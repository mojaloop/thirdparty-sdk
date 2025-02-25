/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import {
  PISPDiscoveryGetResponse,
  PISPDiscoveryModelConfig,
  PISPDiscoveryModelState,
  PISPDiscoveryData,
  PISPDiscoveryStateMachine
} from '~/models/outbound/pispDiscovery.interface'
import { v1_1 as fspiopAPI, thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { Message, PubSub } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'

import inspect from '~/shared/inspect'

export class PISPDiscoveryModel extends PersistentModel<PISPDiscoveryStateMachine, PISPDiscoveryData> {
  protected config: PISPDiscoveryModelConfig

  constructor(data: PISPDiscoveryData, config: PISPDiscoveryModelConfig) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [{ name: 'requestAccounts', from: 'start', to: 'succeeded' }],
      methods: {
        // specific transitions handlers methods
        onRequestAccounts: () => this.onRequestAccounts()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get subscriber(): PubSub {
    return this.config.subscriber
  }

  get thirdpartyRequests(): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  // generate the name of notification channel dedicated for accounts requests
  static notificationChannel(id: string): string {
    if (!(id && id.toString().length > 0)) {
      throw new Error("PISPDiscoveryModel.notificationChannel: 'id' parameter is required")
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
  async onRequestAccounts(): Promise<void> {
    const channel = PISPDiscoveryModel.notificationChannel(this.data.userId)
    const subscriber: PubSub = this.subscriber

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let subId = 0
      try {
        // in handlers/inbound is implemented UpdateAccountsByUserId handler
        // which publish getAccounts response to channel
        subId = this.subscriber.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // first unsubscribe
          subscriber.unsubscribe(channel, sid)

          type PutResponseOrError = tpAPI.Schemas.AccountsIDPutResponse & fspiopAPI.Schemas.ErrorInformationObject
          const putResponse = message as unknown as PutResponseOrError

          // store response which will be returned by 'getResponse' method in workflow 'run'
          this.data.response = {
            accounts: putResponse.errorInformation ? [] : putResponse.accounts!,
            currentState: PISPDiscoveryModelState[this.data.currentState as keyof typeof PISPDiscoveryModelState]
          }

          if (putResponse.errorInformation) {
            this.data.response.errorInformation = { ...putResponse.errorInformation }
          }
          resolve()
        })

        // send GET /accounts/${userId} request to the switch
        const res = await this.thirdpartyRequests.getAccounts(this.data.userId, this.data.toParticipantId)
        this.logger.push({ res }).info('getAccounts request sent to peer')
      } catch (error) {
        this.logger.push(error).error('getAccounts request error')
        subscriber.unsubscribe(channel, subId)
        reject(error)
      }
    })
  }

  /**
   * Returns an object representing the final state of the requestAccounts suitable for the outbound API
   *
   * @returns {object} - Response representing the result of the onRequestAccounts process
   */
  getResponse(): PISPDiscoveryGetResponse | void {
    return this.data.response
  }

  /**
   * runs the workflow
   */
  async run(): Promise<PISPDiscoveryGetResponse | void> {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      this.logger.info(`Error running PISPDiscoveryModel : ${inspect(err)}`)

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

export async function create(data: PISPDiscoveryData, config: PISPDiscoveryModelConfig): Promise<PISPDiscoveryModel> {
  // create a new model
  const model = new PISPDiscoveryModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}
