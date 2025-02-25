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

 * Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Message, PubSub } from '~/shared/pub-sub'
import Config from '~/shared/config'
import axios from 'axios'
import env from '../env'
import mockLogger from '../../unit/mockLogger'
import * as mockData from 'test/unit/data/mockData'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

describe('PUT /accounts/{ID}', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/accounts/username1234`
  describe('Inbound API', (): void => {
    const config: RedisConnectionConfig = {
      host: Config.redis.host,
      port: Config.redis.port,
      logger: mockLogger(),
      timeout: Config.redis.timeout
    }

    const payload: tpAPI.Schemas.AccountsIDPutResponse = mockData.accountsRequest.payload
    const headers = {
      headers: {
        'Content-Type': 'application/vnd.interoperability.thirdparty+json;version=1.0',
        Accept: 'application/vnd.interoperability.thirdparty+json;version=1',
        'FSPIOP-Source': 'dfspA',
        'FSPIOP-Destination': 'pisp',
        Date: 'Wed, 03 Jun 2020 08:22:12 GMT'
      }
    }

    it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve) => {
        const subscriber = new PubSub(config)
        await subscriber.connect()
        expect(subscriber.isConnected).toBeTruthy()
        subscriber.subscribe('accounts_username1234', async (channel: string, message: Message, _id: number) => {
          expect(channel).toEqual('accounts_username1234')
          expect(message).toEqual(payload)
          await subscriber.disconnect()
          expect(subscriber.isConnected).toBeFalsy()
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
