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
import Config from '~/shared/config'
import { Server } from '@hapi/hapi'
import index from '~/index'
import path from 'path'
import TestData from 'test/unit/data/mockData.json'
import { buildPayeeQuoteRequestFromTptRequest } from '~/domain/thirdpartyRequests/transactions'
import { resetUuid } from '../__mocks__/uuidv4'

const mockData = JSON.parse(JSON.stringify(TestData))
const postThirdpartyRequestsTransactionRequest = mockData.postThirdpartyRequestsTransactionRequest
const __postQuotes = jest.fn(() => Promise.resolve())

jest.mock('@mojaloop/sdk-standard-components', () => {
  return {
    MojaloopRequests: jest.fn(() => {
      return {
        postQuotes: __postQuotes
      }
    })
  }
})

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
    server.events.on('stop', done)
    await server.stop()
  })

  it('/health', async (): Promise<void> => {
    interface HealthResponse {
      status: string;
      uptime: number;
      startTime: string;
      versionNumber: string;
    }

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
      hello: 'inbound'
    })
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
