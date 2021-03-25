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

import { KVS } from '~/shared/kvs'
import {
  Message,
  NotificationCallback,
  PubSub
} from '~/shared/pub-sub'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import {
  DFSPOTPValidateModel,
  create,
  loadFromKVS
} from '~/models/inbound/dfspOTPValidate.model'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest/utils'

import mockLogger from 'test/unit/mockLogger'
import sortedArray from 'test/unit/sortedArray'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests';
import { DFSPOTPValidateModelConfig, DFSPOTPValidateData } from '~/models/inbound/dfspOTPValidate.interface';
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('pipsTransactionModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: DFSPOTPValidateModelConfig

  beforeEach(async () => {
    let subId = 0
    let handler: NotificationCallback

    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      pubSub: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        postConsents: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        putConsentRequestsError: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as ThirdpartyRequests,
      dfspBackendRequests: {
        validateOTPSecret: jest.fn(() => Promise.resolve({
          isValid: true
        })),
        getScopes: jest.fn(() => Promise.resolve({
          scopes: [{
            accountId: "some-id",
            actions: [
              "accounts.getBalance",
              "accounts.transfer"
            ]
          }]
        }))
      } as unknown as DFSPBackendRequests,
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

  function checkDFSPOTPModelLayout (dfspOTPmodel: DFSPOTPValidateModel, optData?: DFSPOTPValidateData) {
    expect(dfspOTPmodel).toBeTruthy()
    expect(dfspOTPmodel.data).toBeDefined()
    expect(dfspOTPmodel.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(dfspOTPmodel.pubSub).toEqual(modelConfig.pubSub)
    expect(dfspOTPmodel.dfspBackendRequests).toEqual(modelConfig.dfspBackendRequests)
    expect(dfspOTPmodel.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof dfspOTPmodel.fsm.init).toEqual('function')
    expect(typeof dfspOTPmodel.fsm.validateOTP).toEqual('function')
    expect(typeof dfspOTPmodel.fsm.requestScopes).toEqual('function')
    expect(typeof dfspOTPmodel.fsm.registerConsent).toEqual('function')

    // check fsm notification handler
    expect(typeof dfspOTPmodel.onValidateOTP).toEqual('function')
    expect(typeof dfspOTPmodel.onRequestScopes).toEqual('function')
    expect(typeof dfspOTPmodel.onRegisterConsent).toEqual('function')

    expect(sortedArray(dfspOTPmodel.fsm.allStates())).toEqual([
      'OTPIsValid',
      'consentSent',
      'errored',
      'none',
      'scopesReceived',
      'start'
    ])
    expect(sortedArray(dfspOTPmodel.fsm.allTransitions())).toEqual([
      'error',
      'init',
      'registerConsent',
      'requestScopes',
      'validateOTP'
    ])
  }

  it('module layout', () => {
    expect(typeof DFSPOTPValidateModel).toEqual('function')
    expect(typeof loadFromKVS).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('Validate OTP with Backend Phase', () => {
    let validateData: DFSPOTPValidateData

    beforeEach(async () => {
      validateData = {
        consentRequestsRequestId: '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        authToken: '123456',
        toParticipantId: 'pispa',
        currentState: 'start'
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPOTPModelLayout(model, validateData)
    })

    it('validateOTP() should transition start  to valid OTP state when successful', async () => {
      const model = await create(validateData, modelConfig)
      mocked(modelConfig.dfspBackendRequests.validateOTPSecret).mockImplementationOnce(() => Promise.resolve({
        isValid: true
      }))

      // start validation step
      await model.fsm.validateOTP()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('OTPIsValid')

      // check we made a call to dfspBackendRequests.validateOTPSecret
      expect(modelConfig.dfspBackendRequests.validateOTPSecret).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab', '123456'
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
        await model.fsm.validateOTP()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('Invalid OTP')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      // todo: better and more descriptive error handling
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        {"errorInformation": {"errorCode": "2001", "errorDescription": "Internal server error"}},
        "pispa"
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
        await model.fsm.validateOTP()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked validateOTPSecret exception')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        {"errorInformation": {"errorCode": "2001", "errorDescription": "Internal server error"}},
        "pispa"
      )
    })
  })

  describe('Get scopes from Backend Phase', () => {
    let validateData: DFSPOTPValidateData

    beforeEach(async () => {
      validateData = {
        consentRequestsRequestId: '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        authToken: '123456',
        toParticipantId: 'pispa',
        currentState: 'OTPIsValid'
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPOTPModelLayout(model, validateData)
    })

    it('requestScopes() should transition from valid OTp to scopes received when successful', async () => {
      const model = await create(validateData, modelConfig)
      mocked(modelConfig.dfspBackendRequests.getScopes).mockImplementationOnce(() => Promise.resolve({
        "scopes": [{
          accountId: "some-id",
          actions: [
            "accounts.getBalance",
            "accounts.transfer"
          ]
        }]
      }))

      // start request scopes step
      await model.fsm.requestScopes()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('scopesReceived')

      // check that scopes were stored in the state machine
      expect(model.data.scopes).toEqual({
        "scopes": [{
          accountId: "some-id",
          actions: [
            "accounts.getBalance",
            "accounts.transfer"
          ]
        }]
      })

      // check we made a call to dfspBackendRequests.getScopes
      expect(modelConfig.dfspBackendRequests.getScopes).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab'
      )
    })

    it('should handle no scopes being returned and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(modelConfig.dfspBackendRequests.getScopes).mockImplementationOnce(() => Promise.resolve({
        "scopes": []
      }))

      const model = await create(validateData, modelConfig)
      try {
        // start request scopes step
        await model.fsm.requestScopes()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('InvalidAuthToken')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      // todo: better and more descriptive error handling
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        {"errorInformation": {"errorCode": "2001", "errorDescription": "Internal server error"}},
        "pispa"
      )
    })

    it('should handle exceptions and send PUT /consentsRequest/{ID}/error response', async () => {
      mocked(
        modelConfig.dfspBackendRequests.getScopes
      ).mockImplementationOnce(
        () => {
          throw new Error('mocked getScopes exception')
        }
      )

      const model = await create(validateData, modelConfig)

      try {
        // start request scopes step
        await model.fsm.requestScopes()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked getScopes exception')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        {"errorInformation": {"errorCode": "2001", "errorDescription": "Internal server error"}},
        "pispa"
      )
    })
  })

  describe('Send Consent to PISP Phase', () => {
    let validateData: DFSPOTPValidateData

    beforeEach(async () => {
      validateData = {
        consentRequestsRequestId: '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        authToken: '123456',
        toParticipantId: 'pispa',
        currentState: 'scopesReceived',
        scopes: { scopes: [{
          accountId: "some-id",
          actions: [
            "accounts.getBalance",
            "accounts.transfer"
          ]
        }]}
      }
    })

    it('should be well constructed', async () => {
      const model = await create(validateData, modelConfig)
      checkDFSPOTPModelLayout(model, validateData)
    })

    it('registerConsent() should transition from scopes received to sent consent when successful', async () => {
      const model = await create(validateData, modelConfig)

      // start send consent step
      await model.fsm.registerConsent()

      // check that the fsm was able to transition properly
      expect(model.data.currentState).toEqual('consentSent')

      // check we made a call to thirdpartyRequests.postConsents
      expect(modelConfig.thirdpartyRequests.postConsents).toBeCalledWith(
        {
          consentId: '00000000-0000-1000-8000-000000000001',
          consentRequestId: '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
          scopes: [{
            accountId: "some-id",
            actions: [
              "accounts.getBalance",
              "accounts.transfer"
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
        await model.fsm.registerConsent()
        shouldNotBeExecuted()
      } catch (err) {
        expect(err.message).toEqual('mocked postConsents exception')
      }

      // check a PUT /consentsRequest/{ID}/error response was sent to source participant
      // todo: better and more descriptive error handling
      expect(modelConfig.thirdpartyRequests.putConsentRequestsError).toBeCalledWith(
        '0c9d9e95-b7ee-4813-87a7-a6a1ab7fc0ab',
        {"errorInformation": {"errorCode": "2001", "errorDescription": "Internal server error"}},
        "pispa"
      )
    })

  })
})
