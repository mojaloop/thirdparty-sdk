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

 - Kevin Leyow - kevin.leyow@modusbox.com
 --------------
 ******/
import axios from 'axios'
import env from '../env'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Config from '~/shared/config'
import mockLogger from '../../unit/mockLogger'
import { PISPOTPValidateModelState } from '~/models/outbound/pispOTPValidate.interface';
import { uuid } from 'uuidv4'

describe('PISP OTP Validate', (): void => {
  const config: RedisConnectionConfig = {
    host: Config.REDIS.HOST,
    port: Config.REDIS.PORT,
    logger: mockLogger(),
    timeout: Config.REDIS.TIMEOUT
  }
  let kvs: KVS
  const consentRequestsRequestId = uuid()
  const consentRequestsURI = `${env.outbound.baseUri}/consentRequests/${consentRequestsRequestId}/validate`

  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  describe('/consentRequests/{ID}/validate: requestAction->OTPIsValid', (): void => {
    it('OTPValidateState should be OTPIsValid', async (): Promise<void> => {
      // ttk uses an authToken of 123456 to return a valid response
      const consentRequestsRequest = {
        toParticipantId: 'dfspa',
        authToken: '123456'
      }
      const expectedResponse = {
        "consentId": "8e34f91d-d078-4077-8263-2c047876fcf6",
        "consentRequestId": consentRequestsRequestId,
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
      expect(consentRequestsResponse.data.currentState).toEqual(PISPOTPValidateModelState.OTPIsValid)
      expect(consentRequestsResponse.data.consent).toEqual(expectedResponse)
    })
  })

  describe('/consentRequests/{ID}/validate: requestAction->errored error return', (): void => {
    // ttk uses an authToken of 654321 to return a invalid response
    it('OTPValidateState should be errored', async (): Promise<void> => {
      const consentRequestsRequest = {
        toParticipantId: 'dfspa',
        authToken: '654321'
      }
      const expectedResponse = {
        "errorCode": "6000",
        "errorDescription": "Generic thirdparty error"
      }
      await axios.patch(consentRequestsURI, consentRequestsRequest)
        .catch(error => {
          expect(error.response.status).toEqual(500)
          expect(error.response.data.currentState).toEqual(PISPOTPValidateModelState.errored)
          expect(error.response.data.errorInformation).toEqual(expectedResponse)
        })
    })
  })
})
