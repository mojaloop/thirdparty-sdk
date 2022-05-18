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

import { StateData } from '~/models/persistent.model'
import { A2SModel, A2SModelConfig, create, loadFromKVS } from '~/models/a2s.model'
import { Message, PubSub } from '~/shared/pub-sub'
import { KVS } from '~/shared/kvs'
import { Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import deferredJob, { JobInitiator, JobListener } from '~/shared/deferred-job'
import mockLogger from 'test/unit/mockLogger'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

// mvp mockup of defferedJob
jest.mock('~/shared/deferred-job', () =>
  jest.fn(() => ({
    init: jest.fn((jobInitiator: JobInitiator) => ({
      job: jest.fn((jobListener: JobListener) => ({
        wait: jest.fn(async () => {
          // simulate calling the jobInitiator
          await jobInitiator('the-channel', 1234)
          // simulate calling the jobListener
          await jobListener({ the: 'message-listening-on' })
        })
      }))
    })),
    trigger: jest.fn()
  }))
)

// state data interface
interface TestData extends StateData {
  property: string
}

// the response data interface
interface TestResponse extends StateData {
  the: string
  message: Message
}

// the Args interface
interface TestArgs {
  first: string
  second: number
}

// config interface type shortcut
class TestA2SModelConfig implements A2SModelConfig<TestArgs, TestResponse> {
  public readonly key: string
  public readonly kvs: KVS
  public readonly logger: SDKLogger.Logger
  public readonly subscriber: PubSub
  public readonly modelName = 'TestA2SModel'
  public readonly requestProcessingTimeoutSeconds = 10000

  constructor(key: string, kvs: KVS, logger: SDKLogger.Logger, subscriber: PubSub) {
    this.key = key
    this.kvs = kvs
    this.logger = logger
    this.subscriber = subscriber
  }

  // generate a channel name
  channelName(args: TestArgs): string {
    const tokens = [this.modelName, args.first]
    return tokens.map((x) => `${x}`).join('-')
  }

  // simulate requesting the action
  requestAction(/* args: TestArgs */): Promise<void> {
    return Promise.resolve()
  }

  // mvp validation
  throwIfInvalidArgs(args: TestArgs): void {
    if (!(args.first || args.second)) {
      throw new Error('throwIfInvalidArgs')
    }
  }

  // simple formatter which injects property
  reformatMessage(message: Message): TestResponse {
    return {
      the: 'injected-property',
      message
    } as TestResponse
  }
}

type TestA2SModel = A2SModel<TestArgs, TestResponse>

describe('A2SModel', () => {
  const logger = mockLogger()
  const redisConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger
  }
  const data: TestData = { property: 'the-mocked-property-value', currentState: 'start' }
  const key = 'example-key'
  let config: TestA2SModelConfig

  beforeEach(() => {
    config = new TestA2SModelConfig(key, new KVS(redisConfig), logger, new PubSub(redisConfig))
  })
  describe('create', () => {
    it('should be created properly', async () => {
      const m: TestA2SModel = await create<TestArgs, TestResponse>(data, config)
      expect(m).toBeDefined()

      // check getters
      expect(m.subscriber).toEqual(config.subscriber)
      expect(m.key).toEqual(config.key)
      expect(m.kvs).toEqual(config.kvs)
      expect(m.modelName).toEqual(config.modelName)

      // check methods
      expect(typeof m.onRequestAction).toEqual('function')
      expect(typeof m.getResponse).toEqual('function')
      expect(typeof m.run).toEqual('function')

      // check fsm.state
      expect(m.fsm.state).toEqual('start')

      // getResponse should returns nothing for newly created model
      expect(m.getResponse()).toBeUndefined()
    })
  })

  describe('loadFromKVS', () => {
    it('should use KVS properly', async () => {
      const getSpy = jest
        .spyOn(config.kvs, 'get')
        .mockImplementationOnce(() => Promise.resolve({ property: 'loaded', currentState: 'succeeded' }))
      const m: TestA2SModel = await loadFromKVS<TestArgs, TestResponse>(config)
      expect(m).toBeDefined()

      expect(m.data).toEqual({ property: 'loaded', currentState: 'succeeded' })
      expect(getSpy).toHaveBeenCalledWith(config.key)
    })

    it('should handle the empty data from KVS properly', async () => {
      const getSpy = jest.spyOn(config.kvs, 'get').mockImplementationOnce(() => Promise.resolve())
      try {
        await loadFromKVS<TestArgs, TestResponse>(config)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.message).toEqual(`A2SModel(${config.modelName}) No data found in KVS for: ${config.key}`)
      }
      expect(getSpy).toHaveBeenCalledWith(config.key)
    })
  })

  describe('run', () => {
    it('should perform as designed', async () => {
      const m: TestA2SModel = await create<TestArgs, TestResponse>(data, config)
      const result = await m.run({ first: 'I am the first', second: 234 })
      expect(result).toEqual({
        currentState: 'COMPLETED',
        message: {
          the: 'message-listening-on'
        },
        the: 'injected-property'
      })
      expect(deferredJob).toBeCalled()
    })

    it('should handle the exception from reformatMessage', async () => {
      const spyReformatMessage = jest.spyOn(config, 'reformatMessage').mockImplementationOnce(() => {
        const err = {
          message: 'from-reformat-message',
          requestActionState: 'something'
        }
        throw err
      })
      const m: TestA2SModel = await create<TestArgs, TestResponse>(data, config)
      try {
        await m.run({ first: 'I am the first', second: 234 })
      } catch (err: any) {
        expect(err.message).toEqual('from-reformat-message')
        expect(spyReformatMessage).toBeCalledWith({
          the: 'message-listening-on'
        })
      }
      expect(m.data.currentState).toEqual('errored')

      // let try run again so the 'errored' state should be reached
      const result = await m.run({ first: 'I am the first', second: 234 })
      expect(result).toBeUndefined()
    })

    it('should handle the exception from requestAction', async () => {
      const spyRequestAction = jest.spyOn(config, 'requestAction').mockImplementationOnce(() => {
        throw new Error('from-requestAction')
      })
      const m: TestA2SModel = await create<TestArgs, TestResponse>(data, config)
      try {
        await m.run({ first: 'I am the first', second: 234 })
      } catch (err: any) {
        expect(err.message).toEqual('from-requestAction')
        expect(spyRequestAction).toBeCalledWith({ first: 'I am the first', second: 234 })
      }
      expect(m.data.currentState).toEqual('errored')
    })
  })
})
