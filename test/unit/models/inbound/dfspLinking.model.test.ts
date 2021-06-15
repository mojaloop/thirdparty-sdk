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
import { ThirdpartyRequests, MojaloopRequests } from '@mojaloop/sdk-standard-components';
import {
  DFSPLinkingModel,
  create
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
import { DFSPLinkingPhase } from '~/models/inbound/dfspLinking.interface';
import { resetUuid } from '../../__mocks__/uuid';

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
  let publisher: PubSub

  beforeEach(async () => {
    let subId = 0
    const handlers: {[key: string]: NotificationCallback } = {}

    publisher = new PubSub(connectionConfig)
    await publisher.connect()

    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      subscriber: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        putConsentRequests: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        putConsentRequestsError: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        postConsents: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        patchConsents: jest.fn(() => Promise.resolve({ statusCode: 200 })),
        putConsentsError: jest.fn(() => Promise.resolve({ statusCode: 200 })),
      } as unknown as ThirdpartyRequests,
      dfspBackendRequests: {
        validateConsentRequests: jest.fn(() => Promise.resolve(mockData.consentRequestsPost.response)),
        storeConsentRequests: jest.fn(() => Promise.resolve()),
        sendOTP: jest.fn(() => Promise.resolve(mockData.consentRequestsPost.otpResponse)),
        validateAuthToken: jest.fn(() => Promise.resolve({
          isValid: true
        }))
      } as unknown as DFSPBackendRequests,
      mojaloopRequests: {
        postParticipants: jest.fn(() => Promise.resolve({ statusCode: 202 })),
      } as unknown as MojaloopRequests,
      requestProcessingTimeoutSeconds: 3
    }
    mocked(modelConfig.subscriber.subscribe).mockImplementation(
      (channel: string, cb: NotificationCallback) => {
        handlers[channel] = cb
        return ++subId
      }
    )

    mocked(publisher.publish).mockImplementation(
      async (channel: string, message: Message) => handlers[channel](channel, message, subId)
    )
    await modelConfig.kvs.connect()
    await modelConfig.subscriber.connect()
  })

  afterEach(async () => {
    resetUuid()
    await publisher.disconnect()
    await modelConfig.kvs.disconnect()
    await modelConfig.subscriber.disconnect()
  })

  function checkDFSPLinkingModelLayout (
    dfspLinkingModel: DFSPLinkingModel, consentRequestsData?: DFSPLinkingData
  ) {
    expect(dfspLinkingModel).toBeTruthy()
    expect(dfspLinkingModel.data).toBeDefined()
    expect(dfspLinkingModel.fsm.state).toEqual(consentRequestsData?.currentState || 'start')

    // check new getters
    expect(dfspLinkingModel.subscriber).toEqual(modelConfig.subscriber)
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
      'authTokenReceived',
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
      'finalizeThirdpartyLinkWithALS',
      'grantConsent',
      'init',
      'notifyVerificationToPISP',
      'sendLinkingChannelResponse',
      'storeReqAndSendOTP',
      'validateAuthToken',
      'validateRequest',
      'validateWithAuthService'
    ])
  }

  it('module layout', () => {
    expect(typeof DFSPLinkingModel).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('Validate Consent Request with Backend Phase', () => {
    let validateData: DFSPLinkingData
    const expectedWebConsentRequestResponse: tpAPI.Schemas.ConsentRequestsIDPutResponseWeb = {
      consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
      scopes: mockData.consentRequestsPost.payload.scopes,
      authChannels: ['WEB'],
      callbackUri: mockData.consentRequestsPost.payload.callbackUri,
      authUri: "dfspa.com/authorize?consentRequestId=456"
    }

    const expectedOTPConsentRequestResponse: tpAPI.Schemas.ConsentRequestsIDPutResponseOTP = {
      consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
      scopes: mockData.consentRequestsPost.payload.scopes,
      authChannels: ['OTP'],
      callbackUri: mockData.consentRequestsPost.payload.callbackUri
    }

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
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

    it('validateRequest() : WEB should transition start  to requestIsValid when successful', async () => {
      const model = await create(validateData, modelConfig)

      mocked(modelConfig.dfspBackendRequests.validateConsentRequests).mockImplementationOnce(() => Promise.resolve(mockData.consentRequestsPost.response))

      // start validation step
      await model.fsm.validateRequest()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('requestIsValid')

      // check that the channel response request has been constructed
      expect(model.data.consentRequestsIDPutRequest).toEqual(
        expectedWebConsentRequestResponse
      )

      // check we made a call to dfspBackendRequests.validateConsentRequests
      expect(modelConfig.dfspBackendRequests.validateConsentRequests)
        .toBeCalledWith(mockData.consentRequestsPost.payload)
    })

    it('validateRequest() : OTP should transition start  to requestIsValid when successful', async () => {
      const model = await create(validateData, modelConfig)

      mocked(modelConfig.dfspBackendRequests.validateConsentRequests)
        .mockImplementationOnce(() => Promise.resolve(mockData.consentRequestsPost.responseOTP))

      // start validation step
      await model.fsm.validateRequest()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('requestIsValid')

      // check that the channel response request has been constructed
      expect(model.data.consentRequestsIDPutRequest).toEqual(
        expectedOTPConsentRequestResponse
      )

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
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
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
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
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
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
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
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
          }
        },
        'pispa'
      )
    })
  })

  describe('StoreReqAndSendOTP Backend Phase', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
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

  describe('SendLinkingChannelResponse Phase', () => {
    let validateData: DFSPLinkingData
    const expectedWebConsentRequestResponse: tpAPI.Schemas.ConsentRequestsIDPutResponseWeb = {
      consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
      scopes: mockData.consentRequestsPost.payload.scopes,
      authChannels: ['WEB'],
      callbackUri: mockData.consentRequestsPost.payload.callbackUri,
      authUri: "dfspa.com/authorize?consentRequestId=456"
    }
    const waitOnAuthTokenFromPISPResponseChannel = DFSPLinkingModel.notificationChannel(
      DFSPLinkingPhase.waitOnAuthTokenFromPISPResponse,
      mockData.consentRequestsPost.payload.consentRequestId
    )

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
        currentState: 'consentRequestValidatedAndStored',
        consentRequestsIDPutRequest: mockData.consentRequestsPut.payload
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('sendLinkingChannelResponse() should transition from consentRequestValidatedAndStored to authTokenReceived when successful', async () => {
      validateData = {
        ...validateData,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.responseOTP
      }
      const model = await create(validateData, modelConfig)

      setImmediate(() => {
        publisher.publish(
          waitOnAuthTokenFromPISPResponseChannel,
          mockData.consentRequestsIDPatchRequest.payload as unknown as Message
        )
      })

      // start request scopes step
      await model.fsm.sendLinkingChannelResponse()

      // check the PATCH /consentRequests/{ID} response is store in the model data
      expect(model.data.consentRequestsIDPatchResponse).toEqual(
        mockData.consentRequestsIDPatchRequest.payload
      )

      // state machine should be at sendLinkingChannelResponse transition now
      // check if PUT consentRequests/{ID} channel response is sent to PISP
      expect(modelConfig.thirdpartyRequests.putConsentRequests).toHaveBeenCalledWith(
        mockData.consentRequestsPost.payload.consentRequestId,
        expectedWebConsentRequestResponse,
        'pispa'
      )
      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('authTokenReceived')
    })

    it('should handle exceptions and send PUT /consentsRequests/{ID}/error response', async () => {
      mocked(modelConfig.thirdpartyRequests.putConsentRequests).mockImplementationOnce(
        () => {
          throw new Error('mocked putConsentRequests exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start send consent step
        await model.fsm.sendLinkingChannelResponse()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked putConsentRequests exception')
      }

      // check a PUT /consentsRequests/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069',
        {
          errorInformation: {
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
          }
        },
        'pispa'
      )
    })
  })

  describe('Validate AuthToken with Backend Phase', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'authTokenReceived',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchResponse: mockData.consentRequestsIDPatchRequest.payload
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('validateAuthToken() should transition start to authTokenValidated state when successful', async () => {
      const model = await create(validateData, modelConfig)
      mocked(modelConfig.dfspBackendRequests.validateAuthToken).mockImplementationOnce(() => Promise.resolve({
        isValid: true
      }))

      // start validation step
      await model.fsm.validateAuthToken()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('authTokenValidated')

      // check we made a call to dfspBackendRequests.validateAuthToken
      expect(modelConfig.dfspBackendRequests.validateAuthToken).toBeCalledWith(
        'b51ec534-ee48-4575-b6a9-ead2955b8069', '123456'
      )
    })

    it('should handle failed OTP backend validation and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.validateAuthToken
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
        modelConfig.dfspBackendRequests.validateAuthToken
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
        modelConfig.dfspBackendRequests.validateAuthToken
      ).mockImplementationOnce(
        () => {
          throw new Error('mocked validateAuthToken exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start validation step
        await model.fsm.validateAuthToken()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked validateAuthToken exception')
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
    const waitOnSignedCredentialFromPISPResponseChannel = DFSPLinkingModel.notificationChannel(
      DFSPLinkingPhase.waitOnSignedCredentialFromPISPResponse,
      '00000000-0000-1000-8000-000000000001'
    )

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'authTokenValidated',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchResponse: mockData.consentRequestsIDPatchRequest.payload,
        scopes: [
          {
            accountId: 'dfspa.username.1234',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          },
          {
            accountId: 'dfspa.username.5678',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          }
        ]
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('grantConsent() should transition from auth token validated to sent consent when successful', async () => {
      const model = await create(validateData, modelConfig)

      setImmediate(() => {
        publisher.publish(
          waitOnSignedCredentialFromPISPResponseChannel,
          mockData.inboundPutConsentsIdRequestSignedCredential.payload as unknown as Message
        )
      })

      // start send consent step
      await model.fsm.grantConsent()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('consentGranted')

      // check the signed credential response is stored in model data
      expect(model.data.consentIDPutResponseSignedCredentialFromPISP).toEqual(
        mockData.inboundPutConsentsIdRequestSignedCredential.payload
      )
      // check we made a call to thirdpartyRequests.postConsents
      expect(modelConfig.thirdpartyRequests.postConsents).toBeCalledWith(
        {
          consentId: '00000000-0000-1000-8000-000000000001',
          consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
          scopes: [
            {
              accountId: 'dfspa.username.1234',
              actions: [
                'accounts.transfer',
                'accounts.getBalance'
              ]
            },
            {
              accountId: 'dfspa.username.5678',
              actions: [
                'accounts.transfer',
                'accounts.getBalance'
              ]
            }
          ]
        },
        'pispa'
      )
    })

    it('should handle exceptions and send PUT /consents/{ID}/error response', async () => {
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

      // check a PUT /consents/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentsError).toBeCalledWith(
        '00000000-0000-1000-8000-000000000001',
        {
          errorInformation: {
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
          }
        },
        'pispa'
      )
    })
  })

  describe('Send signed challenge to auth service', () => {
    let validateData: DFSPLinkingData

    const consentsIDPutResponseVerified: tpAPI.Schemas.ConsentsIDPutResponseVerified = {
      scopes: [
        {
          accountId: 'dfspa.username.1234',
          actions: [
            'accounts.transfer',
            'accounts.getBalance'
          ]
        },
        {
          accountId: 'dfspa.username.5678',
          actions: [
            'accounts.transfer',
            'accounts.getBalance'
          ]
        }
      ],
      credential: {
        credentialType: 'FIDO',
        status: 'VERIFIED',
        payload: {
          id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
          rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
          response: {
            clientDataJSON: 'clientDataJSON-must-not-have-fewer-than-121-' +
              'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
              'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
              'aliqua.',
            attestationObject: 'attestationObject-must-not-have-fewer-than-' +
              '306-characters Lorem ipsum dolor sit amet, consectetur ' +
              'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
              'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
              'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
              'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
              'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
          },
          type: 'public-key'
        }
      }
    }

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'consentGranted',
        consentId: '00000000-0000-1000-8000-000000000001',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchResponse: mockData.consentRequestsIDPatchRequest.payload,
        consentIDPutResponseSignedCredentialFromPISP: mockData.inboundPutConsentsIdRequestSignedCredential.payload,
        scopes: [
          {
            accountId: 'dfspa.username.1234',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          },
          {
            accountId: 'dfspa.username.5678',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          }
        ],
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('onValidateWithAuthService() should transition from consent granted to consent registered and validated when successful', async () => {
      const model = await create(validateData, modelConfig)
      const waitOnAuthServiceResponse = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnAuthServiceResponse,
        validateData.consentId!
      )

      // defer publication to notification channel
      setImmediate(() => {
        publisher.publish(
          waitOnAuthServiceResponse,
          consentsIDPutResponseVerified as unknown as Message
        )
      })

      // start send consent step
      await model.fsm.validateWithAuthService()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('consentRegisteredAndValidated')

      // check we made a call to thirdpartyRequests.postConsents
      expect(modelConfig.thirdpartyRequests.postConsents).toBeCalledWith(
        {
          consentId: '00000000-0000-1000-8000-000000000001',
          scopes: [
            {
              accountId: 'dfspa.username.1234',
              actions: [
                'accounts.transfer',
                'accounts.getBalance'
              ]
            },
            {
              accountId: 'dfspa.username.5678',
              actions: [
                'accounts.transfer',
                'accounts.getBalance'
              ]
            }
          ],
          credential: {
            credentialType: 'FIDO',
            status: 'PENDING',
            payload: {
              id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
              rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
              response: {
                clientDataJSON: 'clientDataJSON-must-not-have-fewer-than-121-' +
                  'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
                  'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
                  'aliqua.',
                attestationObject: 'attestationObject-must-not-have-fewer-than-' +
                  '306-characters Lorem ipsum dolor sit amet, consectetur ' +
                  'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
                  'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
                  'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
                  'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
                  'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
              },
              type: 'public-key'
            }
          }
        },
        'central-auth'
      )
    })

    it('onValidateWithAuthService() should transition from consent granted to errored when receiving error response from Auth service', async () => {
      const model = await create(validateData, modelConfig)
      const waitOnAuthServiceResponse = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnAuthServiceResponse,
        validateData.consentId!
      )

      // defer publication to notification channel
      setImmediate(() => {
        publisher.publish(
          waitOnAuthServiceResponse,
          {
            errorInformation: {
              errorCode: '7200',
              errorDescription: 'Generic Thirdparty account linking error'
            }
          } as unknown as Message
        )
      })

      // start send consent step
      await model.fsm.validateWithAuthService()
      // check for errors
      await model.checkModelDataForErrorInformation()
      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('errored')

      // check we made a call to thirdpartyRequests.postConsents
      expect(modelConfig.thirdpartyRequests.putConsentsError).toBeCalledWith(
        validateData.consentId,
        {
          errorInformation: {
            errorCode: '7213',
            errorDescription: 'Consent is invalid'
          }
        },
        'pispa'
      )
    })

    it('should handle exceptions and send PUT /consents/{ID}/error response', async () => {
      mocked(modelConfig.thirdpartyRequests.postConsents).mockImplementationOnce(
        () => {
          throw new Error('mocked postConsents exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start send consent step
        await model.fsm.validateWithAuthService()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked postConsents exception')
      }

      // check a PUT /consents/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentsError).toBeCalledWith(
        '00000000-0000-1000-8000-000000000001',
        {
          errorInformation: {
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
          }
        },
        'pispa'
      )
    })
  })

  describe('Register THIRD_PARTY_LINKS with als', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'consentRegisteredAndValidated',
        consentId: '00000000-0000-1000-8000-000000000001',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchResponse: mockData.consentRequestsIDPatchRequest.payload,
        consentIDPutResponseSignedCredentialFromPISP: mockData.inboundPutConsentsIdRequestSignedCredential.payload,
        consentIDPutResponseFromAuthService: mockData.inboundPutConsentsIdRequestVerifiedCredential.payload,
        scopes: [
          {
            accountId: 'dfspa.username.1234',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          },
          {
            accountId: 'dfspa.username.5678',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          }
        ],
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('onValidateWithAuthService() should transition from consent registered and validated to PISP DFSP LinkEstablished when successful', async () => {
      const model = await create(validateData, modelConfig)
      // start send consent step
      await model.fsm.finalizeThirdpartyLinkWithALS()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('PISPDFSPLinkEstablished')
    })
  })

  describe('Notify PISP of successful account linking', () => {
    let validateData: DFSPLinkingData

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        currentState: 'PISPDFSPLinkEstablished',
        consentId: '00000000-0000-1000-8000-000000000001',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        backendValidateConsentRequestsResponse: mockData.consentRequestsPost.response,
        consentRequestsIDPatchResponse: mockData.consentRequestsIDPatchRequest.payload,
        consentIDPutResponseSignedCredentialFromPISP: mockData.inboundPutConsentsIdRequestSignedCredential.payload,
        consentIDPutResponseFromAuthService: mockData.inboundPutConsentsIdRequestVerifiedCredential.payload,
        scopes: [
          {
            accountId: 'dfspa.username.1234',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          },
          {
            accountId: 'dfspa.username.5678',
            actions: [
              'accounts.transfer',
              'accounts.getBalance'
            ]
          }
        ],
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPLinkingModelLayout(model, validateData)
    })

    it('onNotifyVerificationToPISP() should transition from PISP DFSP LinkEstablished to verification notification sent to PISP  when successful', async () => {
      const model = await create(validateData, modelConfig)
      // start send consent step
      await model.fsm.notifyVerificationToPISP()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('notificationSent')

      // check we made a call to thirdpartyRequests.postConsents
      expect(modelConfig.thirdpartyRequests.patchConsents).toBeCalledWith(
        validateData.consentId!,
        {
          credential: {
            status: 'VERIFIED'
          }
        },
        'pispa'
      )
    })

    it('should handle exceptions and send PUT /consents/{ID}/error response', async () => {
      mocked(modelConfig.thirdpartyRequests.patchConsents).mockImplementationOnce(
        () => {
          throw new Error('mocked patchConsents exception')
        }
      )

      const model = await create(validateData, modelConfig)
      try {
        // start send consent step
        await model.fsm.notifyVerificationToPISP()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked patchConsents exception')
      }

      // check a PUT /consents/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentsError).toBeCalledWith(
        '00000000-0000-1000-8000-000000000001',
        {
          errorInformation: {
            errorCode: '7200',
            errorDescription: 'Generic Thirdparty account linking error'
          }
        },
        'pispa'
      )
    })
  })

  // run this test last since it can interfere with other tests because of the
  // timed pubsub publishing
  describe('run workflow', () => {
    let validateData: DFSPLinkingData
    const consentsIDPutResponseVerified: tpAPI.Schemas.ConsentsIDPutResponseVerified = {
      scopes: [
        {
          accountId: 'dfspa.username.1234',
          actions: [
            'accounts.transfer',
            'accounts.getBalance'
          ]
        },
        {
          accountId: 'dfspa.username.5678',
          actions: [
            'accounts.transfer',
            'accounts.getBalance'
          ]
        }
      ],
      credential: {
        credentialType: 'FIDO',
        status: 'VERIFIED',
        payload: {
          id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
          rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
          response: {
            clientDataJSON: 'clientDataJSON-must-not-have-fewer-than-121-' +
              'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
              'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
              'aliqua.',
            attestationObject: 'attestationObject-must-not-have-fewer-than-' +
              '306-characters Lorem ipsum dolor sit amet, consectetur ' +
              'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
              'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
              'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
              'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
              'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
          },
          type: 'public-key'
        }
      }
    }

    beforeEach(async () => {
      validateData = {
        dfspId: 'dfspa',
        toParticipantId: 'pispa',
        toAuthServiceParticipantId: 'central-auth',
        consentRequestsPostRequest: mockData.consentRequestsPost.payload,
        currentState: 'start',
        consentRequestId: mockData.consentRequestsPost.payload.consentRequestId,
      }
    })

    it('start', async () => {
      mocked(modelConfig.dfspBackendRequests.validateConsentRequests).mockImplementationOnce(() => Promise.resolve(mockData.consentRequestsPost.response))
      mocked(modelConfig.dfspBackendRequests.storeConsentRequests).mockImplementationOnce(() => Promise.resolve())
      mocked(modelConfig.dfspBackendRequests.validateAuthToken).mockImplementationOnce(() => Promise.resolve({
        isValid: true
      }))

      const waitOnAuthTokenFromPISPResponseChannel = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnAuthTokenFromPISPResponse,
        mockData.consentRequestsPost.payload.consentRequestId
      )
      const waitOnSignedCredentialFromPISPResponseChannel = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnSignedCredentialFromPISPResponse,
        '00000000-0000-1000-8000-000000000001'
      )
      const waitOnAuthServiceResponse = DFSPLinkingModel.notificationChannel(
        DFSPLinkingPhase.waitOnAuthServiceResponse,
        '00000000-0000-1000-8000-000000000001'
      )

      const model = await create(validateData, modelConfig)

      // todo: this feels very fickle...research a good solution for
      //       publishing responses one after the other
      setImmediate(() => {
        publisher.publish(
          waitOnAuthTokenFromPISPResponseChannel,
          mockData.consentRequestsIDPatchRequest.payload as unknown as Message
        )
        setTimeout(() => {
          publisher.publish(
            waitOnSignedCredentialFromPISPResponseChannel,
            mockData.inboundPutConsentsIdRequestSignedCredential.payload as unknown as Message
          )
        }, 200)
        setTimeout(() => {
          publisher.publish(
            waitOnAuthServiceResponse,
            consentsIDPutResponseVerified as unknown as Message
          )
        }, 200)
      })

      await model.run()

      // check that the fsm was able complete the workflow
      expect(model.data.currentState).toEqual('notificationSent')

      mocked(modelConfig.logger.info).mockReset()

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
