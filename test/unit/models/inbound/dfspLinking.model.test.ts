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
import {
  Message,
  NotificationCallback,
  PubSub
} from '~/shared/pub-sub'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import {
  DFSPLinkingModel,
  create,
  existsInKVS,
  loadFromKVS
} from '~/models/inbound/dfspLinking.model'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest/utils'

import mockLogger from 'test/unit/mockLogger'
import sortedArray from 'test/unit/sortedArray'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import {
  DFSPLinkingModelConfig,
  DFSPLinkingData
} from '~/models/inbound/dfspLinking.interface'
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import TestData from 'test/unit/data/mockData.json'
import { HTTPResponseError } from '../../../../src/shared/http-response-error'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')
const mockData = JSON.parse(JSON.stringify(TestData))

describe('dfspLinkingModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: DFSPLinkingModelConfig

  beforeEach(async () => {
    let subId = 0
    let handler: NotificationCallback

    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      pubSub: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        putConsentRequests: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        putConsentRequestsError: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        postConsents: jest.fn(() => Promise.resolve({ statusCode: 202 })),
      } as unknown as ThirdpartyRequests,
      dfspBackendRequests: {
        validateConsentRequests: jest.fn(() => Promise.resolve(mockData.consentRequestsPost.response)),
        storeConsentRequests: jest.fn(() => Promise.resolve()),
        sendOTP: jest.fn(() => Promise.resolve(mockData.consentRequestsPost.otpResponse)),
        validateOTPSecret: jest.fn(() => Promise.resolve({
          isValid: true
        }))
      } as unknown as DFSPBackendRequests,
      requestProcessingTimeoutSeconds: 3
    }
    mocked(modelConfig.pubSub.subscribe).mockImplementationOnce(
      (_channel: string, cb: NotificationCallback) => {
        handler = cb
        return ++subId
      }
    )

    mocked(modelConfig.pubSub.publish).mockImplementationOnce(
      async (channel: string, message: Message) => handler(channel, message, subId)
    )
    await modelConfig.kvs.connect()
    await modelConfig.pubSub.connect()
  })

  afterEach(async () => {
    await modelConfig.kvs.disconnect()
    await modelConfig.pubSub.disconnect()
  })

  function checkDFSPLinkingModelLayout (
    dfspLinkingModel: DFSPLinkingModel, consentRequestsData?: DFSPLinkingData
  ) {
    expect(dfspLinkingModel).toBeTruthy()
    expect(dfspLinkingModel.data).toBeDefined()
    expect(dfspLinkingModel.fsm.state).toEqual(consentRequestsData?.currentState || 'start')

    // check new getters
    expect(dfspLinkingModel.pubSub).toEqual(modelConfig.pubSub)
    expect(dfspLinkingModel.dfspBackendRequests).toEqual(modelConfig.dfspBackendRequests)
    expect(dfspLinkingModel.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof dfspLinkingModel.fsm.init).toEqual('function')
    expect(typeof dfspLinkingModel.fsm.validateRequest).toEqual('function')
    expect(typeof dfspLinkingModel.fsm.storeReqAndSendOTP).toEqual('function')

    // check fsm notification handler
    expect(typeof dfspLinkingModel.onValidateRequest).toEqual('function')
    expect(typeof dfspLinkingModel.onStoreReqAndSendOTP).toEqual('function')

    expect(sortedArray(dfspLinkingModel.fsm.allStates())).toEqual([
      'PISPDFSPLinkEstablished',
      'authTokenValidated',
      'consentGranted',
      'consentRegisteredAndValidated',
      'consentRequestValidatedAndStored',
      'errored',
      'none',
      'notificationSent',
      'requestIsValid',
      'start'
    ])
    expect(sortedArray(dfspLinkingModel.fsm.allTransitions())).toEqual([
      'error',
      'finalizeConsentWithALS',
      'grantConsent',
      'init',
      'notifyVerificationToPISP',
      'storeReqAndSendOTP',
      'validateAuthToken',
      'validateRequest',
      'validateWithAuthService'
    ])
  }

  it('module layout', () => {
    expect(typeof DFSPLinkingModel).toEqual('function')
    expect(typeof loadFromKVS).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('Validate consentRequests with Backend Phase', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        currentState: 'start',
        consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('validateRequest():WEB should transition start  to requestIsValid when successful', async () => {
      const model = await create(validateData, modelConfig)

      mocked(modelConfig.dfspBackendRequests.validateConsentRequests).mockImplementationOnce(() => Promise.resolve(mockData.consentRequestsPost.response))

      // start validation step
      await model.fsm.validateRequest()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('requestIsValid')

      // check we made a call to dfspBackendRequests.validateConsentRequests
      expect(modelConfig.dfspBackendRequests.validateConsentRequests)
        .toBeCalledWith(mockData.consentRequestsPost.payload)
    })

    it('validateRequest():OTP should transition start  to requestIsValid when successful', async () => {
      const model = await create(validateData, modelConfig)

      mocked(modelConfig.dfspBackendRequests.validateConsentRequests)
        .mockImplementationOnce(() => Promise.resolve(mockData.consentRequestsPost.responseOTP))

      // start validation step
      await model.fsm.validateRequest()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('requestIsValid')

      // check we made a call to dfspBackendRequests.validateConsentRequests
      expect(modelConfig.dfspBackendRequests.validateConsentRequests)
        .toBeCalledWith(mockData.consentRequestsPost.payload)
    })

    it('should handle failed backend validation and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateConsentRequests
      ).mockImplementationOnce(() => Promise.resolve(mockData.consentRequestsPost.responseError))

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateRequest()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.code).toEqual('7204')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        mockData.consentRequestsPutError.params.ID,
        mockData.consentRequestsPutError.payload,
        'pispa'
      )
    })

    it('should handle empty response and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateConsentRequests
      ).mockImplementationOnce(() => Promise.resolve())

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateRequest()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.code).toEqual('7208')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        mockData.consentRequestsPutError.params.ID,
        {
          errorInformation: {
            errorCode: '7208',
            errorDescription: 'FSP failed to validate consent request'
          }
        },
        'pispa'
      )
    })

    it('should handle exceptions and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateConsentRequests
      ).mockImplementationOnce(
        () => {
          throw new Error('mocked validateConsentRequests exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateRequest()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked validateConsentRequests exception')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        mockData.consentRequestsPutError.params.ID,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        'pispa'
      )
    })

    it('reformating of thrown exception when res.body present', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateConsentRequests
      ).mockImplementationOnce(
        () => {
          throw new HTTPResponseError({
            msg: 'mocked-error',
            res: {
              body: JSON.stringify({ statusCode: '2003' })
            }
          })
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateRequest()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked-error')
      }
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        mockData.consentRequestsPutError.params.ID,
        {
          errorInformation: {
            errorCode: '2003',
            errorDescription: 'Service currently unavailable'
          }
        },
        'pispa'
      )
    })

    it('reformating of thrown exception when res.data present and using different statusCode', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateConsentRequests
      ).mockImplementationOnce(
        () => {
          throw new HTTPResponseError({
            msg: 'mocked-error',
            res: {
              data: { statusCode: '2002' }
            }
          })
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateRequest()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked-error')
      }
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        mockData.consentRequestsPutError.params.ID,
        {
          errorInformation: {
            errorCode: '2002',
            errorDescription: 'Not implemented'
          }
        },
        'pispa'
      )
    })

    it('reformating of thrown generic Error', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateConsentRequests
      ).mockImplementationOnce(
        () => {
          throw new Error('generic-error')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateRequest()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('generic-error')
      }
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        mockData.consentRequestsPutError.params.ID,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        'pispa'
      )
    })

    describe('run workflow', () => {
      const webConsentRequestResponse: tpAPI.Schemas.ConsentRequestsIDPutResponseWeb = {
        consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
        scopes: mockData.consentRequestsPost.payload.scopes,
        authChannels: ['WEB'],
        callbackUri: mockData.consentRequestsPost.payload.callbackUri,
        authUri: 'dfspa.com/authorize?consentRequestId=456',
      }

      it('start', async () => {
        const model = await create(validateData, modelConfig)
        await model.run()
        expect(mocked(modelConfig.thirdpartyRequests.putConsentRequests)).toHaveBeenCalledWith(
          mockData.consentRequestsPost.payload.consentRequestId, webConsentRequestResponse, 'pispa'
        )
        mocked(modelConfig.logger.info).mockReset()
        expect(model.data.currentState).toEqual('consentRequestValidatedAndStored')
        const result = await existsInKVS(modelConfig)
        expect(result).toBeUndefined()
      })

      it('errored', async () => {
        const model = await create({ ...validateData, currentState: 'error' }, modelConfig)

        const result = await model.run()

        expect(mocked(modelConfig.logger.info)).toBeCalledWith('State machine in errored state')

        expect(result).toBeUndefined()
      })

      it('exceptions', async () => {
        const error = { message: 'error from requests.putConsentRequests', consentReqState: 'broken' }
        mocked(modelConfig.thirdpartyRequests.putConsentRequests).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create(validateData, modelConfig)

        expect(async () => await model.run()).rejects.toEqual(error)
      })

      it('exceptions - Error', async () => {
        const error = new Error('the-exception')
        mocked(modelConfig.thirdpartyRequests.putConsentRequests).mockImplementationOnce(
          () => {
            throw error
          }
        )
        const model = await create({ ...validateData, currentState: 'start' }, modelConfig)

        expect(model.run()).rejects.toEqual(error)
      })
    })
  })

  describe('StoreReqAndSendOTP Backend Phase', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
        currentState: 'requestIsValid'
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('storeReqAndSendOTP()-WEB: should transition from requestIsValid to consentRequestValidatedAndStored when successful', async () => {
      const model = await create(validateData, modelConfig)

      mocked(modelConfig.dfspBackendRequests.storeConsentRequests).mockImplementationOnce(() => Promise.resolve())
      // start request scopes step
      await model.fsm.storeReqAndSendOTP()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('consentRequestValidatedAndStored')

      // check we made dfspBackendRequests calls
      expect(modelConfig.dfspBackendRequests.storeConsentRequests).toBeCalledWith(mockData.consentRequestsPost.payload)
      expect(modelConfig.dfspBackendRequests.sendOTP).not.toHaveBeenCalled()
    })

    it('storeReqAndSendOTP()-OTP:  should transition from requestIsValid to consentRequestValidatedAndStored when successful', async () => {
      validateData = {
        ...validateData,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.responseOTP
      }
      const model = await create(validateData, modelConfig)

      mocked(modelConfig.dfspBackendRequests.sendOTP)
        .mockImplementationOnce(
          () => Promise.resolve(mockData.consentRequestsPost.otpResponse)
        )

      // start request scopes step
      await model.fsm.storeReqAndSendOTP()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('consentRequestValidatedAndStored')

      // check we made dfspBackendRequests calls
      expect(modelConfig.dfspBackendRequests.sendOTP).toBeCalledWith(mockData.consentRequestsPost.payload)
      expect(modelConfig.dfspBackendRequests.storeConsentRequests).not.toHaveBeenCalled()
    })

    it('storeReqAndSendOTP()-InvalidAuthChannel:  should transition from requestIsValid to errored', async () => {
      validateData = {
        ...validateData,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.responseErrorAuthChannel
      }
      const model = await create(validateData, modelConfig)

      try {
        // start request scopes step
        await model.fsm.storeReqAndSendOTP()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('Invalid authChannel TEST')
      }
    })

    it('should handle exceptions', async () => {
      mocked(
        modelConfig.dfspBackendRequests.storeConsentRequests
      ).mockImplementationOnce(
        () => {
          throw new Error('mocked storeConsentRequests exception')
        }
      )

      const model = await create(validateData, modelConfig)

      try {
        // start request scopes step
        await model.fsm.storeReqAndSendOTP()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked storeConsentRequests exception')
      }
    })
  })

  describe('Validate AuthToken with Backend Phase', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'consentRequestValidatedAndStored',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchRequest: mockData.consentRequestsIDPatchRequest.payload
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('validateAuthToken() should transition start to authTokenValidated state when successful', async () => {
      const model = await create(validateData, modelConfig)
      mocked(modelConfig.dfspBackendRequests.validateOTPSecret).mockImplementationOnce(() => Promise.resolve({
        isValid: true
      }))

      // start validation step
      await model.fsm.validateAuthToken()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('authTokenValidated')

      // check we made a call to dfspBackendRequests.validateOTPSecret
      expect(modelConfig.dfspBackendRequests.validateOTPSecret).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069', '123456'
      )
    })

    it('should handle failed OTP backend validation and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateOTPSecret
      ).mockImplementationOnce(() => Promise.resolve({
        isValid: false
      }))

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateAuthToken()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.code).toEqual('7205')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      // todo: better and more descriptive error handling
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069',
        {
          errorInformation: {
            errorCode: '7205',
            errorDescription: 'OTP failed validation'
          }
        },
        'pispa'
      )
    })

    it('should handle empty OTP validation response and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateOTPSecret
      ).mockImplementationOnce(() => Promise.resolve())

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateAuthToken()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.code).toEqual('7206')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      // todo: better and more descriptive error handling
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069',
        {
          errorInformation: {
            errorCode: '7206',
            errorDescription: 'FSP failed to validate OTP'
          }
        },
        'pispa'
      )
    })

    it('should handle exceptions and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateOTPSecret
      ).mockImplementationOnce(
        () => {
          throw new Error('mocked validateOTPSecret exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateAuthToken()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked validateOTPSecret exception')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069',
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        'pispa'
      )
    })
  })

  describe('Send consent to PISP', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'authTokenValidated',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchRequest: mockData.consentRequestsIDPatchRequest.payload,
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }]
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('registerConsent() should transition from scopes received to sent consent when successful', async () => {
      const model = await create(validateData, modelConfig)

      // start send consent step
      await model.fsm.grantConsent()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('consentGranted')

      // check we made a call to thirdpartyRequests.postConsents
      expect(modelConfig.thirdpartyRequests.postConsents).toBeCalledWith(
        {
          consentId: '00000000-0000-1000-8000-000000000001',
          consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
          scopes: [{
            accountId: 'some-id',
            actions: [
              'accounts.getBalance',
              'accounts.transfer'
            ]
          }]
        },
        'pispa'
      )
    })

    it('should handle exceptions and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(modelConfig.thirdpartyRequests.postConsents).mockImplementationOnce(
        () => {
          throw new Error('mocked postConsents exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start send consent step
        await model.fsm.grantConsent()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked postConsents exception')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069',
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        'pispa'
      )
    })

  })
  describe('loadFromKVS', () => {
    it('should properly call `KVS.get`, get expected data in `context.data` and setup state of machine', async () => {
      const dataFromCache = {
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        currentState: 'consentRequestValidatedAndStored',
        consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
      }
      mocked(modelConfig.kvs.get).mockImplementationOnce(async () => dataFromCache)
      const am = await loadFromKVS(modelConfig)
      checkDFSPLinkingModelLayout(am, dataFromCache)

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
})
