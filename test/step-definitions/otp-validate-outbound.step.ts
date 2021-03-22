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

 - Kevin Leyow <kevin.leyow@modusbox.com>

 --------------
 ******/

import { Handlers, ServerAPI, ServerConfig } from '~/server'
import { Server, ServerInjectResponse } from '@hapi/hapi'
import { defineFeature, loadFeature } from 'jest-cucumber'
import { NotificationCallback, Message, PubSub } from '~/shared/pub-sub'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import Config from '~/shared/config'
import index from '~/index'
import path from 'path'
import { A2SModelState } from '../../src/models/a2s.model';

const apiPath = path.resolve(__dirname, '../../src/interface/api-outbound.yaml')
const featurePath = path.resolve(__dirname, '../features/otp-validate-outbound.feature')
const feature = loadFeature(featurePath)

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

  afterEach((done): void => {
    server.events.on('stop', done)
    server.stop()
  })

  test('OutboundConsentRequestsValidatePatch', ({ given, when, then }): void => {
    const patchConsentRequestsIDPatchRequest: tpAPI.Schemas.ConsentRequestsIDPatchRequest = {
      authToken: '123456'
    }

    const postConsentsIDPatchResponse: tpAPI.Schemas.ConsentsPostRequest = {
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

    given('Outbound API server', async (): Promise<void> => {
      server = await prepareOutboundAPIServer()
    })

    when('I send a \'OutboundConsentRequestsValidatePatch\' request', async (): Promise<ServerInjectResponse> => {
      const request = {
        method: 'PATCH',
        url: '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba/validate',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          toParticipantId: 'dfspA',
          ...patchConsentRequestsIDPatchRequest
        }
      }
      const pubSub = new PubSub({} as RedisConnectionConfig)
      // defer publication to notification channel
      const channel = `OTPValidate-997c89f4-053c-4283-bfec-45a1a0a28fba`
      setTimeout(() => pubSub.publish(
        channel,
        postConsentsIDPatchResponse as unknown as Message
      ), 10)
      response = await server.inject(request)
      return response
    })

    then('I get a response with a status code of \'200\'', (): void => {
      expect(response.statusCode).toBe(200)
      expect(response.result).toEqual({
        consent: {
          ...postConsentsIDPatchResponse
        },
        currentState: A2SModelState.succeeded
      })
    })
  })
})
