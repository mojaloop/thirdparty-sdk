/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

- Kevin Leyow <kevin.leyow@modusbox.com>

--------------
******/

import { Server, ServerInjectResponse } from '@hapi/hapi'
import { ServerAPI, ServerConfig } from '~/server'
import { defineFeature, loadFeature } from 'jest-cucumber'
import Config from '~/shared/config'
import Handlers from '~/handlers'
import index from '~/index'
import path from 'path'

const apiPath = path.resolve(__dirname, '../../src/interface/api-inbound.yaml')
const featurePath = path.resolve(__dirname, '../features/services-inbound.feature')
const feature = loadFeature(featurePath)

async function prepareInboundAPIServer(): Promise<Server> {
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
  return index.server.setupAndStart(serverConfig, apiPath, serverHandlers)
}

defineFeature(feature, (test): void => {
  let server: Server
  let response: ServerInjectResponse

  // tests seem to not like the server booting up/down between tests.
  // so we prepare a server for all tests in the feature
  beforeAll(async (): Promise<void> => {
    server = await prepareInboundAPIServer()
  })

  afterAll(async (): Promise<void> => {
    server.events.on('stop', await new Promise(process.nextTick))
    server.stop({ timeout: 0 })
  })

  afterEach((): void => {
    jest.resetAllMocks()
    jest.resetModules()
  })

  test('PutServicesByServiceType', ({ given, when, then }): void => {
    given('Inbound API server', async (): Promise<void> => {
      // do nothing
    })

    when("I receive a 'PutServicesByServiceType' request", async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
      const request = {
        method: 'PUT',
        url: '/services/THIRD_PARTY_DFSP',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'pispa'
        },
        payload: {
          providers: ['dfspA', 'dfspB']
        }
      }
      response = await server.inject(request)
      return response
    })

    then("I get a response with a status code of '200'", (): void => {
      expect(response.statusCode).toBe(200)
    })
  })

  test('PutServicesByServiceTypeAndError', ({ given, when, then }): void => {
    given('Inbound API server', async (): Promise<void> => {
      // do nothing
    })

    when("I receive a 'PutServicesByServiceTypeAndError' request", async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
      const request = {
        method: 'PUT',
        url: '/services/THIRD_PARTY_DFSP/error',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'pispA'
        },
        payload: {
          errorInformation: {
            errorCode: '7000',
            errorDescription: 'This is an error description.',
            extensionList: {
              extension: [
                {
                  key: 'sample error key',
                  value: 'sample error value'
                }
              ]
            }
          }
        }
      }
      response = await server.inject(request)
      return response
    })

    then("I get a response with a status code of '200'", (): void => {
      expect(response.statusCode).toBe(200)
    })
  })
})
