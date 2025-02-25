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

 * Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Message, PubSub } from '~/shared/pub-sub'
import Config from '~/shared/config'
import axios from 'axios'
import env from '../env'
import mockLogger from '../../unit/mockLogger'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

describe('PISP Inbound', (): void => {
  describe('POST /consents', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/consents`
    describe('Inbound API', (): void => {
      const config: RedisConnectionConfig = {
        host: Config.redis.host,
        port: Config.redis.port,
        logger: mockLogger(),
        timeout: Config.redis.timeout
      }
      const payload: tpAPI.Schemas.ConsentsPostRequestPISP = {
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fbb',
        scopes: [
          {
            address: 'some-id',
            actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
          }
        ],
        status: 'ISSUED'
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Accept: 'application/json',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'pispA'
        }
      }

      it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
        const subscriber = new PubSub(config)
        await subscriber.connect()
        expect(subscriber.isConnected).toBeTruthy()

        subscriber.subscribe(
          'PISPLinking_requestConsentAuthenticate_997c89f4-053c-4283-bfec-45a1a0a28fbb',
          async (channel: string, message: Message) => {
            expect(channel).toEqual('PISPLinking_requestConsentAuthenticate_997c89f4-053c-4283-bfec-45a1a0a28fbb')
            expect(message).toEqual(payload)
            await subscriber.disconnect()
            expect(subscriber.isConnected).toBeFalsy()

            await new Promise(process.nextTick)
          }
        )

        // Act
        const response = await axios.post(scenarioUri, payload, axiosConfig)

        // Assert
        expect(response.status).toEqual(202)
      })
    })
  })

  // note: if the PISP is not granted consent it is sent a PUT /consentRequests/{ID}/error
  //       this inbound test is found in consentRequests.test.ts
})

describe('DFSP Inbound', (): void => {
  describe('PUT /consents/{ID} response from PISP', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/consents/8e34f91d-d078-4077-8263-2c047876fcf6`

    describe('Inbound API', (): void => {
      const signedCredentialPayload: tpAPI.Schemas.ConsentsIDPutResponseSigned = {
        scopes: [
          {
            address: 'some-id',
            actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
          }
        ],
        credential: {
          credentialType: 'FIDO',
          status: 'PENDING',
          fidoPayload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON:
                'clientDataJSON-must-not-have-fewer-than-121-' +
                'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
                'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
                'aliqua.',
              attestationObject:
                'attestationObject-must-not-have-fewer-than-' +
                '306-characters Lorem ipsum dolor sit amet, consectetur ' +
                'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
                'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
                'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
                'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
                'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
            },
            type: 'public-key'
          }
        }
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        }
      }

      it('should return 202', async (): Promise<void> => {
        // Act
        const response = await axios.put(scenarioUri, signedCredentialPayload, axiosConfig)

        // Assert
        expect(response.status).toEqual(202)
      })
    })
  })

  describe('PUT /consents/{ID} response from auth-service', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/consents/8e34f91d-d078-4077-8263-2c047876fcf6`

    describe('Inbound API', (): void => {
      const config: RedisConnectionConfig = {
        host: Config.redis.host,
        port: Config.redis.port,
        logger: mockLogger(),
        timeout: Config.redis.timeout
      }
      const verifiedCredentialPayload: tpAPI.Schemas.ConsentsIDPutResponseVerified = {
        scopes: [
          {
            address: 'some-id',
            actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER']
          }
        ],
        credential: {
          credentialType: 'FIDO',
          status: 'VERIFIED',
          fidoPayload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON:
                'clientDataJSON-must-not-have-fewer-than-121-' +
                'characters Lorem ipsum dolor sit amet, consectetur adipiscing ' +
                'elit, sed do eiusmod tempor incididunt ut labore et dolore magna ' +
                'aliqua.',
              attestationObject:
                'attestationObject-must-not-have-fewer-than-' +
                '306-characters Lorem ipsum dolor sit amet, consectetur ' +
                'adipiscing elit, sed do eiusmod tempor incididunt ut ' +
                'labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
                'quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
                'ex ea commodo consequat. Duis aute irure dolor in reprehenderit ' +
                'in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
            },
            type: 'public-key'
          }
        }
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        }
      }

      it('should return 202', async (): Promise<void> => {
        // Act
        const response = await axios.put(scenarioUri, verifiedCredentialPayload, axiosConfig)

        // Assert
        expect(response.status).toEqual(200)
      })

      it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
        const subscriber = new PubSub(config)
        await subscriber.connect()
        expect(subscriber.isConnected).toBeTruthy()

        subscriber.subscribe(
          'DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6',
          async (channel: string, message: Message) => {
            expect(channel).toEqual('DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6')
            expect(message).toEqual(verifiedCredentialPayload)
            await subscriber.disconnect()
            expect(subscriber.isConnected).toBeFalsy()

            await new Promise(process.nextTick)
          }
        )

        // Act
        const response = await axios.put(scenarioUri, verifiedCredentialPayload, axiosConfig)

        // Assert
        expect(response.status).toEqual(200)
      })
    })
  })

  it.todo('PUT /consents/{ID}/error response from PISP')

  describe('PUT /consents/{ID}/error response from auth-service', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/consents/8e34f91d-d078-4077-8263-2c047876fcf6/error`

    describe('Inbound API', (): void => {
      const config: RedisConnectionConfig = {
        host: Config.redis.host,
        port: Config.redis.port,
        logger: mockLogger(),
        timeout: Config.redis.timeout
      }
      const errorPayload = {
        errorInformation: {
          errorCode: '5100',
          errorDescription: 'This is an error description.',
          extensionList: {
            extension: [
              {
                key: 'sample error key',
                value: 'sample error value'
              }
            ]
          }
        }
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'switch',
          Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
          'FSPIOP-Destination': 'dfspA'
        }
      }

      it('should return 202', async (): Promise<void> => {
        // Act
        const response = await axios.put(scenarioUri, errorPayload, axiosConfig)

        // Assert
        expect(response.status).toEqual(200)
      })

      it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
        const subscriber = new PubSub(config)
        await subscriber.connect()
        expect(subscriber.isConnected).toBeTruthy()

        subscriber.subscribe(
          'DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6',
          async (channel: string, message: Message) => {
            expect(channel).toEqual('DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6')
            expect(message).toEqual(errorPayload)
            await subscriber.disconnect()
            expect(subscriber.isConnected).toBeFalsy()

            await new Promise(process.nextTick)
          }
        )

        // Act
        const response = await axios.put(scenarioUri, errorPayload, axiosConfig)

        // Assert
        expect(response.status).toEqual(200)
      })
    })
  })
})
