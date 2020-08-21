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

import StateMachine, { StateMachineSpec, Data, Method, Transition } from 'javascript-state-machine'
import { KVS } from './kvs'
import { Logger as WinstonLogger } from 'winston'

export interface Context {
  data: Data;
  cache: KVS;
  key: string;
  logger: WinstonLogger
}

export interface PersistentStateMachine extends StateMachine {
  context: Context;
}

export type CreateFunction = (
  data: Record<string, unknown>,
  cache: KVS,
  key: string,
  logger: WinstonLogger,
  stateMachineSpec: StateMachineSpec
) => Promise<PersistentStateMachine>;

async function saveToCache (psm: PersistentStateMachine) {
  const { data, cache, key, logger } = psm.context
  try {
    const res = await cache.set(key, data)
    logger.push({ res })
    logger.info(`Persisted model in cache: ${key}`)
  } catch (err) {
    logger.push({ err })
    logger.info(`Error saving model: ${key}`)
    throw err
  }
}

async function onAfterTransition (psm: PersistentStateMachine, transition: Transition) {
  const { logger } = psm.context
  logger.info(`State machine transitioned '${transition.transition}': ${transition.from} -> ${transition.to}`)
  psm.context.data.currentState = transition.to
}

function onPendingTransition (_psm: PersistentStateMachine, transition: string) {
  // allow transitions to 'error' state while other transitions are in progress
  if (transition !== 'error') {
    throw new Error(`Transition '${transition}' requested while another transition is in progress.`)
  }
}

export async function create (
  data: Data,
  cache: KVS,
  key: string,
  logger: WinstonLogger,
  stateMachineSpec: StateMachineSpec
): Promise<PersistentStateMachine> {
  let initState = stateMachineSpec.init || 'init'

  if (!data.currentState) {
    data.currentState = initState
  } else {
    initState = stateMachineSpec.init = data.currentState as string
  }

  stateMachineSpec.data = {
    ...stateMachineSpec.data,
    context: {
      data, cache, key, logger
    }
  }

  stateMachineSpec.methods = {
    ...stateMachineSpec.methods,
    onAfterTransition: onAfterTransition as Method,
    onPendingTransition: onPendingTransition as Method,
    saveToCache: saveToCache as Method
  }

  const stateMachine = new StateMachine(stateMachineSpec)
  await stateMachine[initState]
  return stateMachine as PersistentStateMachine
}

async function loadFromCache (
  cache: KVS,
  key: string,
  logger: WinstonLogger,
  stateMachineSpec: StateMachineSpec,
  optCreate?: CreateFunction
): Promise<PersistentStateMachine> {
  try {
    const data = await cache.get<Data>(key)
    if (!data) {
      throw new Error(`No cached data found for: ${key}`)
    }
    logger.push({ cache: data })
    logger.info('data loaded from cache')

    // use delegation to allow customization of 'create'
    const createPSM = optCreate || create
    return createPSM(data, cache, key, logger, stateMachineSpec)
  } catch (err) {
    logger.push({ err })
    logger.info(`Error loading data: ${key}`)
    throw err
  }
}

export default {
  create,
  loadFromCache
}
