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

 - Paweł Marzec <pawel.marzec@modusbox.com>

 --------------
 ******/

import { Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import OutboundAuthorizations from '~/handlers/outbound/authorizations'
import mockLogger from '../mockLogger'

jest.mock('~/models/outbound/authorizations.model', () => ({
  OutboundAuthorizationsModel: {
    notificationChannel: jest.fn(() => 'the-mocked-channel')
  },
  create: jest.fn(async () => ({
    // this result will be tested
    run: jest.fn(async () => undefined)
  }))
}))

describe('Outbound authorizations handlers', () => {
  const toolkit = {
    getKVS: jest.fn(),
    getSubscriber: jest.fn(),
    getLogger: jest.fn(() => mockLogger()),
    getThirdpartyRequests: jest.fn(),
    response: jest.fn(() => ({
      code: jest.fn((code: number) => ({
        statusCode: code
      }))
    }))
  }
  it('should report error when result from \'run\' is undefined', async () => {
    const postRequest = {
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
    const request = {
      method: 'POST',
      url: '/authorizations',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: postRequest
    }

    const result = await OutboundAuthorizations.post(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })
})
