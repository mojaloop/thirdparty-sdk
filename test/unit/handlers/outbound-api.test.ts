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

 * Lewis Daly <lewis@vesselstech.com>
 * Paweł Marzec <pawel.marzec@modusbox.com>
 * Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/

import { PISPDiscoveryModel } from '~/models/outbound/pispDiscovery.model'
import { PISPLinkingModel } from '~/models/outbound/pispLinking.model'
import { PISPPrelinkingModel } from '~/models/outbound/pispPrelinking.model'
import { v1_1 as fspiopAPI, thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { HealthResponse } from '~/interface/types'
import { NotificationCallback, Message, PubSub } from '~/shared/pub-sub'
import { RequestPartiesInformationState, PISPTransactionPhase } from '~/models/pispTransaction.interface'
import PTM, { PISPTransactionModel } from '~/models/pispTransaction.model'
import { PISPDiscoveryModelState } from '~/models/outbound/pispDiscovery.interface'

import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Server } from '@hapi/hapi'
import { ServerAPI, ServerConfig } from '~/server'
import Config from '~/shared/config'
import Handlers from '~/handlers'
import * as mockData from 'test/unit/data/mockData'
import index from '~/index'
import path from 'path'
import SDK from '@mojaloop/sdk-standard-components'
import { PISPLinkingPhase } from '~/models/outbound/pispLinking.interface'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'

const putResponse: fspiopAPI.Schemas.AuthorizationsIDPutResponse = {
  authenticationInfo: {
    authentication: 'U2F',
    authenticationValue: {
      pinValue: 'the-mocked-pin-value',
      counter: '1'
    } as fspiopAPI.Schemas.AuthenticationValue
  },
  responseType: 'ENTERED'
}

const partyLookupResponse: SDKOutboundAPI.Schemas.partiesByIdResponse = {
  party: {
    body: {
      partyIdInfo: {
        partyIdType: 'MSISDN',
        partyIdentifier: '+4412345678',
        fspId: 'pispA'
      },
      merchantClassificationCode: '4321',
      name: 'Justin Trudeau',
      personalInfo: {
        complexName: {
          firstName: 'Justin',
          middleName: 'Pierre',
          lastName: 'Trudeau'
        },
        dateOfBirth: '1980-01-01'
      }
    },
    headers: {}
  },
  currentState: RequestPartiesInformationState.COMPLETED
}

const approveResponse: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse = {
  transactionRequestState: 'ACCEPTED',
  transactionState: 'COMPLETED'
}

jest.mock('redis')
jest.mock('@mojaloop/sdk-standard-components', () => {
  const sdkStandardComponentsActual = jest.requireActual('@mojaloop/sdk-standard-components')

  return {
    ...sdkStandardComponentsActual,
    MojaloopRequests: jest.fn(() => ({
      getParties: jest.fn(() => Promise.resolve(partyLookupResponse))
    })),
    ThirdpartyRequests: jest.fn(() => ({
      postAuthorizations: jest.fn(() => Promise.resolve(putResponse)),
      getAccounts: jest.fn(() => Promise.resolve(mockData.accountsRequest.payload)),
      patchConsentRequests: jest.fn(() => Promise.resolve(mockData.inboundConsentsPostRequest)),
      postConsentRequests: jest.fn(() => Promise.resolve(mockData.consentRequestsPut.payload)),
      getServices: jest.fn(() => Promise.resolve(mockData.putServicesByServiceTypeRequest.payload)),
      putConsents: jest.fn(() => Promise.resolve(mockData.inboundConsentsVerifiedPatchRequest.payload)),
      putThirdpartyRequestsAuthorizations: jest.fn(() => Promise.resolve(approveResponse)),
      postThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve())
    })),
    WSO2Auth: jest.fn(),
    Logger: {
      Logger: jest.fn(() => {
        const methods = {
          // log methods
          log: jest.fn(),
          configure: jest.fn(),
          // generated methods from default levels
          verbose: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          trace: jest.fn(),
          info: jest.fn(),
          fatal: jest.fn()
        }
        return {
          ...methods,
          push: jest.fn(() => methods)
        }
      })
    },
    request: jest.fn()
  }
})

jest.mock('~/shared/pub-sub', () => {
  const handlers: { [key: string]: NotificationCallback } = {}

  let subId = 0
  return {
    PubSub: jest.fn(() => ({
      isConnected: true,
      subscribe: jest.fn((channel: string, cb: NotificationCallback) => {
        handlers[channel] = cb
        return ++subId
      }),
      unsubscribe: jest.fn(),
      publish: jest.fn(async (channel: string, message: Message) => {
        const h = handlers[channel]
        if (!h) {
          throw new Error(`PubSub.publish: no handler for channel: ${channel}`)
        }
        h(channel, message, subId)
      }),
      connect: jest.fn(() => Promise.resolve()),
      disconnect: jest.fn()
    }))
  }
})

describe('Outbound API routes', (): void => {
  let server: Server

  beforeAll(async (): Promise<void> => {
    const apiPath = path.resolve(__dirname, '../../../src/interface/api-outbound.yaml')
    const serverConfig: ServerConfig = {
      port: Config.outbound.port,
      host: Config.outbound.host,
      api: ServerAPI.outbound,
      tls: Config.outbound.tls,
      serviceConfig: Config
    }
    const serverHandlers = {
      ...Handlers.Shared,
      ...Handlers.Outbound
    }
    server = await index.server.setupAndStart(serverConfig, apiPath, serverHandlers)
  })

  afterAll(async (done): Promise<void> => {
    // StatePlugin is waiting on stop event so give it a chance to close the redis connections
    server.events.on('stop', () => setTimeout(done, 100))
    await server.stop()
  })

  it('/health', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/health'
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toBeDefined()

    const result = response.result as HealthResponse
    expect(result.status).toEqual('OK')
    expect(result.uptime).toBeGreaterThan(1.0)
    expect(result.KVSConnected).toBeTruthy()
    expect(result.PublisherConnected).toBeTruthy()
    expect(result.SubscriberConnected).toBeTruthy()
    expect(result.LoggerPresent).toBeTruthy()
    expect(result.MojaloopRequestsPresent).toBeTruthy()
    expect(result.ThirdpartyRequestsPresent).toBeTruthy()
  })

  it('/metrics', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/metrics'
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
  })

  it('/thirdpartyTransaction/partyLookup', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/partyLookup',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        payee: {
          partyIdType: 'MSISDN',
          partyIdentifier: '+4412345678'
        },
        transactionRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
      }
    }
    jest.spyOn(SDK, 'request').mockImplementationOnce(() =>
      Promise.resolve({
        statusCode: 200,
        data: {
          party: { ...partyLookupResponse.party },
          currentState: 'COMPLETED'
        }
      })
    )
    const response = await server.inject(request)

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      party: { ...partyLookupResponse.party.body },
      currentState: 'partyLookupSuccess'
    })
  })

  it('/thirdpartyTransaction/partyLookup guarded', async (): Promise<void> => {
    jest.spyOn(PTM, 'existsInKVS').mockImplementationOnce(() => Promise.resolve(true))
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/partyLookup',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        payee: {
          partyIdType: 'MSISDN',
          partyIdentifier: '+4412345678'
        },
        transactionRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
      }
    }
    const response = await server.inject(request)
    expect(response.statusCode).toBe(422)
  })

  it('/thirdpartyTransaction/{ID}/initiate', async (): Promise<void> => {
    const transactionRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
    const request = {
      method: 'POST',
      url: `/thirdpartyTransaction/${transactionRequestId}/initiate`,
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+44 1234 5678',
            fspId: 'dfspb'
          }
        },
        payer: {
          partyIdType: 'THIRD_PARTY_LINK',
          partyIdentifier: 'querty-123456',
          fspId: 'dfspa'
        },
        amountType: 'SEND',
        amount: {
          amount: '100',
          currency: 'USD'
        },
        transactionType: {
          scenario: 'TRANSFER',
          initiator: 'PAYER',
          initiatorType: 'CONSUMER'
        },
        expiration: '2020-07-15T22:17:28.985-01:00'
      }
    }

    const thirdpartyAuthorizationRequest: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsPostRequest = {
      authorizationRequestId: '5f8ee7f9-290f-4e03-ae1c-1e81ecf398df',
      transactionRequestId: '2cf08eed-3540-489e-85fa-b2477838a8c5',
      challenge: '<base64 encoded binary - the encoded challenge>',
      transferAmount: {
        amount: '100',
        currency: 'USD'
      },
      payeeReceiveAmount: {
        amount: '99',
        currency: 'USD'
      },
      fees: {
        amount: '1',
        currency: 'USD'
      },
      payee: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '+4412345678',
          fspId: 'dfspb'
        }
      },
      payer: {
        partyIdType: 'THIRD_PARTY_LINK',
        partyIdentifier: 'qwerty-123456',
        fspId: 'dfspa'
      },
      transactionType: {
        scenario: 'TRANSFER',
        initiator: 'PAYER',
        initiatorType: 'CONSUMER'
      },
      expiration: '2020-06-15T12:00:00.000Z'
    }

    const transactionStatus: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse = {
      transactionRequestState: 'RECEIVED'
    }
    const channelTransPut = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.waitOnTransactionPut,
      transactionRequestId
    )
    const channelAuthPost = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.waitOnAuthorizationPost,
      transactionRequestId
    )
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => {
      // publish authorization request
      pubSub.publish(channelAuthPost, thirdpartyAuthorizationRequest as unknown as Message)

      // publish transaction status update
      pubSub.publish(channelTransPut, transactionStatus as unknown as Message)
    }, 100)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      authorization: expect.anything(),
      currentState: 'authorizationReceived'
    })
  })

  it('/thirdpartyTransaction/{ID}/approve', async (): Promise<void> => {
    const transactionRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
    const request = {
      method: 'POST',
      url: `/thirdpartyTransaction/${transactionRequestId}/approve`,
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        authorizationResponse: {
          responseType: 'ACCEPTED',
          signedPayload: {
            signedPayloadType: 'FIDO',
            fidoSignedPayload: {
              id: '45c-TkfkjQovQeAWmOy-RLBHEJ_e4jYzQYgD8VdbkePgM5d98BaAadadNYrknxgH0jQEON8zBydLgh1EqoC9DA',
              rawId: '45c+TkfkjQovQeAWmOy+RLBHEJ/e4jYzQYgD8VdbkePgM5d98BaAadadNYrknxgH0jQEON8zBydLgh1EqoC9DA==',
              response: {
                authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4/krrmihjLHmVzzuoMdl2MBAAAACA==',
                clientDataJSON:
                  'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiQUFBQUFBQUFBQUFBQUFBQUFBRUNBdyIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDIxODEiLCJjcm9zc09yaWdpbiI6ZmFsc2UsIm90aGVyX2tleXNfY2FuX2JlX2FkZGVkX2hlcmUiOiJkbyBub3QgY29tcGFyZSBjbGllbnREYXRhSlNPTiBhZ2FpbnN0IGEgdGVtcGxhdGUuIFNlZSBodHRwczovL2dvby5nbC95YWJQZXgifQ==',
                signature:
                  'MEUCIDcJRBu5aOLJVc/sPyECmYi23w8xF35n3RNhyUNVwQ2nAiEA+Lnd8dBn06OKkEgAq00BVbmH87ybQHfXlf1Y4RJqwQ8='
              },
              type: 'public-key'
            }
          }
        }
      } as OutboundAPI.Schemas.ThirdpartyTransactionIDApproveRequest
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    const channelApprove = PISPTransactionModel.notificationChannel(PISPTransactionPhase.approval, transactionRequestId)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(channelApprove, approveResponse as unknown as Message), 10)
    const response = await server.inject(request)
    expect(response.result).toEqual({
      transactionStatus: { ...approveResponse },
      currentState: 'transactionStatusReceived'
    })
    expect(response.statusCode).toBe(200)
  })

  it('/linking/providers - success', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/linking/providers'
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)

    setTimeout(
      () =>
        pubSub.publish(
          PISPPrelinkingModel.notificationChannel('THIRD_PARTY_DFSP'),
          mockData.putServicesByServiceTypeRequest.payload as unknown as Message
        ),
      10
    )
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    const expectedResp = {
      providers: ['dfspA', 'dfspB'],
      currentState: 'providersLookupSuccess'
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/providers - error', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/linking/providers'
    }

    const errorResponse = {
      errorInformation: {
        errorCode: '7000',
        errorDescription: 'Generic thirdparty error'
      }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)

    setTimeout(
      () =>
        pubSub.publish(
          PISPPrelinkingModel.notificationChannel('THIRD_PARTY_DFSP'),
          errorResponse as unknown as Message
        ),
      10
    )
    const response = await server.inject(request)
    expect(response.statusCode).toBe(500)
    const expectedResp = {
      currentState: 'errored',
      errorInformation: errorResponse.errorInformation
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/accounts/{fspId}/{userId} - success', async (): Promise<void> => {
    const userId = 'username1234'
    const request = {
      method: 'GET',
      url: `/linking/accounts/dfspa/${userId}`
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(
      () =>
        pubSub.publish(
          PISPDiscoveryModel.notificationChannel(userId),
          mockData.accountsRequest.payload as unknown as Message
        ),
      10
    )
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
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
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/accounts/{fspId}/{userId} - fail', async (): Promise<void> => {
    const userId = 'test'
    const request = {
      method: 'GET',
      url: `/linking/accounts/dfspa/${userId}`
    }
    const errorResp = {
      errorInformation: {
        errorCode: '3200',
        errorDescription: 'Generic ID not found'
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(
      () => pubSub.publish(PISPDiscoveryModel.notificationChannel(userId), errorResp as unknown as Message),
      10
    )
    const response = await server.inject(request)
    expect(response.statusCode).toBe(500)
    const expectedResp = {
      accounts: [],
      currentState: PISPDiscoveryModelState.succeeded,
      errorInformation: errorResp.errorInformation
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/request-consent - success', async (): Promise<void> => {
    // const consentRequestId = '6988c34f-055b-4ed5-b223-b10c8a2e2329'
    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      url: '/linking/request-consent',
      payload: { ...mockData.linkingRequestConsentPostRequest.payload }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(
      () =>
        pubSub.publish(
          PISPLinkingModel.notificationChannel(
            PISPLinkingPhase.requestConsent,
            mockData.linkingRequestConsentPostRequest.payload.consentRequestId
          ),
          mockData.consentRequestsPut.payload as unknown as Message
        ),
      10
    )

    const response = await server.inject(request)

    expect(response.statusCode).toBe(200)
    const expectedResp = {
      channelResponse: { ...mockData.consentRequestsPut.payload },
      currentState: 'WebAuthenticationChannelResponseReceived'
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/request-consent/{ID}/authenticate - success', async (): Promise<void> => {
    const consentRequestId = 'bbce3ce8-c247-4153-aab1-f89768c93b18'
    const request = {
      method: 'PATCH',
      url: `/linking/request-consent/${consentRequestId}/authenticate`,
      payload: {
        authToken: '123456'
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    // the dfsp should respond to a PISP with a POST /consents request
    // where the inbound handler will publish the message
    setTimeout(
      () =>
        pubSub.publish(
          PISPLinkingModel.notificationChannel(PISPLinkingPhase.requestConsentAuthenticate, consentRequestId),
          mockData.inboundConsentsPostRequest.payload as unknown as Message
        ),
      10
    )
    const response = await server.inject(request)
    const expectedConsent: tpAPI.Schemas.ConsentsPostRequestPISP = {
      consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
      consentRequestId,
      status: 'ISSUED',
      scopes: [
        {
          address: 'some-id',
          actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
        }
      ]
    }
    expect(response.statusCode).toBe(200)
    const expectedResp = {
      consent: expectedConsent,
      challenge: PISPLinkingModel.deriveChallenge(expectedConsent),
      currentState: 'consentReceivedAwaitingCredential'
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/request-consent/{ID}/pass-credential - success', async (): Promise<void> => {
    const consentRequestId = 'bbce3ce8-c247-4153-aab1-f89768c93b18'
    const request = {
      method: 'POST',
      url: `/linking/request-consent/${consentRequestId}/pass-credential`,
      payload: {
        credential: {
          payload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON:
                'clientDataJSON-must-not-have-fewer-than-121-' +
                'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
                'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
                'aliqua.',
              attestationObject:
                'attestationObject-must-not-have-fewer-than-' +
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
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    // the dfsp should respond to a PISP with a POST /consents request
    // where the inbound handler will publish the message
    setTimeout(
      () =>
        pubSub.publish(
          PISPLinkingModel.notificationChannel(
            PISPLinkingPhase.registerCredential,
            '8e34f91d-d078-4077-8263-2c047876fcf6'
          ),
          mockData.inboundConsentsVerifiedPatchRequest.payload as unknown as Message
        ),
      10
    )
    const response = await server.inject(request)
    const expectedConsent: tpAPI.Schemas.ConsentsIDPatchResponseVerified = {
      credential: {
        status: 'VERIFIED'
      }
    }
    expect(response.statusCode).toBe(200)
    const expectedResp = {
      credential: {
        status: expectedConsent.credential.status
      },
      currentState: 'accountsLinked'
    }
    expect(response.result).toEqual(expectedResp)
  })

  // since the PISPLinkingModel is run in a series of requests, we can't
  // run error tests for now since the tests require the calls to be run in
  // sequence and an error populates the saved model's errorInformation data
  // which breaks tests later in the sequence.

  // the solution is to have multiple sequence requests that break at each
  // level of the state machine, but that is really cumbersome to test
  // A->Error A->B->Error A->B->C->Error.

  // each sequence of requests would also need there own requests/model keys
  // to not overlap each other.

  // todo: investigate solution.

  /*
  it('/linking/request-consent - error', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/linking/request-consent',
      payload: { ...mockData.linkingRequestConsentPostRequest.payload }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    // if the validation fails the dfsp will respond with a
    // PUT /consentRequests/{ID}/error where the inbound handler will publish the error
    setTimeout(() => pubSub.publish(
      PISPLinkingModel.notificationChannel(
        PISPLinkingPhase.requestConsent,
        mockData.linkingRequestConsentPostRequest.payload.consentRequestId
      ),
      mockData.consentRequestsPutError.payload as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(500)
    const expectedResp = {
      ...mockData.consentRequestsPutError.payload,
      currentState: 'errored'
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/linking/request-consent/{ID}/authenticate - error', async (): Promise<void> => {
    const consentRequestId = 'bbce3ce8-c247-4153-aab1-f89768c93b18'
    const request = {
      method: 'PATCH',
      url: `/linking/request-consent/${consentRequestId}/authenticate`,
      payload: {
        toParticipantId: 'dfpsa',
        authToken: '123456'
      }
    }

    const errorResponse = {
      errorInformation: {
        errorCode: '6000',
        errorDescription: 'Generic thirdparty error'
      }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    // if the validation fails the dfsp will respond with a
    // PUT /consentRequests/{ID}/error where the inbound handler will publish
    // the error
    setTimeout(() => pubSub.publish(
      PISPLinkingModel.notificationChannel(
        PISPLinkingPhase.requestConsent,
        consentRequestId
      ),
      errorResponse as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(500)
    const expectedResp = {
      currentState: 'errored',
      errorInformation: errorResponse.errorInformation
    }
    expect(response.result).toEqual(expectedResp)
  })
  */
})
