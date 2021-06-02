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

 * Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Message, PubSub } from '~/shared/pub-sub'
import Config from '~/shared/config'
import axios from 'axios'
import env from '../env'
import mockLogger from '../../unit/mockLogger'

describe('PISP Inbound', (): void => {
  describe('POST /consents', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/consents`
    describe('Inbound API', (): void => {
      const config: RedisConnectionConfig = {
        host: Config.REDIS.HOST,
        port: Config.REDIS.PORT,
        logger: mockLogger(),
        timeout: Config.REDIS.TIMEOUT
      }
      const payload = {
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        consentRequestId: '997c89f4-053c-4283-bfec-45a1a0a28fbb',
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }
        ]
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

      it('should propagate message via Redis PUB/SUB', async (done): Promise<void> => {
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()

        pubSub.subscribe('PISPLinking_requestConsentAuthenticate_997c89f4-053c-4283-bfec-45a1a0a28fbb',
          async (channel: string, message: Message) => {
            expect(channel).toEqual('PISPLinking_requestConsentAuthenticate_997c89f4-053c-4283-bfec-45a1a0a28fbb')
            expect(message).toEqual(payload)
            await pubSub.disconnect()
            expect(pubSub.isConnected).toBeFalsy()

            done()
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
      const signedCredentialPayload = {
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }],
        credential: {
          credentialType: 'FIDO',
          status: 'PENDING',
          payload: {
            id: 'some-credential-id',
            response: {
              clientDataJSON: 'client-data'
            }
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
        host: Config.REDIS.HOST,
        port: Config.REDIS.PORT,
        logger: mockLogger(),
        timeout: Config.REDIS.TIMEOUT
      }
      const verifiedCredentialPayload = {
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }],
        credential: {
          credentialType: 'FIDO',
          status: 'VERIFIED',
          payload: {
            id: 'some-credential-id',
            response: {
              clientDataJSON: 'client-data'
            }
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


      it('should propagate message via Redis PUB/SUB', async (done): Promise<void> => {
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()

        pubSub.subscribe('DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6',
          async (channel: string, message: Message) => {
            expect(channel).toEqual('DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6')
            expect(message).toEqual(verifiedCredentialPayload)
            await pubSub.disconnect()
            expect(pubSub.isConnected).toBeFalsy()

            done()
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
        host: Config.REDIS.HOST,
        port: Config.REDIS.PORT,
        logger: mockLogger(),
        timeout: Config.REDIS.TIMEOUT
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


      it('should propagate message via Redis PUB/SUB', async (done): Promise<void> => {
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()

        pubSub.subscribe('DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6',
          async (channel: string, message: Message) => {
            expect(channel).toEqual('DFSPLinking_waitOnAuthServiceResponse_8e34f91d-d078-4077-8263-2c047876fcf6')
            expect(message).toEqual(errorPayload)
            await pubSub.disconnect()
            expect(pubSub.isConnected).toBeFalsy()

            done()
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

