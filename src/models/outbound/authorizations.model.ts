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

import {
  OutboundAuthorizationsPostResponse,
  OutboundAuthorizationsModelConfig,
  OutboundAuthorizationsModelState,
  OutboundAuthorizationData,
  OutboundAuthorizationStateMachine
} from '~/models/authorizations.interface'
import {
  v1_1 as fspiopAPI
} from '@mojaloop/api-snippets'

import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { Message, PubSub } from '~/shared/pub-sub'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import inspect from '~/shared/inspect'

export class OutboundAuthorizationsModel
  extends PersistentModel<OutboundAuthorizationStateMachine, OutboundAuthorizationData> {
  protected config: OutboundAuthorizationsModelConfig

  constructor (
    data: OutboundAuthorizationData,
    config: OutboundAuthorizationsModelConfig
  ) {
    // request authorization state machine model
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'requestAuthorization', from: 'start', to: 'succeeded' }
      ],
      methods: {
        // specific transitions handlers methods
        onRequestAuthorization: () => this.onRequestAuthorization()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get subscriber (): PubSub {
    return this.config.subscriber
  }

  get requests (): ThirdpartyRequests {
    return this.config.requests
  }

  // generate the name of notification channel dedicated for authorizations requests
  static notificationChannel (id: string): string {
    // mvp validation
    if (!(id && id.toString().length > 0)) {
      throw new Error('OutboundAuthorizationsModel.notificationChannel: \'id\' parameter is required')
    }

    // channel name
    return `authorizations_${id}`
  }

  /**
   * Requests Authorization
   * Starts the authorization process by sending a POST /authorizations request to switch;
   * than await for a notification on PUT /authorizations/<transactionRequestId>
   * from the PubSub that the Authorization has been resolved
   */
  async onRequestAuthorization (): Promise<void> {
    const channel = OutboundAuthorizationsModel.notificationChannel(this.data.request.transactionRequestId)
    const subscriber: PubSub = this.subscriber

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let subId = 0
      try {
        // in handlers/inbound is implemented putAuthorizationsById handler
        // which publish PutAuthorizationsResponse to channel
        subId = this.subscriber.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // first unsubscribe
          subscriber.unsubscribe(channel, sid)

          // TODO: investigate PubSub subscribe method and callback
          // should be a generic so casting here would be not necessary...
          const putResponse = { ...message as unknown as fspiopAPI.Schemas.AuthorizationsIDPutResponse }

          // store response which will be returned by 'getResponse' method in workflow 'run'
          this.data.response = {
            authenticationInfo: putResponse.authenticationInfo,
            responseType: putResponse.responseType,
            currentState: OutboundAuthorizationsModelState[
              this.data.currentState as keyof typeof OutboundAuthorizationsModelState
            ]
          }
          resolve()
        })

        // POST /authorization request to the switch
        const res = await this.requests.postAuthorizations(this.data.request, this.data.toParticipantId)

        this.logger.push({ res }).info('Authorizations request sent to peer')
      } catch (error) {
        this.logger.push(error).error('Authorization request error')
        subscriber.unsubscribe(channel, subId)
        reject(error)
      }
    })
  }

  /**
   * Returns an object representing the final state of the authorization suitable for the outbound API
   *
   * @returns {object} - Response representing the result of the authorization process
   */
  getResponse (): OutboundAuthorizationsPostResponse | void {
    return this.data.response
  }

  /**
   * runs the workflow
   */
  async run (): Promise<OutboundAuthorizationsPostResponse | void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          // the first transition is requestAuthorization
          await this.fsm.requestAuthorization()
          this.logger.info(
            `Authorization requested for ${data.transactionRequestId},  currentState: ${data.currentState}`
          )
          /* falls through */

        case 'succeeded':
          // all steps complete so return
          this.logger.info('Authorization completed successfully')
          return this.getResponse()

        case 'errored':
          // stopped in errored state
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running authorizations model: ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a authorizationState property here!
        if (err.authorizationState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between authorizationState.lastError and err
        err.authorizationState = { ...this.getResponse() }
      }
      throw err
    }
  }
}

export async function create (
  data: OutboundAuthorizationData,
  config: OutboundAuthorizationsModelConfig
): Promise <OutboundAuthorizationsModel> {
  // create a new model
  const model = new OutboundAuthorizationsModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: OutboundAuthorizationsModelConfig
): Promise <OutboundAuthorizationsModel> {
  try {
    const data = await config.kvs.get<OutboundAuthorizationData>(config.key)
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
