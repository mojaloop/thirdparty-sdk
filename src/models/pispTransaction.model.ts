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
 --------------
 ******/
import {
  InboundThirdpartyAuthorizationsPutRequest,
  OutboundThirdpartyAuthorizationsPostResponse,
  OutboundThirdpartyAuthorizationsModelConfig,
  OutboundThirdpartyAuthorizationsModelState,
  OutboundThirdpartyAuthorizationsData,
  OutboundThirdpartyAuthorizationStateMachine
} from '~/models/thirdparty.authorizations.interface'
import { Message, PubSub } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { MojaloopRequests, ThirdpartyRequests } from '@mojaloop/sdk-standard-components'

import inspect from '~/shared/inspect'
import { PISPTransactionData, PISPTransactionModelConfig, PISPTransactionPhase, PISPTransactionStateMachine } from './pispTransaction.interface'

export class PISPTransactionModel
  extends PersistentModel<PISPTransactionStateMachine, PISPTransactionData> {
  protected config: PISPTransactionModelConfig

  constructor(
    data: PISPTransactionData,
    config: PISPTransactionModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        // Party Lookup Phase
        { name: 'requestPartyLookup', from: 'start', to: 'partyLookup' },
        { name: 'resolvedPartyLookup', from: 'partyLookup', to: 'partyLookupSuccess' },

        // Initiate Transaction
        { name: 'initiate', from: 'partyLookupSuccess', to: 'requestTransaction' },
        { name: 'requestAuthorization', from: 'requestTransaction', to: 'authorizationReceived' },

        // Approve Transaction
        { name: 'approve', from: 'authorizationReceived', to: 'approvalReceived' },
        { name: 'notifySuccess', from: 'approvalReceived', to: 'transactionSuccess' },

      ],
      methods: {
        // specific transitions handlers methods
        onRequestPartyLookup: () => this.onRequestPartyLookup(),
        onResolvedPartyLookup:  () => this.onResolvedPartyLookup(),
        initiate: () => this.initiate(),
        requestAuthorization: () => this.requestAuthorization(),
        approve: () => this.approve(),
        notifySuccess: () => this.notifySuccess()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get pubSub(): PubSub {
    return this.config.pubSub
  }

  get thirdpartyRequests(): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  get mojaloopRequests(): MojaloopRequests {
    return this.config.mojaloopRequests
  }

  // TODO: why can't we overload these?
  static notificationChannel(phase: PISPTransactionPhase, transactionRequestId: string): string {
    if (!transactionRequestId) {
      throw new Error('PISPTransactionModel.notificationChannel: \'transactionRequestId\' parameter is required')
    }
    // channel name
    return `pisp_transaction_${phase}_${transactionRequestId}`
  }

  static partyNotificationChannel(phase: PISPTransactionPhase, partyType: string, id: string, subId?: string): string {
    if (!(partyType && id && (typeof subId === 'string' && !subId))) {
      throw new Error('PISPTransactionModel.partyNotificationChannel: \'partyType, id, subId (when specified)\' parameters are required')
    }
    // channel name
    // format is: `pisp_transaction_<phase>_<partyTypeOrTransactionId>[_<subId>]`
    return [
      PISPTransactionModel.notificationChannel(phase, partyType),
      id,
      subId
    ].filter(x=>!!x).join('_')
  }

  async onRequestPartyLookup(): Promise<void> {
    const { type: partyType, id: partyId, subId: partySubId } = this.data.payeeRequest
    const channel = PISPTransactionModel.partyNotificationChannel(PISPTransactionPhase.lookup, partyType, partyId, partySubId)
    const pubSub: PubSub = this.pubSub

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let subId = 0
      try {
        // in handlers/inbound is implemented putThirdpartyAuthorizationsById handler
        // which publish thirdparty authorizations response to channel
        subId = this.pubSub.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // first unsubscribe
          pubSub.unsubscribe(channel, sid)

          const putResponse = { ...message as unknown as InboundThirdpartyAuthorizationsPutRequest }
          // store response which will be returned by 'getResponse' method in workflow 'run'
          this.data.response = {
            ...putResponse,
            currentState: OutboundThirdpartyAuthorizationsModelState[
              this.data.currentState as keyof typeof OutboundThirdpartyAuthorizationsModelState
            ]
          }
          resolve()
        })
        // POST /thirdpartyRequests/transactions/${transactionRequestId}/authorizations request to the switch
        const res = await this.requests.postThirdpartyRequestsTransactionsAuthorizations(
          this.data.request,
          this.config.key,
          this.data.toParticipantId
        )
        this.logger.push({ res })
        this.logger.info('ThirdpartyAuthorizations request sent to peer')
      } catch (error) {
        this.logger.push(error)
        this.logger.error('ThirdpartyAuthorizations request error')
        pubSub.unsubscribe(channel, subId)
        reject(error)
      }
    })
  }

  async onResolvedPartyLookup(): Promise<void> {

  }

  async initiate(): Promise<void> {

  }

  async requestAuthorization(): Promise<void> {

  }

  async approve(): Promise<void> {

  }

  async notifySuccess(): Promise<void> {

  }


  /**
   * Requests Thirdparty Authorization
   * Starts the thirdparty authorization process by sending a
   * POST /thirdpartyRequests/transactions/${transactionRequestId}/authorizations request to switch
   * than await for a notification on PUT /thirdpartyRequests/transactions/${transactionRequestId}/authorizations
   * from the PubSub that the Authorization has been resolved
   */
  async onThirdpartyRequestAuthorization(): Promise<void> {
    const channel = OutboundThirdpartyAuthorizationsModel.notificationChannel(this.config.key)
    const pubSub: PubSub = this.pubSub

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let subId = 0
      try {
        // in handlers/inbound is implemented putThirdpartyAuthorizationsById handler
        // which publish thirdparty authorizations response to channel
        subId = this.pubSub.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // first unsubscribe
          pubSub.unsubscribe(channel, sid)

          const putResponse = { ...message as unknown as InboundThirdpartyAuthorizationsPutRequest }
          // store response which will be returned by 'getResponse' method in workflow 'run'
          this.data.response = {
            ...putResponse,
            currentState: OutboundThirdpartyAuthorizationsModelState[
              this.data.currentState as keyof typeof OutboundThirdpartyAuthorizationsModelState
            ]
          }
          resolve()
        })

        // POST /thirdpartyRequests/transactions/${transactionRequestId}/authorizations request to the switch
        const res = await this.requests.postThirdpartyRequestsTransactionsAuthorizations(
          this.data.request,
          this.config.key,
          this.data.toParticipantId
        )
        this.logger.push({ res })
        this.logger.info('ThirdpartyAuthorizations request sent to peer')
      } catch (error) {
        this.logger.push(error)
        this.logger.error('ThirdpartyAuthorizations request error')
        pubSub.unsubscribe(channel, subId)
        reject(error)
      }
    })
  }

  /**
   * Returns an object representing the final state of the thirdparty authorization suitable for the outbound API
   *
   * @returns {object} - Response representing the result of the thirdparty authorization process
   */
  getResponse(): OutboundThirdpartyAuthorizationsPostResponse | void {
    return this.data.response
  }

  /**
   * runs the workflow
   */
  async run(): Promise<OutboundThirdpartyAuthorizationsPostResponse | void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          // the first transition is thirdpartyRequestAuthorization
          await this.fsm.thirdpartyRequestAuthorization()
          this.logger.info(
            `ThirdpartyAuthorizations requested for ${data.transactionRequestId},  currentState: ${data.currentState}`
          )
        /* falls through */

        case 'succeeded':
          // all steps complete so return
          this.logger.info('ThirdpartyAuthorizations completed successfully')
          return this.getResponse()

        case 'errored':
          // stopped in errored state
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running ThirdpartyAuthorizations model: ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a thirdpartythirdpartyAuthorizationState property here!
        if (err.thirdpartyAuthorizationState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between thirdpartyAuthorizationState.lastError and err
        err.thirdpartyAuthorizationState = { ...this.getResponse() }
      }
      throw err
    }
  }
}

export async function create(
  data: OutboundThirdpartyAuthorizationsData,
  config: OutboundThirdpartyAuthorizationsModelConfig
): Promise<OutboundThirdpartyAuthorizationsModel> {
  // create a new model
  const model = new OutboundThirdpartyAuthorizationsModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS(
  config: OutboundThirdpartyAuthorizationsModelConfig
): Promise<OutboundThirdpartyAuthorizationsModel> {
  try {
    const data = await config.kvs.get<OutboundThirdpartyAuthorizationsData>(config.key)
    if (!data) {
      throw new Error(`No data found in KVS for: ${config.key}`)
    }
    config.logger.push({ data })
    config.logger.info('data loaded from KVS')
    return new OutboundThirdpartyAuthorizationsModel(data, config)
  } catch (err) {
    config.logger.push({ err })
    config.logger.info(`Error loading data from KVS for key: ${config.key}`)
    throw err
  }
}
