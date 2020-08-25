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

import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { StateMachineConfig, Method } from 'javascript-state-machine'
import { PersistentModel, ControlledStateMachine } from '~/shared/persistent-model'
import mockLogger from '../mockLogger'
// import { mocked } from 'ts-jest/utils'

// mock KVS default exported class
jest.mock('~/shared/kvs')

describe('Persistent State Machine', () => {
  interface TestStateMachine extends ControlledStateMachine {
    init: Method
    gogo: Method
    error: Method
  }

  const config: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let kvs: KVS
  let data: Record<string, unknown>
  let smConfig: StateMachineConfig
  const key = 'cache-key'

  function checkPSMLayout (pm: PersistentModel<TestStateMachine>, optData?: Record<string, unknown>) {
    expect(pm).toBeTruthy()
    expect(pm.jsm.state).toEqual((optData && optData.currentState) || smConfig.init || 'none')

    expect(pm.data).toEqual(data)
    expect(pm.kvs).toEqual(kvs)
    expect(pm.key).toEqual(key)
    expect(pm.logger).toEqual(config.logger)

    expect(typeof pm.onAfterTransition).toEqual('function')
    expect(typeof pm.onPendingTransition).toEqual('function')
    expect(typeof pm.saveToKVS).toEqual('function')
    expect(typeof pm.jsm.init).toEqual('function')
    expect(typeof pm.jsm.gogo).toEqual('function')
    expect(typeof pm.jsm.error).toEqual('function')
  }

  function shouldNotBeExecuted () {
    throw new Error('test failure enforced: this code should never be executed')
  }

  beforeEach(async () => {
    smConfig = {
      // init: 'start',
      transitions: [
        { name: 'init', from: 'none', to: 'start' },
        { name: 'gogo', from: 'start', to: 'end' },
        { name: 'error', from: '*', to: 'errored' }
      ],
      methods: {
        onGogo: () => {
          return new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 100)
          })
        },
        onError: () => {
          console.error('onError')
        }
      }
    }

    // test data
    data = { the: 'data' }

    kvs = new KVS(config)

    await kvs.connect()
  })

  afterEach(async () => {
    await kvs.disconnect()
  })

  test('module layout', () => {
    expect(typeof PersistentModel).toEqual('function')
    expect(typeof PersistentModel.loadFromKVS).toEqual('function')
    expect(smConfig).toBeDefined()
    expect(data).toBeDefined()
  })

  test('create', async () => {
    const pm = new PersistentModel<TestStateMachine>(data, kvs, key, config.logger, smConfig)
    checkPSMLayout(pm)
    expect(pm.jsm.state).toEqual('none')
    await pm.jsm.init()
    expect(pm.jsm.state).toEqual('start')
    expect(config.logger.info).toHaveBeenCalledWith('State machine transitioned \'init\': none -> start')
  })

  describe('onPendingTransition', () => {
    it('should throw error if not `error` transition', async () => {
      const pm = new PersistentModel<TestStateMachine>(data, kvs, key, config.logger, smConfig)
      checkPSMLayout(pm)

      pm.jsm.init()
      expect(() => {
        pm.jsm.gogo()
      }).toThrowError('Transition \'gogo\' requested while another transition is in progress')
    })

    it('should not throw error if `error` transition called when `gogo` is pending', (done) => {
      const pm = new PersistentModel<TestStateMachine>(data, kvs, key, config.logger, smConfig)
      checkPSMLayout(pm)

      const result = pm.jsm.init()
      if (result) {
        result.then(() => {
          expect(pm.jsm.state).toEqual('start')
          pm.jsm.gogo()
          expect(pm.jsm.state).toEqual('end')
          return Promise.resolve()
        })
          .then(() => pm.jsm.error())
          .then(done)
          .catch(shouldNotBeExecuted)
      }
    })
  })

  describe('loadFromKVS', () => {
    // it('should properly call cache.get, get expected data in `context.data` and setup state of machine', async () => {
    //   const dataFromCache = { this_is: 'data from cache', currentState: 'end' }
    //   mocked(kvs.get).mockImplementationOnce(jest.fn(async () => dataFromCache))
    //   const pm = await PersistentModel.loadFromKVS<TestStateMachine>(kvs, key, config.logger, smConfig)
    //   checkPSMLayout(pm, dataFromCache)

    //   // to get value from cache proper key should be used
    //   expect(mocked(kvs.get)).toHaveBeenCalledWith(key)

    //   // check what has been stored in `context.data`
    //   expect(pm.data).toEqual(dataFromCache)
    // })

    // it('should throw when received invalid data from `cache.get`', async () => {
    //   cache.get = jest.fn( async () => null)
    //   try {
    //     await PSM.loadFromCache(cache, key, logger, smSpec)
    //     shouldNotBeExecuted()
    //   } catch (error) {
    //     expect(error.message).toEqual(`No cached data found for: ${key}`)
    //   }
    // })

    // it('should propagate error received from `cache.get`', async () => {
    //   cache.get = jest.fn( async () => { throw new Error('error from cache.get') })
    //   expect(() => PSM.loadFromCache(cache, key, logger, smSpec))
    //     .rejects.toEqual(new Error('error from cache.get'))
    // })
  })
})
