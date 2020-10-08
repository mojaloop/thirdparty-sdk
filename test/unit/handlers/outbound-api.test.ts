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

import {
  AuthorizationResponse,
  AuthenticationType,
  InboundAuthorizationsPostRequest,
  InboundAuthorizationsPutRequest,
  OutboundAuthorizationsModelState
} from '~/models/authorizations.interface'
import { HealthResponse } from '~/interface/types'
import { NotificationCallback, Message, PubSub } from '~/shared/pub-sub'
import {
  OutboundThirdpartyAuthorizationsModelState,
  InboundThirdpartyAuthorizationsPutRequest
} from '~/models/thirdparty.authorizations.interface'
import {
  PISPTransactionModelState,
  ThirdpartyTransactionStatus
} from '~/models/pispTransaction.interface'
import PTM from '~/models/pispTransaction.model'

import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Server } from '@hapi/hapi'
import { ServerAPI, ServerConfig } from '~/server'
import { TParty } from '@mojaloop/sdk-standard-components'
import Config from '~/shared/config'
import Handlers from '~/handlers'
import index from '~/index'
import path from 'path'

const putResponse: InboundAuthorizationsPutRequest = {
  authenticationInfo: {
    authentication: AuthenticationType.U2F,
    authenticationValue: {
      pinValue: 'the-mocked-pin-value',
      counter: '1'
    }
  },
  responseType: AuthorizationResponse.ENTERED
}
const putThirdpartyAuthResponse: InboundThirdpartyAuthorizationsPutRequest = {
  challenge: 'challenge',
  consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
  sourceAccountId: 'dfspa.alice.1234',
  status: 'VERIFIED',
  value: 'value'
}
const partyLookupResponse: TParty = {
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
}
const initiateResponse: InboundAuthorizationsPostRequest = {
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
const approveResponse: ThirdpartyTransactionStatus = {
  transactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
  transactionRequestState: 'ACCEPTED'
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
      postThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve(initiateResponse))
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
    }
  }
})

jest.mock('~/shared/pub-sub', () => {
  let handler: NotificationCallback
  let subId = 0
  return {
    PubSub: jest.fn(() => ({
      isConnected: true,
      subscribe: jest.fn(
        (_channel: string, cb: NotificationCallback) => {
          handler = cb
          return ++subId
        }
      ),
      unsubscribe: jest.fn(),
      publish: jest.fn(
        async (channel: string, message: Message) => {
          return handler(channel, message, subId)
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

  it('/hello', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/hello'
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({
      hello: 'outbound'
    })
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
      'some-channel',
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
      'some-channel',
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
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      'some-channel',
      partyLookupResponse as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      party: { ...partyLookupResponse },
      currentState: PISPTransactionModelState.partyLookupSuccess
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
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/b51ec534-ee48-4575-b6a9-ead2955b8069/initiate',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        sourceAccountId: 'dfspa.alice.1234',
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+44 1234 5678',
            fspId: 'dfspb'
          }
        },
        payer: {
          personalInfo: {
            complexName: {
              firstName: 'Alice',
              lastName: 'K'
            }
          },
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+44 8765 4321',
            fspId: 'dfspa'
          }
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
    const pubSub = new PubSub({} as RedisConnectionConfig)
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      'some-channel',
      initiateResponse as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      authorization: { ...initiateResponse },
      currentState: PISPTransactionModelState.authorizationReceived
    })
  })

  it('/thirdpartyTransaction/{ID}/approve', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/b51ec534-ee48-4575-b6a9-ead2955b8069/approve',
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
    // defer publication to notification channel
    setTimeout(() => pubSub.publish(
      'some-channel',
      approveResponse as unknown as Message
    ), 10)
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      transactionStatus: { ...approveResponse },
      currentState: PISPTransactionModelState.transactionStatusReceived
    })
  })
})
