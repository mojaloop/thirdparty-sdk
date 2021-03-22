import { PubSub } from '~/shared/pub-sub'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import deferredJob, { JobInitiator, JobListener } from '~/shared/deferred-job'
import mockLogger from 'test/unit/mockLogger'
import { StateData } from '../../../src/models/persistent.model';
import { OTPValidateModelConfig } from '../../../src/models/OTPValidate.model';
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components';
import { create, loadFromKVS } from '~/models/a2s.model'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

// mvp mockup of defferedJob
jest.mock('~/shared/deferred-job', () => jest.fn(() => ({
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
})))


describe('A2SModel', () => {
  const logger = mockLogger()
  const redisConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger
  }
  const data: StateData = { currentState: 'start' }
  const key = 'example-key'
  let config: OTPValidateModelConfig

  beforeEach(() => {
    config = new OTPValidateModelConfig(
      key,
      new KVS(redisConfig),
      logger,
      new PubSub(redisConfig),
      {
        patchConsentRequests: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as ThirdpartyRequests,
    )
  })
  describe('create', () => {
    it('should be created properly', async () => {
      const m = await create(data, config)
      expect(m).toBeDefined()

      // check getters
      expect(m.pubSub).toEqual(config.pubSub)
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
      const getSpy = jest.spyOn(config.kvs, 'get').mockImplementationOnce(
        () => Promise.resolve({ property: 'loaded', currentState: 'succeeded' })
      )
      const m = await loadFromKVS(config)
      expect(m).toBeDefined()

      expect(m.data).toEqual({ property: 'loaded', currentState: 'succeeded' })
      expect(getSpy).toHaveBeenCalledWith(config.key)
    })

    it('should handle the empty data from KVS properly', async () => {
      const getSpy = jest.spyOn(config.kvs, 'get').mockImplementationOnce(
        () => Promise.resolve()
      )
      try {
        await loadFromKVS(config)
      } catch (err) {
        expect(err.message).toEqual(`A2SModel(${config.modelName}) No data found in KVS for: ${config.key}`)
      }
      expect(getSpy).toHaveBeenCalledWith(config.key)
    })
  })

  describe('run', () => {
    it('should perform as designed', async () => {
      const m = await create(data, config)
      const result = await m.run({
        consentRequestId: '27f88eff-d958-44f4-a0cd-6930e402e2fc',
        fspId: 'dfspa',
        consentRequest: {
          'authToken': '123456',
        }
      })
      expect(result).toEqual({
        currentState: 'COMPLETED',
        consent: {
          the: 'message-listening-on'
        }
      })
      expect(deferredJob).toBeCalled()
    })

    it('should handle the exception from reformatMessage', async () => {
      const spyReformatMessage = jest.spyOn(config, 'reformatMessage')
        .mockImplementationOnce(() => {
          const err = {
            message: 'from-reformat-message',
            requestActionState: 'something'
          }
          throw err
        })
      const m = await create(data, config)
      try {
        await m.run({
          consentRequestId: '27f88eff-d958-44f4-a0cd-6930e402e2fc',
          fspId: 'dfspa',
          consentRequest: {
            'authToken': '123456',
          }
        })
      } catch (err) {
        expect(err.message).toEqual('from-reformat-message')
        expect(spyReformatMessage).toBeCalledWith({
          the: 'message-listening-on'
        })
      }
      expect(m.data.currentState).toEqual('errored')

      // let try run again so the 'errored' state should be reached
      const result = await m.run({ consentRequestId: '27f88eff-d958-44f4-a0cd-6930e402e2fc' })
      expect(result).toBeUndefined()
    })

    it('should handle the exception from requestAction', async () => {
      const spyRequestAction = jest.spyOn(config, 'requestAction')
        .mockImplementationOnce(() => { throw new Error('from-requestAction') })
      const m = await create(data, config)
      try {
        await m.run({
          consentRequestId: '27f88eff-d958-44f4-a0cd-6930e402e2fc',
          fspId: 'dfspa',
          consentRequest: {
            'authToken': '123456',
          }
        })
      } catch (err) {
        expect(err.message).toEqual('from-requestAction')
        expect(spyRequestAction).toBeCalledWith({
          consentRequestId: '27f88eff-d958-44f4-a0cd-6930e402e2fc',
          fspId: 'dfspa',
          consentRequest: {
            'authToken': '123456',
          }
        })
      }
      expect(m.data.currentState).toEqual('errored')
    })
  })
})
