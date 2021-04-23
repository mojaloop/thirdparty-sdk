/* eslint-disable no-fallthrough */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
import { uuid } from 'uuidv4'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

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
export class DFSPTransactionModel
  extends PersistentModel<DFSPTransactionStateMachine, DFSPTransactionData> {
  protected config: DFSPTransactionModelConfig

  constructor (
    data: DFSPTransactionData,
    config: DFSPTransactionModelConfig
  ) {
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

  get sdkOutgoingRequests (): SDKOutgoingRequests {
    return this.config.sdkOutgoingRequests
  }

  get dfspBackendRequests (): DFSPBackendRequests {
    return this.config.dfspBackendRequests
  }

  get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  // transitions handlers
  async onValidateTransactionRequest (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestId')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestState')
    InvalidDataError.throwIfInvalidProperty(this.data, 'participantId')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestRequest')

    // validation of transactionRequestRequest
    const validationResult = await this.dfspBackendRequests.validateThirdpartyTransactionRequest(
      this.data.transactionRequestRequest
    )
    if (!(validationResult && validationResult.isValid)) {
      // TODO: throw proper error when transactionRequestRequest is not valid
      // TODO: error should be transformed to call PUT /thirdpartyRequests/{ID}/transactions/error
      // TP_FSP_TRANSACTION_REQUEST_NOT_VALID
      throw new Error('transactionRequestRequest is not valid')
    }

    // allocate new id
    this.data.transactionId = uuid()

    // so let prepare notification payload to be send to PISPTransactionModel
    this.data.transactionRequestPutUpdate = {
      transactionId: this.data.transactionId,
      transactionRequestState: this.data.transactionRequestState
    }
  }

  async onNotifyTransactionRequestIsValid (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPutUpdate')

    // TODO: fspId field for payee.partyIdInfo should be mandatory, now it is optional
    InvalidDataError.throwIfInvalidProperty(
      this.data.transactionRequestRequest.payee.partyIdInfo, 'fspId'
    )

    // this field will be present which is guaranteed by InvalidDataError validation above
    const update = this.data.transactionRequestPutUpdate as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
    const updateResult = await this.thirdpartyRequests.putThirdpartyRequestsTransactions(
      update,
      this.data.transactionRequestId,
      this.data.participantId
    )

    // check result and throw if invalid
    if (!(updateResult && updateResult.statusCode >= 200 && updateResult.statusCode < 300)) {
      // TODO: throw proper error when notification failed
      // TODO: error should be transformed to call PUT /thirdpartyRequests/transactions/{ID}/error
      // TP_FSP_TRANSACTION_PUT_UPDATE_FAILED
      throw new Error(`PUT /thirdpartyRequests/transactions/${this.data.transactionRequestId} failed`)
    }

    // shortcut
    const tr = this.data.transactionRequestRequest

    // prepare request for quote
    this.data.requestQuoteRequest = {
      // TODO: fspId field for payee.partyIdInfo should be mandatory, now it is optional
      fspId: tr.payee.partyIdInfo.fspId!,
      quotesPostRequest: {
        // allocate quoteId
        quoteId: uuid(),

        // copy from previously allocated
        transactionId: this.data.transactionRequestPutUpdate!.transactionId,

        // copy from request
        transactionRequestId: tr.transactionRequestId,
        payee: { ...tr.payee },
        // TODO: investigate quotes interface and payer 'THIRD_PARTY_LINK' problem
        payer: { partyIdInfo: { ...tr.payer } },
        amountType: tr.amountType,
        amount: { ...tr.amount },
        transactionType: { ...tr.transactionType }
      }
    }
  }

  async onRequestQuote (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestQuoteRequest')

    // request quote via sync interface on sdk-scheme-adapter
    const resultQuote = await this.sdkOutgoingRequests.requestQuote(this.data.requestQuoteRequest!)

    // check result and throw if invalid
    if (!(resultQuote && resultQuote.currentState === 'COMPLETED')) {
      // TODO: throw proper error
      // TODO: error should be transformed to call PUT /thirdpartyRequests/{ID}/transactions/error
      // TP_FSP_TRANSACTION_REQUEST_QUOTE_FAILED

      throw new Error('POST /quotes failed')
    }

    // store result in state
    this.data.requestQuoteResponse = resultQuote
  }

  async onRequestAuthorization (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestQuoteResponse')

    this.data.requestAuthorizationPostRequest = {
      fspId: this.data.participantId,
      authorizationsPostRequest: {
        authenticationType: 'U2F',
        retriesLeft: '1',
        amount: { ...this.data.transactionRequestRequest.amount },
        quote: { ...this.data.requestQuoteResponse!.quotes },
        transactionId: this.data.transactionRequestPutUpdate!.transactionId,
        transactionRequestId: this.data.transactionRequestId
      }
    }

    const resultAuthorization = await this.sdkOutgoingRequests.requestAuthorization(
      this.data.requestAuthorizationPostRequest
    )

    if (!(resultAuthorization && resultAuthorization.currentState === 'COMPLETED')) {
      // TODO: throw proper error
      // TP_FSP_TRANSACTION_REQUEST_AUTHORIZATION_FAILED
      throw new Error('POST /authorizations failed')
    }

    this.data.requestAuthorizationResponse = resultAuthorization
  }

  async onVerifyAuthorization (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestAuthorizationResponse')

    // shortcut
    const authorizationInfo = this.data.requestAuthorizationResponse!.authorizations

    // different actions on responseType
    switch (authorizationInfo.responseType) {
      case 'ENTERED': {
        // user accepted quote & transfer details
        // let verify entered signed challenge by DFSP backend
        const result = await this.dfspBackendRequests.verifyAuthorization(authorizationInfo)

        if (!(result && result.isValid)) {
          // challenge is improperly signed
          // TODO: throw proper error
          // TP_FSP_TRANSACTION_AUTHORIZATION_NOT_VALID
          throw new Error('POST /verify-authorization failed')
        }

        // user's challenge has been successfully verified
        this.data.transactionRequestState = 'ACCEPTED'

        // TODO: to have or not to have transferId - what has been passed to quote - investigate!!!
        this.data.transferId = uuid()

        const tr = this.data.transactionRequestRequest
        const quote = this.data.requestQuoteResponse!.quotes
        // prepare transfer request
        this.data.transferRequest = {
          // TODO: payer.fspId is optional it should be mandatory
          fspId: tr.payer.fspId!,
          transfersPostRequest: {
            transferId: this.data.transferId!,

            // payee & payer data from /thirdpartyRequests/transaction
            payeeFsp: tr.payee.partyIdInfo.fspId!,
            payerFsp: tr.payer.fspId!,

            // transfer data from quote response
            amount: { ...quote.transferAmount },
            ilpPacket: quote.ilpPacket,
            condition: quote.condition,

            // TODO: investigate recalculation of expiry...
            expiration: tr.expiration
          }

        }
        break
      }

      case 'REJECTED': {
        // user rejected authorization so transfer is declined, let abort workflow!
        this.data.transactionRequestState = 'REJECTED'

        // TODO: throw proper error;
        // PUT /thirdpartyRequests/transactions/{ID}/error
        // or  PATCH /thirdpartyRequests/transactions/{ID} ????
        // TP_FSP_TRANSACTION_AUTHORIZATION_REJECTED_BY_USER
        throw new Error('Authorization/Transfer REJECTED')
      }

      default: {
        // should we setup ??? this.data.transactionRequestState = 'REJECTED'
        // we received 'RESEND' or something else
        // TP_FSP_TRANSACTION_AUTHORIZATION_UNEXPECTED
        throw new Error(`Unexpected authorization responseType: ${authorizationInfo.responseType}`)
      }
    }
  }

  async onRequestTransfer (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transferRequest')

    // make a call to switch via sync sdk api
    const transferResult = await this.sdkOutgoingRequests.requestTransfer(
      this.data.transferRequest!
    )

    // check result
    if (
      !(transferResult &&
        transferResult.currentState === 'COMPLETED' &&
        transferResult.transfer.transferState === 'COMMITTED'
      )
    ) {
      // TODO: throw proper error
      // TP_FSP_TRANSACTION_TRANSFER_FAILED
      throw new Error('POST /simpleTransfer failed')
    }
    this.data.transferResponse = transferResult

    this.data.transactionRequestPatchUpdate = {
      transactionId: this.data.transactionId!,
      transactionRequestState: this.data.transactionRequestState,
      transactionState: 'COMPLETED'
    }
  }

  async onNotifyTransferIsDone (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPatchUpdate')

    const result = await this.thirdpartyRequests.patchThirdpartyRequestsTransactions(
      this.data.transactionRequestPatchUpdate!,
      this.data.transactionRequestId,
      this.data.participantId
    )
    if (!result) {
      // TP_FSP_TRANSACTION_NOTIFICATION_FAILED
      throw new Error('PATCH /thirdpartyRequests/transactions/{ID} failed')
    }
  }

  // workflow
  async run (): Promise<void> {
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
  }
}

export async function create (
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
export async function loadFromKVS (
  config: DFSPTransactionModelConfig
): Promise<DFSPTransactionModel> {
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
