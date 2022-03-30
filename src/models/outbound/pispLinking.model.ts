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

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 - Kevin Leyow <kevin.leyow@modusbox.com>

 --------------
 ******/

import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { StateMachineConfig } from 'javascript-state-machine'
import { canonicalize } from 'json-canonicalize'
import sha256 from 'crypto-js/sha256'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'
import {
  PISPLinkingData,
  PISPLinkingModelConfig,
  PISPLinkingStateMachine
  , PISPLinkingPhase
} from '~/models/outbound/pispLinking.interface'
import { PersistentModel } from '~/models/persistent.model'
import deferredJob from '~/shared/deferred-job'
import inspect from '~/shared/inspect'
import { Message, PubSub } from '~/shared/pub-sub'

export class PISPLinkingModel
  extends PersistentModel<PISPLinkingStateMachine, PISPLinkingData> {
  protected config: PISPLinkingModelConfig

  constructor (
    data: PISPLinkingData,
    config: PISPLinkingModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'requestConsent', from: 'start', to: 'channelResponseReceived' },
        { name: 'changeToOTPAuthentication', from: 'channelResponseReceived', to: 'OTPAuthenticationChannelResponseReceived' },
        { name: 'changeToWebAuthentication', from: 'channelResponseReceived', to: 'WebAuthenticationChannelResponseReceived' },
        { name: 'authenticate', from: 'OTPAuthenticationChannelResponseReceived', to: 'consentReceivedAwaitingCredential' },
        { name: 'authenticate', from: 'WebAuthenticationChannelResponseReceived', to: 'consentReceivedAwaitingCredential' },
        { name: 'registerCredential', from: 'consentReceivedAwaitingCredential', to: 'accountsLinked' }
      ],
      methods: {
        // specific transitions handlers methods
        onRequestConsent: () => this.onRequestConsent(),
        onAuthenticate: () => this.onAuthenticate(),
        onRegisterCredential: () => this.onRegisterCredential()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get subscriber (): PubSub {
    return this.config.subscriber
  }

  get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  static notificationChannel (phase: PISPLinkingPhase, id: string): string {
    if (!id) {
      throw new Error('PISPLinkingModel.notificationChannel: \'id\' parameter is required')
    }
    // channel name
    return `PISPLinking_${phase}_${id}`
  }

  static async triggerWorkflow (
    phase: PISPLinkingPhase,
    id: string,
    pubSub: PubSub,
    message: Message
  ): Promise<void> {
    const channel = PISPLinkingModel.notificationChannel(phase, id)
    return deferredJob(pubSub, channel).trigger(message)
  }

  linkingRequestConsentPostRequestToConsentRequestsPostRequest (): tpAPI.Schemas.ConsentRequestsPostRequest {
    const { linkingRequestConsentPostRequest, consentRequestId } = this.data

    const scopes: tpAPI.Schemas.Scope[] = []
    for (const account of linkingRequestConsentPostRequest.accounts as unknown as tpAPI.Schemas.Account[]) {
      scopes.push({
        address: account.address!,
        actions: linkingRequestConsentPostRequest.actions
      })
    }

    const postConsentRequest: tpAPI.Schemas.ConsentRequestsPostRequest = {
      consentRequestId,
      scopes,
      userId: linkingRequestConsentPostRequest.userId,
      authChannels: ['OTP', 'WEB'],
      callbackUri: linkingRequestConsentPostRequest.callbackUri
    }
    return postConsentRequest
  }

  static deriveChallenge (consentsPostRequest: tpAPI.Schemas.ConsentsPostRequestPISP): string {
    if (!consentsPostRequest) {
      throw new Error('PISPLinkingModel.deriveChallenge: \'consentRequestsPostRequest\' parameter is required')
    }

    const rawChallenge = {
      consentId: consentsPostRequest.consentId,
      scopes: consentsPostRequest.scopes
    }

    const RFC8785String = canonicalize(rawChallenge)
    return sha256(RFC8785String).toString()
  }

  async onRequestConsent (): Promise<void> {
    const { linkingRequestConsentPostRequest, consentRequestId } = this.data
    const channel = PISPLinkingModel.notificationChannel(
      PISPLinkingPhase.requestConsent,
      consentRequestId
    )

    // store `toParticipantId` for subsequent outgoing requests
    this.data.toParticipantId = linkingRequestConsentPostRequest.toParticipantId

    this.logger.push({ channel }).info('onRequestConsent - subscribe to channel')

    const postConsentRequest = this.linkingRequestConsentPostRequestToConsentRequestsPostRequest()

    return deferredJob(this.subscriber, channel)
      .init(async (channel) => {
        const res = await this.thirdpartyRequests.postConsentRequests(
          postConsentRequest,
          this.data.toParticipantId!
        )

        this.logger.push({ res, channel })
          .log('ThirdpartyRequests.postConsentRequests call sent to peer, listening on response')
      })
      .job(async (message: Message): Promise<void> => {
        try {
          type PutResponse =
            tpAPI.Schemas.ConsentRequestsIDPutResponseWeb |
            tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
          type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
          const putResponse = message as unknown as PutResponseOrError

          if (putResponse.errorInformation) {
            this.data.errorInformation = putResponse.errorInformation
          } else {
            this.data.linkingRequestConsentInboundChannelResponse = { ...message as unknown as PutResponse }
          }
        } catch (error) {
          this.logger.push(error).error('ThirdpartyRequests.postConsentRequests request error')
          return Promise.reject(error)
        }
      })
      .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  async onAuthenticate (): Promise<void> {
    const { consentRequestId, linkingRequestConsentIDAuthenticatePatchRequest } = this.data

    const channel = PISPLinkingModel.notificationChannel(
      PISPLinkingPhase.requestConsentAuthenticate,
      consentRequestId
    )

    this.logger.push({ channel }).info('onAuthenticate - subscribe to channel')

    return deferredJob(this.subscriber, channel)
      .init(async (channel) => {
        const res = await this.thirdpartyRequests.patchConsentRequests(
          consentRequestId,
          { authToken: linkingRequestConsentIDAuthenticatePatchRequest!.authToken },
          this.data.toParticipantId!
        )

        this.logger.push({ res, channel })
          .log('ThirdpartyRequests.patchConsentRequests request call sent to peer, listening on response')
      })
      .job(async (message: Message): Promise<void> => {
        try {
        type PutResponseOrError = tpAPI.Schemas.ConsentsPostRequestPISP & fspiopAPI.Schemas.ErrorInformationObject
        const putResponse = message as unknown as PutResponseOrError

        if (putResponse.errorInformation) {
          this.data.errorInformation = putResponse.errorInformation
        } else {
          this.data.linkingRequestConsentIDAuthenticateInboundConsentResponse = {
            ...message as unknown as tpAPI.Schemas.ConsentsPostRequestPISP
          }
        }
        } catch (error) {
          this.logger.push(error).error('ThirdpartyRequests.patchConsentRequests request error')
          return Promise.reject(error)
        }
      })
      .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  async onRegisterCredential (): Promise<void> {
    const {
      linkingRequestConsentIDAuthenticateInboundConsentResponse,
      linkingRequestConsentIDPassCredentialPostRequest
    } = this.data

    // pull consentId from previous step
    const consentId = linkingRequestConsentIDAuthenticateInboundConsentResponse!.consentId

    // we're using consentId from this point onwards since consentRequestId
    // is not used at this point forward
    const channel = PISPLinkingModel.notificationChannel(
      PISPLinkingPhase.registerCredential,
      consentId
    )

    this.logger.push({ channel }).info('onRegisterCredential - subscribe to channel')

    return deferredJob(this.subscriber, channel)
      .init(async (channel) => {
      // todo: need credential type distinguishing logic once we support more
      //       credential types
      // todo: support generic credential
        const res = await this.thirdpartyRequests.putConsents(
          consentId,
          {
            scopes: this.data.linkingRequestConsentIDAuthenticateInboundConsentResponse!.scopes,
            status: 'ISSUED',
            credential: {
              credentialType: 'FIDO',
              status: 'PENDING',
              fidoPayload: linkingRequestConsentIDPassCredentialPostRequest!.credential.payload
            }
          },
          this.data.toParticipantId!
        )

        this.logger.push({ res, channel })
          .log('ThirdpartyRequests.putConsents request call sent to peer, listening on response')
      })
      .job(async (message: Message): Promise<void> => {
        try {
        type PutResponseOrError = tpAPI.Schemas.ConsentsIDPatchResponseVerified & fspiopAPI.Schemas.ErrorInformationObject
        const putResponse = message as unknown as PutResponseOrError

        if (putResponse.errorInformation) {
          this.data.errorInformation = putResponse.errorInformation
        } else {
          this.data.linkingRequestConsentIDPassCredentialInboundConsentResponse = {
            ...message as unknown as tpAPI.Schemas.ConsentsIDPatchResponseVerified
          }
        }
        } catch (error) {
          this.logger.push(error).error('ThirdpartyRequests.putConsents request error')
          return Promise.reject(error)
        }
      })
      .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  getResponse ():
  OutboundAPI.Schemas.LinkingRequestConsentResponse |
  OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateResponse |
  OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialResponse |
  void {
    switch (this.data.currentState) {
      case 'OTPAuthenticationChannelResponseReceived':
        return {
          channelResponse: this.data.linkingRequestConsentInboundChannelResponse,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentResponse
      case 'WebAuthenticationChannelResponseReceived':
        return {
          channelResponse: this.data.linkingRequestConsentInboundChannelResponse,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentResponse
      case 'consentReceivedAwaitingCredential':
        return {
          consent: this.data.linkingRequestConsentIDAuthenticateInboundConsentResponse,
          challenge: PISPLinkingModel.deriveChallenge(
            this.data.linkingRequestConsentIDAuthenticateInboundConsentResponse!
          ),
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateResponse
      case 'accountsLinked':
        return {
          credential: {
            status: this.data.linkingRequestConsentIDPassCredentialInboundConsentResponse!.credential.status
          },
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialResponse
      case 'errored':
        return {
          errorInformation: this.data.errorInformation,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentResponse
      default:
    }
  }

  // utility function to check if an error after a transistion which
  // pub/subs for a response that can return a mojaloop error
  async checkModelDataForErrorInformation (): Promise<void> {
    if (this.data.errorInformation) {
      await this.fsm.error(this.data.errorInformation)
    }
  }

  async checkModelDataChannelResponse (): Promise<void> {
    if (!this.data.linkingRequestConsentInboundChannelResponse) {
      return
    }

    if (this.data.linkingRequestConsentInboundChannelResponse.authChannels[0] === 'WEB') {
      await this.fsm.changeToWebAuthentication()
    } else if (this.data.linkingRequestConsentInboundChannelResponse.authChannels[0] === 'OTP') {
      await this.fsm.changeToOTPAuthentication()
    } else {
      await this.fsm.error()
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<
  OutboundAPI.Schemas.LinkingRequestConsentResponse |
  OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateResponse |
  OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialResponse |
  void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          await this.saveToKVS()
          this.logger.info(
            `validateRequest for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.requestConsent()
          await this.checkModelDataForErrorInformation()
          await this.checkModelDataChannelResponse()
          await this.saveToKVS()
          return this.getResponse()

        case 'OTPAuthenticationChannelResponseReceived':
          this.logger.info(
            `validateRequest for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.authenticate()
          await this.checkModelDataForErrorInformation()
          await this.saveToKVS()
          return this.getResponse()

        case 'WebAuthenticationChannelResponseReceived':
          this.logger.info(
            `validateRequest for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.authenticate()
          await this.checkModelDataForErrorInformation()
          await this.saveToKVS()
          return this.getResponse()

        case 'consentReceivedAwaitingCredential':
          this.logger.info(
            `registerCredential for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.registerCredential()
          await this.checkModelDataForErrorInformation()
          await this.saveToKVS()
          return this.getResponse()

        default:
          this.logger.info('State machine in errored state')
          return
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      this.logger.info(`Error running PISPLinkingModel : ${inspect(err)}`)

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

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: PISPLinkingModelConfig
): Promise<PISPLinkingModel> {
  try {
    const data = await config.kvs.get<PISPLinkingData>(config.key)
    if (!data) {
      throw new Error(`No data found in KVS for: ${config.key}`)
    }
    config.logger.push({ data }).info('data loaded from KVS')
    return create(data, config)
  } catch (err) {
    config.logger.push({ err }).info(`Error loading data from KVS for key: ${config.key}`)
    throw err
  }
}

export async function create (
  data: PISPLinkingData,
  config: PISPLinkingModelConfig
): Promise<PISPLinkingModel> {
  // create a new model
  const model = new PISPLinkingModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

export default {
  PISPLinkingModel,
  create
}
