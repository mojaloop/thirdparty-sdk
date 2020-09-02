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

import { HealthResponse } from '~/interface/types'
import { ServerAPI, ServerConfig } from '~/server'
import {
  AuthorizationResponse,
  AuthenticationType,
  InboundAuthorizationsPutRequest,
  OutboundAuthorizationsModelState
} from '~/models/authorizations.interface'
import { Server } from '@hapi/hapi'
import Config from '~/shared/config'
import Handlers from '~/handlers'
import index from '~/index'
import path from 'path'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('Outbound API routes', (): void => {
  let server: Server
  let putResponse: InboundAuthorizationsPutRequest

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
  beforeEach(() => {
    putResponse = {
      authenticationInfo: {
        authentication: AuthenticationType.U2F,
        authenticationValue: {
          pinValue: 'the-mocked-pin-value',
          counter: '1'
        }
      },
      responseType: AuthorizationResponse.ENTERED
    }
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

    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      ...putResponse,
      currentState: OutboundAuthorizationsModelState.succeeded
    })
  })
})
