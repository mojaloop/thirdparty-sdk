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

- Kevin Leyow - kevin.leyow@modusbox.com
--------------
******/

import { v1_1 as fspiopAPI, thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { KVS } from '~/shared/kvs'
import { Message, NotificationCallback, PubSub } from '~/shared/pub-sub'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { PISPPrelinkingModel, create } from '~/models/outbound/pispPrelinking.model'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest/utils'

import mockLogger from 'test/unit/mockLogger'
import sortedArray from 'test/unit/sortedArray'
import { PISPPrelinkingModelConfig, PISPPrelinkingData } from '~/models/outbound/pispPrelinking.interface'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('pispPrelinkingModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: PISPPrelinkingModelConfig
  let publisher: PubSub

  beforeEach(async () => {
    let subId = 0
    let handler: NotificationCallback

    publisher = new PubSub(connectionConfig)
    await publisher.connect()

    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      subscriber: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        getServices: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as ThirdpartyRequests,
      requestProcessingTimeoutSeconds: 3
    }
    mocked(modelConfig.subscriber.subscribe).mockImplementationOnce((_channel: string, cb: NotificationCallback) => {
      handler = cb
      return ++subId
    })

    mocked(publisher.publish).mockImplementationOnce(async (channel: string, message: Message) =>
      handler(channel, message, subId)
    )
    await modelConfig.kvs.connect()
    await modelConfig.subscriber.connect()
  })

  afterEach(async () => {
    await publisher.disconnect()
    await modelConfig.kvs.disconnect()
    await modelConfig.subscriber.disconnect()
  })

  function checkPISPPrelinkingModelLayout(pispPrelinkingModel: PISPPrelinkingModel, optData?: PISPPrelinkingData) {
    expect(pispPrelinkingModel).toBeTruthy()
    expect(pispPrelinkingModel.data).toBeDefined()
    expect(pispPrelinkingModel.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(pispPrelinkingModel.subscriber).toEqual(modelConfig.subscriber)
    expect(pispPrelinkingModel.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof pispPrelinkingModel.fsm.init).toEqual('function')
    expect(typeof pispPrelinkingModel.fsm.getProviders).toEqual('function')

    // check fsm notification handler
    expect(typeof pispPrelinkingModel.onGetProviders).toEqual('function')

    expect(sortedArray(pispPrelinkingModel.fsm.allStates())).toEqual([
      'errored',
      'none',
      'providersLookupSuccess',
      'start'
    ])
    expect(sortedArray(pispPrelinkingModel.fsm.allTransitions())).toEqual(['error', 'getProviders', 'init'])
  }

  it('module layout', () => {
    expect(typeof PISPPrelinkingModel).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('Get providers', () => {
    const prelinkingData: PISPPrelinkingData = {
      serviceType: 'THIRD_PARTY_DFSP',
      currentState: 'start'
    }

    const providersResponse: tpAPI.Schemas.ServicesServiceTypePutResponse = {
      providers: ['dfspA', 'dfspB']
    }

    const genericErrorResponse: fspiopAPI.Schemas.ErrorInformationObject = {
      errorInformation: {
        errorCode: '7000',
        errorDescription: 'Generic thirdparty error'
      }
    }

    it('should be well constructed', async () => {
      const model = await create(prelinkingData, modelConfig)
      checkPISPPrelinkingModelLayout(model, prelinkingData)
    })

    it('getProviders() should transition start to providersLookupSuccess state when successful', async () => {
      const model = await create(prelinkingData, modelConfig)
      // defer publication to notification channel
      setImmediate(() =>
        publisher.publish(
          PISPPrelinkingModel.notificationChannel(prelinkingData.serviceType),
          providersResponse as unknown as Message
        )
      )
      const result = await model.run()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('providersLookupSuccess')

      // check we made a call to thirdpartyRequests.getServices
      expect(modelConfig.thirdpartyRequests.getServices).toBeCalledWith('THIRD_PARTY_DFSP')

      expect(result).toEqual({
        providers: ['dfspA', 'dfspB'],
        currentState: 'providersLookupSuccess'
      })
    })

    it('should handle a PUT /services/THIRD_PARTY_DFSP/error response', async () => {
      setImmediate(() =>
        publisher.publish(
          PISPPrelinkingModel.notificationChannel(prelinkingData.serviceType),
          genericErrorResponse as unknown as Message
        )
      )

      const model = await create(prelinkingData, modelConfig)
      const result = await model.run()

      expect(result).toEqual({
        currentState: 'errored',
        errorInformation: {
          errorCode: '7000',
          errorDescription: 'Generic thirdparty error'
        }
      })
    })
  })
})
