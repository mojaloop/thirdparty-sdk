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

import { OutboundAuthorizationsModelState } from '~/models/authorizations.interface'
import { OutboundAuthorizationsModel } from '~/models/outbound/authorizations.model'
import { OutboundThirdpartyAuthorizationsModel } from '~/models/outbound/thirdparty.authorizations.model'
import { OutboundAccountsModel } from '~/models/outbound/accounts.model'
import { PISPOTPValidateModel } from '~/models/outbound/pispOTPValidate.model'
import { PISPConsentRequestsModel } from '~/models/outbound/pispConsentRequests.model'
import { PISPPrelinkingModel } from '~/models/outbound/pispPrelinking.model';
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { OutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { HealthResponse } from '~/interface/types'
import { NotificationCallback, Message, PubSub } from '~/shared/pub-sub'
import {
  OutboundThirdpartyAuthorizationsModelState
} from '~/models/thirdparty.authorizations.interface'
import {
  RequestPartiesInformationState
  , PISPTransactionPhase
} from '~/models/pispTransaction.interface'
import PTM, { PISPTransactionModel } from '~/models/pispTransaction.model'
import { OutboundAccountsModelState } from '~/models/accounts.interface'

import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Server } from '@hapi/hapi'
import { ServerAPI, ServerConfig } from '~/server'
import Config from '~/shared/config'
import Handlers from '~/handlers'
import TestData from 'test/unit/data/mockData.json'
import index from '~/index'
import path from 'path'
import SDK from '@mojaloop/sdk-standard-components'

const mockData = JSON.parse(JSON.stringify(TestData))
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
const putThirdpartyAuthResponse: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDAuthorizationsPutResponse = {
  challenge: 'challenge',
  consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
  sourceAccountId: 'dfspa.alice.1234',
  status: 'VERIFIED',
  value: 'value'
}
const partyLookupResponse: OutboundAPI.Schemas.partiesByIdResponse = {
  party: {
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
  currentState: RequestPartiesInformationState.COMPLETED
}
const initiateResponse: tpAPI.Schemas.AuthorizationsPostRequest = {
  authenticationType: 'U2F',
  retriesLeft: '1',
  amount: {
    currency: 'USD',
    amount: '124.45'
  },
  transactionId: '2f169631-ef99-4cb1-96dc-91e8fc08f539',
  transactionRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
  quote: {
    transferAmount: {
      currency: 'USD',
      amount: '124.45'
    },
    expiration: '2020-08-24T08:38:08.699-04:00',
    ilpPacket: 'AYIBgQAAAAAAAASwNGxldmVsb25lLmRmc3AxLm1lci45T2RTOF81MDdqUUZ',
    condition: 'f5sqb7tBTWPd5Y8BDFdMm9BJR_MNI4isf8p8n4D5pHA'
  }
}
const approveResponse: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse = {
  transactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
  transactionRequestState: 'ACCEPTED',
  transactionState: 'COMPLETED'
}

jest.mock('redis')
jest.mock('@mojaloop/sdk-standard-components', () => {
  return {
    MojaloopRequests: jest.fn(() => ({
      getParties: jest.fn(() => Promise.resolve(partyLookupResponse)),
      putAuthorizations: jest.fn(() => Promise.resolve(approveResponse))
    })),
    ThirdpartyRequests: jest.fn(() => ({
      postAuthorizations: jest.fn(() => Promise.resolve(putResponse)),
      postThirdpartyRequestsTransactionsAuthorizations: jest.fn(() => Promise.resolve(putThirdpartyAuthResponse)),
      postThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve(initiateResponse)),
      getAccounts: jest.fn(() => Promise.resolve(mockData.accountsRequest.payload)),
      patchConsentRequests: jest.fn(() => Promise.resolve(mockData.inboundConsentsPostRequest)),
      postConsentRequests: jest.fn(() => Promise.resolve(mockData.consentRequestsPut.payload)),
      getServices: jest.fn(() => Promise.resolve(mockData.putServicesByServiceTypeRequest.payload))
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
      subscribe: jest.fn(
        (channel: string, cb: NotificationCallback) => {
          handlers[channel] = cb
          return ++subId
        }
      ),
      unsubscribe: jest.fn(),
      publish: jest.fn(
        async (channel: string, message: Message) => {
          const h = handlers[channel]
          if (!h) {
            throw new Error(`PubSub.publish: no handler for channel: ${channel}`)
          }
          h(channel, message, subId)
        }
      ),
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
      port: Config.OUTBOUND.PORT,
      host: Config.OUTBOUND.HOST,
      api: ServerAPI.outbound
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
    expect(result.PubSubConnected).toBeTruthy()
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

  it('/authorizations', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/authorizations',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        toParticipantId: 'pisp',
        authenticationType: 'U2F',
        retriesLeft: '1',
        amount: {
          currency: 'USD',
          amount: '100'
        },
        transactionId: 'c87e9f61-e0d1-4a1c-a992-002718daf402',
        transactionRequestId: 'aca279be-60c6-42ff-aab5-901d61b5e35c',
        quote: {
          transferAmount: {
            currency: 'USD',
            amount: '105'
          },
          expiration: '2020-07-15T09:48:54.961Z',
          ilpPacket: 'ilp-packet-value',
          condition: 'condition-000000000-111111111-222222222-abc'
        }
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)

    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      OutboundAuthorizationsModel.notificationChannel(request.payload.transactionRequestId),
      putResponse as unknown as Message // TODO: think about generic Message so casting will not be necessary
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      ...putResponse,
      currentState: OutboundAuthorizationsModelState.succeeded
    })
  })

  it('/thirdpartyRequests/transactions/{ID}/authorizations', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions/123/authorizations',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        toParticipantId: 'dfspA',
        challenge: 'challenge',
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        sourceAccountId: 'dfspa.alice.1234',
        status: 'PENDING',
        value: 'value'
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      OutboundThirdpartyAuthorizationsModel.notificationChannel('123'),
      putThirdpartyAuthResponse as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      ...putThirdpartyAuthResponse,
      currentState: OutboundThirdpartyAuthorizationsModelState.succeeded
    })
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
    jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve({
      statusCode: 200,
      data: {
        party: { ...partyLookupResponse.party },
        currentState: 'COMPLETED'
      }
    }))
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      party: { ...partyLookupResponse.party },
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
    const transactionId = '52933d2c-f22f-4494-a7ae-99fc560357df'
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

    const authorizationRequest: tpAPI.Schemas.AuthorizationsPostRequest = {
      transactionRequestId,
      transactionId: transactionId,
      authenticationType: 'U2F',
      retriesLeft: '1',
      amount: {
        amount: '123.00',
        currency: 'USD'
      },
      quote: {
        transferAmount: {
          amount: '123.00',
          currency: 'USD'
        },
        expiration: 'quote-expiration',
        ilpPacket: 'quote-ilp-packet',
        condition: 'quote-condition'
      }
    }
    const transactionStatus: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse = {
      transactionId,
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
      pubSub.publish(
        channelAuthPost,
        authorizationRequest as unknown as Message
      )
      // publish transaction status update
      pubSub.publish(
        channelTransPut,
        transactionStatus as unknown as Message
      )
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
          authenticationInfo: {
            authentication: 'U2F',
            authenticationValue: {
              pinValue: 'xxxxxxxxxxx',
              counter: '1'
            }
          },
          responseType: 'ENTERED'
        }
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    const channelApprove = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.approval,
      transactionRequestId
    )
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      channelApprove,
      approveResponse as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      transactionStatus: { ...approveResponse },
      currentState: 'transactionStatusReceived'
    })
  })

  it('/accounts/{fspId}/{userId} -success', async (): Promise<void> => {
    const userId = 'username1234'
    const request = {
      method: 'GET',
      url: `/accounts/dfspa/${userId}`
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      OutboundAccountsModel.notificationChannel(userId),
      mockData.accountsRequest.payload as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
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
    expect(response.result).toEqual(expectedResp)
  })

  it('/accounts/{fspId}/{userId} -fail', async (): Promise<void> => {
    const userId = 'test'
    const request = {
      method: 'GET',
      url: `/accounts/dfspa/${userId}`
    }
    const errorResp = {
      errorInformation: {
        errorCode: '3200',
        errorDescription: 'Generic ID not found'
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      OutboundAccountsModel.notificationChannel(userId),
      errorResp as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(500)
    const expectedResp = {
      accounts: [],
      currentState: OutboundAccountsModelState.succeeded,
      errorInformation: errorResp.errorInformation
    }
    expect((response.result)).toEqual(expectedResp)
  })

  it('/consentRequests/{ID}/validate - success', async (): Promise<void> => {
    const consentRequestId = '6988c34f-055b-4ed5-b223-b10c8a2e2329'
    const request = {
      method: 'PATCH',
      url: `/consentRequests/${consentRequestId}/validate`,
      payload: {
        toParticipantId: 'dfpsa',
        authToken: '123456'
      }
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    // the dfsp should respond to a PISP with a POST /consents request
    // where the inbound handler will publish the message
    setTimeout(() => pubSub.publish(
      PISPOTPValidateModel.notificationChannel(
        consentRequestId
      ),
      mockData.inboundConsentsPostRequest.payload as unknown as Message
    ), 10)
    const response = await server.inject(request)

    expect(response.statusCode).toBe(200)
    const expectedResp = {
      consent: {
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
      },
      currentState: 'OTPIsValid'
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/consentRequests/{ID}/validate - error', async (): Promise<void> => {
    const consentRequestId = '6988c34f-055b-4ed5-b223-b10c8a2e2329'
    const request = {
      method: 'PATCH',
      url: `/consentRequests/${consentRequestId}/validate`,
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
      PISPOTPValidateModel.notificationChannel(
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

  it('/consentRequests - success', async (): Promise<void> => {
    // const consentRequestId = '6988c34f-055b-4ed5-b223-b10c8a2e2329'
    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      url: '/consentRequests',
      payload: { ...mockData.consentRequestsPost.payload, toParticipantId: 'dfspa' }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      PISPConsentRequestsModel.notificationChannel(mockData.consentRequestsPost.payload.id),
      mockData.consentRequestsPut.payload as unknown as Message
    ), 10)

    const response = await server.inject(request)

    expect(response.statusCode).toBe(200)
    const expectedResp = {
      consentRequests: { ...mockData.consentRequestsPut.payload },
      currentState: 'RequestIsValid'
    }
    expect(response.result).toEqual(expectedResp)
  })

  it('/consentRequests - error', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/consentRequests',
      payload: { ...mockData.consentRequestsPost.payload, toParticipantId: 'dfspa' }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    // if the validation fails the dfsp will respond with a
    // PUT /consentRequests/{ID}/error where the inbound handler will publish the error
    setTimeout(() => pubSub.publish(
      PISPConsentRequestsModel.notificationChannel(
        mockData.consentRequestsPost.payload.id
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

  it('/linking/providers - success', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: `/linking/providers`,
    }
    const pubSub = new PubSub({} as RedisConnectionConfig)

    setTimeout(() => pubSub.publish(
      PISPPrelinkingModel.notificationChannel(
        'THIRD_PARTY_DFSP'
      ),
      mockData.putServicesByServiceTypeRequest.payload as unknown as Message
    ), 10)
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
      url: `/linking/providers`,
    }

    const errorResponse = {
      errorInformation: {
        errorCode: '7000',
        errorDescription: 'Generic thirdparty error'
      }
    }

    const pubSub = new PubSub({} as RedisConnectionConfig)

    setTimeout(() => pubSub.publish(
      PISPPrelinkingModel.notificationChannel(
        'THIRD_PARTY_DFSP'
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
})
