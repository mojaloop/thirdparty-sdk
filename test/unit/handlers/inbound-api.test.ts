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
import { HealthResponse } from '~/interface/types'
import InboundAuthorizations from '~/handlers/inbound/authorizations'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import {
  OutboundAuthorizationsModel
} from '~/models/outbound/authorizations.model'
import {
  OutboundThirdpartyAuthorizationsModel
} from '~/models/outbound/thirdparty.authorizations.model'
import {
  PISPTransactionModel
} from '~/models/pispTransaction.model'
import {
  OutboundAccountsModel
} from '~/models/outbound/accounts.model'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'
import { notificationChannel } from '~/models/pispConsentRequest.model'
import ThirdpartyAuthorizations from '~/handlers/inbound/thirdpartyRequests/transactions/{ID}/authorizations'
import ConsentsHandler from '~/handlers/inbound/consents'
import ConsentRequestsIdHandler from '~/handlers/inbound/consentRequests/{ID}'
import { Server, Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import { buildPayeeQuoteRequestFromTptRequest } from '~/domain/thirdpartyRequests/transactions'
import InboundAccounts from '~/handlers/inbound/accounts/{ID}'
import InboundAccountError from '~/handlers/inbound/accounts/{ID}/error'
import { resetUuid } from '../__mocks__/uuidv4'
import TestData from 'test/unit/data/mockData.json'
import index from '~/index'
import path from 'path'
import config from '~/shared/config'
import { logger } from '~/shared/logger'

const mockData = JSON.parse(JSON.stringify(TestData))
const postThirdpartyRequestsTransactionRequest = mockData.postThirdpartyRequestsTransactionRequest
const __postQuotes = jest.fn(() => Promise.resolve())
const __postConsents = jest.fn(() => Promise.resolve())

jest.mock('@mojaloop/sdk-standard-components', () => {
  const loggerMethods = {
    log: jest.fn(),

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
    MojaloopRequests: jest.fn(() => {
      return {
        postQuotes: __postQuotes
      }
    }),
    ThirdpartyRequests: jest.fn(() => {
      return {
        postConsents: __postConsents
      }
    }),
    WSO2Auth: jest.fn(),
    Logger: {
      Logger: jest.fn(() => ({
        push: jest.fn(() => loggerMethods),
        configure: jest.fn(),
        ...loggerMethods
      })),
      buildStringify: jest.fn()
    }
  }
})

jest.mock('~/shared/pub-sub', () => {
  return {
    PubSub: jest.fn(() => ({
      isConnected: true,
      publish: jest.fn(),
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

const mockInboundPostAuthorization = jest.fn(() => Promise.resolve())
jest.mock('~/models/inbound/authorizations.model', () => ({
  InboundAuthorizationsModel: jest.fn(() => ({
    postAuthorizations: mockInboundPostAuthorization
  }))
}))

const mockInboundPostConsents = jest.fn(() => Promise.resolve())
jest.mock('~/models/inbound/consentRequests.model', () => ({
  InboundConsentRequestsRequestModel: jest.fn(() => ({
    postConsentsRequest: mockInboundPostConsents
  }))
}))

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

const postConsentRequest: tpAPI.Schemas.ConsentsPostRequest = {
  consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
  consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fba',
  scopes: [{
    accountId: 'some-id',
    actions: [
      'accounts.getBalance',
      'accounts.transfer'
    ]
  }
  ]
}

const patchConsentRequestsRequest: tpAPI.Schemas.ConsentRequestsIDPatchRequest = {
  authToken: '123455'
}

describe('Inbound API routes', (): void => {
  let server: Server

  beforeAll(async (): Promise<void> => {
    const apiPath = path.resolve(__dirname, '../../../src/interface/api-inbound.yaml')
    const serverConfig: ServerConfig = {
      port: config.INBOUND.PORT,
      host: config.INBOUND.HOST,
      api: ServerAPI.inbound
    }
    const serverHandlers = {
      ...Handlers.Shared,
      ...Handlers.Inbound
    }
    server = await index.server.setupAndStart(serverConfig, apiPath, serverHandlers)
    jest.clearAllMocks()
  })

  afterAll(async (done): Promise<void> => {
    // StatePlugin is waiting on stop event so give it a chance to close the redis connections
    server.events.on('stop', () => setTimeout(done, 100))
    await server.stop()
  })

  describe('/authorization', () => {
    it('PUT handler && pubSub invocation - authorization mode', async (): Promise<void> => {
      const request = {
        params: {
          ID: '123'
        },
        payload: putResponse
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await InboundAuthorizations.put(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(200)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      // check default authorization mode
      const authChannel = OutboundAuthorizationsModel.notificationChannel(request.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(authChannel, putResponse)
    })

    it('PUT handler && pubSub invocation - pisp transfer mode', async (): Promise<void> => {
      config.INBOUND.PISP_TRANSACTION_MODE = true
      const request = {
        params: {
          ID: '123'
        },
        payload: putResponse
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await InboundAuthorizations.put(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(200)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      // check pisp transaction mode
      const pispChannel = PISPTransactionModel.notificationChannel(PISPTransactionPhase.initiation, request.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(pispChannel, putResponse)

      config.INBOUND.PISP_TRANSACTION_MODE = false
    })

    it('PUT success flow', async (): Promise<void> => {
      const request = {
        method: 'PUT',
        url: '/authorizations/123',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: putResponse
      }
      const response = await server.inject(request)
      expect(response.statusCode).toBe(200)
    })

    it('POST success flow - authorization mode', async (): Promise<void> => {
      const postRequest = {
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
      const request = {
        method: 'POST',
        url: '/authorizations',
        headers: {
          'Content-Type': 'application/json',
          'fspiop-source': 'sourceDfspId'
        },
        payload: postRequest
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getLogger: jest.fn(() => logger),
        getPubSub: jest.fn(() => pubSubMock),
        getPISPBackendRequests: jest.fn(),
        getMojaloopRequests: jest.fn(),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }
      const result = await InboundAuthorizations.post(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )
      expect(result.statusCode).toBe(202)
      expect(mockInboundPostAuthorization).toBeCalledWith(postRequest, request.headers['fspiop-source'])
    })

    it('POST success flow - pisp transaction mode', async (): Promise<void> => {
      // TODO: investigate how to drop this flag used in handlers/authorizations/put
      config.INBOUND.PISP_TRANSACTION_MODE = true
      const postRequest = {
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
      const request = {
        method: 'POST',
        url: '/authorizations',
        headers: {
          'Content-Type': 'application/json',
          'fspiop-source': 'sourceDfspId'
        },
        payload: postRequest
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getLogger: jest.fn(() => logger),
        getPubSub: jest.fn(() => pubSubMock),
        getPISPBackendRequests: jest.fn(),
        getMojaloopRequests: jest.fn(),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }
      const result = await InboundAuthorizations.post(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )
      expect(result.statusCode).toBe(202)

      // check pisp transaction mode
      const pispChannel = PISPTransactionModel.notificationChannel(
        PISPTransactionPhase.initiation,
        postRequest.transactionRequestId
      )
      expect(pubSubMock.publish).toBeCalledWith(pispChannel, postRequest)
      config.INBOUND.PISP_TRANSACTION_MODE = false
    })
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

  xit('/thirdpartyRequests/transactions should forward requestToPayTransfer', async (): Promise<void> => {
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      payload: JSON.stringify(postThirdpartyRequestsTransactionRequest.payload)
    }
    const quoteRequest = buildPayeeQuoteRequestFromTptRequest(postThirdpartyRequestsTransactionRequest.payload)
    resetUuid()

    const response = await server.inject(request)
    expect(response.statusCode).toBe(202)

    expect(__postQuotes).toBeCalledWith(
      quoteRequest,
      quoteRequest.payee.partyIdInfo.fspId
    )
  })

  it('/thirdpartyRequests/transactions should error on failed verifyConsentId', async (): Promise<void> => {
    jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
      verifySourceAccountId: jest.fn(() => false)
    }))
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(400)
  })

  it('/thirdpartyRequests/transactions should error on failed verifyPispId', async (): Promise<void> => {
    jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
      verifyPispId: jest.fn(() => false)
    }))
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(400)
  })

  it('/thirdpartyRequests/transactions should error on failed verifySourceAccountId', async (): Promise<void> => {
    jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
      verifySourceAccountId: jest.fn(() => false)
    }))
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(400)
  })

  it('/thirdpartyRequests/transactions should error on failed validateGrantedConsent', async (): Promise<void> => {
    jest.mock('~/domain/thirdpartyRequests/transactions', () => ({
      validateGrantedConsent: jest.fn(() => false)
    }))
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      payload: JSON.stringify(postThirdpartyRequestsTransactionRequest)
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(400)
  })

  describe('/thirdpartyRequests/transactions/{ID}/authorizations', () => {
    it('handler && pubSub invocation', async (): Promise<void> => {
      const request = {
        params: {
          ID: '123'
        },
        payload: putThirdpartyAuthResponse
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await ThirdpartyAuthorizations.put(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(200)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      const channel = OutboundThirdpartyAuthorizationsModel.notificationChannel(request.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(channel, putThirdpartyAuthResponse)
    })

    it('input validation', async (): Promise<void> => {
      const request = {
        method: 'PUT',
        url: '/thirdpartyRequests/transactions/123/authorizations',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload: putThirdpartyAuthResponse
      }
      const response = await server.inject(request)
      expect(response.statusCode).toBe(200)
    })
  })

  describe('/accounts/{ID}', () => {
    const request: Request = mockData.accountsRequest
    const errorRequest: Request = mockData.accountsRequestError
    it('PUT handler && pubSub invocation', async (): Promise<void> => {
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        getLogger: jest.fn(() => logger),
        getDFSPBackendRequests: jest.fn(),
        getThirdpartyRequests: jest.fn(),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await InboundAccounts.put(
        {},
        request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(200)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      const channel = OutboundAccountsModel.notificationChannel(request.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(channel, request.payload)
    })

    it('input validation', async (): Promise<void> => {
      const inRequest = {
        method: 'PUT',
        url: '/accounts/username1234',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload: request.payload
      }
      const response = await server.inject(inRequest)
      expect(response.statusCode).toBe(200)
    })

    it('GET handler', async (): Promise<void> => {
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        getLogger: jest.fn(() => logger),
        getDFSPBackendRequests: jest.fn(),
        getThirdpartyRequests: jest.fn(),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await InboundAccounts.get(
        {},
        request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toBe(202)
      expect(mockInboundGetAccounts).not.toHaveBeenCalled()
    })

    it('PUT error handler && pubSub invocation', async (): Promise<void> => {
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        getLogger: jest.fn(() => logger),
        getDFSPBackendRequests: jest.fn(),
        getThirdpartyRequests: jest.fn(),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await InboundAccountError.put(
        {},
        errorRequest,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(200)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      const channel = OutboundAccountsModel.notificationChannel(errorRequest.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(channel, errorRequest.payload)
    })
  })
  describe('POST /consents', () => {
    it('handler && pubSub invocation', async (): Promise<void> => {
      const request = {
        headers: {
          'accept': 'application/json'
        },
        payload: postConsentRequest
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        })),
        getLogger: jest.fn(() => logger)
      }

      const result = await ConsentsHandler.post(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(202)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      const channel = notificationChannel(postConsentRequest.consentRequestId)
      expect(pubSubMock.publish).toBeCalledWith(channel, postConsentRequest)
    })

    it('input validation', async (): Promise<void> => {
      const request = {
        method: 'POST',
        url: '/consents',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          'Accept': 'application/json',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload: postConsentRequest
      }
      const response = await server.inject(request)
      expect(response.statusCode).toBe(202)
    })
  })

  describe('PATCH /consentRequests/{ID}', () => {
    it('handler && pubSub invocation', async (): Promise<void> => {
      const request = {
        payload: patchConsentRequestsRequest,
        params: {
          ID: "520f9165-7be6-4a40-9fc8-b30fcf4f62ab"
        },
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        })),
        getLogger: jest.fn(() => logger),
        getDFSPBackendRequests: jest.fn(),
        getThirdpartyRequests: jest.fn(),
      }

      const result = await ConsentRequestsIdHandler.patch(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(202)
    })

    it('input validation', async (): Promise<void> => {
      const request = {
        method: 'PATCH',
        url: '/consentRequests/520f9165-7be6-4a40-9fc8-b30fcf4f62ab',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload: patchConsentRequestsRequest
      }
      const response = await server.inject(request)
      expect(response.statusCode).toBe(202)
    })
  })

  describe('/thirdpartyRequests/transactions/{ID}/authorizations', () => {
    it('handler && pubSub invocation', async (): Promise<void> => {
      const request = {
        params: {
          ID: '123'
        },
        payload: putThirdpartyAuthResponse
      }
      const pubSubMock = {
        publish: jest.fn()
      }
      const toolkit = {
        getPubSub: jest.fn(() => pubSubMock),
        response: jest.fn(() => ({
          code: jest.fn((code: number) => ({
            statusCode: code
          }))
        }))
      }

      const result = await ThirdpartyAuthorizations.put(
        {},
        request as unknown as Request,
        toolkit as unknown as StateResponseToolkit
      )

      expect(result.statusCode).toEqual(200)
      expect(toolkit.getPubSub).toBeCalledTimes(1)

      const channel = OutboundThirdpartyAuthorizationsModel.notificationChannel(request.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(channel, putThirdpartyAuthResponse)
    })

    it('input validation', async (): Promise<void> => {
      const request = {
        method: 'PUT',
        url: '/thirdpartyRequests/transactions/123/authorizations',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload: putThirdpartyAuthResponse
      }
      const response = await server.inject(request)
      expect(response.statusCode).toBe(200)
    })
  })
})
