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
 - Lewis Daly <lewisd@crosslaketech.com>
 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { Message, PubSub } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import {
  MojaloopRequests,
  ThirdpartyRequests
} from '@mojaloop/sdk-standard-components'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'

import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import {
  PISPTransactionData,
  PISPTransactionModelConfig,
  PISPTransactionPhase,
  PISPTransactionStateMachine
} from './pispTransaction.interface'
import inspect from '~/shared/inspect'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { HTTPResponseError } from '~/shared/http-response-error'
import deferredJob from '~/shared/deferred-job'
import { InvalidDataError } from '~/shared/invalid-data-error'

export class PISPTransactionModel
  extends PersistentModel<PISPTransactionStateMachine, PISPTransactionData> {
  protected config: PISPTransactionModelConfig

  constructor (
    data: PISPTransactionData,
    config: PISPTransactionModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        // Party Lookup Phase
        { name: 'requestPartyLookup', from: 'start', to: 'partyLookupSuccess' },
        { name: 'failPartyLookup', from: 'partyLookupSuccess', to: 'partyLookupFailure' },

        // Initiate Transaction Phase
        { name: 'initiate', from: 'partyLookupSuccess', to: 'authorizationReceived' },

        // Approve Transaction Phase
        { name: 'approve', from: 'authorizationReceived', to: 'transactionStatusReceived' }

      ],
      methods: {
        // specific transitions handlers methods
        onRequestPartyLookup: () => this.onRequestPartyLookup(),
        onFailPartyLookup: () => this.onFailPartyLookup(),
        onInitiate: () => this.onInitiate(),
        onApprove: () => this.onApprove()
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

  get mojaloopRequests (): MojaloopRequests {
    return this.config.mojaloopRequests
  }

  get sdkOutgoingRequests (): SDKOutgoingRequests {
    return this.config.sdkOutgoingRequests
  }

  static notificationChannel (phase: PISPTransactionPhase, transactionRequestId: string): string {
    if (!transactionRequestId) {
      throw new Error('PISPTransactionModel.notificationChannel: \'transactionRequestId\' parameter is required')
    }

    // channel name
    return `pisp_transaction_${phase}_${transactionRequestId}`
  }

  static async triggerWorkflow (
    phase: PISPTransactionPhase,
    transactionRequestId: string,
    pubSub: PubSub,
    message: Message
  ): Promise<void> {
    const channel = PISPTransactionModel.notificationChannel(phase, transactionRequestId)
    return deferredJob(pubSub, channel).trigger(message)
  }

  async onRequestPartyLookup (): Promise<void> {
    // input validation
    InvalidDataError.throwIfInvalidProperty(this.data, 'payeeRequest')
    InvalidDataError.throwIfInvalidProperty(this.data!.payeeRequest as Record<string, unknown>, 'payee')
    InvalidDataError.throwIfInvalidProperty(
      this.data!.payeeRequest!.payee as Record<string, unknown>, 'partyIdType'
    )
    InvalidDataError.throwIfInvalidProperty(
      this.data!.payeeRequest!.payee as Record<string, unknown>, 'partyIdentifier'
    )

    // extract params for GET /parties
    const payee = this.data!.payeeRequest!.payee

    try {
      // call GET /parties on sdk-scheme-adapter Outbound service
      const response = this.data.payeeResolved = await this.sdkOutgoingRequests.requestPartiesInformation(
        payee.partyIdType, payee.partyIdentifier, payee.partySubIdOrType
      ) as SDKOutboundAPI.Schemas.partiesByIdResponse

      // store results
      this.data.partyLookupResponse = {
        party: response.party,
        currentState: this.data.currentState as OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupState
      }
    } catch (error) {
      this.logger.push({ error }).error('onRequestPartyLookup -> requestPartiesInformation')
      // try to handle specific HTTP related error
      if (error instanceof HTTPResponseError) {
        const errorData = error.getData()
        // do we have errorInformation -> if yes handle it elsewhere rethrow error
        if (errorData?.res?.data?.errorInformation) {
          await this.fsm.error()
          this.data.partyLookupResponse = {
            errorInformation: errorData.res.data.errorInformation,
            currentState: this.data.currentState as OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupState
          }
          // error handled, no need to rethrow
          return
        }
      }
      // rethrow unhandled error
      throw error
    }
  }

  onFailPartyLookup (): void {
    this.data!.partyLookupResponse!.currentState = 'partyLookupFailure'
  }

  async onInitiate (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'payeeRequest')
    InvalidDataError.throwIfInvalidProperty(this.data, 'initiateRequest')

    // we need to mitigate the hazard, we don't know from which callback we will get messages first
    // so let have a barrier and wait for both messages

    // waiting on PUT /thirdpartyRequests/{ID}/transaction callback
    // first channel
    const channelWaitOnTransPut = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.waitOnTransactionPut,
      this.data.transactionRequestId!
    )
    // first deferredJob will only listen on first channel
    // where the message from PUT /thirdpartyRequests/{ID}/transaction should be published
    const waitOnTransPut = deferredJob(this.subscriber, channelWaitOnTransPut)
      .init(async (): Promise<void> => {
        // initiate the workflow - forward request to DFSP
        const request: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest = {
          transactionRequestId: this.data?.transactionRequestId as string,
          ...this.data?.initiateRequest as OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateRequest
        }
        const res = await this.thirdpartyRequests.postThirdpartyRequestsTransactions(
          request,
          this.data.initiateRequest!.payer.fspId!
        )
        this.logger.push({ res }).info('ThirdpartyRequests.postThirdpartyRequestsTransactions request sent to peer')
      })
      .job(async (message: Message): Promise<void> => {
        // receive the transfer state update from PUT /thirdpartyRequests/{ID}/transaction
        this.data.transactionStatusPut = {
          ...message as unknown as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
        }
        // TODO: error case when transactionRequestState !== 'RECEIVED'
        this.saveToKVS()
      })
      .wait(this.config.initiateTimeoutInSeconds * 1000)

    // waiting on POST /authorizations callback
    // second channel
    const channelWaitOnAuthPost = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.waitOnAuthorizationPost,
      this.data.transactionRequestId!
    )

    // second deferredJob will listen only on second channel
    // where the message from POST /authorization should be published
    const waitOnAuthPost = deferredJob(this.subscriber, channelWaitOnAuthPost)
      .init(async (): Promise<void> => {
        // do nothing - workflow will be initiated by waitOnTrans.init above ^^^
        return Promise.resolve()
      })
      .job(async (message: Message): Promise<void> => {
        // receive auth request from POST /authorization
        this.data.authorizationRequest = { ...message as unknown as tpAPI.Schemas.AuthorizationsPostRequest }
        this.saveToKVS()
      })
      .wait(this.config.initiateTimeoutInSeconds * 1000)

    // barrier is build up on waiting for two promises to be resolved
    // each promise resolves when receives message from corresponding callback or timeout
    // so wait until we will receive and consume both messages
    await Promise.all([waitOnAuthPost, waitOnTransPut])

    // when both messages from callbacks comes successfully on barrier
    // we can prepare the Initiate response
    this.data.initiateResponse = {
      authorization: { ...this.data.authorizationRequest! },
      currentState: this.data.currentState as OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateState
    }
  }

  async onApprove (): Promise<void> {
    InvalidDataError.throwIfInvalidProperty(this.data, 'payeeRequest')
    InvalidDataError.throwIfInvalidProperty(this.data, 'initiateRequest')
    InvalidDataError.throwIfInvalidProperty(this.data, 'approveRequest')

    const channel = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.approval,
      this.data.transactionRequestId!
    )

    this.logger.push({ channel }).info('onApprove - subscribe to channel')

    return deferredJob(this.subscriber, channel)
      .init(async (): Promise<void> => {
        const res = await this.mojaloopRequests.putAuthorizations(
          this.data.transactionRequestId!,
          // propagate signed challenge
          this.data.approveRequest!.authorizationResponse,
          this.data.initiateRequest!.payer.fspId!
        )
        this.logger.push({ res }).info('ThirdpartyRequests.postThirdpartyRequestsTransactions request sent to peer')
      })
      .job(async (message: Message): Promise<void> => {
        this.data.transactionStatusPatch = {
          ...message as unknown as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse
        }
        this.data.approveResponse = {
          transactionStatus: { ...this.data.transactionStatusPatch },
          currentState: this.data.currentState as OutboundAPI.Schemas.ThirdpartyTransactionIDApproveState
        }
      })
      .wait(this.config.approveTimeoutInSeconds * 1000)
  }

  /**
   * depending on current state of model returns proper result
   */
  getResponse (): OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupResponse |
  OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateResponse |
  OutboundAPI.Schemas.ThirdpartyTransactionIDApproveResponse |
  void {
    switch (this.data.currentState) {
      case 'partyLookupSuccess':
      case 'partyLookupFailure':
        return this.data.partyLookupResponse
      case 'authorizationReceived':
        return this.data.initiateResponse
      case 'transactionStatusReceived':
        return this.data.approveResponse
      default:
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<
  OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupResponse |
  OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateResponse |
  OutboundAPI.Schemas.ThirdpartyTransactionIDApproveResponse |
  void
  > {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        // lookup phase
        case 'start':
          // save model to protect against data overwrite
          await this.saveToKVS()

          this.logger.info(
            `requestPartyLookup requested for ${data.transactionRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.requestPartyLookup()
          if (
            (
              this.data.partyLookupResponse as OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupResponseError
            ).errorInformation
          ) {
            await this.fsm.failPartyLookup()
            this.logger.info('requestPartyLookup failed')
          } else {
            this.logger.info('requestPartyLookup completed successfully')
          }
          await this.saveToKVS()
          return this.getResponse()

        // initiate phase
        case 'partyLookupSuccess':
          this.logger.info(
            `initiate requested for ${data.transactionRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.initiate()
          this.logger.info('initiate completed successfully')
          await this.saveToKVS()
          return this.getResponse()

        // approve phase
        case 'authorizationReceived':
          this.logger.info(
            `approve requested for ${data.transactionRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.approve()
          this.logger.info('approve completed successfully')
          await this.saveToKVS()
          return this.getResponse()

        case 'errored':
        default:
          await this.saveToKVS()
          // stopped in errored state
          this.logger.info('State machine in errored state')
          return this.getResponse()
      }
    } catch (err) {
      this.logger.info(`Error running PISPTransactionModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a pispTransactionState property here!
        if (err.pispTransactionState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between pispTransactionState.lastError and err
        err.pispTransactionState = { ...this.data }
      }
      throw err
    }
  }
}

export async function existsInKVS (config: PISPTransactionModelConfig): Promise<boolean> {
  return config.kvs.exists(config.key)
}

export async function create (
  data: PISPTransactionData,
  config: PISPTransactionModelConfig
): Promise<PISPTransactionModel> {
  // create a new model
  const model = new PISPTransactionModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: PISPTransactionModelConfig
): Promise<PISPTransactionModel> {
  try {
    const data = await config.kvs.get<PISPTransactionData>(config.key)
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
  InvalidDataError,
  PISPTransactionModel,
  existsInKVS,
  create,
  loadFromKVS
}
