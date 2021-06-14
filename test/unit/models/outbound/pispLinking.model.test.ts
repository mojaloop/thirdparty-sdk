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
  PISPLinkingPhase,
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
  let publisher: PubSub

  const expectedResp = {
    channelResponse: { ...mockData.consentRequestsPut.payload },
    currentState: 'WebAuthenticationChannelResponseRecieved'
  }

  const expectedErrorResp = {
    ...mockData.consentRequestsPutError.payload,
    currentState: 'errored'
  }

  beforeEach(async () => {
    publisher = new PubSub(connectionConfig)
    await publisher.connect()

    modelConfig = {
      kvs: new KVS(connectionConfig),
      key: 'cache-key',
      logger: connectionConfig.logger,
      subscriber: new PubSub(connectionConfig),
      requestProcessingTimeoutSeconds: 3,
      thirdpartyRequests: {
        postConsentRequests: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        patchConsentRequests: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        putConsents: jest.fn(() => Promise.resolve({ statusCode: 202 }))
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

  function checkPISPLinkingModelLayout (am: PISPLinkingModel, optData?: PISPLinkingData) {
    expect(am).toBeTruthy()
    expect(am.data).toBeDefined()
    expect(am.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(am.subscriber).toEqual(modelConfig.subscriber)
    expect(am.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof am.fsm.init).toEqual('function')
    expect(typeof am.fsm.onRequestConsent).toEqual('function')

    // check fsm notification handler
    expect(typeof am.onRequestConsent).toEqual('function')

    expect(sortedArray(am.fsm.allStates())).toEqual([
      'OTPAuthenticationChannelResponseRecieved',
      'WebAuthenticationChannelResponseRecieved',
      'accountsLinked',
      'channelResponseReceived',
      'consentReceivedAwaitingCredential',
      'errored',
      'none',
      'start'
    ])
    expect(sortedArray(am.fsm.allTransitions())).toEqual([
      'authenticate',
      'changeToOTPAuthentication',
      'changeToWebAuthentication',
      'error',
      'init',
      'registerCredential',
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
      expect(PISPLinkingModel.notificationChannel(
        PISPLinkingPhase.requestConsent,
        id)).toEqual('PISPLinking_requestConsent_123')
    })

    it('input validation', () => {
      expect(
        () => PISPLinkingModel.notificationChannel(
          PISPLinkingPhase.requestConsent,
          null as unknown as string
        )
      ).toThrow()
    })
  })

  describe('validateRequest flow', () => {
    let subId = 0
    let requestConsentChannel: string
    let requestConsentAuthenticateChannel: string
    let handler: NotificationCallback
    let data: PISPLinkingData
    type PutResponse =
      tpAPI.Schemas.ConsentRequestsIDPutResponseWeb |
      tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
    type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
    let putResponse: PutResponseOrError

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
        toParticipantId: 'dfspA',
        consentRequestId: mockData.linkingRequestConsentPostRequest.payload.consentRequestId,
        linkingRequestConsentPostRequest: mockData.linkingRequestConsentPostRequest.payload,
        currentState: 'start'
      }

      requestConsentChannel = PISPLinkingModel.notificationChannel(
        PISPLinkingPhase.requestConsent,
        data.consentRequestId
      )

      requestConsentAuthenticateChannel = PISPLinkingModel.notificationChannel(
        PISPLinkingPhase.requestConsentAuthenticate,
        data.consentRequestId
      )

      putResponse = mockData.consentRequestsPut.payload
    })

    it('should be well constructed', async () => {
      const model = await create(data, modelConfig)
      checkPISPLinkingModelLayout(model, data)
    })

    it('should give response properly populated from notification channel - success', async () => {
      const model = await create(data, modelConfig)
      setImmediate(() => publisher.publish(
        requestConsentChannel,
        putResponse as unknown as Message
      ))

      const result = await model.run()
      // Assertions
      expect(result).toEqual(expectedResp)
      expect(mocked(modelConfig.thirdpartyRequests.postConsentRequests)).toHaveBeenCalledWith(
        model.linkingRequestConsentPostRequestToConsentRequestsPostRequest(),
        model.data.toParticipantId
      )
      expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(requestConsentChannel, subId)
      expect(mocked(publisher.publish)).toBeCalledWith(requestConsentChannel, putResponse)
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
      setImmediate(() => publisher.publish(
        requestConsentChannel,
        putResponse as unknown as Message
      ))

      const result = await model.run()
      // Assertions
      expect(result).toEqual(expectedErrorResp)
      expect(mocked(modelConfig.thirdpartyRequests.postConsentRequests)).toHaveBeenCalledWith(
        model.linkingRequestConsentPostRequestToConsentRequestsPostRequest(),
        model.data.toParticipantId
      )
      expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
      expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(requestConsentChannel, subId)
      expect(mocked(publisher.publish)).toBeCalledWith(requestConsentChannel, putResponse)
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
        expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(requestConsentChannel, subId)
      }
    })

    describe('run requestConsent workflow', () => {
      it('start', async () => {
        const model = await create(data, modelConfig)

        setImmediate(() => publisher.publish(
          requestConsentChannel,
          putResponse as unknown as Message
        ))

        const result = await model.run()

        expect(result).toEqual(expectedResp)
        expect(mocked(modelConfig.thirdpartyRequests.postConsentRequests)).toHaveBeenCalledWith(
          model.linkingRequestConsentPostRequestToConsentRequestsPostRequest(),
          model.data.toParticipantId
        )
        expect(mocked(modelConfig.subscriber.subscribe)).toBeCalledTimes(1)
        expect(mocked(modelConfig.subscriber.unsubscribe)).toBeCalledWith(requestConsentChannel, subId)
        expect(mocked(publisher.publish)).toBeCalledWith(requestConsentChannel, putResponse)
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

    describe('run requestConsentAuthenticate workflow', () => {
      const consentRequestId = 'bbce3ce8-c247-4153-aab1-f89768c93b18'
      const validateData: PISPLinkingData = {
        toParticipantId: 'dfspA',
        consentRequestId: mockData.linkingRequestConsentPostRequest.payload.consentRequestId,
        linkingRequestConsentPostRequest: mockData.linkingRequestConsentPostRequest.payload,
        linkingRequestConsentIDAuthenticatePatchRequest: mockData.linkingRequestConsentIDAuthenticatePatchRequest.payload,
        currentState: 'WebAuthenticationChannelResponseRecieved'
      }
      const consentPostResponse: tpAPI.Schemas.ConsentsPostRequestPISP = {
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        consentRequestId: consentRequestId,
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }
        ]
      }

      const genericErrorResponse: fspiopAPI.Schemas.ErrorInformationObject = {
        errorInformation: {
          errorCode: '6000',
          errorDescription: 'Generic thirdparty error'
        }
      }

      it('should be well constructed', async () => {
        const model = await create(validateData, modelConfig)
        checkPISPLinkingModelLayout(model, validateData)
      })

      it('authenticate() should transition start to consentReceivedAwaitingCredential state when successful', async () => {
        const model = await create(validateData, modelConfig)
        // defer publication to notification channel
        setImmediate(() => publisher.publish(
          requestConsentAuthenticateChannel,
          consentPostResponse as unknown as Message
        ))
        const result = await model.run()

        // check that the fsm was able to transition properly
        expect(model.data.currentState).toEqual('consentReceivedAwaitingCredential')

        // check we made a call to thirdpartyRequests.patchConsentRequests
        expect(modelConfig.thirdpartyRequests.patchConsentRequests).toBeCalledWith(
          consentRequestId,
          { authToken: '123456' },
          'dfspA'
        )
        const expectedConsent: tpAPI.Schemas.ConsentsPostRequestPISP = {
          consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
          consentRequestId,
          scopes: [{
            accountId: 'some-id',
            actions: [
              'accounts.getBalance',
              'accounts.transfer'
            ]
          }
          ]
        }
        expect(result).toEqual({
          challenge: PISPLinkingModel.deriveChallenge(expectedConsent),
          consent: expectedConsent,
          currentState: 'consentReceivedAwaitingCredential'
        })
      })

      it('should handle a PUT /consentsRequest/{ID}/error response', async () => {
        setImmediate(() => publisher.publish(
          requestConsentAuthenticateChannel,
          genericErrorResponse as unknown as Message
        ))

        const model = await create(validateData, modelConfig)
        const result = await model.run()

        expect(result).toEqual({
          currentState: 'errored',
          errorInformation: {
            errorCode: '6000',
            errorDescription: 'Generic thirdparty error'
          }
        })
      })
    })

    describe('run registerCredential workflow', () => {
      const consentRequestId = 'bbce3ce8-c247-4153-aab1-f89768c93b18'
      const consentPostResponse: tpAPI.Schemas.ConsentsPostRequestPISP = {
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        consentRequestId: consentRequestId,
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }]
      }
      const consentPatchResponse: tpAPI.Schemas.ConsentsIDPatchResponseVerified = {
        credential: {
          status: 'VERIFIED'
        }
      }

      const registerCredentialData: PISPLinkingData = {
        toParticipantId: 'dfspA',
        consentRequestId: mockData.linkingRequestConsentPostRequest.payload.consentRequestId,
        linkingRequestConsentPostRequest: mockData.linkingRequestConsentPostRequest.payload,
        linkingRequestConsentIDAuthenticatePatchRequest: mockData.linkingRequestConsentIDAuthenticatePatchRequest.payload,
        linkingRequestConsentIDPassCredentialPostRequest: mockData.linkingRequestConsentIDPassCredentialPostRequest.payload,
        linkingRequestConsentIDAuthenticateInboundConsentResponse: consentPostResponse,
        scopes: consentPostResponse.scopes,
        currentState: 'consentReceivedAwaitingCredential'
      }

      const registerCredentialChannel = PISPLinkingModel.notificationChannel(
        PISPLinkingPhase.registerCredential,
        registerCredentialData.linkingRequestConsentIDAuthenticateInboundConsentResponse!.consentId
      )

      const genericErrorResponse: fspiopAPI.Schemas.ErrorInformationObject = {
        errorInformation: {
          errorCode: '6000',
          errorDescription: 'Generic thirdparty error'
        }
      }

      it('should be well constructed', async () => {
        const model = await create(registerCredentialData, modelConfig)
        checkPISPLinkingModelLayout(model, registerCredentialData)
      })

      it('registerCredential() should transition consentReceivedAwaitingCredential to accountsLinked state when successful', async () => {
        const model = await create(registerCredentialData, modelConfig)

        // defer publication to notification channel
        setImmediate(() => publisher.publish(
          registerCredentialChannel,
          consentPatchResponse as unknown as Message
        ))
        const result = await model.run()

        // check that the fsm was able to transition properly
        expect(model.data.currentState).toEqual('accountsLinked')

        // check we made a call to thirdpartyRequests.putConsents
        expect(modelConfig.thirdpartyRequests.putConsents).toBeCalledWith(
          registerCredentialData.linkingRequestConsentIDAuthenticateInboundConsentResponse!.consentId,
          {
            credential: {
              credentialType: 'FIDO',
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
              },
              status: 'PENDING',
            },
            scopes: [{
              accountId: 'some-id',
              actions: [
                'accounts.getBalance',
                'accounts.transfer'
              ]
            }]
          },
          'dfspA'
        )

        expect(result).toEqual({
          credential: {
            status: 'VERIFIED'
          },
          currentState: 'accountsLinked'
        })
      })

      it('should handle a PUT /consents/{ID}/error response', async () => {
        setImmediate(() => publisher.publish(
          registerCredentialChannel,
          genericErrorResponse as unknown as Message
        ))

        const model = await create(registerCredentialData, modelConfig)
        const result = await model.run()

        expect(result).toEqual({
          currentState: 'errored',
          errorInformation: {
            errorCode: '6000',
            errorDescription: 'Generic thirdparty error'
          }
        })
      })
    })
  })
})
