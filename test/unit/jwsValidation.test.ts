/* eslint-disable @typescript-eslint/ban-ts-comment */
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

import { Server } from '@hapi/hapi'
import { ServerAPI, ServerConfig } from '~/server'
import Config from '~/shared/config'
import Handlers from '~/handlers'
import index from '~/index'
import path from 'path'

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

  // exclude mocks that are not explicitly defined
  const sdkStandardComponentsActual = jest.requireActual('@mojaloop/sdk-standard-components')

  // @ts-ignore
  class MockJwsValidator extends sdkStandardComponentsActual.Jws.validator {
    constructor(config: { validationKeys: any }) {
      super(config)
      // @ts-ignore
      MockJwsValidator.__validationKeys = config.validationKeys
      // @ts-ignore
      this.validate = MockJwsValidator.__validate
    }
  }
  // @ts-ignore
  MockJwsValidator.__validate = jest.fn(() => true)

  return {
    ...sdkStandardComponentsActual,
    Jws: {
      validator: MockJwsValidator
    },
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

// @ts-ignore
import { Jws } from '@mojaloop/sdk-standard-components'

const apiPath = path.resolve(__dirname, '../../src/interface/api-inbound.yaml')

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

describe('validation', () => {
  afterEach((): void => {
    jest.resetAllMocks()
    jest.resetModules()
  })

  it('should pass incoming jws signed requests to sdk-standard-components validator when validateInboundJws enabled', async (): Promise<void> => {
    jest.mock('~/shared/kvs')
    jest.mock('~/shared/pub-sub')
    Config.validateInboundJws = true
    const server = await prepareInboundAPIServer()
    const request = {
      method: 'PUT',
      url: '/services/THIRD_PARTY_DFSP',
      headers: {
        'content-type': 'application/vnd.interoperability.services+json;version=1.1',
        'fspiop-source': 'other-dfsp',
        'fspiop-destination': 'mojaloop-sdk',
        'fspiop-signature':
          '{"signature":"aTTa1TTCBJA1K1VoEFgpSicWYU0q1VYXV-bjkk7uoeNicog7QSp9_AbwtYm4u8NJ1HFM_3mekE8wioAs5YNugnTlJ1k-q4Ouvp5Jo3ZnozoPVtnLaqdhxRMUBOHfDp0X8eCHEo7lETjKcCcH4r5_KT_9Vwx5TMytoG_y9Be8PpviJFkOqOV5jCeIl7XzL_pZQoY0pRJdkXDzYpXDu-HTYKr8ckxWQzx4HO-viJQd2ByQkbqPfQom9IQaAX1t4yztCCpOQn1LY9j9sbfEX9RPXG3UbY6UyDsNjUKYP9BAhXwI9pFWlgv2i9FvEtay2QYdwbW7XEpIiGZ_vi5d6yc12w","protectedHeader":"eyJhbGciOiJSUzI1NiIsIkZTUElPUC1VUkkiOiIvcGFydGllcy9NU0lTRE4vMTIzNDU2Nzg5IiwiRlNQSU9QLUhUVFAtTWV0aG9kIjoiUFVUIiwiRlNQSU9QLVNvdXJjZSI6InNpbSIsIkZTUElPUC1EZXN0aW5hdGlvbiI6ImRmc3AiLCJEYXRlIjoiVGh1LCAzMSBPY3QgMjAxOSAxMTo0MTo0MyBHTVQifQ"}',
        accept: '',
        date: 'Thu, 24 Jan 2019 10:22:12 GMT'
      },
      payload: {
        providers: ['dfspA', 'dfspB']
      }
    }
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    // @ts-ignore
    expect(Jws.validator.__validate).toHaveBeenCalledWith({
      headers: expect.objectContaining(request.headers),
      body: request.payload
    })
    server.stop({ timeout: 0 })
  })

  it('should not pass incoming jws signed requests to sdk-standard-components validator when validateInboundJws disabled', async (): Promise<void> => {
    jest.mock('~/shared/kvs')
    jest.mock('~/shared/pub-sub')
    Config.validateInboundJws = false
    const server = await prepareInboundAPIServer()
    const request = {
      method: 'PUT',
      url: '/services/THIRD_PARTY_DFSP',
      headers: {
        'content-type': 'application/vnd.interoperability.services+json;version=1.1',
        'fspiop-source': 'other-dfsp',
        'fspiop-destination': 'mojaloop-sdk',
        'fspiop-signature':
          '{"signature":"aTTa1TTCBJA1K1VoEFgpSicWYU0q1VYXV-bjkk7uoeNicog7QSp9_AbwtYm4u8NJ1HFM_3mekE8wioAs5YNugnTlJ1k-q4Ouvp5Jo3ZnozoPVtnLaqdhxRMUBOHfDp0X8eCHEo7lETjKcCcH4r5_KT_9Vwx5TMytoG_y9Be8PpviJFkOqOV5jCeIl7XzL_pZQoY0pRJdkXDzYpXDu-HTYKr8ckxWQzx4HO-viJQd2ByQkbqPfQom9IQaAX1t4yztCCpOQn1LY9j9sbfEX9RPXG3UbY6UyDsNjUKYP9BAhXwI9pFWlgv2i9FvEtay2QYdwbW7XEpIiGZ_vi5d6yc12w","protectedHeader":"eyJhbGciOiJSUzI1NiIsIkZTUElPUC1VUkkiOiIvcGFydGllcy9NU0lTRE4vMTIzNDU2Nzg5IiwiRlNQSU9QLUhUVFAtTWV0aG9kIjoiUFVUIiwiRlNQSU9QLVNvdXJjZSI6InNpbSIsIkZTUElPUC1EZXN0aW5hdGlvbiI6ImRmc3AiLCJEYXRlIjoiVGh1LCAzMSBPY3QgMjAxOSAxMTo0MTo0MyBHTVQifQ"}',
        accept: '',
        date: 'Thu, 24 Jan 2019 10:22:12 GMT'
      },
      payload: {
        providers: ['dfspA', 'dfspB']
      }
    }
    const response = await server.inject(request)
    expect(response.statusCode).toBe(200)
    // @ts-ignore
    expect(Jws.validator.__validate).toHaveBeenCalledTimes(0)
    server.stop({ timeout: 0 })
  })
})
