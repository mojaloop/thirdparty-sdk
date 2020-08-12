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

 - Paweł Marzec <pawel.marzec@modusbox.com>

 --------------
 ******/

import { Handlers, ServerAPI, ServerConfig } from '~/server'
import { Server, ServerInjectResponse } from '@hapi/hapi'
import { defineFeature, loadFeature } from 'jest-cucumber'
import Config from '~/shared/config'
import index from '~/index'
import path from 'path'

const apiPath = path.resolve(__dirname, '../../src/interface/api-outbound.yaml')
const featurePath = path.resolve(__dirname, '../features/outbound-health-check.scenario.feature')
const feature = loadFeature(featurePath)

async function prepareOutboundAPIServer (): Promise<Server> {
  const serverConfig: ServerConfig = {
    port: Config.OUTBOUND.PORT,
    host: Config.OUTBOUND.HOST,
    api: ServerAPI.outbound
  }
  const serverHandlers = {
    ...Handlers.Shared,
    ...Handlers.Outbound
  }
  return index.server.setupAndStart(serverConfig, apiPath, serverHandlers)
}

defineFeature(feature, (test): void => {
  let server: Server
  let response: ServerInjectResponse

  afterEach((done): void => {
    server.events.on('stop', done)
    server.stop()
  })

  test('Health Check', ({ given, when, then }): void => {
    given('Outbound API server', async (): Promise<void> => {
      server = await prepareOutboundAPIServer()
    })

    when('I get \'Health Check\' response', async (): Promise<ServerInjectResponse> => {
      const request = {
        method: 'GET',
        url: '/health'
      }
      response = await server.inject(request)
      return response
    })

    then('The status should be \'OK\'', (): void => {
      interface HealthResponse {
        status: string;
        uptime: number;
        startTime: string;
        versionNumber: string;
      }
      const healthResponse = response.result as HealthResponse
      expect(response.statusCode).toBe(200)
      expect(healthResponse.status).toEqual('OK')
      expect(healthResponse.uptime).toBeGreaterThan(1.0)
    })
  })

  test('Hello Check', ({ given, when, then }): void => {
    given('Outbound API server', async (): Promise<void> => {
      server = await prepareOutboundAPIServer()
    })

    when('I get \'Hello\' response', async (): Promise<ServerInjectResponse> => {
      const request = {
        method: 'GET',
        url: '/hello'
      }
      response = await server.inject(request)
      return response
    })

    interface HelloResponse {
      hello: string;
    }

    then('The \'hello\' property should be \'outbound\'', (): void => {
      const healthResponse = response.result as HelloResponse
      expect(response.statusCode).toBe(200)
      expect(healthResponse.hello).toEqual('outbound')
    })
  })
})
