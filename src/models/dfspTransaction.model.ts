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

 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/

import { StateMachineConfig } from 'javascript-state-machine'
import { v4 as uuidv4 } from 'uuid'
import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets'

import { PersistentModel } from './persistent.model'
import {
  DFSPTransactionStateMachine,
  DFSPTransactionData,
  DFSPTransactionModelConfig
} from './dfspTransaction.interface'
import { InvalidDataError } from '~/shared/invalid-data-error'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { ThirdpartyRequests, Errors } from '@mojaloop/sdk-standard-components'
import { reformatError } from '~/shared/api-error'
import deferredJob from '~/shared/deferred-job'
import { Message, PubSub } from '~/shared/pub-sub'
import { AuthRequestPartial, deriveTransactionChallenge } from '~/shared/challenge'
import { feeForTransferAndPayeeReceiveAmount, payeeReceiveAmountForQuoteAndFees } from '~/shared/feeCalculator'

// Some constants to use for async jobs
export enum DFSPTransactionPhase {
  waitOnAuthResponseFromPISPChannel = 'waitOnAuthResponseFromPISPChannel',
  waitOnVerificationResponseFromSwitchChannel = 'waitOnVerificationResponseFromSwitchChannel'
}

export class DFSPTransactionModel extends PersistentModel<DFSPTransactionStateMachine, DFSPTransactionData> {
  protected config: DFSPTransactionModelConfig

  constructor(data: DFSPTransactionData, config: DFSPTransactionModelConfig) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        {
          name: 'validateTransactionRequest',
          from: 'start',
          to: 'transactionRequestIsValid'
        },
        {
          name: 'notifyTransactionRequestIsValid',
          from: 'transactionRequestIsValid',
          to: 'notifiedTransactionRequestIsValid'
        },
        {
          name: 'requestQuote',
          from: 'notifiedTransactionRequestIsValid',
          to: 'quoteReceived'
        },
        {
          name: 'requestAuthorization',
          from: 'quoteReceived',
          to: 'authorizationReceived'
        },
        {
          name: 'verifyAuthorization',
          from: 'authorizationReceived',
          to: 'authorizationReceivedIsValid'
        },
        {
          name: 'requestTransfer',
          from: 'authorizationReceivedIsValid',
          to: 'transferIsDone'
        },
        {
          name: 'notifyTransferIsDone',
          from: 'transferIsDone',
          to: 'transactionRequestIsDone'
        }
      ],
      methods: {
        // specific transitions handlers methods
        onValidateTransactionRequest: () => this.onValidateTransactionRequest(),
        onNotifyTransactionRequestIsValid: () => this.onNotifyTransactionRequestIsValid(),
        onRequestQuote: () => this.onRequestQuote(),
        onRequestAuthorization: () => this.onRequestAuthorization(),
        onVerifyAuthorization: () => this.onVerifyAuthorization(),
        onRequestTransfer: () => this.onRequestTransfer(),
        onNotifyTransferIsDone: () => this.onNotifyTransferIsDone()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get subscriber(): PubSub {
    return this.config.subscriber
  }

  get sdkOutgoingRequests(): SDKOutgoingRequests {
    return this.config.sdkOutgoingRequests
  }

  get dfspBackendRequests(): DFSPBackendRequests {
    return this.config.dfspBackendRequests
  }

  get thirdpartyRequests(): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  static notificationChannel(phase: DFSPTransactionPhase, id: string): string {
    if (!id) {
      throw new Error("DFSPTransactionModel.notificationChannel: 'id' parameter is required")
    }
    // channel name
    return `DFSPTransaction_${phase}_${id}`
  }

  // transitions handlers
  async onValidateTransactionRequest(): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestId')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestState')
    InvalidDataError.throwIfInvalidProperty(this.data, 'participantId')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestRequest')

    // validation of transactionRequestRequest
    const validationResult = await this.dfspBackendRequests.validateThirdpartyTransactionRequestAndGetContext(
      this.data.transactionRequestRequest
    )
    if (!(validationResult && validationResult.isValid)) {
      throw Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_NOT_VALID
    }

    // store the context for later
    this.data.transactionRequestContext = {
      payerPartyIdInfo: validationResult.payerPartyIdInfo,
      payerPersonalInfo: validationResult.payerPersonalInfo,
      consentId: validationResult.consentId
    }

    // allocate new id
    this.data.transactionId = uuidv4()

    // so let prepare notification payload to be send to PISPTransactionModel
    this.data.transactionRequestPutUpdate = {
      transactionId: this.data.transactionId,
      transactionRequestState: this.data.transactionRequestState
    }
  }

  async onNotifyTransactionRequestIsValid(): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPutUpdate')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestContext')

    // TODO: fspId field for payee.partyIdInfo should be mandatory, now it is optional
    InvalidDataError.throwIfInvalidProperty(this.data.transactionRequestRequest.payee.partyIdInfo, 'fspId')

    // this field will be present which is guaranteed by InvalidDataError validation above
    const update = this.data.transactionRequestPutUpdate as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
    try {
      await this.thirdpartyRequests.putThirdpartyRequestsTransactions(
        update,
        this.data.transactionRequestId,
        this.data.participantId
      )
    } catch (err) {
      this.logger.push({ err }).log('putThirdpartyRequestsTransactions failed')
      // throw proper error
      throw Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_UPDATE_FAILED
    }

    // shortcut
    const tr = this.data.transactionRequestRequest

    // prepare request for quote
    this.data.requestQuoteRequest = {
      // TODO: fspId field for payee.partyIdInfo should be mandatory, now it is optional
      fspId: tr.payee.partyIdInfo.fspId!,
      quotesPostRequest: {
        // allocate quoteId
        quoteId: uuidv4(),

        // copy from previously allocated
        transactionId: this.data.transactionId!,

        // copy from request
        transactionRequestId: tr.transactionRequestId,
        payee: { ...tr.payee },
        payer: {
          partyIdInfo: this.data.transactionRequestContext!.payerPartyIdInfo,
          personalInfo: this.data.transactionRequestContext!.payerPersonalInfo
        },
        amountType: tr.amountType,
        amount: { ...tr.amount },
        transactionType: { ...tr.transactionType }
      }
    }
  }

  async onRequestQuote(): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestQuoteRequest')

    // request quote via sync interface on sdk-scheme-adapter
    const resultQuote = await this.sdkOutgoingRequests.requestQuote(this.data.requestQuoteRequest!)

    // check result and throw if invalid
    if (!(resultQuote && resultQuote.currentState === 'COMPLETED')) {
      throw Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_QUOTE_FAILED
    }

    // store result in state
    this.data.requestQuoteResponse = resultQuote
  }

  async onRequestAuthorization(): Promise<void> {
    try {
      InvalidDataError.throwIfInvalidProperty(this.data, 'requestQuoteResponse')

      // shortcut
      const quote = this.data.requestQuoteResponse!.quotes.body
      const transferAmount: fspiopAPI.Schemas.Money = quote.transferAmount
      const payeeReceiveAmount = payeeReceiveAmountForQuoteAndFees(
        transferAmount,
        quote.payeeFspFee,
        quote.payeeFspCommission
      )

      // fees are calculated on the basic difference between transfer amount
      // and receive amount. This doesn't take into consideration any fees
      // the Payer DFSP might want to add, or any commission they receive
      const fees = feeForTransferAndPayeeReceiveAmount(transferAmount, payeeReceiveAmount)

      const authorizationRequestId = uuidv4()
      const authRequestPartial: AuthRequestPartial = {
        authorizationRequestId,
        transactionRequestId: this.data.transactionRequestId,
        transferAmount,
        payeeReceiveAmount,
        fees,
        payer: this.data.transactionRequestRequest.payer,
        payee: this.data.transactionRequestRequest.payee,
        transactionType: this.data.transactionRequestRequest.transactionType,
        expiration: this.data.requestQuoteResponse!.quotes.body.expiration
      }
      const challenge = deriveTransactionChallenge(authRequestPartial)

      this.data.requestAuthorizationPostRequest = {
        ...authRequestPartial,
        challenge
      }

      const waitOnAuthResponseFromPISPChannel = DFSPTransactionModel.notificationChannel(
        DFSPTransactionPhase.waitOnAuthResponseFromPISPChannel,
        authorizationRequestId
      )

      await deferredJob(this.subscriber, waitOnAuthResponseFromPISPChannel)
        .init(async (channel) => {
          // Send the request to the PISP
          const response = await this.thirdpartyRequests.postThirdpartyRequestsAuthorizations(
            this.data.requestAuthorizationPostRequest!,
            this.data.participantId
          )
          this.logger
            .push({ response, channel })
            .log('ThirdpartyRequests.postThirdpartyRequestsAuthorizations call sent to peer, listening on response')
        })
        .job(async (message: Message): Promise<void> => {
          try {
            type PutResponse = tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponse
            type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
            const putResponse = message as unknown as PutResponseOrError

            if (putResponse.errorInformation) {
              this.data.errorInformation = putResponse.errorInformation as unknown as fspiopAPI.Schemas.ErrorInformation
              return Promise.reject(putResponse.errorInformation)
            }

            this.logger.info(`received ${putResponse} from PISP`)
            this.data.requestAuthorizationResponse = putResponse
          } catch (error) {
            this.logger.push(error).error('ThirdpartyRequests.postThirdpartyRequestsAuthorizations request error')
            return Promise.reject(error)
          }
        })
        // This requires user input on the PISP side, so this number should be something reasonable, like 1 minute or so
        .wait(this.config.transactionRequestAuthorizationTimeoutSeconds * 1000)
    } catch (error) {
      this.logger.info(error)
      const mojaloopError = reformatError(
        Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_AUTHORIZATION_UNEXPECTED,
        this.logger
      )

      // If something failed here, inform the PISP that the transactionRequest failed
      await this.thirdpartyRequests.putThirdpartyRequestsTransactionsError(
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.transactionRequestId,
        this.data.participantId
      )

      throw Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_AUTHORIZATION_UNEXPECTED
    }
  }

  async onVerifyAuthorization(): Promise<void> {
    try {
      InvalidDataError.throwIfInvalidProperty(this.data, 'requestAuthorizationResponse')
      InvalidDataError.throwIfInvalidProperty(this.data.requestAuthorizationResponse!, 'signedPayload')
      InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestContext')
      InvalidDataError.throwIfInvalidProperty(this.data, 'requestAuthorizationPostRequest')

      const verificationRequestId = uuidv4()
      const channel = DFSPTransactionModel.notificationChannel(
        DFSPTransactionPhase.waitOnVerificationResponseFromSwitchChannel,
        verificationRequestId
      )
      // TODO: Need to handle rejection case
      if (
        this.data.requestAuthorizationResponse?.responseType &&
        this.data.requestAuthorizationResponse?.responseType === 'REJECTED'
      ) {
        throw new Error('PISP end user rejection not supported')
      }

      const authResponse = this.data.requestAuthorizationResponse as
        | tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseFIDO
        | tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseGeneric
      const signedPayloadType = authResponse.signedPayload.signedPayloadType

      switch (signedPayloadType) {
        case 'FIDO': {
          const rar = this.data
            .requestAuthorizationResponse! as tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseFIDO
          this.data.requestVerificationPostRequest = {
            verificationRequestId,
            consentId: this.data.transactionRequestContext!.consentId,
            fidoSignedPayload: rar.signedPayload.fidoSignedPayload,
            signedPayloadType: 'FIDO',
            challenge: this.data.requestAuthorizationPostRequest!.challenge
          } as tpAPI.Schemas.ThirdpartyRequestsVerificationsPostRequestFIDO
          break
        }
        case 'GENERIC': {
          const rar = this.data
            .requestAuthorizationResponse! as tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseGeneric
          this.data.requestVerificationPostRequest = {
            verificationRequestId,
            consentId: this.data.transactionRequestContext!.consentId,
            genericSignedPayload: rar.signedPayload!.genericSignedPayload,
            signedPayloadType: 'GENERIC',
            challenge: this.data.requestAuthorizationPostRequest!.challenge
          } as tpAPI.Schemas.ThirdpartyRequestsVerificationsPostRequestGeneric
          break
        }
        default:
          throw new Error(`unhandled signedPayloadType: ${signedPayloadType}`)
      }
      // eslint-disable-next-line no-console
      console.log('onVerifyAuthorization - challenge is', this.data.requestAuthorizationPostRequest!.challenge)

      await deferredJob(this.subscriber, channel)
        .init(async (channel) => {
          // Send the request to the auth service for verification.
          const response = await this.thirdpartyRequests.postThirdpartyRequestsVerifications(
            this.data.requestVerificationPostRequest!,
            this.config.authServiceParticipantId
          )
          this.logger
            .push({ response, channel })
            .log('ThirdpartyRequests.postThirdpartyRequestsVerifications call sent to peer, listening on response')
        })
        .job(async (message: Message): Promise<void> => {
          try {
            type PutResponse = tpAPI.Schemas.ThirdpartyRequestsVerificationsIDPutResponse
            type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
            const putResponse = message as unknown as PutResponseOrError

            if (putResponse.errorInformation) {
              this.data.errorInformation = putResponse.errorInformation as unknown as fspiopAPI.Schemas.ErrorInformation
              return Promise.reject(putResponse.errorInformation)
            }

            this.logger.info(`received ${putResponse} from PISP`)
            this.data.requestVerificationResponse = putResponse

            this.data.transferId = uuidv4()

            // AuthService has approved, prepare transfer request
            const tr = this.data.transactionRequestRequest
            const quote = this.data.requestQuoteResponse!.quotes.body
            this.data.transactionRequestState = 'ACCEPTED'

            this.data.transferRequest = {
              fspId: this.config.dfspId,
              transfersPostRequest: {
                transferId: this.data.transferId!,

                // payee & payer data from /thirdpartyRequests/transaction
                payeeFsp: tr.payee.partyIdInfo.fspId!,
                payerFsp: this.config.dfspId,

                // transfer data from quote response
                amount: { ...quote.transferAmount },
                ilpPacket: quote.ilpPacket,
                condition: quote.condition,

                // TODO: investigate recalculation of expiry...
                expiration: tr.expiration
              }
            }
          } catch (error) {
            this.logger.push(error).error('ThirdpartyRequests.postThirdpartyRequestsVerifications request error')
            return Promise.reject(error)
          }
        })
        // This requires user input on the PISP side, so this number should be something reasonable, like 1 minute or so
        .wait(this.config.transactionRequestVerificationTimeoutSeconds * 1000)
    } catch (error) {
      this.logger.info(error)

      const mojaloopError = reformatError(Errors.MojaloopApiErrorCodes.TP_AUTH_SERVICE_ERROR, this.logger)

      // If something failed here, inform the PISP that the transactionRequest failed
      await this.thirdpartyRequests.putThirdpartyRequestsTransactionsError(
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.transactionRequestId,
        this.data.participantId
      )

      throw Errors.MojaloopApiErrorCodes.TP_AUTH_SERVICE_ERROR
    }
  }

  async onRequestTransfer(): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transferRequest')

    // make a call to switch via sync sdk api
    const transferResult = await this.sdkOutgoingRequests.requestTransfer(this.data.transferRequest!)

    // check result
    if (
      !(
        transferResult &&
        transferResult.currentState === 'COMPLETED' &&
        transferResult.transfer.body.transferState === 'COMMITTED'
      )
    ) {
      throw Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_TRANSFER_FAILED
    }

    this.data.transferResponse = transferResult
    this.data.transactionRequestPatchUpdate = {
      transactionRequestState: this.data.transactionRequestState,
      transactionState: 'COMPLETED'
    }
  }

  async onNotifyTransferIsDone(): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPatchUpdate')

    try {
      await this.thirdpartyRequests.patchThirdpartyRequestsTransactions(
        this.data.transactionRequestPatchUpdate!,
        this.data.transactionRequestId,
        this.data.participantId
      )
    } catch (err) {
      this.logger.push({ err }).log('patchThirdpartyRequestsTransactions')
      throw Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_NOTIFICATION_FAILED
    }
  }

  // workflow
  async run(): Promise<void> {
    try {
      switch (this.data.currentState) {
        case 'start':
          await this.fsm.validateTransactionRequest()
          await this.saveToKVS()

        case 'transactionRequestIsValid':
          await this.fsm.notifyTransactionRequestIsValid()
          await this.saveToKVS()

        case 'notifiedTransactionRequestIsValid':
          await this.fsm.requestQuote()
          await this.saveToKVS()

        case 'quoteReceived':
          await this.fsm.requestAuthorization()
          await this.saveToKVS()

        case 'authorizationReceived':
          await this.fsm.verifyAuthorization()
          await this.saveToKVS()

        case 'authorizationReceivedIsValid':
          await this.fsm.requestTransfer()
          await this.saveToKVS()

        case 'transferIsDone':
          await this.fsm.notifyTransferIsDone()
          await this.saveToKVS()

        case 'transactionRequestIsDone':
          return

        case 'errored':
        default:
          await this.saveToKVS()
          // stopped in errored state
          this.logger.info('State machine in errored state')
      }
    } catch (error: any) {
      const mojaloopError = reformatError(error, this.logger)
      this.logger.push({ error, mojaloopError }).info(`Sending error response to ${this.data.participantId}`)
      this.data.currentState = 'errored'
      await this.saveToKVS()
      await this.thirdpartyRequests.putThirdpartyRequestsTransactionsError(
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        this.data.transactionRequestId,
        this.data.participantId
      )
    }
  }
}

export async function create(
  data: DFSPTransactionData,
  config: DFSPTransactionModelConfig
): Promise<DFSPTransactionModel> {
  // create a new model
  const model = new DFSPTransactionModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS(config: DFSPTransactionModelConfig): Promise<DFSPTransactionModel> {
  try {
    const data = await config.kvs.get<DFSPTransactionData>(config.key)
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

export default {
  DFSPTransactionModel,
  create,
  loadFromKVS
}
