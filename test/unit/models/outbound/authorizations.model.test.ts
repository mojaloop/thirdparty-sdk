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
import { Message, NotificationCallback, PubSub } from '~/shared/pub-sub'

import {
  OutboundAuthorizationData,
  OutboundAuthorizationsModelConfig,
  OutboundAuthorizationsModelState
} from '~/models/authorizations.interface'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'

import {
  OutboundAuthorizationsModel,
  create,
  loadFromKVS
} from '~/models/outbound/authorizations.model'

import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest/utils'

import mockLogger from 'test/unit/mockLogger'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import sortedArray from 'test/unit/sortedArray'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('OutboundAuthorizationsModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: OutboundAuthorizationsModelConfig
  let publisher: PubSub

  beforeEach(async () => {
    publisher = new PubSub(connectionConfig)
    await publisher.connect()

    modelConfig = {
      kvs: new KVS(connectionConfig),
      key: 'cache-key',
      logger: connectionConfig.logger,
      subscriber: new PubSub(connectionConfig),
      requests: {
        postAuthorizations: jest.fn()
      } as unknown as ThirdpartyRequests
    }
    await modelConfig.kvs.connect()
    await modelConfig.subscriber.connect()
  })

  afterEach(async () => {
    await publisher.disconnect()
    await modelConfig.kvs.disconnect()
    await modelConfig.subscriber.disconnect()
  })

  function checkOAMLayout (am: OutboundAuthorizationsModel, optData?: OutboundAuthorizationData) {
    expect(am).toBeTruthy()
    expect(am.data).toBeDefined()
    expect(am.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(am.subscriber).toEqual(modelConfig.subscriber)
    expect(am.requests).toEqual(modelConfig.requests)

    // check is fsm correctly constructed
    expect(typeof am.fsm.init).toEqual('function')
    expect(typeof am.fsm.requestAuthorization).toEqual('function')

    // check fsm notification handler
    expect(typeof am.onRequestAuthorization).toEqual('function')

    expect(sortedArray(am.fsm.allStates())).toEqual(['errored', 'none', 'start', 'succeeded'])
    expect(sortedArray(am.fsm.allTransitions())).toEqual(['error', 'init', 'requestAuthorization'])
  }

  it('module layout', () => {
    expect(typeof OutboundAuthorizationsModel).toEqual('function')
    expect(typeof loadFromKVS).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('notificationChannel', () => {
    it('should generate proper channel name', () => {
      const id = '123'
      expect(OutboundAuthorizationsModel.notificationChannel(id)).toEqual('authorizations_123')
    })

    it('input validation', () => {
      expect(
        () => OutboundAuthorizationsModel.notificationChannel(null as unknown as string)
      ).toThrow()
    })
  })

  describe('request authorization flow', () => {
    let subId = 0
    let channel: string
    let handler: NotificationCallback
    let data: OutboundAuthorizationData
    let putResponse: fspiopAPI.Schemas.AuthorizationsIDPutResponse
    beforeEach(() => {
      mocked(modelConfig.subscriber.subscribe).mockImplementationOnce(
        (_channel: string, cb: NotificationCallback) => {
          handler = cb
          return ++subId
        }
      )

      mocked(publisher.publish).mockImplementationOnce(
        async (channel: string, message: Message) => handler(channel, message, subId)
      )

      data = {
        toParticipantId: '123',
        request: {
          transactionRequestId: '1'
        } as unknown as tpAPI.Schemas.AuthorizationsPostRequest, // minimal request body
        currentState: 'start'
      }

      channel = OutboundAuthorizationsModel.notificationChannel(data.request.transactionRequestId)

      putResponse = {
        authenticationInfo: {
          authentication: 'U2F',
          authenticationValue: {
            pinValue: 'the-mocked-pin-value',
            counter: '1'
          } as fspiopAPI.Schemas.AuthenticationValue
        },
        responseType: 'ENTERED'
      }
    })

    it('should give response properly populated from notification channel', async () => {
      const model = await create(data, modelConfig)
      // defer publication to notification channel
      setImmediate(() => publisher.publish(
        channel,
        putResponse as unknown as Message
      ))
      // do a request and await on published Message
      await model.fsm.requestAuthorization()

      // retrieve the request
      const result = model.getResponse()

      // Assertions
      expect(result).toEqual({
        ...putResponse,
        currentState: OutboundAuthorizationsModelState.succeeded
      })
      expect(mocked(modelConfig.requests.postAuthorizations)).toHaveBeenCalledWith(
        model.data.request, model.data.toParticipantId
      )
      expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(publisher.publish)).toBeCalledWith(channel, putResponse)
    })

    it('should properly handle error from requests.postAuthorizations', async () => {
      mocked(modelConfig.requests.postAuthorizations).mockImplementationOnce(
        () => { throw new Error('error from requests.postAuthorizations') }
      )
      const model = await create(data, modelConfig)

      // do a request and await on published Message
      try {
        await model.fsm.requestAuthorization()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err).toEqual(new Error('error from requests.postAuthorizations'))
        const result = model.getResponse()
        expect(result).toBeUndefined()
        expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(channel, subId)
      }
    })

    describe('run workflow', () => {
      it('start', async () => {
        const model = await create(data, modelConfig)

        // defer publication to notification channel
        setImmediate(() => publisher.publish(
          channel,
          putResponse as unknown as Message
        ))

        const result = await model.run()

        expect(result).toEqual({
          ...putResponse,
          currentState: OutboundAuthorizationsModelState.succeeded
        })
        expect(mocked(modelConfig.requests.postAuthorizations)).toHaveBeenCalledWith(
          model.data.request, model.data.toParticipantId
        )
        expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(channel, subId)
        expect(mocked(publisher.publish)).toBeCalledWith(channel, putResponse)

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('Authorization completed successfully')
        mocked(modelConfig.logger.info).mockReset()

        // check retrieving state from 'succeeded'
        expect(model.data.currentState).toEqual('succeeded')

        // run workflow again
        const newResult = await model.run()

        expect(newResult).toEqual(result)

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('Authorization completed successfully')
      })

      it('errored', async () => {
        const model = await create({ ...data, currentState: 'errored' }, modelConfig)

        const result = await model.run()

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('State machine in errored state')

        expect(result).toBeUndefined()
      })

      it('exceptions', async () => {
        const error = { message: 'error from requests.postAuthorizations', authorizationState: 'broken' }
        mocked(modelConfig.requests.postAuthorizations).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create(data, modelConfig)

        expect(async () => await model.run()).rejects.toEqual(error)
      })

      it('exceptions - Error', async () => {
        const error = new Error('the-exception')
        mocked(modelConfig.requests.postAuthorizations).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create({ ...data, currentState: 'start' }, modelConfig)

        expect(model.run()).rejects.toEqual(error)
      })
    })
  })

  describe('loadFromKVS', () => {
    it('should properly call `KVS.get`, get expected data in `context.data` and setup state of machine', async () => {
      const dataFromCache: OutboundAuthorizationData = {
        toParticipantId: '123',
        request: { mocked: true } as unknown as tpAPI.Schemas.AuthorizationsPostRequest,
        currentState: 'succeeded'
      }
      mocked(modelConfig.kvs.get).mockImplementationOnce(async () => dataFromCache)
      const am = await loadFromKVS(modelConfig)
      checkOAMLayout(am, dataFromCache)

      // to get value from cache proper key should be used
      expect(mocked(modelConfig.kvs.get)).toHaveBeenCalledWith(modelConfig.key)

      // check what has been stored in `data`
      expect(am.data).toEqual(dataFromCache)
    })

    it('should throw when received invalid data from `KVS.get`', async () => {
      mocked(modelConfig.kvs.get).mockImplementationOnce(async () => null)
      try {
        await loadFromKVS(modelConfig)
        shouldNotBeExecuted()
      } catch (error) {
        expect(error.message).toEqual(`No data found in KVS for: ${modelConfig.key}`)
      }
    })

    it('should propagate error received from `KVS.get`', async () => {
      mocked(modelConfig.kvs.get).mockImplementationOnce(jest.fn(async () => { throw new Error('error from KVS.get') }))
      expect(() => loadFromKVS(modelConfig))
        .rejects.toEqual(new Error('error from KVS.get'))
    })
  })

  describe('saveToKVS', () => {
    it('should store using KVS.set', async () => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      const data: OutboundAuthorizationData = {
        toParticipantId: '123',
        request: { mocked: true } as unknown as tpAPI.Schemas.AuthorizationsPostRequest,
        currentState: 'succeeded'
      }
      const model = await create(data, modelConfig)
      checkOAMLayout(model, data)

      // transition `init` should encounter exception when saving `context.data`
      await model.saveToKVS()
      expect(mocked(modelConfig.kvs.set)).toBeCalledWith(model.key, model.data)
    })

    it('should propagate error from KVS.set', async () => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => { throw new Error('error from KVS.set') })
      const data: OutboundAuthorizationData = {
        toParticipantId: '123',
        request: { mocked: true } as unknown as tpAPI.Schemas.AuthorizationsPostRequest,
        currentState: 'succeeded'
      }
      const am = await create(data, modelConfig)
      checkOAMLayout(am, data)

      // transition `init` should encounter exception when saving `context.data`
      expect(() => am.saveToKVS()).rejects.toEqual(new Error('error from KVS.set'))
      expect(mocked(modelConfig.kvs.set)).toBeCalledWith(am.key, am.data)
    })
  })
})
