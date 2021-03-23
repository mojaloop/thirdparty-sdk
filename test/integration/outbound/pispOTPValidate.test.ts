import axios from 'axios'
import env from '../env'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Config from '~/shared/config'
import mockLogger from '../../unit/mockLogger'
import { A2SModelState } from '../../../src/models/a2s.model';

describe('PISP OTP Validate', (): void => {
  const config: RedisConnectionConfig = {
    host: Config.REDIS.HOST,
    port: Config.REDIS.PORT,
    logger: mockLogger(),
    timeout: Config.REDIS.TIMEOUT
  }
  let kvs: KVS
  const consentRequestsRequestId = 'ab049ac1-b936-4327-ab76-3e66e608beb8'
  const consentRequestsRequestIdError = 'cd049ac1-b936-4327-ab76-3e66e608beb8'
  const consentRequestsURI = `${env.outbound.baseUri}/consentRequests/${consentRequestsRequestId}/validate`
  const consentRequestsURIError = `${env.outbound.baseUri}/consentRequests/${consentRequestsRequestIdError}/validate`

  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  describe('/consentRequests/{ID}/validate: requestAction->succeeded', (): void => {
    it('OTPValidateState should be COMPLETED', async (): Promise<void> => {
      const consentRequestsRequest = {
        toParticipantId: 'dfspa',
        authToken: '123456'
      }
      const expectedResponse = {
        "consentId": "8e34f91d-d078-4077-8263-2c047876fcf6",
        "consentRequestId": "ab049ac1-b936-4327-ab76-3e66e608beb8",
        "scopes": [{
            "accountId": "some-id",
            "actions": [
              "accounts.getBalance",
              "accounts.transfer"
            ]
          }
        ]
      }
      const consentRequestsResponse = await axios.patch(consentRequestsURI, consentRequestsRequest)
      expect(consentRequestsResponse.status).toEqual(200)
      expect(consentRequestsResponse.data.currentState).toEqual(A2SModelState.succeeded)
      expect(consentRequestsResponse.data.consent).toEqual(expectedResponse)
    })
  })

  describe('/consentRequests/{ID}/validate: requestAction->succeeded error return', (): void => {
    it('OTPValidateState should be COMPLETED', async (): Promise<void> => {
      const consentRequestsRequest = {
        toParticipantId: 'dfspa',
        authToken: '123456'
      }
      const expectedResponse = {
        "errorCode": "6000",
        "errorDescription": "Generic thirdparty error"
      }
      await axios.patch(consentRequestsURIError, consentRequestsRequest)
        .catch(error => {
          expect(error.response.status).toEqual(500)
          expect(error.response.data.currentState).toEqual(A2SModelState.succeeded)
          expect(error.response.data.errorInformation).toEqual(expectedResponse)
        })
    })
  })
})
