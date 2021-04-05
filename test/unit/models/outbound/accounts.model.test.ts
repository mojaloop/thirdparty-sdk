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

 - Sridhar Voruganti - sridhar.voruganti@modusbox.com
 --------------
 ******/
import { KVS } from '~/shared/kvs'
import { Message, NotificationCallback, PubSub } from '~/shared/pub-sub'

import {
  OutboundAccountsData,
  OutboundAccountsModelConfig,
  OutboundAccountsModelState
} from '~/models/accounts.interface'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import {
  OutboundAccountsModel,
  create,
  loadFromKVS
} from '~/models/outbound/accounts.model'

import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest/utils'

import TestData from 'test/unit/data/mockData.json'
import mockLogger from 'test/unit/mockLogger'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import sortedArray from 'test/unit/sortedArray'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('OutboundAccountsModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: OutboundAccountsModelConfig
  const expectedResp = {
    accounts: [
      {
        accountNickname: 'dfspa.user.nickname1',
        id: 'dfspa.username.1234',
        currency: 'ZAR'
      },
      {
        accountNickname: 'dfspa.user.nickname2',
        id: 'dfspa.username.5678',
        currency: 'USD'
      }
    ],
    currentState: OutboundAccountsModelState.succeeded
  }
  const idNotFoundResp = {
    accounts: [],
    errorInformation: {
      errorCode: '3200',
      errorDescription: 'Generic ID not found'
    },
    currentState: 'COMPLETED'
  }

  beforeEach(async () => {
    modelConfig = {
      kvs: new KVS(connectionConfig),
      key: 'cache-key',
      logger: connectionConfig.logger,
      pubSub: new PubSub(connectionConfig),
      thirdpartyRequests: {
        getAccounts: jest.fn()
      } as unknown as ThirdpartyRequests
    }
    await modelConfig.kvs.connect()
    await modelConfig.pubSub.connect()
  })

  afterEach(async () => {
    await modelConfig.kvs.disconnect()
    await modelConfig.pubSub.disconnect()
  })

  function checkOAMLayout (am: OutboundAccountsModel, optData?: OutboundAccountsData) {
    expect(am).toBeTruthy()
    expect(am.data).toBeDefined()
    expect(am.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(am.pubSub).toEqual(modelConfig.pubSub)
    expect(am.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof am.fsm.init).toEqual('function')
    expect(typeof am.fsm.requestAccounts).toEqual('function')

    // check fsm notification handler
    expect(typeof am.onRequestAccounts).toEqual('function')

    expect(sortedArray(am.fsm.allStates())).toEqual(['errored', 'none', 'start', 'succeeded'])
    expect(sortedArray(am.fsm.allTransitions())).toEqual(['error', 'init', 'requestAccounts'])
  }

  it('module layout', () => {
    expect(typeof OutboundAccountsModel).toEqual('function')
    expect(typeof loadFromKVS).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('notificationChannel', () => {
    it('should generate proper channel name', () => {
      const id = '123'
      expect(OutboundAccountsModel.notificationChannel(id)).toEqual('accounts_123')
    })

    it('input validation', () => {
      expect(
        () => OutboundAccountsModel.notificationChannel(null as unknown as string)
      ).toThrow()
    })
  })

  describe('request accounts flow', () => {
    let subId = 0
    let channel: string
    let handler: NotificationCallback
    let data: OutboundAccountsData
    type PutResponseOrError = tpAPI.Schemas.AccountsIDPutResponse & fspiopAPI.Schemas.ErrorInformationObject
    let putResponse: PutResponseOrError

    const mockData = JSON.parse(JSON.stringify(TestData))
    beforeEach(() => {
      mocked(modelConfig.pubSub.subscribe).mockImplementationOnce(
        (_channel: string, cb: NotificationCallback) => {
          handler = cb
          return ++subId
        }
      )

      mocked(modelConfig.pubSub.publish).mockImplementationOnce(
        async (channel: string, message: Message) => handler(channel, message, subId)
      )

      data = {
        toParticipantId: '123',
        userId: 'username1234',
        currentState: 'start'
      }

      channel = OutboundAccountsModel.notificationChannel(data.userId)

      putResponse = mockData.accountsRequest.payload
    })

    it('should give response properly populated from notification channel - success', async () => {
      const model = await create(data, modelConfig)
      // defer publication to notification channel
      setImmediate(() => model.pubSub.publish(
        channel,
        putResponse as unknown as Message
      ))
      // do a request and await on published Message
      await model.fsm.requestAccounts()

      // retrieve the request
      const result = model.getResponse()
      // Assertions
      expect(result).toEqual(expectedResp)
      expect(mocked(modelConfig.thirdpartyRequests.getAccounts)).toHaveBeenCalledWith(
        model.data.userId, model.data.toParticipantId
      )
      expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(modelConfig.pubSub.publish)).toBeCalledWith(channel, putResponse)
    })
    it('should give response properly populated from notification channel - ID not found', async () => {
      putResponse = mockData.accountsRequestError.payload
      const model = await create(data, modelConfig)
      // defer publication to notification channel
      setImmediate(() => model.pubSub.publish(
        channel,
        putResponse as unknown as Message
      ))
      // do a request and await on published Message
      await model.fsm.requestAccounts()

      // retrieve the request
      const result = model.getResponse()
      // Assertions
      expect(result).toEqual(idNotFoundResp)
      expect(mocked(modelConfig.thirdpartyRequests.getAccounts)).toHaveBeenCalledWith(
        model.data.userId, model.data.toParticipantId
      )
      expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(modelConfig.pubSub.publish)).toBeCalledWith(channel, putResponse)
    })

    it('should properly handle error from requests.getAccounts', async () => {
      mocked(modelConfig.thirdpartyRequests.getAccounts).mockImplementationOnce(
        () => { throw new Error('error from requests.getAccounts') }
      )
      const model = await create(data, modelConfig)

      // do a request and await on published Message
      try {
        await model.fsm.requestAccounts()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err).toEqual(new Error('error from requests.getAccounts'))
        const result = model.getResponse()
        expect(result).toBeUndefined()
        expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
      }
    })

    describe('run workflow', () => {
      it('start', async () => {
        const model = await create(data, modelConfig)

        // defer publication to notification channel
        setImmediate(() => model.pubSub.publish(
          channel,
          putResponse as unknown as Message
        ))

        const result = await model.run()

        expect(result).toEqual(expectedResp)
        expect(mocked(modelConfig.thirdpartyRequests.getAccounts)).toHaveBeenCalledWith(
          model.data.userId, model.data.toParticipantId
        )
        expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
        expect(mocked(modelConfig.pubSub.publish)).toBeCalledWith(channel, putResponse)

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('getAccounts completed successfully')
        mocked(modelConfig.logger.info).mockReset()

        // check retrieving state from 'succeeded'
        expect(model.data.currentState).toEqual('succeeded')

        // run workflow again
        const newResult = await model.run()

        expect(newResult).toEqual(result)

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('getAccounts completed successfully')
      })

      it('errored', async () => {
        const model = await create({ ...data, currentState: 'errored' }, modelConfig)

        const result = await model.run()

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('State machine in errored state')

        expect(result).toBeUndefined()
      })

      it('exceptions', async () => {
        const error = { message: 'error from requests.getAccounts', accountsState: 'broken' }
        mocked(modelConfig.thirdpartyRequests.getAccounts).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create(data, modelConfig)

        expect(async () => await model.run()).rejects.toEqual(error)
      })

      it('exceptions - Error', async () => {
        const error = new Error('the-exception')
        mocked(modelConfig.thirdpartyRequests.getAccounts).mockImplementationOnce(
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
      const dataFromCache: OutboundAccountsData = {
        toParticipantId: '123',
        userId: 'username1234',
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
      const data: OutboundAccountsData = {
        toParticipantId: '123',
        userId: 'username1234',
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
      const data: OutboundAccountsData = {
        toParticipantId: '123',
        userId: 'username1234',
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
