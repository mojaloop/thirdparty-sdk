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

import StateMachine, {
  Method,
  StateMachineConfig,
  StateMachineInterface,
  TransitionEvent
} from 'javascript-state-machine'
import { KVS } from '~/shared/kvs'
import { Logger as WinstonLogger } from 'winston'

export interface ControlledStateMachine extends StateMachineInterface {
  init: Method
  error: Method

  onAfterTransition: Method;
  onPendingTransition: Method;
  onError: Method;
}

export interface StateData extends Record<string, unknown> {
  currentState: string
}

export interface PersistentModelConfig {
  key: string;
  kvs: KVS;
  logger: WinstonLogger;
}

export class PersistentModel<JSM extends ControlledStateMachine, Data extends StateData> {
  protected readonly config: PersistentModelConfig
  public readonly fsm: JSM

  public data: Data

  constructor (
    data: Data,
    config: PersistentModelConfig,
    specOrig: StateMachineConfig
  ) {
    this.data = { ...data }
    this.config = { ...config }

    const spec = { ...specOrig }

    // inject basic methods
    spec.methods = {
      onAfterTransition: this.onAfterTransition.bind(this) as Method,
      onPendingTransition: this.onPendingTransition.bind(this) as Method,
      ...spec.methods
    }
    // inject error transition
    spec.transitions = [
      ...spec.transitions,
      { name: 'error', from: '*', to: 'errored' }
    ]

    // propagete sate from data.currentState, then spec.init and use 'none' as default
    spec.init = (data.currentState || spec.init || 'none') as string

    // create a new state machine and store it
    this.fsm = new StateMachine(spec) as JSM
  }

  // accessors to config properties
  get logger (): WinstonLogger {
    return this.config.logger
  }

  get key (): string {
    return this.config.key
  }

  get kvs (): KVS {
    return this.config.kvs
  }

  // it is called on after every transition and updates data.currentState
  async onAfterTransition (event: TransitionEvent<JSM>): Promise<void> {
    this.logger.info(`State machine transitioned '${event.transition}': ${event.from} -> ${event.to}`)
    this.data.currentState = event.to
  }

  // it allows to call `error` transition even if there is pending transition
  onPendingTransition (transition: string): void {
    // allow transitions to 'error' state while other transitions are in progress
    if (transition !== 'error') {
      throw new Error(`Transition '${transition}' requested while another transition is in progress.`)
    }
  }

  // stores state data in KVS
  async saveToKVS (): Promise<void> {
    try {
      const res = await this.kvs.set(this.key, this.data)
      this.logger.push({ res })
      this.logger.info(`Persisted model in cache: ${this.key}`)
    } catch (err) {
      this.logger.push({ err })
      this.logger.info(`Error saving model: ${this.key}`)
      throw err
    }
  }
}

// creates a PersistentModel instance
export async function create<JSM extends ControlledStateMachine, Data extends StateData> (
  data: Data,
  config: PersistentModelConfig,
  spec: StateMachineConfig
): Promise <PersistentModel<JSM, Data>> {
  // create a new model
  const model = new PersistentModel<JSM, Data>(data, config, spec)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS<JSM extends ControlledStateMachine, Data extends StateData> (
  config: PersistentModelConfig,
  spec: StateMachineConfig
): Promise <PersistentModel<JSM, Data>> {
  try {
    const data = await config.kvs.get<Data>(config.key)
    if (!data) {
      throw new Error(`No data found in KVS for: ${config.key}`)
    }
    config.logger.push({ data })
    config.logger.info('data loaded from KVS')
    return new PersistentModel<JSM, Data>(data, config, spec)
  } catch (err) {
    config.logger.push({ err })
    config.logger.info(`Error loading data from KVS for key: ${config.key}`)
    throw err
  }
}
