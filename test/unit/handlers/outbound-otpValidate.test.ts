import { Request } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import ConsentRequestsIDValidate from '~/handlers/outbound/consentRequests/{ID}/validate'
import mockLogger from '../mockLogger'
//import { JobInitiator, JobListener } from '../../../src/shared/deferred-job';


// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

jest.mock('~/models/a2s.model', () => ({
  create: jest.fn(async () => ({
    run: jest.fn(async () => undefined)
  }))
}))

describe('Outbound Consent request otp validate handlers', () => {
  const toolkit = {
    getKVS: jest.fn(),
    getPubSub: jest.fn(),
    getLogger: jest.fn(() => mockLogger()),
    getThirdpartyRequests: jest.fn(() => ({
      patchConsentRequests: jest.fn()
    })),
    getMojaloopRequests: jest.fn(),
    getSDKOutgoingRequests: jest.fn(),
    response: jest.fn(() => ({
      code: jest.fn((code: number) => ({
        statusCode: code
      }))
    }))
  }
  const validateRequest = {
    'authToken': '123456',
    'toParticipantId': 'dfspa'
  }

  it('/consentRequests/{ID}/validate should report error when result from \'run\' is undefined', async () => {
    const request = {
      method: 'PATCH',
      url: '/consentRequests/{ID}/validate',
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        ID: 'r51ec534-se48-8575-b6a9-ead2955b8067'
      },
      payload: validateRequest
    }

    const result = await ConsentRequestsIDValidate.patch(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(500)
  })
})
