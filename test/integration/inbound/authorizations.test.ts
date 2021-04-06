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

 * Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { Message, PubSub } from '~/shared/pub-sub'
import Config from '~/shared/config'
import axios from 'axios'
import env from '../env'
import mockLogger from '../../unit/mockLogger'
import { PISPTransactionModel } from '~/models/pispTransaction.model'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'

describe('PUT /authorizations', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/authorizations/123`
  describe('Inbound API', (): void => {
    const config: RedisConnectionConfig = {
      host: Config.REDIS.HOST,
      port: Config.REDIS.PORT,
      logger: mockLogger(),
      timeout: Config.REDIS.TIMEOUT
    }
    const payload = {
      authenticationInfo: {
        authentication: 'U2F',
        authenticationValue: {
          pinValue: 'the-mocked-pin-value',
          counter: '1'
        }
      },
      responseType: 'ENTERED'
    }
    it('should propagate message via Redis PUB/SUB', async (): Promise<void> => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve) => {
        const channel123 = PISPTransactionModel.notificationChannel(PISPTransactionPhase.initiation, '123')
        const pubSub = new PubSub(config)
        await pubSub.connect()
        expect(pubSub.isConnected).toBeTruthy()
        pubSub.subscribe(channel123, async (channel: string, message: Message, _id: number) => {
          expect(channel).toEqual(channel123)
          expect(message).toEqual(payload)
          await pubSub.disconnect()
          expect(pubSub.isConnected).toBeFalsy()

          resolve()
        })
        // Act
        const response = await axios.put(scenarioUri, payload)

        // Assert
        expect(response.status).toEqual(200)
      })
    })
  })
})
