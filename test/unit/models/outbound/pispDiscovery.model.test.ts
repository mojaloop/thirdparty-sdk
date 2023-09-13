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
  PISPDiscoveryData,
  PISPDiscoveryModelConfig,
  PISPDiscoveryModelState
} from '~/models/outbound/pispDiscovery.interface'
import { v1_1 as fspiopAPI, thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { PISPDiscoveryModel, create } from '~/models/outbound/pispDiscovery.model'

import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest'

import * as mockData from 'test/unit/data/mockData'
import mockLogger from 'test/unit/mockLogger'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import sortedArray from 'test/unit/sortedArray'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('PISPDiscoveryModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: PISPDiscoveryModelConfig
  let publisher: PubSub
  const expectedResp = {
    accounts: [
      {
        accountNickname: 'dfspa.user.nickname1',
        address: 'dfspa.username.1234',
        currency: 'ZAR'
      },
      {
        accountNickname: 'dfspa.user.nickname2',
        address: 'dfspa.username.5678',
        currency: 'USD'
      }
    ],
    currentState: PISPDiscoveryModelState.succeeded
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
    publisher = new PubSub(connectionConfig)
    await publisher.connect()

    modelConfig = {
      kvs: new KVS(connectionConfig),
      key: 'cache-key',
      logger: connectionConfig.logger,
      subscriber: new PubSub(connectionConfig),
      thirdpartyRequests: {
        getAccounts: jest.fn()
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

  function checkPISPDiscoveryModelLayout(am: PISPDiscoveryModel, optData?: PISPDiscoveryData) {
    expect(am).toBeTruthy()
    expect(am.data).toBeDefined()
    expect(am.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(am.subscriber).toEqual(modelConfig.subscriber)
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
    expect(typeof PISPDiscoveryModel).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('notificationChannel', () => {
    it('should generate proper channel name', () => {
      const id = '123'
      expect(PISPDiscoveryModel.notificationChannel(id)).toEqual('accounts_123')
    })

    it('input validation', () => {
      expect(() => PISPDiscoveryModel.notificationChannel(null as unknown as string)).toThrow()
    })
  })

  describe('request accounts flow', () => {
    let subId = 0
    let channel: string
    let handler: NotificationCallback
    let data: PISPDiscoveryData
    type PutResponseOrError = tpAPI.Schemas.AccountsIDPutResponse | fspiopAPI.Schemas.ErrorInformationObject
    let putResponse: PutResponseOrError

    beforeEach(() => {
      mocked(modelConfig.subscriber.subscribe).mockImplementationOnce((_channel: string, cb: NotificationCallback) => {
        handler = cb
        return ++subId
      })

      mocked(publisher.publish).mockImplementationOnce(async (channel: string, message: Message) =>
        handler(channel, message, subId)
      )

      data = {
        toParticipantId: '123',
        userId: 'username1234',
        currentState: 'start'
      }

      channel = PISPDiscoveryModel.notificationChannel(data.userId)

      putResponse = mockData.accountsRequest.payload
    })

    it('should be well constructed', async () => {
      const model = await create(data, modelConfig)
      checkPISPDiscoveryModelLayout(model, data)
    })

    it('should give response properly populated from notification channel - success', async () => {
      const model = await create(data, modelConfig)
      // defer publication to notification channel
      setImmediate(() => publisher.publish(channel, putResponse as unknown as Message))
      // do a request and await on published Message
      await model.fsm.requestAccounts()

      // retrieve the request
      const result = model.getResponse()
      // Assertions
      expect(result).toEqual(expectedResp)
      expect(mocked(modelConfig.thirdpartyRequests.getAccounts)).toHaveBeenCalledWith(
        model.data.userId,
        model.data.toParticipantId
      )
      expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(publisher.publish)).toBeCalledWith(channel, putResponse)
    })
    it('should give response properly populated from notification channel - ID not found', async () => {
      putResponse = mockData.accountsRequestError.payload
      const model = await create(data, modelConfig)
      // defer publication to notification channel
      setImmediate(() => publisher.publish(channel, putResponse as unknown as Message))
      // do a request and await on published Message
      await model.fsm.requestAccounts()

      // retrieve the request
      const result = model.getResponse()
      // Assertions
      expect(result).toEqual(idNotFoundResp)
      expect(mocked(modelConfig.thirdpartyRequests.getAccounts)).toHaveBeenCalledWith(
        model.data.userId,
        model.data.toParticipantId
      )
      expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(publisher.publish)).toBeCalledWith(channel, putResponse)
    })

    it('should properly handle error from requests.getAccounts', async () => {
      mocked(modelConfig.thirdpartyRequests.getAccounts).mockImplementationOnce(() => {
        throw new Error('error from requests.getAccounts')
      })
      const model = await create(data, modelConfig)

      // do a request and await on published Message
      try {
        await model.fsm.requestAccounts()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err).toEqual(new Error('error from requests.getAccounts'))
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
        setImmediate(() => publisher.publish(channel, putResponse as unknown as Message))

        const result = await model.run()

        expect(result).toEqual(expectedResp)
        expect(mocked(modelConfig.thirdpartyRequests.getAccounts)).toHaveBeenCalledWith(
          model.data.userId,
          model.data.toParticipantId
        )
        expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(channel, subId)
        expect(mocked(publisher.publish)).toBeCalledWith(channel, putResponse)

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
        mocked(modelConfig.thirdpartyRequests.getAccounts).mockImplementationOnce(() => {
          throw error
        })
        const model = await create(data, modelConfig)

        expect(async () => await model.run()).rejects.toEqual(error)
      })

      it('exceptions - Error', async () => {
        const error = new Error('the-exception')
        mocked(modelConfig.thirdpartyRequests.getAccounts).mockImplementationOnce(() => {
          throw error
        })
        const model = await create({ ...data, currentState: 'start' }, modelConfig)

        expect(model.run()).rejects.toEqual(error)
      })
    })
  })
})
