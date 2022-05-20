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
import { NotificationCallback, Message, PubSub } from '~/shared/pub-sub'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

const apiPath = path.resolve(__dirname, '../../src/interface/api-outbound.yaml')
const featurePath = path.resolve(__dirname, '../features/linking-providers-outbound.feature')
const feature = loadFeature(featurePath)

jest.mock('@mojaloop/sdk-standard-components', () => {
  const sdkStandardComponentsActual = jest.requireActual('@mojaloop/sdk-standard-components')

  return {
    ...sdkStandardComponentsActual,
    MojaloopRequests: jest.fn(),
    ThirdpartyRequests: jest.fn(() => ({
      getServices: jest.fn(() => Promise.resolve())
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

  // tests seem to not like the server booting up/down between tests.
  // so we prepare a server for all tests in the feature
  beforeAll(async (): Promise<void> => {
    server = await prepareOutboundAPIServer()
  })

  afterAll(async (done): Promise<void> => {
    server.events.on('stop', done)
    server.stop({ timeout: 0 })
  })

  afterEach((): void => {
    jest.resetAllMocks()
    jest.resetModules()
  })

  test('GetLinkingProviders', ({ given, when, then }): void => {
    const servicesServiceTypePutResponse: tpAPI.Schemas.ServicesServiceTypePutResponse = {
      providers: ['dfspA', 'dfspB']
    }

    given('Outbound API server', async (): Promise<void> => {
      // do nothing
    })

    when('I send a \'GetLinkingProviders\' request', async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
      const request = {
        method: 'GET',
        url: '/linking/providers',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'pispA',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'switch'
        }
      }
      const pubSub = new PubSub({} as RedisConnectionConfig)
      // defer publication to notification channel
      setTimeout(() => pubSub.publish(
        'some-channel',
        servicesServiceTypePutResponse as unknown as Message
      ), 10)
      response = await server.inject(request)
      return response
    })

    then('I get a response with a status code of \'200\'', (): void => {
      expect(response.statusCode).toBe(200)
    })
  })
})
