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

import util from 'util'
import { Method, StateMachineConfig } from 'javascript-state-machine'

import { ControlledStateMachine, PersistentModel, PersistentModelConfig, StateData } from './persistent.model'
import deferredJob from '~/shared/deferred-job'
import { Message, PubSub } from '~/shared/pub-sub'

export enum A2SModelState {
  start = 'WAITING_FOR_ACTION_REQUEST',
  succeeded = 'COMPLETED',
  errored = 'ERROR_OCCURRED'
}

export interface A2SStateMachine extends ControlledStateMachine {
  requestAction: Method
  onRequestAction: Method
}

export interface A2SData<A2SActionResponse extends StateData> extends StateData {
  response?: A2SActionResponse
}

export interface A2SModelConfig<Args, A2SActionResponse extends StateData> extends PersistentModelConfig {
  /**
   * @property subscriber
   * @description PubSub instance used to subscribe to messages
   */
  subscriber: PubSub

  /**
   * @property modelName
   * @description the name of the generated model
   */
  modelName: string

  /**
   * @method channelName
   * @description generates the pub/sub channel name
   * @param {object} args - the arguments passed as object,
   *                        same as passed to `run, triggerDeferredJob, generateKey` method
   * @returns {string} - the pub/sub channel name
   */
  channelName(arg: Args): string

  /**
   * @method requestAction
   * @description invokes the call to switch
   * @param {<Args>} args - the arguments passed as object to `run` method
   */
  requestAction(args: Args): Promise<void>

  /**
   * @method throwIfInvalidArgs
   * @description optional method which makes validation of args object, invoked in `run,
   *              triggerDeferredJob, generateKey` methods to ensure everything is going well
   * @param {<Args>} args - the arguments passed as object to `run` method
   */
  throwIfInvalidArgs?(args: Args): void

  /**
   * @method reformatMessage
   * @description reformats message received from PUB/SUB channel,
   *              it is optional method, if not specified identify function is used by default
   * @param {Message} message - message received
   * @returns {<A2SData>} - reformatted message in format complied with persistent state data
   */
  reformatMessage?(message: Message): A2SActionResponse

  requestProcessingTimeoutSeconds: number
}

export class A2SModel<Args, A2SActionResponse extends StateData> extends PersistentModel<
  A2SStateMachine,
  A2SData<A2SActionResponse>
> {
  protected config: A2SModelConfig<Args, A2SData<A2SActionResponse>>
  protected args: Args

  constructor(data: A2SData<A2SActionResponse>, config: A2SModelConfig<Args, A2SData<A2SActionResponse>>) {
    // request authorization state machine model
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [{ name: 'requestAction', from: 'start', to: 'succeeded' }],
      methods: {
        // specific transitions handlers methods
        // eslint-disable-next-line prefer-rest-params
        onRequestAction: () => this.onRequestAction()
      }
    }
    super(data, config, spec)
    this.config = config
    this.args = null as unknown as Args
  }

  // getters
  get subscriber(): PubSub {
    return this.config.subscriber
  }

  get modelName(): string {
    return this.config.modelName
  }

  /**
   * @name onRequestAction
   * @description generates the pub/sub channel name
   */
  async onRequestAction(): Promise<void> {
    this.logger.push({ args: this.args }).log('onRequestAction - arguments')
    const channel = this.config.channelName(this.args)
    return deferredJob(this.subscriber, channel)
      .init(async (channel: string) => {
        const res = await this.config.requestAction(this.args)
        this.logger
          .push({ res, channel, args: this.args })
          .log('RequestAction call sent to peer, listening on response')
        return res
      })
      .job((message: Message): Promise<void> => {
        this.data.response = {
          // invoke optional reformatMessage
          ...(this.config.reformatMessage ? this.config.reformatMessage(message) : (message as A2SActionResponse)),

          // response.currentState is remapped from state machine data.currentState
          currentState: A2SModelState[this.data.currentState as keyof typeof A2SModelState]
        } as A2SActionResponse
        this.logger.push({ message }).log('requestActionMethod message received')
        return Promise.resolve()
      })
      .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  /**
   * @name getResponse
   * @description returns the http response payload depending on which state machine is
   * @returns {A2SActionResponse} - the http response payload
   */
  getResponse(): A2SActionResponse | void {
    return this.data.response
  }

  /**
   * @name run
   * @description run the workflow logic
   * @param {<Args>} args - arguments
   * @returns {Object} - the http response payload
   */
  async run(args: Args): Promise<A2SActionResponse | void> {
    if (this.config.throwIfInvalidArgs) {
      // optional input validation, it should throws if any of args is invalid
      this.config.throwIfInvalidArgs(args)
    }

    try {
      // run transitions based on incoming state
      switch (this.data.currentState) {
        case 'start':
          this.args = args
          // the first transition is requestAction
          await this.fsm.requestAction()
          // don't await to finish the save
          this.saveToKVS()

        // eslint-disable-next-line no-fallthrough
        case 'succeeded':
          // all steps complete so return
          this.logger.log('Action called successfully')
          return this.getResponse()

        case 'errored':
          // stopped in errored state
          this.logger.log('State machine in errored state')
          return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      this.logger.log(`Error running ${this.modelName} model: ${util.inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (this.data.currentState !== 'errored') {
        // err should not have a requestActionState property here!
        if (err.requestActionState) {
          this.logger.log('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between requestActionState.lastError and err
        err.requestActionState = this.getResponse()
      }
      throw err
    }
  }
}

export async function create<Args, A2SActionResponse extends StateData>(
  data: A2SData<A2SActionResponse>,
  config: A2SModelConfig<Args, A2SData<A2SActionResponse>>
): Promise<A2SModel<Args, A2SActionResponse>> {
  // create a new model
  const model = new A2SModel<Args, A2SActionResponse>(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS<Args, A2SActionResponse extends StateData>(
  config: A2SModelConfig<Args, A2SData<A2SActionResponse>>
): Promise<A2SModel<Args, A2SActionResponse>> {
  try {
    const data = await config.kvs.get<A2SData<A2SActionResponse>>(config.key)
    if (!data) {
      throw new Error(`A2SModel(${config.modelName}) No data found in KVS for: ${config.key}`)
    }
    config.logger.push({ data }).info('data loaded from KVS')
    return create(data, config)
  } catch (err) {
    config.logger.push({ err }).info(`Error loading data from KVS for key: ${config.key}`)
    throw err
  }
}
