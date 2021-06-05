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

 * Kevin Leyow<kevin.leyow@modusbox.com>
 --------------
 ******/
import axios from 'axios'
import env from '../env'
import { v5 as uuidv5 } from 'uuid';

//const mockData = JSON.parse(JSON.stringify(TestData))

describe('DFSP Inbound', (): void => {
  const ttkPollIncomingRequestsUri = `http://127.0.0.1:5050/longpolling/requests`
  const ttkPollCallbackRequestsUri = `http://127.0.0.1:5050/longpolling/callbacks`
  // these must be run in sequence since am inbound POST /consentRequests
  // initializes a recurringly used DFSPLinkingModel object.
  describe('POST /consentRequests should create DFSP Linking and start the workflow', (): void => {
    it('should send a PUT /consentRequests/{ID} to PISP(Testing Toolkit Switch) containing specified auth channel', async (): Promise<void> => {
      const scenarioUri = `${env.inbound.baseUri}/consentRequests`

      const payload = {
        "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fba",
        "userId": "dfspa.username",
        "scopes": [
          {
            "accountId": "dfspa.username.1234",
            "actions": [
              "accounts.transfer",
              "accounts.getBalance"
            ]
          },
          {
            "accountId": "dfspa.username.5678",
            "actions": [
              "accounts.transfer",
              "accounts.getBalance"
            ]
          }
        ],
        "authChannels": [
          "WEB",
          "OTP"
        ],
        "callbackUri": "pisp-app://callback.com"
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'pispA',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        }
      }

      const response = await axios.post(scenarioUri, payload, axiosConfig)

      // Switch should return Accepted code to DFSP
      expect(response.status).toEqual(202)

      // Switch should receive the PUT /consentRequests/{ID} request from DFSP
      const checkResponse = await axios.get(
        ttkPollIncomingRequestsUri + '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba',
        axiosConfig
      )
      // note: the testing-toolkit seems to be doing something weird where
      // the payload is sometimes in `data.data` and sometimes in `data.body`
      var checkPayload

      if (checkResponse.data.data) {
        checkPayload = checkResponse.data.data
      } else {
        checkPayload = checkResponse.data.body
      }

      expect(checkPayload).toEqual({
        "consentRequestId":"997c89f4-053c-4283-bfec-45a1a0a28fba",
        "scopes":[
          {
            "accountId":"dfspa.username.1234",
            "actions":[
              "accounts.transfer",
              "accounts.getBalance"
            ]
          },
          {
            "accountId":"dfspa.username.5678",
            "actions":[
              "accounts.transfer",
              "accounts.getBalance"
            ]
          }],
        "callbackUri":"pisp-app://callback.com",
        "authChannels":["WEB"],
        "authUri":"dfspa.com/authorize?consentRequestId=997c89f4-053c-4283-bfec-45a1a0a28fba"
      })
    })
  })

  describe('PATCH /consentRequests/{ID}', (): void => {
    describe('Inbound API', (): void => {
      const payload = {
        authToken: '123456'
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:23:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        }
      }

      it('should pass the authToken from the PISP to the DFSP Linking Model on PATCH /consentRequests/{ID}', async (): Promise<void> => {
        const scenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba`

        const response = await axios.patch(scenarioUri, payload, axiosConfig)

        expect(response.status).toEqual(202)

        // will derive in to ed94658b-31d7-5ed3-8ee1-d8dfbf0b1949
        const consentId = uuidv5(
          'consentId',
          '997c89f4-053c-4283-bfec-45a1a0a28fba'
        )
        // we can't check the POST /consents request to the TTK that the DFSP
        // would send back since the TTK doesn't support longpolling POST requests.

        // so we will check for a callback for the expected PUT /consent/{ID}
        // that a PISP(TTK) would send in response to the POST /consents
        const checkCallback = await axios.get(
          ttkPollCallbackRequestsUri + `/consents/${consentId}`,
          axiosConfig
        )
        // note: the testing-toolkit seems to be doing something weird where
        // the payload is sometimes in `data.data` and sometimes in `data.body`
        var checkCallbackPayload

        if (checkCallback.data.data) {
          checkCallbackPayload = checkCallback.data.data
        } else {
          checkCallbackPayload = checkCallback.data.body
        }

        expect(checkCallbackPayload).toEqual({
          "scopes": [
            {
              "accountId": "dfspa.username.1234",
              "actions": [
                "accounts.transfer",
                "accounts.getBalance"
              ]
            },
            {
              "accountId": "dfspa.username.5678",
              "actions": [
                "accounts.transfer",
                "accounts.getBalance"
              ]
            }
          ],
          "credential": {
            "credentialType": "FIDO",
            "status": "PENDING",
            "payload": {
              "id": "credential id: identifier of pair of keys, base64 encoded, min length 59",
              "rawId": "raw credential id: identifier of pair of keys, base64 encoded, min length 59",
              "response": {
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-than-" +
                  "121-characters Lorem ipsum dolor sit amet, consectetur " +
                  "adipiscing elit, sed do eiusmod tempor incididunt ut labore " +
                  "et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer-" +
                  "than-306-characters Lorem ipsum dolor sit amet, consectetur " +
                  "adipiscing elit, sed do eiusmod tempor incididunt ut labore " +
                  "et dolore magna aliqua. Ut enim ad minim veniam, quis " +
                  "nostrud exercitation ullamco laboris nisi ut aliquip ex " +
                  "ea commodo consequat. Duis aute irure dolor in " +
                  "reprehenderit in voluptate velit esse cillum dolore eu " +
                  "fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        })

        // the DFSP at this point would have sent a POST /consents to the
        // auth-service. the TTK will send back a PUT /consents/{ID}
        // simulating an auth-service and a PUT /participant/CONSENT/{ID}
        // simulating the ALS.
        // these requests are a TTK script and can't be polled

        // at this point on the happy path the DFSP will send a
        // PATCH /consents/{ID} to the PISP. it's existence means the previous
        // happy path calls were successful

        // polling http://127.0.0.1:5050/longpolling/requests/consents/ed94658b-31d7-5ed3-8ee1-d8dfbf0b1949
        // does not seem to return the passed PATCH request
      })
    })
  })
})

