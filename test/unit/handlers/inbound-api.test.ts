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
 --------------
 ******/

import { Handlers, ServerAPI, ServerConfig } from '~/server'
import { HealthResponse } from '~/interface/types'
import {
  AuthorizationResponse,
  AuthenticationType,
  InboundAuthorizationsPutRequest
} from '~/models/authorizations.interface'

import InboundAuthorizations from '~/handlers/inbound/authorizations'

import {
  OutboundAuthorizationsModel
} from '~/models/outbound/authorizations.model'
import { Server, Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import { buildPayeeQuoteRequestFromTptRequest } from '~/domain/thirdpartyRequests/transactions'
import { resetUuid } from '../__mocks__/uuidv4'
import Config from '~/shared/config'
import TestData from 'test/unit/data/mockData.json'
import index from '~/index'
import path from 'path'
const mockData = JSON.parse(JSON.stringify(TestData))
const postThirdpartyRequestsTransactionRequest = mockData.postThirdpartyRequestsTransactionRequest
const __postQuotes = jest.fn(() => Promise.resolve())

jest.mock('@mojaloop/sdk-standard-components', () => {
  return {
    MojaloopRequests: jest.fn(() => {
      return {
        postQuotes: __postQuotes
      }
    }),
    ThirdpartyRequests: jest.fn(),
    WSO2Auth: jest.fn(),
    Logger: {
      Logger: jest.fn(() => ({
        push: jest.fn(),
        configure: jest.fn(),

        // log methods
        log: jest.fn(),

        // generated methods from default levels
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        info: jest.fn(),
        fatal: jest.fn()
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

describe('Inbound API routes', (): void => {
  let server: Server

  beforeAll(async (): Promise<void> => {
    const apiPath = path.resolve(__dirname, '../../../src/interface/api-inbound.yaml')
    const serverConfig: ServerConfig = {
      port: Config.INBOUND.PORT,
      host: Config.INBOUND.HOST,
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
    it('handler && pubSub invocation', async (): Promise<void> => {
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

      const channel = OutboundAuthorizationsModel.notificationChannel(request.params.ID)
      expect(pubSubMock.publish).toBeCalledWith(channel, putResponse)
    })

    it('PUT /authorizations & input validation', async (): Promise<void> => {
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

  it('/hello', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/hello'
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({
      hello: 'inbound'
    })
  })

  it('/metrics', async (): Promise<void> => {
    const request = {
      method: 'GET',
      url: '/metrics'
    }

    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
  })

  it('/thirdpartyRequests/transactions should forward quote request to payee', async (): Promise<void> => {
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
})
