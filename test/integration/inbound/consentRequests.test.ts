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
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Message, PubSub } from '~/shared/pub-sub'
import Config from '~/shared/config'
import axios from 'axios'
import env from '../env'
import mockLogger from 'test/unit/mockLogger'
import TestData from 'test/unit/data/mockData.json'

const mockData = JSON.parse(JSON.stringify(TestData))

describe('PUT /consentRequests/{ID}/error', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba/error`
  describe('Inbound API', (): void => {
    const config: RedisConnectionConfig = {
      host: Config.REDIS.HOST,
      port: Config.REDIS.PORT,
      logger: mockLogger(),
      timeout: Config.REDIS.TIMEOUT
    }
    const payload = {
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
        'FSPIOP-Destination': 'pispA'
      }
    }

    it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve) => {
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()

        pubSub.subscribe('PISPOTPValidate-997c89f4-053c-4283-bfec-45a1a0a28fba',
          async (channel: string, message: Message, _id: number) => {
            expect(channel).toEqual('PISPOTPValidate-997c89f4-053c-4283-bfec-45a1a0a28fba')
            expect(message).toEqual(payload)
            await pubSub.disconnect()
            expect(pubSub.isConnected).toBeFalsy()

            resolve()
          }
        )

        pubSub.subscribe('PISPConsentRequests_997c89f4-053c-4283-bfec-45a1a0a28fba',
        async (channel: string, message: Message, _id: number) => {
          expect(channel).toEqual('PISPConsentRequests_997c89f4-053c-4283-bfec-45a1a0a28fba')
          expect(message).toEqual(payload)
          await pubSub.disconnect()
          expect(pubSub.isConnected).toBeFalsy()

          resolve()
        }
      )
        // Act
        const response = await axios.put(scenarioUri, payload, axiosConfig)

        // Assert
        expect(response.status).toEqual(200)
      })
    })
  })
})

describe('PATCH /consentRequests/{ID}', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba`
  describe('Inbound API', (): void => {
    const payload = {
      authToken: '123456'
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
      const response = await axios.patch(scenarioUri, payload, axiosConfig)

      // Assert
      expect(response.status).toEqual(202)
    })
  })
})

describe('PUT /consentRequests/{ID}', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/consentRequests/997c89f4-053c-4283-bfec-45a1a0a28fba`
  describe('Inbound API', (): void => {
    const config: RedisConnectionConfig = {
      host: Config.REDIS.HOST,
      port: Config.REDIS.PORT,
      logger: mockLogger(),
      timeout: Config.REDIS.TIMEOUT
    }
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        'FSPIOP-Source': 'switch',
        Date: 'Thu, 24 Jan 2019 10:22:12 GMT',
        'FSPIOP-Destination': 'dfspA'
      }
    }

    it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {

      return new Promise(async (resolve) => {
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()
        pubSub.subscribe('PISPConsentRequests_997c89f4-053c-4283-bfec-45a1a0a28fba', async (channel: string, message: Message, _id: number) => {
          expect(channel).toEqual('PISPConsentRequests_997c89f4-053c-4283-bfec-45a1a0a28fba')
          expect(message).toEqual(mockData.consentRequestsPut.payload)
          await pubSub.disconnect()
          expect(pubSub.isConnected).toBeFalsy()

          resolve()
        })
        // Act
        const response = await axios.put(scenarioUri, mockData.consentRequestsPut.payload, axiosConfig)

        // Assert
        expect(response.status).toEqual(200)
      })
    })
  })
})