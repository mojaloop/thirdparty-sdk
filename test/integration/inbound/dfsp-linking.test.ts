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

describe('DFSP Inbound', (): void => {
  const ttkRequestsHistoryUri = `http://127.0.0.1:5050/api/objectStore/requestsHistory`

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

        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Switch should return Accepted code to DFSP
        expect(response.status).toEqual(202)

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a PUT /consentRequests/{ID} to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const putConsentRequestsToPISP = requestsHistory.data['put /consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba'].data.body
        expect(putConsentRequestsToPISP).toEqual({
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

    describe('Inbound PATCH /consentRequests/{ID} from PISP', (): void => {
      it('should send back POST /consents to PISP', async (): Promise<void> => {
        const patchConsentRequestsPayload = {
          authToken: '123456'
        }
        const patchScenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba`

        const responseToPatchConsentRequests = await axios.patch(patchScenarioUri, patchConsentRequestsPayload, axiosConfig)
        expect(responseToPatchConsentRequests.status).toEqual(202)

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a POST /consents to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const postConsentsToPISP = requestsHistory.data['post /consents'].data.body

        // save consentId for later
        consentId = postConsentsToPISP.consentId

        expect(postConsentsToPISP.consentId).toBeDefined()
        expect(postConsentsToPISP.consentRequestId).toBeDefined()
        expect(postConsentsToPISP.scopes).toBeDefined()
      })
    })

    describe('Inbound PUT /consents/{ID} signed credential from PISP', (): void => {
      it('should send back POST /consents to Auth Service', async (): Promise<void> => {
          // the PISP now sends back a PUT /consents/{ID} signed credential request to the DFSP
          const putConsentsIDSignedCredentialPayload = {
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

          await new Promise(resolve => setTimeout(resolve, 50));

          // check that the DFSP has sent a POST /consents to the auth-service
          const requestsHistoryTwo = await axios.get(ttkRequestsHistoryUri, axiosConfig)
          const postConsentsToAuthService = requestsHistoryTwo.data['post /consents'].data.body

          expect(postConsentsToAuthService.consentId).toBeDefined()
          expect(postConsentsToAuthService.credential).toBeDefined()
          expect(postConsentsToAuthService.scopes).toBeDefined()
      })
    })

    describe('Inbound PUT /consents/{ID} verified credential from auth-service and PUT /participants/{Type}/{ID} from ALS', (): void => {
      it('should send back PATCH /consents/{ID} to PISP', async (): Promise<void> => {
          // the auth-service now sends back a PUT /consents/{ID} confirming verification
          const putConsentsIDVerifiedCredentialPayload = {
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

          // the ALS now sends back a PUT /participants/CONSENT/{ID} confirming verification
          const putParticipantsTypeIDPayload = {
            "fspId": "auth-service"
          }

          const putParticipantsScenarioUri = `${env.inbound.baseUri}/participants/CONSENT/${consentId}`
          const responseToPutParticipants = await axios.put(putParticipantsScenarioUri, putParticipantsTypeIDPayload, axiosConfig)
          expect(responseToPutParticipants.status).toEqual(200)

          await new Promise(resolve => setTimeout(resolve, 50));

          // check that the DFSP has sent a PATCH /consents/{ID} to the PISP
          const requestsHistoryTwo = await axios.get(ttkRequestsHistoryUri, axiosConfig)
          const patchConsentsToPISP = requestsHistoryTwo.data[`patch /consents/${consentId}`].data.body

          expect(patchConsentsToPISP.credential).toBeDefined()
          expect(patchConsentsToPISP.credential.status).toEqual('VERIFIED')
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

        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Switch should return Accepted code to DFSP
        expect(response.status).toEqual(202)

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a PUT /consentRequests/{ID} to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const putConsentRequestsToPISP = requestsHistory.data['put /consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbb'].data.body
        expect(putConsentRequestsToPISP).toEqual({
          "consentRequestId":"997c89f4-053c-4283-bfec-45a1a0a28fbb",
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

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a POST /consents to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const postConsentsToPISP = requestsHistory.data['post /consents'].data.body

        // save consentId for later
        consentId = postConsentsToPISP.consentId

        expect(postConsentsToPISP.consentId).toBeDefined()
        expect(postConsentsToPISP.consentRequestId).toBeDefined()
        expect(postConsentsToPISP.scopes).toBeDefined()
      })
    })

    describe('Inbound PUT /consents/{ID} signed credential from PISP', (): void => {
      it('should send back POST /consents to Auth Service', async (): Promise<void> => {
          // the PISP now sends back a PUT /consents/{ID} signed credential request to the DFSP
          const putConsentsIDSignedCredentialPayload = {
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

          await new Promise(resolve => setTimeout(resolve, 50));

          // check that the DFSP has sent a POST /consents to the auth-service
          const requestsHistoryTwo = await axios.get(ttkRequestsHistoryUri, axiosConfig)
          const postConsentsToAuthService = requestsHistoryTwo.data['post /consents'].data.body

          expect(postConsentsToAuthService.consentId).toBeDefined()
          expect(postConsentsToAuthService.credential).toBeDefined()
          expect(postConsentsToAuthService.scopes).toBeDefined()
      })
    })

    describe('Inbound PUT /consents/{ID} verified credential from auth-service and PUT /participants/{Type}/{ID} from ALS', (): void => {
      it('should send back PATCH /consents/{ID} to PISP', async (): Promise<void> => {
          // the auth-service now sends back a PUT /consents/{ID} confirming verification
          const putConsentsIDVerifiedCredentialPayload = {
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

          // the ALS now sends back a PUT /participants/CONSENT/{ID} confirming verification
          const putParticipantsTypeIDPayload = {
            "fspId": "auth-service"
          }

          const putParticipantsScenarioUri = `${env.inbound.baseUri}/participants/CONSENT/${consentId}`
          const responseToPutParticipants = await axios.put(putParticipantsScenarioUri, putParticipantsTypeIDPayload, axiosConfig)
          expect(responseToPutParticipants.status).toEqual(200)

          await new Promise(resolve => setTimeout(resolve, 50));

          // check that the DFSP has sent a PATCH /consents/{ID} to the PISP
          const requestsHistoryTwo = await axios.get(ttkRequestsHistoryUri, axiosConfig)
          const patchConsentsToPISP = requestsHistoryTwo.data[`patch /consents/${consentId}`].data.body

          expect(patchConsentsToPISP.credential).toBeDefined()
          expect(patchConsentsToPISP.credential.status).toEqual('VERIFIED')
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

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const putConsentRequestsErrorToPISP = requestsHistory.data['put /consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbc/error'].data.body
        expect(putConsentRequestsErrorToPISP.errorInformation).toBeDefined()
        expect(putConsentRequestsErrorToPISP.errorInformation.errorCode).toEqual('7200')
        expect(putConsentRequestsErrorToPISP.errorInformation.errorDescription).toEqual(
          'Generic Thirdparty account linking error'
        )
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

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const putConsentRequestsErrorToPISP = requestsHistory.data['put /consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbd/error'].data.body
        expect(putConsentRequestsErrorToPISP.errorInformation).toBeDefined()
        expect(putConsentRequestsErrorToPISP.errorInformation.errorCode).toEqual('7209')
        expect(putConsentRequestsErrorToPISP.errorInformation.errorDescription).toEqual(
          'FSP does not find scopes suitable'
        )
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

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const putConsentRequestsErrorToPISP = requestsHistory.data['put /consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbe/error'].data.body
        expect(putConsentRequestsErrorToPISP.errorInformation).toBeDefined()
        expect(putConsentRequestsErrorToPISP.errorInformation.errorCode).toEqual('7200')
        expect(putConsentRequestsErrorToPISP.errorInformation.errorDescription).toEqual(
          'Generic Thirdparty account linking error'
        )
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

        // wait a bit for the DFSP adapter to process the request
        await new Promise(resolve => setTimeout(resolve, 50));

        // check that the DFSP has sent a PUT /consentRequests/{ID}/error to the PISP
        const requestsHistory = await axios.get(ttkRequestsHistoryUri, axiosConfig)
        const putConsentRequestsErrorToPISP = requestsHistory.data['put /consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fbf/error'].data.body
        expect(putConsentRequestsErrorToPISP.errorInformation).toBeDefined()
        expect(putConsentRequestsErrorToPISP.errorInformation.errorCode).toEqual('7200')
        expect(putConsentRequestsErrorToPISP.errorInformation.errorDescription).toEqual(
          'Generic Thirdparty account linking error'
        )
      })
    })
  })
})

