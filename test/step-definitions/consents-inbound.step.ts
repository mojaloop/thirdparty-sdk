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
const featurePath = path.resolve(__dirname, '../features/consents-inbound.feature')
const feature = loadFeature(featurePath)

async function prepareInboundAPIServer (): Promise<Server> {
  const serverConfig: ServerConfig = {
    port: Config.INBOUND.PORT,
    host: Config.INBOUND.HOST,
    api: ServerAPI.inbound
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

  afterEach((done): void => {
    jest.resetAllMocks()
    jest.resetModules()
    server.events.on('stop', done)
    server.stop()
  })

  test('PostConsents', ({ given, when, then }): void => {
    given('Inbound API server', async (): Promise<void> => {
      server = await prepareInboundAPIServer()
    })

    when('I receive a \'PostConsents\' request', async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
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
        payload: {
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
      }
      response = await server.inject(request)
      return response
    })

    then('I get a response with a status code of \'202\'', (): void => {
      expect(response.statusCode).toBe(202)
    })
  })
})
