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

 * Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Message, PubSub } from '~/shared/pub-sub'
import Config from '~/shared/config'
import axios from 'axios'
import env from '../env'
import mockLogger from '../../unit/mockLogger'
import TestData from 'test/unit/data/mockData.json'

describe('PUT /accounts/{ID}', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/accounts/username1234`
  describe('Inbound API', (): void => {
    const config: RedisConnectionConfig = {
      host: Config.REDIS.HOST,
      port: Config.REDIS.PORT,
      logger: mockLogger(),
      timeout: Config.REDIS.TIMEOUT
    }
    const mockData = JSON.parse(JSON.stringify(TestData))
    const payload = mockData.accountsRequest.payload
    const headers = {
      headers: {
        'Content-Type': 'application/vnd.interoperability.authorizations+json;version=1.0',
        Accept: 'application/vnd.interoperability.authorizations+json;version=1',
        'FSPIOP-Source': 'psip',
        'FSPIOP-Destination': 'dfspA',
        Date: 'Wed, 03 Jun 2020 08:22:12 GMT'
      }
    }

    it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve) => {
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()
        pubSub.subscribe('accounts_123', async (channel: string, message: Message, _id: number) => {
          expect(channel).toEqual('accounts_123')
          expect(message).toEqual(payload)
          await pubSub.disconnect()
          expect(pubSub.isConnected).toBeFalsy()

          resolve()
        })
        // Act
        const response = await axios.put(scenarioUri, payload, headers)

        // Assert
        expect(response.status).toEqual(200)
      })
    })
  })
})
