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
import { KVS } from './kvs'
import { Logger as WinstonLogger } from 'winston'

export interface ControlledStateMachine extends StateMachineInterface {
  onAfterTransition: Method;
  onPendingTransition: Method;
}

export class PersistentModel<JSM extends StateMachineInterface> {
  public readonly jsm: JSM
  public readonly data: Record<string, unknown>
  public readonly kvs: KVS
  public readonly key: string
  public readonly logger: WinstonLogger

  constructor (
    data: Record<string, unknown>,
    kvs: KVS,
    key: string,
    logger: WinstonLogger,
    specOrig: StateMachineConfig
  ) {
    this.data = data
    this.kvs = kvs
    this.key = key
    this.logger = logger

    const spec = { ...specOrig }
    let initState = spec.init || 'init'

    if (data?.currentState) {
      initState = spec.init = data.currentState as string
    } else {
      data.currentState = initState
    }

    spec.methods = {
      onAfterTransition: this.onAfterTransition.bind(this) as Method,
      onPendingTransition: this.onPendingTransition.bind(this) as Method,
      ...spec.methods
    }

    this.jsm = new StateMachine(spec) as JSM
  }

  async onAfterTransition (event: TransitionEvent<JSM>): Promise<void> {
    this.logger.info(`State machine transitioned '${event.transition}': ${event.from} -> ${event.to}`)
    this.data.currentState = event.to
  }

  onPendingTransition (transition: string): void {
    // allow transitions to 'error' state while other transitions are in progress
    if (transition !== 'error') {
      throw new Error(`Transition '${transition}' requested while another transition is in progress.`)
    }
  }

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

  static async loadFromKVS<JSM extends StateMachine> (
    kvs: KVS,
    key: string,
    logger: WinstonLogger,
    spec: StateMachineConfig
  ): Promise <PersistentModel<JSM>> {
    try {
      const data = await kvs.get<Record<string, unknown>>(key)
      if (!data) {
        throw new Error(`No cached data found for: ${key}`)
      }
      logger.push({ data })
      logger.info('data loaded from cache')
      return new PersistentModel<JSM>(data, kvs, key, logger, spec)
    } catch (err) {
      logger.push({ err })
      logger.info(`Error loading data: ${key}`)
      throw err
    }
  }
}
