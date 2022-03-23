/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License")
 and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 - Sridhar Voruganti - sridhar.voruganti@modusbox.com
 --------------
 ******/

import { PubSub, Message } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { ThirdpartyRequests, Errors, MojaloopRequests } from '@mojaloop/sdk-standard-components'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import inspect from '~/shared/inspect'
import {
  DFSPLinkingData,
  DFSPLinkingStateMachine,
  DFSPLinkingModelConfig
  , DFSPLinkingPhase
} from '~/models/inbound/dfspLinking.interface'
import { BackendValidateAuthTokenResponse, DFSPBackendRequests } from '~/shared/dfsp-backend-requests'

import { v4 as uuidv4 } from 'uuid'
import { reformatError } from '~/shared/api-error'
import deferredJob from '~/shared/deferred-job'

import { canonicalize } from 'json-canonicalize'
import sha256 from 'crypto-js/sha256'

// DFSPLinkingModel is the passive inbound handler for inbound
// POST /consentRequests requests and no response is generated from `model.run()`
export class DFSPLinkingModel
  extends PersistentModel<DFSPLinkingStateMachine, DFSPLinkingData> {
  protected config: DFSPLinkingModelConfig

  constructor (
    data: DFSPLinkingData,
    config: DFSPLinkingModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'validateRequest', from: 'start', to: 'requestIsValid' },
        { name: 'storeReqAndSendOTP', from: 'requestIsValid', to: 'consentRequestValidatedAndStored' },
        { name: 'sendLinkingChannelResponse', from: 'consentRequestValidatedAndStored', to: 'authTokenReceived' },
        { name: 'validateAuthToken', from: 'authTokenReceived', to: 'authTokenValidated' },
        { name: 'grantConsent', from: 'authTokenValidated', to: 'consentGranted' },
        { name: 'validateWithAuthService', from: 'consentGranted', to: 'consentRegisteredAndValidated' },
        {
          name: 'storeValidatedConsentWithDFSP',
          from: 'consentRegisteredAndValidated',
          to: 'validatedConsentStoredWithDFSP'
        },
        {
          name: 'finalizeThirdpartyLinkWithALS',
          from: 'validatedConsentStoredWithDFSP',
          to: 'PISPDFSPLinkEstablished'
        },
        { name: 'notifyVerificationToPISP', from: 'PISPDFSPLinkEstablished', to: 'notificationSent' }
      ],
      methods: {
        // specific transitions handlers methods
        onValidateRequest: () => this.onValidateRequest(),
        onStoreReqAndSendOTP: () => this.onStoreReqAndSendOTP(),
        onSendLinkingChannelResponse: () => this.onSendLinkingChannelResponse(),
        onValidateAuthToken: () => this.onValidateAuthToken(),
        onGrantConsent: () => this.onGrantConsent(),
        onValidateWithAuthService: () => this.onValidateWithAuthService(),
        onStoreValidatedConsentWithDFSP: () => this.onStoreValidatedConsentWithDFSP(),
        onFinalizeThirdpartyLinkWithALS: () => this.onFinalizeThirdpartyLinkWithALS(),
        onNotifyVerificationToPISP: () => this.onNotifyVerificationToPISP()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get subscriber (): PubSub {
    return this.config.subscriber
  }

  get dfspBackendRequests (): DFSPBackendRequests {
    return this.config.dfspBackendRequests
  }

  get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  get mojaloopRequests (): MojaloopRequests {
    return this.config.mojaloopRequests
  }

  static notificationChannel (phase: DFSPLinkingPhase, id: string): string {
    if (!id) {
      throw new Error('DFSPLinkingModel.notificationChannel: \'id\' parameter is required')
    }
    // channel name
    return `DFSPLinking_${phase}_${id}`
  }

  static async triggerWorkflow (
    phase: DFSPLinkingPhase,
    id: string,
    pubSub: PubSub,
    message: Message
  ): Promise<void> {
    const channel = DFSPLinkingModel.notificationChannel(phase, id)
    return deferredJob(pubSub, channel).trigger(message)
  }

  // utility function to check if an error after a transition which
  // pub/subs for a response that can return a mojaloop error
  async checkModelDataForErrorInformation (): Promise<void> {
    if (this.data.errorInformation) {
      await this.fsm.error(this.data.errorInformation)
    }
  }

  static deriveChallenge (consentsPostRequest: tpAPI.Schemas.ConsentsPostRequestAUTH): string {
    if (!consentsPostRequest) {
      throw new Error('DFSPLinkingModel.deriveChallenge: \'consentsPostRequest\' parameter is required')
    }

    const rawChallenge = {
      consentId: consentsPostRequest.consentId,
      scopes: consentsPostRequest.scopes
    }

    const RFC8785String = canonicalize(rawChallenge)
    return sha256(RFC8785String).toString()
  }

  async onValidateRequest (): Promise<void> {
    const { consentRequestsPostRequest, toParticipantId } = this.data

    try {
      const response = await this.dfspBackendRequests.validateConsentRequests(consentRequestsPostRequest)
      this.logger.info(
        `received ${response}, from DFSP backend for validating consent ${consentRequestsPostRequest}`
      )
      if (!response) {
        // this is a planned error case
        throw Errors.MojaloopApiErrorCodes.TP_CONSENT_REQ_VALIDATION_ERROR
      }

      if (!response.isValid) {
        // this is a planned error case
        // assuming the DFSP sends back a proper code the error
        // will convey why it failed the consent request to PISP
        throw Errors.MojaloopApiErrorCodeFromCode(`${response.errorInformation?.errorCode}`)
      }

      this.data.backendValidateConsentRequestsResponse = response

      let consentRequestsIDPutRequest
      if (response.data.authChannels[0] === 'WEB') {
        consentRequestsIDPutRequest = {
          scopes: consentRequestsPostRequest.scopes,
          callbackUri: consentRequestsPostRequest.callbackUri,
          authChannels: response.data.authChannels,
          authUri: response.data.authUri
        } as tpAPI.Schemas.ConsentRequestsIDPutResponseWeb
      } else {
        consentRequestsIDPutRequest = {
          scopes: consentRequestsPostRequest.scopes,
          callbackUri: consentRequestsPostRequest.callbackUri,
          authChannels: response.data.authChannels
        } as tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
      }

      // save this for a later stage, not ready to send the response yet.
      this.data.consentRequestsIDPutRequest = consentRequestsIDPutRequest
    } catch (error) {
      this.logger.push({ error }).error('start -> requestIsValid')

      let mojaloopError
      // if error is planned and is a MojaloopApiErrorCode we send back that code
      if ((error as Errors.MojaloopApiErrorCode).code) {
        mojaloopError = reformatError(error as Errors.MojaloopApiErrorCode, this.logger)
      } else {
        // if error is not planned send back a generalized error
        mojaloopError = reformatError(
          Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
          this.logger
        )
      }

      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestsPostRequest.consentRequestId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )

      // throw error to stop state machine
      throw error
    }
  }

  async onStoreReqAndSendOTP (): Promise<void> {
    const { consentRequestsPostRequest, backendValidateConsentRequestsResponse, toParticipantId } = this.data

    // store scopes in model for future requests
    this.data.scopes = consentRequestsPostRequest.scopes
    try {
      const channel = [...backendValidateConsentRequestsResponse!.data.authChannels].pop()
      switch (channel) {
        case 'WEB': {
          await this.dfspBackendRequests.storeConsentRequests(consentRequestsPostRequest)
          break
        }
        case 'OTP': {
          await this.dfspBackendRequests.sendOTP(consentRequestsPostRequest)
          break
        }
        default: {
          this.logger.error(`Invalid authChannel ${channel}`)
          throw new Error(`Invalid authChannel ${channel}`)
        }
      }
    } catch (error) {
      this.logger.push({ error }).error('requestIsValid -> consentRequestValidatedAndStored')

      // we send back an account linking error despite the actual error
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
        this.logger
      )

      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestsPostRequest.consentRequestId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )
      // throw error to stop state machine
      throw error
    }
  }

  async onSendLinkingChannelResponse (): Promise<void> {
    const { consentRequestsPostRequest, consentRequestsIDPutRequest, toParticipantId } = this.data

    // catch any unplanned errors and notify PISP
    try {
      if (!consentRequestsIDPutRequest) {
        throw new Error('consentRequestsIDPutRequest is null or undefined')
      }
      const waitOnAuthTokenFromPISPResponseChannel = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnAuthTokenFromPISPResponse,
        consentRequestsPostRequest.consentRequestId
      )
      // now we send back a PUT /consentRequests/{ID} response to elicit
      // a PATCH /consentRequests/{ID} response containing an authToken
      await deferredJob(this.subscriber, waitOnAuthTokenFromPISPResponseChannel)
        .init(async (channel) => {
          const res = await this.thirdpartyRequests.putConsentRequests(
            consentRequestsPostRequest.consentRequestId,
            consentRequestsIDPutRequest,
            toParticipantId
          )

          this.logger.push({ res, channel })
            .log('ThirdpartyRequests.putConsentRequests call sent to peer, listening on response')
        })
        .job(async (message: Message): Promise<void> => {
          try {
            type PatchResponse =
              tpAPI.Schemas.ConsentRequestsIDPatchRequest
            type PatchResponseOrError = PatchResponse & fspiopAPI.Schemas.ErrorInformationObject
            const patchResponse = message as unknown as PatchResponseOrError

            if (patchResponse.errorInformation) {
              // if the PISP sends back any error, both machines will now
              // need to be in an errored state
              // store the error so we can transition to an errored state
              this.data.errorInformation = patchResponse.errorInformation as unknown as fspiopAPI.Schemas.ErrorInformation
            } else {
              this.logger.info(
                `received ${patchResponse}, from PISP`
              )
              this.data.consentRequestsIDPatchResponse = { ...message as unknown as PatchResponse }
            }
          } catch (error) {
            this.logger.push(error).error('ThirdpartyRequests.putConsentRequests request error')
            return Promise.reject(error)
          }
        })
        // since the PATCH /consentRequest/{ID} PISP response requires user input
        // on the PISP side we need to make this a longer time.
        // todo: figure out what time is adequate and make a new variable to store it
        .wait(this.config.requestProcessingTimeoutSeconds * 1000)
    } catch (error) {
      // we send back an account linking error despite the actual error
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
        this.logger
      )

      // if the flow fails to run for any reason notify the PISP that the account
      // linking process has failed
      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestsPostRequest.consentRequestId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.toParticipantId
      )

      // throw the actual error
      throw error
    }
  }

  async onValidateAuthToken (): Promise<void> {
    const { consentRequestId, consentRequestsIDPatchResponse, toParticipantId } = this.data

    try {
      const isValidOTP = await this.dfspBackendRequests.validateAuthToken(
        consentRequestId!,
        consentRequestsIDPatchResponse!.authToken
      ) as BackendValidateAuthTokenResponse

      if (!isValidOTP) {
        throw Errors.MojaloopApiErrorCodes.TP_FSP_OTP_VALIDATION_ERROR
      }

      if (!isValidOTP.isValid) {
        throw Errors.MojaloopApiErrorCodes.TP_OTP_VALIDATION_ERROR
      }
    } catch (error) {
      const mojaloopError = reformatError(error as Errors.MojaloopApiErrorCode, this.logger)

      this.logger.push({ error }).error('consentRequestValidatedAndStored -> authTokenValidated')
      this.logger.push({ mojaloopError }).info(`Sending error response to ${toParticipantId}`)

      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestId!,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )
      // throw error to stop state machine
      throw error
    }
  }

  async onGrantConsent (): Promise<void> {
    const { consentRequestId, toParticipantId, scopes } = this.data
    let consentId = uuidv4()

    if (this.config.testShouldOverrideConsentId) {
      this.logger.warn('TEST_SHOULD_OVERRIDE_CONSENT_ID is TRUE - Not for production use.')
      const consentIdForConsentRequestId = this.config.testConsentRequestToConsentMap[consentRequestId]
      if (consentIdForConsentRequestId) {
        consentId = consentIdForConsentRequestId
        this.logger.warn(`onGrantConsent - generated deterministic consentRequestId -> consentId: ${consentRequestId} --> ${consentId}`)
      } else {
        this.logger.warn(`TEST_CONSENT_REQUEST_TO_CONSENT_MAP no entry found for consentRequestId: ${consentRequestId}. Defaulting to a random consentId`)
      }
    } else if (this.config.deprecatedTestOverrideConsentId) {
      this.logger.warn('deprecated TEST_OVERRIDE_CONSENT_ID is set in config. Use TEST_SHOULD_OVERRIDE_CONSENT_ID and TEST_CONSENT_REQUEST_TO_CONSENT_MAP instead')
      consentId = this.config.deprecatedTestOverrideConsentId
    }
    // save consentId for later
    this.data.consentId = consentId

    const postConsentPayload: tpAPI.Schemas.ConsentsPostRequestPISP = {
      status: 'ISSUED',
      consentId,
      consentRequestId: consentRequestId!,
      scopes: scopes || []
    }

    // save POST /consent request
    this.data.consentPostRequest = postConsentPayload

    // catch any unplanned errors and notify PISP
    try {
      const waitOnSignedCredentialChannel = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnSignedCredentialFromPISPResponse,
        consentId!
      )

      await deferredJob(this.subscriber, waitOnSignedCredentialChannel)
        .init(async (channel) => {
          const res = await this.thirdpartyRequests.postConsents(
            postConsentPayload,
            toParticipantId
          )

          this.logger.push({ res, channel })
            .log('ThirdpartyRequests.postConsents call sent to peer, listening on response')
        })
        .job(async (message: Message): Promise<void> => {
          try {
            type PutResponse =
              tpAPI.Schemas.ConsentsIDPutResponseSigned
            type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
            const putResponse = message as unknown as PutResponseOrError

            if (putResponse.errorInformation) {
              // if the PISP sends back any error, both machines will now
              // need to be in an errored state
              // store the error so we can transition to an errored state
              this.data.errorInformation = putResponse.errorInformation as unknown as fspiopAPI.Schemas.ErrorInformation
            } else {
              this.data.consentIDPutResponseSignedCredentialFromPISP = { ...message as unknown as PutResponse }
            }
          } catch (error) {
            this.logger.push(error).error('ThirdpartyRequests.postConsents request error')
            return Promise.reject(error)
          }
        })
        // since the PUT /consents/{ID} PISP signed credential response requires
        // user input on the PISP side we need to make this a longer time.
        // todo: figure out what time is adequate and make a new variable to store it
        .wait(this.config.requestProcessingTimeoutSeconds * 1000)
    } catch (error) {
      // we send back an account linking error despite the actual error
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
        this.logger
      )

      // if the flow fails to run for any reason notify the PISP that the account
      // linking process has failed
      await this.thirdpartyRequests.putConsentsError(
        consentId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.toParticipantId
      )

      // throw the actual error
      throw error
    }
  }

  async onValidateWithAuthService (): Promise<void> {
    const { consentIDPutResponseSignedCredentialFromPISP, consentId } = this.data

    const consentPostRequestToAuthService: tpAPI.Schemas.ConsentsPostRequestAUTH = {
      status: 'ISSUED',
      consentId: consentId!,
      scopes: this.data.scopes!,
      credential: consentIDPutResponseSignedCredentialFromPISP!.credential
    }

    // store request for later
    this.data.consentPostRequestToAuthService = consentPostRequestToAuthService

    // catch any unplanned errors and notify PISP
    try {
      const waitOnAuthServiceResponse = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnAuthServiceResponse,
        consentId!
      )

      await deferredJob(this.subscriber, waitOnAuthServiceResponse)
        .init(async (channel) => {
          const res = await this.thirdpartyRequests.postConsents(
            consentPostRequestToAuthService,
            this.data.toAuthServiceParticipantId
          )

          this.logger.push({ res, channel })
            .log('ThirdpartyRequests.postConsents call sent to auth service, listening on response')
        })
        .job(async (message: Message): Promise<void> => {
          try {
            type PutResponse =
              tpAPI.Schemas.ConsentsIDPutResponseVerified
            type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
            const putResponse = message as unknown as PutResponseOrError

            if (putResponse.errorInformation) {
              // if the auth-service sends back any error, inform PISP
              // that consent failed to validate with auth-service
              // todo: more detailed error handling depending on auth-service error response
              const mojaloopError = reformatError(
                Errors.MojaloopApiErrorCodes.TP_CONSENT_INVALID,
                this.logger
              )

              await this.thirdpartyRequests.putConsentsError(
                this.data.consentId!,
                mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
                this.data.toParticipantId
              )
              // store the error so we can transition to an errored state
              this.data.errorInformation = mojaloopError.errorInformation as unknown as fspiopAPI.Schemas.ErrorInformation
            } else {
              this.data.consentIDPutResponseFromAuthService = { ...message as unknown as PutResponse }
            }
          } catch (error) {
            this.logger.push(error).error('ThirdpartyRequests.postConsents request error')
            return Promise.reject(error)
          }
        })
        .wait(this.config.requestProcessingTimeoutSeconds * 1000)
    } catch (error) {
      // we send back an account linking error despite the actual error
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
        this.logger
      )

      // if the flow fails to run for any reason notify the PISP that the account
      // linking process has failed
      await this.thirdpartyRequests.putConsentsError(
        this.data.consentId!,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.toParticipantId
      )

      // throw the actual error
      throw error
    }
  }

  async onStoreValidatedConsentWithDFSP (): Promise<void> {
    const {
      consentIDPutResponseFromAuthService,
      consentId,
      consentRequestId,
      consentPostRequestToAuthService
    } = this.data

    try {
      await this.dfspBackendRequests.storeValidatedConsentForAccountId(
        consentIDPutResponseFromAuthService!.scopes,
        consentId!,
        consentRequestId,
        DFSPLinkingModel.deriveChallenge(consentPostRequestToAuthService!),
        consentIDPutResponseFromAuthService!.credential
      )
    } catch (error) {
      // we send back an account linking error despite the actual error
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
        this.logger
      )

      // if the flow fails to run for any reason notify the PISP that the account
      // linking process has failed
      await this.thirdpartyRequests.putConsentsError(
        this.data.consentId!,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.toParticipantId
      )

      // throw the actual error
      throw error
    }
  }

  async onFinalizeThirdpartyLinkWithALS (): Promise<void> {
    // todo: send a bulk POST /participants request to ALS to
    //       store THIRD_PARTY_LINK entries

    /*
    const partyList: tpAPI.Schemas.PartyIdInfo[] = []
    for (const scope of this.data.scopes as tpAPI.Schemas.Scope[]) {
      var partyIdInfo: tpAPI.Schemas.PartyIdInfo = {
        partyIdType: 'THIRD_PARTY_LINK',
        partyIdentifier: scope.accountId
      }
      partyList.push(partyIdInfo)
    }

    const consentPostRequestToALSService: tpAPI.Schemas.ParticipantsPostRequest = {
      requestId: this.data.consentId!,
      partyList
    }

    const channel = DFSPLinkingModel.notificationChannel(
      DFSPLinkingPhase.waitOnThirdpartyLinkRegistrationResponse,
      this.data.consentId!
    )

    return deferredJob(this.subscriber, channel)
    .init(async (): Promise<void> => {
      // need to update `mojaloopRequests.postParticipants` to accept
      // 'THIRD_PARTY_LINK'
      const res = await this.mojaloopRequests.postParticipants(
        consentPostRequestToALSService,
        'auth-service'
      )
      this.logger.push({ res }).info('MojaloopRequests.postParticipants request sent to peer')
    })
    .job(async (message: Message): Promise<void> => {
    })
    .wait(this.config.requestProcessingTimeoutSeconds * 1000)

    // todo: if promise fails we need to send a PUT /consents/{ID}/error
    //       request back to the PISP
    */
  }

  async onNotifyVerificationToPISP (): Promise<void> {
    const { consentId } = this.data

    const consentPatchVerifiedRequest: tpAPI.Schemas.ConsentsIDPatchResponseVerified = {
      credential: {
        status: 'VERIFIED'
      }
    }
    // catch any unplanned errors
    try {
      await this.thirdpartyRequests.patchConsents(
        consentId!,
        consentPatchVerifiedRequest,
        this.data.toParticipantId
      )
    } catch (error) {
      // we send back an account linking error despite the actual error
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_ACCOUNT_LINKING_ERROR,
        this.logger
      )
      // if the flow fails to run for any reason notify the PISP that the account
      // linking process has failed
      await this.thirdpartyRequests.putConsentsError(
        this.data.consentId!,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.toParticipantId
      )

      // throw actual error
      throw error
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          this.logger.info(
            `validateRequest requested for ${data.consentRequestsPostRequest.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.validateRequest()
          return this.run()

        case 'requestIsValid':
          this.logger.info(
            `storeReqAndSendOTP requested for ${data.consentRequestsPostRequest.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.storeReqAndSendOTP()
          return this.run()

        case 'consentRequestValidatedAndStored':
          this.logger.info(
            `storeReqAndSendOTP requested for ${data.consentRequestsPostRequest.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.sendLinkingChannelResponse()
          await this.checkModelDataForErrorInformation()
          return this.run()

        case 'authTokenReceived':
          this.logger.info(
            `validateAuthToken requested for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.validateAuthToken()
          return this.run()

        case 'authTokenValidated':
          this.logger.info(
            `grantConsent requested for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.grantConsent()
          await this.checkModelDataForErrorInformation()
          return this.run()

        case 'consentGranted':
          await this.fsm.validateWithAuthService()
          await this.checkModelDataForErrorInformation()
          this.logger.info(
            `validateWithAuthService requested for ${data.consentId},  currentState: ${data.currentState}`
          )
          return this.run()

        case 'consentRegisteredAndValidated':
          await this.fsm.storeValidatedConsentWithDFSP()
          return this.run()

        case 'validatedConsentStoredWithDFSP':
          await this.fsm.finalizeThirdpartyLinkWithALS()
          await this.checkModelDataForErrorInformation()
          return this.run()

        case 'PISPDFSPLinkEstablished':
          await this.fsm.notifyVerificationToPISP()
          await this.checkModelDataForErrorInformation()
          return

        default:
          this.logger.info('State machine in errored state')
          return
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      // TOOD: reformatError: https://github.com/mojaloop/thirdparty-sdk/blob/master/src/models/dfspTransaction.model.ts#L378
      this.logger.info(`Error running DFSPLinkingModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a consentReqState property here!
        if (err.consentReqState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between consentReqState.lastError and err
        err.consentReqState = { ...this.data }
      }
      throw err
    }
  }
}

export async function create (
  data: DFSPLinkingData,
  config: DFSPLinkingModelConfig
): Promise<DFSPLinkingModel> {
  // create a new model
  const model = new DFSPLinkingModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

export default {
  DFSPLinkingModel,
  create
}
