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
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { TTKHistory } from '../ttkHistory'

export interface MLTestingToolkitRequest {
  timestamp: string
  method: string
  path: string
  headers: Record<string, unknown>
  body: Record<string, unknown>
}

// helper to lookup ttk history calls
const ttkHistory = new TTKHistory('http://localhost:5050')

describe('DFSP Inbound', (): void => {
  beforeEach(async(): Promise<void> => {
    await ttkHistory.clear()
  })

  describe('Happy Path WEB', (): void => {
    let consentId: string

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'FSPIOP-Source': 'switch',
        Date: 'Thu, 24 Jan 2019 10:23:12 GMT',
        'FSPIOP-Destination': 'dfspA'
      }
    }
    describe('Inbound POST /consentRequests from PISP should create DFSP Linking and start the workflow', (): void => {
      it('should send back PUT /consentRequests/{ID} containing the specified auth channel', async (): Promise<void> => {
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fba should return that the
        consent request is valid and specify WEB as the authentication channel

        "statusCode": 200,
        "body": {
          "isValid": true,
          "data": {
            "authChannels": ["WEB"],
            "authUri": "dfspa.com/authorize?consentRequestId=997c89f4-053c-4283-bfec-45a1a0a28fba"
          }
        }
        */
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fba",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }
          ],
          "authChannels": [
            "WEB",
            "OTP"
          ],
          "callbackUri": "pisp-app://callback.com"
        }

        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Switch should return Accepted code to DFSP
        expect(response.status).toEqual(202)

        // check that the DFSP has sent a PUT /consentRequests/{ID} to the PISP
        const putConsentRequestsToPISP = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba')
        expect(putConsentRequestsToPISP.length).toEqual(1)

        const historyPayload = putConsentRequestsToPISP[0].body as tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
        expect(historyPayload).toEqual({
          "consentRequestId":"997c89f4-053c-4283-bfec-45a1a0a28fba",
          "scopes":[
            {
              "address":"dfspa.username.1234",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address":"dfspa.username.5678",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }],
          "callbackUri":"pisp-app://callback.com",
          "authChannels":["WEB"],
          "authUri":"dfspa.com/authorize?consentRequestId=997c89f4-053c-4283-bfec-45a1a0a28fba"
        })
      })
    })

    describe('Inbound PATCH /consentRequests/{ID} from PISP', (): void => {
      it('should send back POST /consents to PISP', async (): Promise<void> => {
        const patchConsentRequestsPayload = {
          authToken: '123456'
        }
        const patchScenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba`

        const responseToPatchConsentRequests = await axios.patch(patchScenarioUri, patchConsentRequestsPayload, axiosConfig)
        expect(responseToPatchConsentRequests.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the PISP
        const postConsentsToPISP = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(postConsentsToPISP.length).toEqual(1)
        const historyPayload = postConsentsToPISP[0].body as tpAPI.Schemas.ConsentsPostRequestPISP

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: expect.any(String),
            consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fba',
            scopes: expect.any(Array)
          })
        )

        // save consentId for later
        consentId = historyPayload.consentId
      })
    })

    describe('Inbound PUT /consents/{ID} signed credential from PISP', (): void => {
      it('should send back POST /consents to Auth Service', async (): Promise<void> => {
        // the PISP now sends back a PUT /consents/{ID} signed credential request to the DFSP
        const putConsentsIDSignedCredentialPayload = {
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                  "than-121-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer" +
                  "-than-306-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua. Ut enim " +
                  "ad minim veniam, quis nostrud exercitation ullamco " +
                  "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                  "aute irure dolor in reprehenderit in voluptate velit " +
                  "esse cillum dolore eu fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDSignedCredentialPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the auth-service
        const postConsentsToAuthService = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(postConsentsToAuthService.length).toEqual(1)
        const historyPayload = postConsentsToAuthService[0].body as tpAPI.Schemas.ConsentsPostRequestAUTH

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: consentId,
            credential: expect.any(Object),
            scopes: expect.any(Object)
          })
        )
      })
    })

    describe('Inbound PUT /consents/{ID} verified credential from auth-service', (): void => {
      it('should send back PATCH /consents/{ID} to PISP', async (): Promise<void> => {
          // the auth-service now sends back a PUT /consents/{ID} confirming verification
          const putConsentsIDVerifiedCredentialPayload = {
            "scopes": [
              {
                "address": "dfspa.username.1234",
                "actions": [
                  "ACCOUNTS_TRANSFER",
                  "ACCOUNTS_GET_BALANCE"
                ]
              },
              {
                "address": "dfspa.username.5678",
                "actions": [
                  "ACCOUNTS_TRANSFER",
                  "ACCOUNTS_GET_BALANCE"
                ]
              }
            ],
            "credential": {
              "credentialType": "FIDO",
              "status": "VERIFIED",
              "payload": {
                "id": "credential id: identifier of pair of keys, base64 encoded, min length 59",
                "rawId": "raw credential id: identifier of pair of keys, base64 encoded, min length 59",
                "response": {
                  "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                    "than-121-characters Lorem ipsum dolor sit amet, " +
                    "consectetur adipiscing elit, sed do eiusmod tempor " +
                    "incididunt ut labore et dolore magna aliqua.",
                  "attestationObject": "attestationObject-must-not-have-fewer" +
                    "-than-306-characters Lorem ipsum dolor sit amet, " +
                    "consectetur adipiscing elit, sed do eiusmod tempor " +
                    "incididunt ut labore et dolore magna aliqua. Ut enim " +
                    "ad minim veniam, quis nostrud exercitation ullamco " +
                    "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                    "aute irure dolor in reprehenderit in voluptate velit " +
                    "esse cillum dolore eu fugiat nulla pariatur."
                },
                "type": "public-key"
              }
            }
          }

          const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
          const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDVerifiedCredentialPayload, axiosConfig)
          expect(responseToPutConsents.status).toEqual(200)

        // check that the DFSP has sent a PATCH /consents/{ID} to the PISP
        const patchConsentsToAuthService = await ttkHistory.getAndFilterWithRetries(2, 'patch', `/consents/${consentId}`)
        expect(patchConsentsToAuthService.length).toEqual(1)
        const historyPayload = patchConsentsToAuthService[0].body as tpAPI.Schemas.ConsentsIDPatchResponseVerified

        expect(historyPayload).toEqual(
          expect.objectContaining({
            credential: {
              status: "VERIFIED"
            }
          })
        )
      })
    })
  })

  describe('Happy Path OTP', (): void => {
    let consentId: string

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'FSPIOP-Source': 'switch',
        Date: 'Thu, 24 Jan 2019 10:23:12 GMT',
        'FSPIOP-Destination': 'dfspA'
      }
    }
    describe('Inbound POST /consentRequests from PISP should create DFSP Linking and start the workflow', (): void => {
      it('should send back PUT /consentRequests/{ID} containing the specified auth channel', async (): Promise<void> => {
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fbb should return that the
        consent request is valid and specify OTP as the authentication channel

        "statusCode": 200,
        "body": {
          "isValid": true,
          "data": {
            "authChannels": ["OTP"]
          }
        }
        */
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fbb",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }
          ],
          "authChannels": [
            "WEB",
            "OTP"
          ],
          "callbackUri": "pisp-app://callback.com"
        }

        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Switch should return Accepted code to DFSP
        expect(response.status).toEqual(202)

        // check that the DFSP has sent a PUT /consentRequests/{ID} to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbb')
        expect(history.length).toEqual(1)

        const historyPayload = history[0].body as tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
        expect(historyPayload).toEqual({
          "consentRequestId":"997c89f4-053c-4283-bfec-45a1a0a28fbb",
          "scopes":[
            {
              "address":"dfspa.username.1234",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address":"dfspa.username.5678",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }],
          "callbackUri":"pisp-app://callback.com",
          "authChannels":["OTP"]
        })
      })
    })

    describe('Inbound PATCH /consentRequests/{ID} from PISP', (): void => {
      it('should send back POST /consents to PISP', async (): Promise<void> => {
        const patchConsentRequestsPayload = {
          authToken: '123456'
        }
        const patchScenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbb`

        const responseToPatchConsentRequests = await axios.patch(patchScenarioUri, patchConsentRequestsPayload, axiosConfig)
        expect(responseToPatchConsentRequests.status).toEqual(202)


        // check that the DFSP has sent a POST /consents to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsPostRequestPISP

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: expect.any(String),
            consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fbb',
            scopes: expect.any(Array)
          })
        )

        // save consentId for later
        consentId = historyPayload.consentId
      })
    })

    describe('Inbound PUT /consents/{ID} signed credential from PISP', (): void => {
      it('should send back POST /consents to Auth Service', async (): Promise<void> => {
        // the PISP now sends back a PUT /consents/{ID} signed credential request to the DFSP
        const putConsentsIDSignedCredentialPayload = {
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                  "than-121-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer" +
                  "-than-306-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua. Ut enim " +
                  "ad minim veniam, quis nostrud exercitation ullamco " +
                  "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                  "aute irure dolor in reprehenderit in voluptate velit " +
                  "esse cillum dolore eu fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDSignedCredentialPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the auth-service
        const history = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsPostRequestAUTH

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: consentId,
            credential: expect.any(Object),
            scopes: expect.any(Object)
          })
        )
      })
    })

    describe('Inbound PUT /consents/{ID} verified credential from auth-service', (): void => {
      it('should send back PATCH /consents/{ID} to PISP', async (): Promise<void> => {
        // the auth-service now sends back a PUT /consents/{ID} confirming verification
        const putConsentsIDVerifiedCredentialPayload = {
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }
          ],
          "credential": {
            "credentialType": "FIDO",
            "status": "VERIFIED",
            "payload": {
              "id": "credential id: identifier of pair of keys, base64 encoded, min length 59",
              "rawId": "raw credential id: identifier of pair of keys, base64 encoded, min length 59",
              "response": {
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                  "than-121-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer" +
                  "-than-306-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua. Ut enim " +
                  "ad minim veniam, quis nostrud exercitation ullamco " +
                  "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                  "aute irure dolor in reprehenderit in voluptate velit " +
                  "esse cillum dolore eu fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDVerifiedCredentialPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(200)

        // check that the DFSP has sent a PATCH /consents/{ID} to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'patch', '/consents/' + consentId)
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsIDPatchResponseVerified

        expect(historyPayload).toEqual(
          expect.objectContaining({
            credential: {
              status: "VERIFIED"
            }
          })
        )
      })
    })
  })

  describe('DFSP dfspBackendRequests.validateConsentRequests returns a HTTP error', (): void => {
    describe('POST /consentRequests should create DFSP Linking and start the workflow', (): void => {
      it('should send a PUT /consentRequests/{ID}/error to PISP', async (): Promise<void> => {
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fbc should return that the
        consent request is not valid and pass on
        {
          "statusCode": 400,
          "errorData": {
            "res": {
              "body": {
                "statusCode": "400",
                "message": "Bad Request"
              }
            }
          }
        }
        */
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fbc",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbc/error')
        expect(history.length).toEqual(1)
        expect(history[0].body.errorInformation).toEqual({
          errorCode: '7200',
          errorDescription:  'Generic Thirdparty account linking error'
        })
      })
    })
  })

  describe('DFSP dfspBackendRequests.validateConsentRequests returns sucessfully but does not pass DFSP validation', (): void => {
    describe('POST /consentRequests should create DFSP Linking and start the workflow', (): void => {
      it('should send a PUT /consentRequests/{ID}/error to PISP', async (): Promise<void> => {
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fbd should return that the
        consent request is not valid and pass on

        "statusCode": 200,
        "body": {
          "isValid": false,
          "errorInformation": {
            "errorCode": "400",
            "errorDescription": "Any description the DFSP wants"
          }
        }
        */
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fbd",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbd/error')
        expect(history.length).toEqual(1)
        expect(history[0].body.errorInformation).toEqual({
          errorCode: '7209',
          errorDescription:  'FSP does not find scopes suitable'
        })
      })
    })
  })

  describe('DFSP dfspBackendRequests.storeConsentRequests returns a HTTP error', (): void => {
    describe('Inbound POST /consentRequests from PISP should create DFSP Linking and start the workflow', (): void => {
      it('should send a PUT /consentRequests/{ID}/error to PISP', async (): Promise<void> => {
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fbe should return that the
        consent request is not valid and pass on
        {
          "statusCode": 500,
          "errorData": {
            "res": {
              "body": {
                "statusCode": "500",
                "message": "Internal Server Error"
              }
            }
          }
        }
        */
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fbe",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbe/error')
        expect(history.length).toEqual(1)
        expect(history[0].body.errorInformation).toEqual({
          errorCode: '7200',
          errorDescription:  'Generic Thirdparty account linking error'
        })
      })
    })
  })

  describe('DFSP dfspBackendRequests.sendOTP returns a HTTP error', (): void => {
    describe('Inbound POST /consentRequests from PISP should create DFSP Linking and start the workflow', (): void => {
      it('should send a PUT /consentRequests/{ID}/error to PISP', async (): Promise<void> => {
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fbf should return that the
        consent request is not valid and pass on
        {
          "statusCode": 500,
          "errorData": {
            "res": {
              "body": {
                "statusCode": "500",
                "message": "Internal Server Error"
              }
            }
          }
        }
        */
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fbf",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbf/error')
        expect(history.length).toEqual(1)
        expect(history[0].body.errorInformation).toEqual({
          errorCode: '7200',
          errorDescription:  'Generic Thirdparty account linking error'
        })
      })
    })
  })

  describe('DFSP dfspBackendRequests.storeValidatedConsentForAccountId returns a HTTP error', (): void => {
    let consentId: string

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'FSPIOP-Source': 'switch',
        Date: 'Thu, 24 Jan 2019 10:23:12 GMT',
        'FSPIOP-Destination': 'dfspA'
      }
    }
    describe('Inbound POST /consentRequests from PISP should create DFSP Linking and start the workflow', (): void => {
      it('should send back PUT /consentRequests/{ID} containing the specified auth channel', async (): Promise<void> => {
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fba should return that the
        consent request is valid and specify WEB as the authentication channel

        "statusCode": 200,
        "body": {
          "isValid": true,
          "data": {
            "authChannels": ["WEB"],
            "authUri": "dfspa.com/authorize?consentRequestId=997c89f4-053c-4283-bfec-45a1a0a28fba"
          }
        }
        */
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fba",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.12345",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }
          ],
          "authChannels": [
            "WEB",
            "OTP"
          ],
          "callbackUri": "pisp-app://callback.com"
        }

        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Switch should return Accepted code to DFSP
        expect(response.status).toEqual(202)

        // check that the DFSP has sent a PUT /consentRequests/{ID} to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba')
        expect(history.length).toEqual(1)

        const historyPayload = history[0].body as tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
        expect(historyPayload).toEqual({
          "consentRequestId":"997c89f4-053c-4283-bfec-45a1a0a28fba",
          "scopes":[
            {
              "address":"dfspa.username.12345",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address":"dfspa.username.5678",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }],
          "callbackUri":"pisp-app://callback.com",
          "authChannels":["WEB"],
          "authUri":"dfspa.com/authorize?consentRequestId=997c89f4-053c-4283-bfec-45a1a0a28fba"
        })
      })
    })

    describe('Inbound PATCH /consentRequests/{ID} from PISP', (): void => {
      it('should send back POST /consents to PISP', async (): Promise<void> => {
        const patchConsentRequestsPayload = {
          authToken: '123456'
        }
        const patchScenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba`

        const responseToPatchConsentRequests = await axios.patch(patchScenarioUri, patchConsentRequestsPayload, axiosConfig)
        expect(responseToPatchConsentRequests.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsPostRequestPISP

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: expect.any(String),
            consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fba',
            scopes: expect.any(Array)
          })
        )

        // save consentId for later
        consentId = historyPayload.consentId
      })
    })

    describe('Inbound PUT /consents/{ID} signed credential from PISP', (): void => {
      it('should send back POST /consents to Auth Service', async (): Promise<void> => {
        // the PISP now sends back a PUT /consents/{ID} signed credential request to the DFSP
        const putConsentsIDSignedCredentialPayload = {
          "scopes": [
            {
              "address": "dfspa.username.12345",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                  "than-121-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer" +
                  "-than-306-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua. Ut enim " +
                  "ad minim veniam, quis nostrud exercitation ullamco " +
                  "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                  "aute irure dolor in reprehenderit in voluptate velit " +
                  "esse cillum dolore eu fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDSignedCredentialPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the auth-service
        const history = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsPostRequestAUTH

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: consentId,
            credential: expect.any(Object),
            scopes: expect.any(Object)
          })
        )
      })
    })

    describe('Inbound PUT /consents/{ID} verified credential from auth-service', (): void => {
      it('should send back PATCH /consents/{ID} to PISP', async (): Promise<void> => {
        // the auth-service now sends back a PUT /consents/{ID} confirming verification
        const putConsentsIDVerifiedCredentialPayload = {
          "scopes": [
            {
              "address": "dfspa.username.12345",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }
          ],
          "credential": {
            "credentialType": "FIDO",
            "status": "VERIFIED",
            "payload": {
              "id": "credential id: identifier of pair of keys, base64 encoded, min length 59",
              "rawId": "raw credential id: identifier of pair of keys, base64 encoded, min length 59",
              "response": {
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                  "than-121-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer" +
                  "-than-306-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua. Ut enim " +
                  "ad minim veniam, quis nostrud exercitation ullamco " +
                  "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                  "aute irure dolor in reprehenderit in voluptate velit " +
                  "esse cillum dolore eu fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDVerifiedCredentialPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(200)

        // check that the DFSP has sent a PUT /consents/{ID}/error to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', `/consents/${consentId}/error`)
        expect(history.length).toEqual(1)
        expect(history.length).toEqual(1)
        expect(history[0].body.errorInformation).toEqual({
          errorCode: '7200',
          errorDescription:  'Generic Thirdparty account linking error'
        })
      })
    })
  })

  describe('DFSP recieves error from auth-service after sending it PISP PENDING credential', (): void => {
    let consentId: string

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'FSPIOP-Source': 'switch',
        Date: 'Thu, 24 Jan 2019 10:23:12 GMT',
        'FSPIOP-Destination': 'dfspA'
      }
    }
    describe('Inbound POST /consentRequests from PISP should create DFSP Linking and start the workflow', (): void => {
      it('should send back PUT /consentRequests/{ID} containing the specified auth channel', async (): Promise<void> => {
        const scenarioUri = `${env.inbound.baseUri}/consentRequests`
        /*
        the `consentRequestId` is the variable that changes the course of
        the flow. the rules can be found in ./docker/dfsp_rules.json
        997c89f4-053c-4283-bfec-45a1a0a28fbb should return that the
        consent request is valid and specify OTP as the authentication channel

        "statusCode": 200,
        "body": {
          "isValid": true,
          "data": {
            "authChannels": ["OTP"]
          }
        }
        */
        const payload = {
          "consentRequestId": "997c89f4-053c-4283-bfec-45a1a0a28fbb",
          "userId": "dfspa.username",
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }
          ],
          "authChannels": [
            "WEB",
            "OTP"
          ],
          "callbackUri": "pisp-app://callback.com"
        }

        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Switch should return Accepted code to DFSP
        expect(response.status).toEqual(202)

        // check that the DFSP has sent a PUT /consentRequests/{ID} to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', '/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbb')
        expect(history.length).toEqual(1)

        const historyPayload = history[0].body as tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
        expect(historyPayload).toEqual({
          "consentRequestId":"997c89f4-053c-4283-bfec-45a1a0a28fbb",
          "scopes":[
            {
              "address":"dfspa.username.1234",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address":"dfspa.username.5678",
              "actions":[
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            }],
          "callbackUri":"pisp-app://callback.com",
          "authChannels":["OTP"]
        })
      })
    })

    describe('Inbound PATCH /consentRequests/{ID} from PISP', (): void => {
      it('should send back POST /consents to PISP', async (): Promise<void> => {
        const patchConsentRequestsPayload = {
          authToken: '123456'
        }
        const patchScenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbb`

        const responseToPatchConsentRequests = await axios.patch(patchScenarioUri, patchConsentRequestsPayload, axiosConfig)
        expect(responseToPatchConsentRequests.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsPostRequestPISP

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: expect.any(String),
            consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fbb',
            scopes: expect.any(Array)
          })
        )

        // save consentId for later
        consentId = historyPayload.consentId
      })
    })

    describe('Inbound PUT /consents/{ID} signed credential from PISP', (): void => {
      it('should send back POST /consents to Auth Service', async (): Promise<void> => {
        // the PISP now sends back a PUT /consents/{ID} signed credential request to the DFSP
        const putConsentsIDSignedCredentialPayload = {
          "scopes": [
            {
              "address": "dfspa.username.1234",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
              ]
            },
            {
              "address": "dfspa.username.5678",
              "actions": [
                "ACCOUNTS_TRANSFER",
                "ACCOUNTS_GET_BALANCE"
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
                "clientDataJSON": "clientDataJSON-must-not-have-fewer-" +
                  "than-121-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua.",
                "attestationObject": "attestationObject-must-not-have-fewer" +
                  "-than-306-characters Lorem ipsum dolor sit amet, " +
                  "consectetur adipiscing elit, sed do eiusmod tempor " +
                  "incididunt ut labore et dolore magna aliqua. Ut enim " +
                  "ad minim veniam, quis nostrud exercitation ullamco " +
                  "laboris nisi ut aliquip ex ea commodo consequat. Duis " +
                  "aute irure dolor in reprehenderit in voluptate velit " +
                  "esse cillum dolore eu fugiat nulla pariatur."
              },
              "type": "public-key"
            }
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDSignedCredentialPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(202)

        // check that the DFSP has sent a POST /consents to the auth-service
        const history = await ttkHistory.getAndFilterWithRetries(2, 'post', '/consents')
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ConsentsPostRequestAUTH

        expect(historyPayload).toEqual(
          expect.objectContaining({
            consentId: consentId,
            credential: expect.any(Object),
            scopes: expect.any(Object)
          })
        )
      })
    })

    describe('Inbound PUT /consents/{ID}/error from auth-service', (): void => {
      it('should send back PUT /consents/{ID}/error to PISP', async (): Promise<void> => {
        // the auth-service now sends back a PUT /consents/{ID} confirming verification
        const putConsentsIDErrorPayload = {
          errorInformation: {
            errorCode: "7213",
            errorDescription: "Consent is invalid"
          }
        }

        const putScenarioUri = `${env.inbound.baseUri}/consents/${consentId}/error`
        const responseToPutConsents = await axios.put(putScenarioUri, putConsentsIDErrorPayload, axiosConfig)
        expect(responseToPutConsents.status).toEqual(200)

        // check that the DFSP has sent a PUT /consents/{ID}/error to the PISP
        const history = await ttkHistory.getAndFilterWithRetries(2, 'put', `/consents/${consentId}/error`)
        expect(history.length).toEqual(1)
        const historyPayload = history[0].body as tpAPI.Schemas.ErrorInformation

        expect(historyPayload).toEqual(
          {
            errorInformation: {
              errorCode: "7213",
              errorDescription: "Consent is invalid"
            }
          }
        )
      })
    })
  })
})

