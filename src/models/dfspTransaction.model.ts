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
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'

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
    InvalidDataError.throwIfInvalidProperty(this.data, 'participantId')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestRequest')

    // validation of transactionRequestRequest
    const validationResult = await this.dfspBackendRequests.validateThirdpartyTransactionRequest(
      this.data.transactionRequestRequest
    )
    if (!(validationResult && validationResult.isValid)) {
      // TODO: throw proper error when transactionRequestRequest is not valid
      // TODO: error should be transformed to call PUT /thirdpartyRequests/{ID}/transactions/error
      throw new Error('transactionRequestRequest is not valid')
    }

    // happy path - transactionRequestRequest is valid,
    // so let prepare notification payload to be send to PISPTransactionModel
    this.data.transactionRequestPutUpdate = {
      transactionId: uuid(),
      transactionRequestState: 'RECEIVED'
    }
  }

  async onNotifyTransactionRequestIsValid (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPutUpdate')

    // TODO: fspId field for payee.partyIdInfo should be mandatory, now it is optional
    InvalidDataError.throwIfInvalidProperty(
      this.data.transactionRequestRequest.payee.partyIdInfo, 'fspId'
    )

    // this field will be present what is guaranted by InvalidDataError validation above
    const update = this.data.transactionRequestPutUpdate as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
    const updateResult = await this.thirdpartyRequests.putThirdpartyRequestsTransactions(
      update,
      this.data.transactionRequestId,
      this.data.participantId
    )

    // check result and throw if invalid
    if (!(updateResult && updateResult.statusCode === 200)) {
      // TODO: throw proper error when notification failed
      // TODO: error should be transformed to call PUT /thirdpartyRequests/transactions/{ID}/error
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
    ) as SDKOutboundAPI.Schemas.authorizationsPostResponse

    if (!(resultAuthorization && resultAuthorization.currentState === 'COMPLETED')) {
      // TODO: throw proper error when quotes
      throw new Error('POST /authorizations failed')
    }

    this.data.requestAuthorizationResponse = resultAuthorization
  }

  async onVerifyAuthorization (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestAuthorizationResponse')

    // TODO: make verification of authorization data received in Approve phase from PISPTransactionModel
    // TODO: handle error case when authorization data isn't valid
    // TODO: prepare this.data.transferRequest
    this.data.transferRequest = {}
  }

  async onRequestTransfer (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transferRequest')

    // TODO: make a call to request simple transfer via SDKOutgoingRequests
    // TODO: store results from call
    this.data.transferResponse = {}

    // TODO: prepare this.data.transactionRequestPatchUpdate
    this.data.transactionRequestPatchUpdate =
      {} as unknown as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse
  }

  async onNotifyTransferIsDone (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPatchUpdate')
    // TODO: make a notification call to PISP
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
