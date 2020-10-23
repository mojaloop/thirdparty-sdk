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

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>

 --------------
 ******/

import PTM from '~/models/pispTransaction.model'
import { Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import ThirdpartyTransactionPartyLookup from '~/handlers/outbound/thirdpartyTransaction/partyLookup'
import ThirdpartyTransactionInitiate from '~/handlers/outbound/thirdpartyTransaction/{ID}/initiate'
import ThirdpartyTransactionApprove from '~/handlers/outbound/thirdpartyTransaction/{ID}/approve'
import mockLogger from '../mockLogger'

jest.mock('~/models/pispTransaction.model', () => ({
  PISPTransactionModel: {
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

describe('Outbound PISP transaction handlers', () => {
  const toolkit = {
    getKVS: jest.fn(),
    getPubSub: jest.fn(),
    getLogger: jest.fn(() => mockLogger()),
    getThirdpartyRequests: jest.fn(),
    getMojaloopRequests: jest.fn(),
    getBackendRequests: jest.fn(),
    response: jest.fn(() => ({
      code: jest.fn((code: number) => ({
        statusCode: code
      }))
    }))
  }
  const initiateRequest = {
    sourceAccountId: 'dfspa.alice.1234',
    consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
    payee: {
      partyIdInfo: {
        partyIdType: 'MSISDN',
        partyIdentifier: '+44 1234 5678',
        fspId: 'dfspb'
      }
    },
    payer: {
      personalInfo: {
        complexName: {
          firstName: 'Alice',
          lastName: 'K'
        }
      },
      partyIdInfo: {
        partyIdType: 'MSISDN',
        partyIdentifier: '+44 8765 4321',
        fspId: 'dfspa'
      }
    },
    amountType: 'SEND',
    amount: {
      amount: '100',
      currency: 'USD'
    },
    transactionType: {
      scenario: 'TRANSFER',
      initiator: 'PAYER',
      initiatorType: 'CONSUMER'
    },
    expiration: '2020-07-15T22:17:28.985-01:00'
  }
  const approveRequest = {
    authorizationResponse: {
      authenticationInfo: {
        authentication: 'U2F',
        authenticationValue: {
          pinValue: 'xxxxxxxxxxx',
          counter: '1'
        }
      },
      responseType: 'ENTERED'
    }
  }
  it('/thirdpartyTransaction/partyLookup should report error when result from \'run\' is undefined', async () => {
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/partyLookup',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        payee: {
          partyIdType: 'MSISDN',
          partyIdentifier: '564533335'
        },
        transactionRequestId: 'n51ec534-se48-4575-b6a9-ead2955b8065'
      }
    }

    const result = await ThirdpartyTransactionPartyLookup.post(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })

  it('/thirdpartyTransaction/partyLookup should be guarded', async () => {
    jest.spyOn(PTM, 'existsInKVS').mockImplementationOnce(() => Promise.resolve(true))
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/partyLookup',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: {
        payee: {
          partyIdType: 'MSISDN',
          partyIdentifier: '564533335'
        },
        transactionRequestId: 'n51ec534-se48-4575-b6a9-ead2955b8065'
      }
    }

    const result = await ThirdpartyTransactionPartyLookup.post(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(422)
  })

  it('/thirdpartyTransaction/{ID}/initiate should report error when result from \'run\' is undefined', async () => {
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/{ID}/initiate',
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        ID: 'q51ec534-se48-8575-b6a9-ead2955b8067'
      },
      payload: initiateRequest
    }

    const result = await ThirdpartyTransactionInitiate.post(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })
  it('/thirdpartyTransaction/{ID}/approve should report error when result from \'run\' is undefined', async () => {
    const request = {
      method: 'POST',
      url: '/thirdpartyTransaction/{ID}/approve',
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        ID: 'r51ec534-se48-8575-b6a9-ead2955b8067'
      },
      payload: approveRequest
    }

    const result = await ThirdpartyTransactionApprove.post(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })
})
