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

  // transitions handlers
  async onValidateTransactionRequest (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestId')
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestRequest')

    // TODO: make validation of transactionRequestRequest
    // TODO: error scenario: transactionRequestRequest is not valid

    // happy path - transactionRequestRequest is valid,
    // so let prepare notification payload to be send to PISPTransactionModel
    this.data.transactionRequestPutUpdate = {
      transactionId: uuid(),
      transactionRequestState: 'RECEIVED'
    }
  }

  async onNotifyTransactionRequestIsValid (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'transactionRequestPutUpdate')

    // TODO: make a notification call PUT /thirdpartyRequests/{ID}/transaction

    // TODO: prepare this.data.requestQuoteRequest
    this.data.requestQuoteRequest = {}
  }

  async onRequestQuote (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestQuoteRequest')

    // TODO: make a call to get quotes from SDKOutgoingRequests
    // TODO: store results from call
    this.data.requestQuoteResponse = {}
  }

  async onRequestAuthorization (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestQuoteResponse')

    // TODO: make a call to request authorization via SDKOutgoingRequests
    // TODO: prepare this.data.requestAuthorizationPostRequest
    this.data.requestAuthorizationPostRequest = {}
    // TODO: store results from call
    this.data.requestAuthorizationPostResponse = {}
  }

  async onVerifyAuthorization (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'requestAuthorizationPostResponse')

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
    this.data.transactionRequestPatchUpdate = {} as unknown as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse
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
