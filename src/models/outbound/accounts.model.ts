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
  OutboundAccountsGetResponse,
  OutboundAccountsModelConfig,
  OutboundAccountsModelState,
  OutboundAccountsData,
  OutboundAccountsStateMachine
} from '~/models/accounts.interface'
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { Message, PubSub } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'

import inspect from '~/shared/inspect'

export class OutboundAccountsModel
  extends PersistentModel<OutboundAccountsStateMachine, OutboundAccountsData> {
  protected config: OutboundAccountsModelConfig

  constructor (
    data: OutboundAccountsData,
    config: OutboundAccountsModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'requestAccounts', from: 'start', to: 'succeeded' }
      ],
      methods: {
        // specific transitions handlers methods
        onRequestAccounts: () => this.onRequestAccounts()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get pubSub (): PubSub {
    return this.config.pubSub
  }

  get requests (): ThirdpartyRequests {
    return this.config.requests
  }

  // generate the name of notification channel dedicated for accounts requests
  static notificationChannel (id: string): string {
    if (!(id && id.toString().length > 0)) {
      throw new Error('OutboundAccountsModel.notificationChannel: \'id\' parameter is required')
    }
    // channel name
    return `accounts_${id}`
  }

  /**
   * Requests User Accounts
   * Starts the get accounts process by sending a
   * GET /accounts/${userId} request to switch
   * than await for a notification on PUT /accounts/${userId}
   * from the PubSub that the requestAccounts has been resolved
   */
  async onRequestAccounts (): Promise<void> {
    const channel = OutboundAccountsModel.notificationChannel(this.data.userId)
    const pubSub: PubSub = this.pubSub

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let subId = 0
      try {
        // in handlers/inbound is implemented UpdateAccountsByUserId handler
        // which publish getAccounts response to channel
        subId = this.pubSub.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // if (!message) {
          //   return reject(new Error('invalid Message'))
          // }
          // first unsubscribe
          pubSub.unsubscribe(channel, sid)

          const putResponse = { ...message as unknown as tpAPI.Schemas.AccountsIDPutResponse }
          // store response which will be returned by 'getResponse' method in workflow 'run'
          this.data.response = {
            accounts: putResponse,
            currentState: OutboundAccountsModelState[
              this.data.currentState as keyof typeof OutboundAccountsModelState
            ]
          }
          resolve()
        })

        // send GET /accounts/${userId} request to the switch
        const res = await this.requests.getAccounts(this.data.userId, this.data.toParticipantId)
        this.logger.push({ res }).info('getAccounts request sent to peer')
      } catch (error) {
        this.logger.push(error).error('getAccounts request error')
        pubSub.unsubscribe(channel, subId)
        reject(error)
      }
    })
  }

  /**
   * Returns an object representing the final state of the requestAccounts suitable for the outbound API
   *
   * @returns {object} - Response representing the result of the onRequestAccounts process
   */
  getResponse (): OutboundAccountsGetResponse | void {
    return this.data.response
  }

  /**
   * runs the workflow
   */
  async run (): Promise<OutboundAccountsGetResponse | void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          // the first transition is requestAccounts
          await this.fsm.requestAccounts()
          this.logger.info(`getAccounts requested for ${data.userId},  currentState: ${data.currentState}`)
        /* falls through */

        case 'succeeded':
          // all steps complete so return
          this.logger.info('getAccounts completed successfully')
          return this.getResponse()

        case 'errored':
          // stopped in errored state
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running OutboundAccountsModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a accountsState property here!
        if (err.accountsState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between accountsState.lastError and err
        err.accountsState = { ...this.getResponse() }
      }
      throw err
    }
  }
}

export async function create (
  data: OutboundAccountsData,
  config: OutboundAccountsModelConfig
): Promise<OutboundAccountsModel> {
  // create a new model
  const model = new OutboundAccountsModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: OutboundAccountsModelConfig
): Promise<OutboundAccountsModel> {
  try {
    const data = await config.kvs.get<OutboundAccountsData>(config.key)
    if (!data) {
      throw new Error(`No data found in KVS for: ${config.key}`)
    }
    config.logger.push({ data })
    config.logger.info('data loaded from KVS')
    return new OutboundAccountsModel(data, config)
  } catch (err) {
    config.logger.push({ err })
    config.logger.info(`Error loading data from KVS for key: ${config.key}`)
    throw err
  }
}
