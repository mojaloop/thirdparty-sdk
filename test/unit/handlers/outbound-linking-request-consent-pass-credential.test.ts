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

import { Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import ConsentRequestsIDPassCredential from '~/handlers/outbound/linking/request-consent/{ID}/pass-credential'
import mockLogger from '../mockLogger'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

jest.mock('~/models/outbound/pispLinking.model', () => ({
  PISPLinkingModel: {
    notificationChannel: jest.fn(() => 'the-mocked-channel')
  },
  create: jest.fn(async () => ({
    // this result will be tested
    run: jest.fn(async () => undefined)
  })),
  loadFromKVS: jest.fn(() => ({
    data: jest.fn(),
    run: jest.fn(async () => undefined)
  })),
  existsInKVS: jest.fn(() => Promise.resolve(false))
}))

describe('Outbound linking request consent ID authenticate handlers', () => {
  const toolkit = {
    getKVS: jest.fn(),
    getSubscriber: jest.fn(),
    getLogger: jest.fn(() => mockLogger()),
    getThirdpartyRequests: jest.fn(() => ({
      putConsents: jest.fn()
    })),
    response: jest.fn(() => ({
      code: jest.fn((code: number) => ({
        statusCode: code
      }))
    }))
  }
  const passCredentialRequest = {
    credential: {
      payload: {
        id: 'some-credential-id',
        response: {
          clientDataJSON: 'client-data'
        }
      }
    }
  }

  it("/linking/request-consent/{ID}/pass-credential should report error when result from 'run' is undefined", async () => {
    const request = {
      method: 'POST',
      url: '/linking/request-consent/{ID}/pass-credential',
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        ID: 'r51ec534-se48-8575-b6a9-ead2955b8067'
      },
      payload: passCredentialRequest
    }

    const result = await ConsentRequestsIDPassCredential.post(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })
})
