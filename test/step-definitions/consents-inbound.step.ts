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
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

const apiPath = path.resolve(__dirname, '../../src/interface/api-inbound.yaml')
const featurePath = path.resolve(__dirname, '../features/consents-inbound.feature')
const feature = loadFeature(featurePath)

async function prepareInboundAPIServer(): Promise<Server> {
  const serverConfig: ServerConfig = {
    port: Config.INBOUND.PORT,
    host: Config.INBOUND.HOST,
    api: ServerAPI.inbound,
    tls: Config.INBOUND.TLS
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

  afterAll(async (done): Promise<void> => {
    server.events.on('stop', done)
    server.stop({ timeout: 0 })
  })

  afterEach((): void => {
    jest.resetAllMocks()
    jest.resetModules()
  })

  test('PostConsents', ({ given, when, then }): void => {
    given('Inbound API server', async (): Promise<void> => {
      // do nothing
    })

    when("I receive a 'PostConsents' request", async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
      const payload: tpAPI.Schemas.ConsentsPostRequestPISP = {
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
      const request = {
        method: 'POST',
        url: '/consents',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Accept: 'application/json',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload
      }
      response = await server.inject(request)
      return response
    })

    then("I get a response with a status code of '202'", (): void => {
      expect(response.statusCode).toBe(202)
    })
  })

  test('PutConsentByID Signed', ({ given, when, then }): void => {
    given('Inbound API server', async (): Promise<void> => {
      // do nothing
    })

    when("I receive a 'PutConsentByID' request", async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
      const payload: tpAPI.Schemas.ConsentsIDPutResponseSigned = {
        scopes: [
          {
            address: 'some-id',
            actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
          }
        ],
        credential: {
          credentialType: 'FIDO',
          status: 'PENDING',
          fidoPayload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON:
                'clientDataJSON-must-not-have-fewer-than-121-' +
                'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
                'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
                'aliqua.',
              attestationObject:
                'attestationObject-must-not-have-fewer-than-' +
                '306-characters Lorem ipsum dolor sit amet, consectetur ' +
                'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
                'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
                'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
                'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
                'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
            },
            type: 'public-key'
          }
        }
      }
      const request = {
        method: 'PUT',
        url: '/consents/8e34f91d-d078-4077-8263-2c047876fcf6',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Accept: 'application/json',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload
      }
      response = await server.inject(request)
      return response
    })

    then("I get a response with a status code of '202'", (): void => {
      expect(response.statusCode).toBe(202)
    })
  })

  test('PutConsentByID Verified', ({ given, when, then }): void => {
    given('Inbound API server', async (): Promise<void> => {
      // do nothing
    })

    when("I receive a 'PutConsentByID' request", async (): Promise<ServerInjectResponse> => {
      jest.mock('~/shared/kvs')
      jest.mock('~/shared/pub-sub')
      const payload: tpAPI.Schemas.ConsentsIDPutResponseVerified = {
        scopes: [
          {
            address: 'some-id',
            actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
          }
        ],
        credential: {
          credentialType: 'FIDO',
          status: 'VERIFIED',
          fidoPayload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON:
                'clientDataJSON-must-not-have-fewer-than-121-' +
                'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
                'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
                'aliqua.',
              attestationObject:
                'attestationObject-must-not-have-fewer-than-' +
                '306-characters Lorem ipsum dolor sit amet, consectetur ' +
                'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
                'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
                'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
                'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
                'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
            },
            type: 'public-key'
          }
        }
      }
      const request = {
        method: 'PUT',
        url: '/consents/8e34f91d-d078-4077-8263-2c047876fcf6',
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Accept: 'application/json',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        },
        payload
      }
      response = await server.inject(request)
      return response
    })

    then("I get a response with a status code of '200'", (): void => {
      expect(response.statusCode).toBe(200)
    })
  })
})
