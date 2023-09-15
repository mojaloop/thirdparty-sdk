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

import { Handlers, ServerAPI, ServerConfig } from '~/server'

import { v1_1 as fspiopAPI, thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { HealthResponse } from '~/interface/types'
import { NotificationCallback, Message } from '~/shared/pub-sub'
import { RequestPartiesInformationState } from '~/models/pispTransaction.interface'

// import ConsentsHandler from '~/handlers/inbound/consents'
// import ConsentsIdHandler from '~/handlers/inbound/consents/{ID}'
// import ConsentsIdErrorHandler from '~/handlers/inbound/consents/{ID}/error'
// import ConsentRequestsHandler from '~/handlers/inbound/consentRequests'
// import ConsentRequestsIdHandler from '~/handlers/inbound/consentRequests/{ID}'
// import ConsentRequestsIdErrorHandler from '~/handlers/inbound/consentRequests/{ID}/error'
// import ParticipantTypeIdHandler from '~/handlers/inbound/participants/{Type}/{ID}'
// import ParticipantTypeIdHandlerError from '~/handlers/inbound/participants/{Type}/{ID}/error'
// import ServicesServiceTypeHandler from '~/handlers/inbound/services/{ServiceType}'
// import ServicesServiceTypeErrorHandler from '~/handlers/inbound/services/{ServiceType}/error'
import { Server, Request } from '@hapi/hapi'
// import { StateResponseToolkit } from '~/server/plugins/state'
import { buildPayeeQuoteRequestFromTptRequest } from '~/domain/thirdpartyRequests/transactions'
// import InboundAccounts from '~/handlers/inbound/accounts/{ID}'
// import InboundAccountError from '~/handlers/inbound/accounts/{ID}/error'
import { resetUuid } from '../__mocks__/uuid'
import * as mockData from 'test/unit/data/mockData'
import index from '~/index'
import path from 'path'
// import { logger } from '~/shared/logger'
// import { PISPLinkingPhase } from '~/models/outbound/pispLinking.interface'

const postThirdpartyRequestsTransactionRequest = mockData.postThirdpartyRequestsTransactionRequest
const __postQuotes = jest.fn(() => Promise.resolve())
// const __postConsents = jest.fn(() => Promise.resolve())

import Config from '~/shared/config'
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

const mockInboundGetAccounts = jest.fn(() => Promise.resolve())
jest.mock('~/models/inbound/accounts.model', () => ({
  InboundAccountsModel: jest.fn(() => ({
    getUserAccounts: mockInboundGetAccounts
  }))
}))

const postConsentRequest: tpAPI.Schemas.ConsentsPostRequestPISP = {
  consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
  consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fba',
  status: 'ISSUED',
  scopes: [
    {
      address: 'some-id',
      actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
    }
  ]
}

const patchConsentRequestsRequest: tpAPI.Schemas.ConsentRequestsIDPatchRequest = {
  authToken: '123455'
}

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'FSPIOP-Source': 'switch',
  Date: 'Fri, 15 Sep 2023 03:46:12 CST',
  'FSPIOP-Destination': 'dfspA'
}

describe('Inbound API routes', (): void => {
  let server: Server

  beforeAll(async (): Promise<void> => {
    const apiPath = path.resolve(__dirname, '../../../src/interface/api-inbound.yaml')
    const serverConfig: ServerConfig = {
      port: Config.inbound.port,
      host: Config.inbound.host,
      api: ServerAPI.inbound,
      tls: Config.inbound.tls,
      serviceConfig: Config
    }
    const serverHandlers = {
      ...Handlers.Shared,
      ...Handlers.Inbound
    }
    server = await index.server.setupAndStart(serverConfig, apiPath, serverHandlers)
  })

  afterAll((done) => {
    // StatePlugin is waiting on stop event so give it a chance to close the redis connections
    server.events.on('stop', () => setTimeout(done, 100))
    server.stop()
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

  it('/thirdpartyRequests/transactions should forward requestToPayTransfer', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      payload: JSON.stringify(postThirdpartyRequestsTransactionRequest.payload),
      headers
    }
    const quoteRequest = buildPayeeQuoteRequestFromTptRequest(postThirdpartyRequestsTransactionRequest.payload)
    resetUuid()

    const response = await server.inject(request)
    expect(response.statusCode).toBe(202)

    expect(__postQuotes).toBeCalledWith(quoteRequest, quoteRequest.payee.partyIdInfo.fspId)
  })

  // describe('/thirdpartyRequests/transactions', () => {
  //   it('/thirdpartyRequests/transactions should error on failed verifyConsentId', async (): Promise<void> => {
  //     jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
  //       verifySourceAccountId: jest.fn(() => false)
  //     }))
  //     const request = {
  //       method: 'POST',
  //       url: '/thirdpartyRequests/transactions',
  //       payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
  //     }

  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(400)
  //   })

  //   it('/thirdpartyRequests/transactions should error on failed verifyPispId', async (): Promise<void> => {
  //     jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
  //       verifyPispId: jest.fn(() => false)
  //     }))
  //     const request = {
  //       method: 'POST',
  //       url: '/thirdpartyRequests/transactions',
  //       payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
  //     }

  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(400)
  //   })

  //   it('/thirdpartyRequests/transactions should error on failed verifySourceAccountId', async (): Promise<void> => {
  //     jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
  //       verifySourceAccountId: jest.fn(() => false)
  //     }))
  //     const request = {
  //       method: 'POST',
  //       url: '/thirdpartyRequests/transactions',
  //       payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
  //     }

  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(400)
  //   })

  //   it('/thirdpartyRequests/transactions should error on failed validateGrantedConsent', async (): Promise<void> => {
  //     jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
  //       validateGrantedConsent: jest.fn(() => false)
  //     }))
  //     const request = {
  //       method: 'POST',
  //       url: '/thirdpartyRequests/transactions',
  //       payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
  //     }

  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(400)
  //   })
  // })

  // describe('/accounts/{ID}', () => {
  //   const request = mockData.accountsRequest
  //   const errorRequest = mockData.accountsRequestError
  //   it('PUT handler && pubSub invocation', async (): Promise<void> => {
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getDFSPBackendRequests: jest.fn(),
  //       getThirdpartyRequests: jest.fn(),
  //       getMojaloopRequests: jest.fn(),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       }))
  //     }

  //     const result = await InboundAccounts.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //     expect(toolkit.getPublisher).toBeCalledTimes(1)

  //     const channel = PISPDiscoveryModel.notificationChannel(request.params.ID)
  //     expect(pubSubMock.publish).toBeCalledWith(channel, request.payload)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const inRequest = {
  //       method: 'PUT',
  //       url: '/accounts/username1234',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       },
  //       payload: request.payload
  //     }
  //     const response = await server.inject(inRequest)
  //     expect(response.statusCode).toBe(200)
  //   })

  //   it('GET handler', async (): Promise<void> => {
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getDFSPBackendRequests: jest.fn(),
  //       getThirdpartyRequests: jest.fn(),
  //       getMojaloopRequests: jest.fn(),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       }))
  //     }

  //     const result = await InboundAccounts.get(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toBe(202)
  //     expect(mockInboundGetAccounts).not.toHaveBeenCalled()
  //   })

  //   it('PUT error handler && pubSub invocation', async (): Promise<void> => {
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getDFSPBackendRequests: jest.fn(),
  //       getThirdpartyRequests: jest.fn(),
  //       getMojaloopRequests: jest.fn(),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       }))
  //     }

  //     const result = await InboundAccountError.put(
  //       {},
  //       errorRequest as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //     expect(toolkit.getPublisher).toBeCalledTimes(1)

  //     const channel = PISPDiscoveryModel.notificationChannel(errorRequest.params.ID)
  //     expect(pubSubMock.publish).toBeCalledWith(channel, errorRequest.payload)
  //   })
  // })
  // describe('POST /consents', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const request = {
  //       headers: {
  //         accept: 'application/json'
  //       },
  //       payload: postConsentRequest
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       getAuthServiceParticipantId: jest.fn(() => 'central-auth'),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger)
  //     }

  //     const result = await ConsentsHandler.post(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(202)

  //     const channel = PISPLinkingModel.notificationChannel(
  //       PISPLinkingPhase.requestConsentAuthenticate,
  //       postConsentRequest.consentRequestId!
  //     )
  //     expect(toolkit.getPublisher).toBeCalledTimes(1)
  //     expect(pubSubMock.publish).toBeCalledWith(channel, postConsentRequest)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'POST',
  //       url: '/consents',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Accept: 'application/json',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       },
  //       payload: postConsentRequest
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(202)
  //   })
  // })

  // describe('POST /consentRequests', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const request = {
  //       payload: mockData.consentRequestsPost.payload,
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getSubscriber: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getAuthServiceParticipantId: jest.fn(() => 'central-auth'),
  //       getDFSPBackendRequests: jest.fn(() => ({
  //         validateConsentRequests: jest.fn(() => Promise.resolve(mockData.consentRequestsPost.response)),
  //         storeConsentRequests: jest.fn(() => Promise.resolve()),
  //         sendOTP: jest.fn(() => Promise.resolve(mockData.consentRequestsPost.otpResponse))
  //       })),
  //       getThirdpartyRequests: jest.fn(() => ({
  //         putConsentRequests: jest.fn(),
  //         putConsentRequestsError: jest.fn()
  //       })),
  //       getMojaloopRequests: jest.fn(),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ConsentRequestsHandler.post(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(202)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'POST',
  //       url: '/consentRequests',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         Accept: 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       },
  //       payload: mockData.consentRequestsPost.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(202)
  //   })
  // })

  // describe('PUT /consentRequests/{ID}', () => {
  //   jest.useFakeTimers()
  //   const request = mockData.consentRequestsPut
  //   const errorRequest = mockData.consentRequestsPutError
  //   it('PUT handler && pubSub invocation', async (): Promise<void> => {
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getDFSPBackendRequests: jest.fn(),
  //       getThirdpartyRequests: jest.fn(),
  //       getMojaloopRequests: jest.fn(),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       }))
  //     }

  //     const result = await ConsentRequestsIdHandler.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //     jest.runAllImmediates()
  //     expect(toolkit.getPublisher).toBeCalledTimes(1)

  //     const channel = PISPLinkingModel.notificationChannel(PISPLinkingPhase.requestConsent, request.params.ID)
  //     expect(pubSubMock.publish).toBeCalledWith(channel, request.payload)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const inRequest = {
  //       method: 'PUT',
  //       url: '/consentRequests/b51ec534-ee48-4575-b6a9-ead2955b8069',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       },
  //       payload: request.payload
  //     }
  //     const response = await server.inject(inRequest)
  //     expect(response.statusCode).toBe(200)
  //   })

  //   it('PUT error handler && pubSub invocation', async (): Promise<void> => {
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getDFSPBackendRequests: jest.fn(),
  //       getThirdpartyRequests: jest.fn(),
  //       getMojaloopRequests: jest.fn(),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       }))
  //     }
  //     const result = await ConsentRequestsIdErrorHandler.put(
  //       {},
  //       errorRequest as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //     jest.runAllImmediates()
  //     expect(toolkit.getPublisher).toBeCalledTimes(2)

  //     const channel = PISPLinkingModel.notificationChannel(PISPLinkingPhase.requestConsent, errorRequest.params.ID)
  //     expect(pubSubMock.publish).toBeCalledWith(channel, errorRequest.payload)

  //     const authTokenChannel = PISPLinkingModel.notificationChannel(
  //       PISPLinkingPhase.requestConsentAuthenticate,
  //       errorRequest.params.ID
  //     )
  //     expect(pubSubMock.publish).toBeCalledWith(authTokenChannel, errorRequest.payload)
  //   })
  // })

  // describe('PATCH /consentRequests/{ID}', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const request = {
  //       payload: patchConsentRequestsRequest,
  //       params: {
  //         ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //       },
  //       headers: {
  //         Accept: 'application/json',
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPId: jest.fn(() => 'dfspA'),
  //       getDFSPBackendRequests: jest.fn(() => ({
  //         validateAuthToken: jest.fn(() =>
  //           Promise.resolve({
  //             isValid: true
  //           })
  //         )
  //       })),
  //       getThirdpartyRequests: jest.fn(() => ({
  //         postConsents: jest.fn()
  //       })),
  //       getMojaloopRequests: jest.fn(),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ConsentRequestsIdHandler.patch(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(202)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PATCH',
  //       url: '/consentRequests/520f9165-7be6-4a40-9fc8-b30fcf4f62ab',
  //       headers: {
  //         Accept: 'application/json',
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       },
  //       payload: patchConsentRequestsRequest
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(202)
  //   })
  // })

  // describe('PUT /services/{ServiceType}', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const putServicesByServiceTypeRequest = mockData.putServicesByServiceTypeRequest
  //     const request = {
  //       payload: putServicesByServiceTypeRequest,
  //       params: {
  //         ServiceType: 'THIRD_PARTY_DFSP'
  //       },
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ServicesServiceTypeHandler.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PUT',
  //       url: '/services/THIRD_PARTY_DFSP',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       },
  //       payload: mockData.putServicesByServiceTypeRequest.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(200)
  //   })
  // })

  // describe('PUT /services/{ServiceType}/error', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const errorRequest = mockData.putServicesByServiceTypeRequestError
  //     const request = {
  //       payload: errorRequest,
  //       params: {
  //         ServiceType: 'THIRD_PARTY_DFSP'
  //       },
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ServicesServiceTypeErrorHandler.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PUT',
  //       url: '/services/THIRD_PARTY_DFSP/error',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       },
  //       payload: mockData.putServicesByServiceTypeRequestError.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(200)
  //   })
  // })

  // describe('PUT /consents/{ID}/error', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const errorRequest = mockData.putConsentsIdRequestError
  //     const request = {
  //       payload: errorRequest,
  //       params: {
  //         ID: 'T520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //       },
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ConsentsIdErrorHandler.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PUT',
  //       url: '/consents/520f9165-7be6-4a40-9fc8-b30fcf4f62ab/error',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       },
  //       payload: mockData.putConsentsIdRequestError.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(200)
  //   })
  // })

  // describe('PUT /consents/{ID}', () => {
  //   describe('Signed Credential request body', () => {
  //     it('handler && pubSub invocation', async (): Promise<void> => {
  //       const request = {
  //         payload: mockData.inboundPutConsentsIdRequestSignedCredential.payload,
  //         params: {
  //           ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //         },
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'FSPIOP-Source': 'switch',
  //           Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //           'FSPIOP-Destination': 'dfspA'
  //         }
  //       }
  //       const pubSubMock = {
  //         publish: jest.fn()
  //       }
  //       const toolkit = {
  //         getPublisher: jest.fn(() => pubSubMock),
  //         response: jest.fn(() => ({
  //           code: jest.fn((code: number) => ({
  //             statusCode: code
  //           }))
  //         })),
  //         getLogger: jest.fn(() => logger),
  //         getDFSPBackendRequests: jest.fn(),
  //         getThirdpartyRequests: jest.fn(() => ({
  //           postConsents: jest.fn()
  //         })),
  //         getMojaloopRequests: jest.fn(),
  //         getKVS: jest.fn(() => ({
  //           set: jest.fn()
  //         }))
  //       }

  //       const result = await ConsentsIdHandler.put(
  //         {},
  //         request as unknown as Request,
  //         toolkit as unknown as StateResponseToolkit
  //       )
  //       expect(result.statusCode).toEqual(202)
  //     })

  //     it('input validation', async (): Promise<void> => {
  //       const request = {
  //         method: 'PUT',
  //         url: '/consents/520f9165-7be6-4a40-9fc8-b30fcf4f62ab',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'FSPIOP-Source': 'switch',
  //           Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //           'FSPIOP-Destination': 'pispA'
  //         },
  //         payload: mockData.inboundPutConsentsIdRequestSignedCredential.payload
  //       }
  //       const response = await server.inject(request)
  //       expect(response.statusCode).toBe(202)
  //     })
  //   })

  //   describe('Verified Credential request body', () => {
  //     it('handler && pubSub invocation', async (): Promise<void> => {
  //       const request = {
  //         payload: mockData.inboundPutConsentsIdRequestVerifiedCredential.payload,
  //         params: {
  //           ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //         },
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'FSPIOP-Source': 'switch',
  //           Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //           'FSPIOP-Destination': 'pispA'
  //         }
  //       }
  //       const pubSubMock = {
  //         publish: jest.fn()
  //       }
  //       const toolkit = {
  //         getPublisher: jest.fn(() => pubSubMock),
  //         response: jest.fn(() => ({
  //           code: jest.fn((code: number) => ({
  //             statusCode: code
  //           }))
  //         })),
  //         getLogger: jest.fn(() => logger),
  //         getDFSPBackendRequests: jest.fn(),
  //         getThirdpartyRequests: jest.fn(() => ({
  //           postConsents: jest.fn()
  //         })),
  //         getMojaloopRequests: jest.fn(),
  //         getKVS: jest.fn(() => ({
  //           set: jest.fn()
  //         }))
  //       }

  //       const result = await ConsentsIdHandler.put(
  //         {},
  //         request as unknown as Request,
  //         toolkit as unknown as StateResponseToolkit
  //       )

  //       expect(result.statusCode).toEqual(200)
  //     })

  //     it('input validation', async (): Promise<void> => {
  //       const request = {
  //         method: 'PUT',
  //         url: '/consents/520f9165-7be6-4a40-9fc8-b30fcf4f62ab',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'FSPIOP-Source': 'switch',
  //           Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //           'FSPIOP-Destination': 'pispA'
  //         },
  //         payload: mockData.inboundPutConsentsIdRequestVerifiedCredential.payload
  //       }
  //       const response = await server.inject(request)
  //       expect(response.statusCode).toBe(200)
  //     })
  //   })
  // })

  // describe('PATCH /consents/{ID}', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const request = {
  //       payload: mockData.inboundConsentsVerifiedPatchRequest.payload,
  //       params: {
  //         ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //       },
  //       headers: {
  //         Accept: 'application/json',
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getThirdpartyRequests: jest.fn(() => ({
  //         postConsents: jest.fn()
  //       })),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ConsentsIdHandler.patch(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PATCH',
  //       url: '/consents/520f9165-7be6-4a40-9fc8-b30fcf4f62ab',
  //       headers: {
  //         Accept: 'application/json',
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       },
  //       payload: mockData.inboundConsentsVerifiedPatchRequest.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(200)
  //   })
  // })

  // describe('PUT /participants/{Type}/{ID}', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const request = {
  //       payload: mockData.inboundPutParticipantsTypeIdRequest.payload,
  //       params: {
  //         Type: 'CONSENT',
  //         ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //       },
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getDFSPBackendRequests: jest.fn(),
  //       getThirdpartyRequests: jest.fn(() => ({
  //         postConsents: jest.fn()
  //       })),
  //       getMojaloopRequests: jest.fn(),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ParticipantTypeIdHandler.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PUT',
  //       url: '/participants/CONSENT/520f9165-7be6-4a40-9fc8-b30fcf4f62ab',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'dfspA'
  //       },
  //       payload: mockData.inboundPutParticipantsTypeIdRequest.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(200)
  //   })
  // })

  // describe('PUT /participants/{Type}/{ID}/error', () => {
  //   it('handler && pubSub invocation', async (): Promise<void> => {
  //     const request = {
  //       payload: mockData.inboundPutParticipantsTypeIdRequestError.payload,
  //       params: {
  //         Type: 'CONSENT',
  //         ID: 'T520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  //       },
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       }
  //     }
  //     const pubSubMock = {
  //       publish: jest.fn()
  //     }
  //     const toolkit = {
  //       getPublisher: jest.fn(() => pubSubMock),
  //       response: jest.fn(() => ({
  //         code: jest.fn((code: number) => ({
  //           statusCode: code
  //         }))
  //       })),
  //       getLogger: jest.fn(() => logger),
  //       getKVS: jest.fn(() => ({
  //         set: jest.fn()
  //       }))
  //     }

  //     const result = await ParticipantTypeIdHandlerError.put(
  //       {},
  //       request as unknown as Request,
  //       toolkit as unknown as StateResponseToolkit
  //     )

  //     expect(result.statusCode).toEqual(200)
  //   })

  //   it('input validation', async (): Promise<void> => {
  //     const request = {
  //       method: 'PUT',
  //       url: '/participants/CONSENT/520f9165-7be6-4a40-9fc8-b30fcf4f62ab/error',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'FSPIOP-Source': 'switch',
  //         Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
  //         'FSPIOP-Destination': 'pispA'
  //       },
  //       payload: mockData.inboundPutParticipantsTypeIdRequestError.payload
  //     }
  //     const response = await server.inject(request)
  //     expect(response.statusCode).toBe(200)
  //   })
  // })
})
