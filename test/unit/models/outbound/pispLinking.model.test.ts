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
  PISPLinkingData,
  PISPLinkingModelConfig,
} from '~/models/outbound/pispLinking.interface'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import {
  PISPLinkingModel,
  create
} from '~/models/outbound/pispLinking.model'

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
const mockData = JSON.parse(JSON.stringify(TestData))

describe('PISPLinkingModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: PISPLinkingModelConfig
  const expectedResp = {
    channelResponse: { ...mockData.consentRequestsPut.payload },
    currentState: 'WebAuthenticationChannelResponseRecieved'
  }

  const expectedErrorResp = {
    ...mockData.consentRequestsPutError.payload,
    currentState: 'errored'
  }

  beforeEach(async () => {
    modelConfig = {
      kvs: new KVS(connectionConfig),
      key: 'cache-key',
      logger: connectionConfig.logger,
      pubSub: new PubSub(connectionConfig),
      requestProcessingTimeoutSeconds: 3,
      thirdpartyRequests: {
        postConsentRequests: jest.fn()
      } as unknown as ThirdpartyRequests
    }
    await modelConfig.kvs.connect()
    await modelConfig.pubSub.connect()
  })

  afterEach(async () => {
    await modelConfig.kvs.disconnect()
    await modelConfig.pubSub.disconnect()
  })

  function checkPISPLinkingModelLayout (am: PISPLinkingModel, optData?: PISPLinkingData) {
    expect(am).toBeTruthy()
    expect(am.data).toBeDefined()
    expect(am.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(am.pubSub).toEqual(modelConfig.pubSub)
    expect(am.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof am.fsm.init).toEqual('function')
    expect(typeof am.fsm.onRequestConsent).toEqual('function')

    // check fsm notification handler
    expect(typeof am.onRequestConsent).toEqual('function')

    expect(sortedArray(am.fsm.allStates())).toEqual([
      'OTPAuthenticationChannelResponseRecieved',
      'WebAuthenticationChannelResponseRecieved',
      'channelResponseReceived',
      'errored',
      'none',
      'start'
    ])
    expect(sortedArray(am.fsm.allTransitions())).toEqual([
      'changeToOTPAuthentication',
      'changeToWebAuthentication',
      'error',
      'init',
      'requestConsent'
    ])
  }

  it('module layout', () => {
    expect(typeof PISPLinkingModel).toEqual('function')
    expect(typeof create).toEqual('function')
  })



  describe('notificationChannel', () => {
    it('should generate proper channel name', () => {
      const id = '123'
      expect(PISPLinkingModel.notificationChannel(id)).toEqual('PISPLinking_123')
    })

    it('input validation', () => {
      expect(
        () => PISPLinkingModel.notificationChannel(null as unknown as string)
      ).toThrow()
    })
  })

  describe('validateRequest flow', () => {
    let subId = 0
    let channel: string
    let handler: NotificationCallback
    let data: PISPLinkingData
    type PutResponse =
      tpAPI.Schemas.ConsentRequestsIDPutResponseWeb |
      tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
    type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
    let putResponse: PutResponseOrError

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
        toParticipantId: 'dfspA',
        consentRequestId: mockData.linkingRequestConsentPostRequest.payload.consentRequestId,
        linkingRequestConsentPostRequest: mockData.linkingRequestConsentPostRequest.payload,
        currentState: 'start'
      }

      channel = PISPLinkingModel.notificationChannel(data.consentRequestId)

      putResponse = mockData.consentRequestsPut.payload
    })

    it('should be well constructed', async () => {
      const model = await create(data, modelConfig)
      checkPISPLinkingModelLayout(model, data)
    })

    it('should give response properly populated from notification channel - success', async () => {
      const model = await create(data, modelConfig)
      setImmediate(() => model.pubSub.publish(
        channel,
        putResponse as unknown as Message
      ))

      const result = await model.run()
      // Assertions
      expect(result).toEqual(expectedResp)
      expect(mocked(modelConfig.thirdpartyRequests.postConsentRequests)).toHaveBeenCalledWith(
        model.linkingRequestConsentPostRequestToConsentRequestsPostRequest(),
        model.data.toParticipantId
      )
      expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(modelConfig.pubSub.publish)).toBeCalledWith(channel, putResponse)
    })
    it('should give response properly populated from notification channel - error response', async () => {
      data = {
        toParticipantId: 'dfspA',
        consentRequestId: mockData.linkingRequestConsentPostRequest.payload.consentRequestId,
        linkingRequestConsentPostRequest: mockData.linkingRequestConsentPostRequest.payload,
        currentState: 'start'
      }
      putResponse = mockData.consentRequestsPutError.payload
      const model = await create(data, modelConfig)
      setImmediate(() => model.pubSub.publish(
        channel,
        putResponse as unknown as Message
      ))

      const result = await model.run()
      // Assertions
      expect(result).toEqual(expectedErrorResp)
      expect(mocked(modelConfig.thirdpartyRequests.postConsentRequests)).toHaveBeenCalledWith(
        model.linkingRequestConsentPostRequestToConsentRequestsPostRequest(),
        model.data.toParticipantId
      )
      expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
      expect(mocked(modelConfig.pubSub.publish)).toBeCalledWith(channel, putResponse)
    })

    it('should properly handle error from requests.postConsentRequests', async () => {
      mocked(modelConfig.thirdpartyRequests.postConsentRequests).mockImplementationOnce(
        () => { throw new Error('error from requests.postConsentRequests') }
      )
      const model = await create(data, modelConfig)

      try {
        await model.run()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err).toEqual(new Error('error from requests.postConsentRequests'))
        expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
      }
    })

    describe('run workflow', () => {
      it('start', async () => {
        const model = await create(data, modelConfig)

        setImmediate(() => model.pubSub.publish(
          channel,
          putResponse as unknown as Message
        ))

        const result = await model.run()

        expect(result).toEqual(expectedResp)
        expect(mocked(modelConfig.thirdpartyRequests.postConsentRequests)).toHaveBeenCalledWith(
          model.linkingRequestConsentPostRequestToConsentRequestsPostRequest(),
          model.data.toParticipantId
        )
        expect(mocked(modelConfig.pubSub.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.pubSub.unsubscribe)).toBeCalledWith(channel, subId)
        expect(mocked(modelConfig.pubSub.publish)).toBeCalledWith(channel, putResponse)
        mocked(modelConfig.logger.info).mockReset()
        expect(model.data.currentState).toEqual('WebAuthenticationChannelResponseRecieved')
      })

      it('errored', async () => {
        const model = await create({ ...data, currentState: 'errored' }, modelConfig)
        const result = await model.run()
        expect(result).toBeUndefined()
      })

      it('exceptions', async () => {
        const error = { message: 'error from requests.postConsentRequests', consentReqState: 'broken' }
        mocked(modelConfig.thirdpartyRequests.postConsentRequests).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create(data, modelConfig)

        expect(async () => await model.run()).rejects.toEqual(error)
      })

      it('exceptions - Error', async () => {
        const error = new Error('the-exception')
        mocked(modelConfig.thirdpartyRequests.postConsentRequests).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create({ ...data, currentState: 'start' }, modelConfig)

        expect(model.run()).rejects.toEqual(error)
      })
    })
  })
})
