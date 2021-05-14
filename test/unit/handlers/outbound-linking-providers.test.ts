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

import { Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import LinkingProviders from '~/handlers/outbound/linking/providers'
import mockLogger from '../mockLogger'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

jest.mock('~/models/outbound/pispPrelinking.model', () => ({
  PISPPrelinkingModel: {
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

describe('Outbound linking provider handler', () => {
  const toolkit = {
    getKVS: jest.fn(),
    getPubSub: jest.fn(),
    getLogger: jest.fn(() => mockLogger()),
    getThirdpartyRequests: jest.fn(() => ({
      getServices: jest.fn()
    })),
    response: jest.fn(() => ({
      code: jest.fn((code: number) => ({
        statusCode: code
      }))
    }))
  }
  it('/linking/providers should report error when result from \'run\' is undefined', async () => {
    const request = {
      method: 'GET',
      url: '/linking/providers',
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        ServiceType: 'THIRD_PARTY_DFSP'
      }
    }

    const result = await LinkingProviders.get(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })
})
