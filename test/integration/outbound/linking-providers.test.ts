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
import * as OutboundAPI from '~/interface/outbound/api_interfaces'

describe('PISP Pre-Linking', (): void => {
  const config: RedisConnectionConfig = {
    host: Config.redis.host,
    port: Config.redis.port,
    logger: mockLogger(),
    timeout: Config.redis.timeout
  }
  let kvs: KVS
  const linkingProvidersURI = `${env.outbound.baseUri}/linking/providers`

  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  describe('/linking/providers: start->providersLookupSuccess', (): void => {
    it('PrelinkingState should be providersLookupSuccess', async (): Promise<void> => {
      const expectedResponse: OutboundAPI.Schemas.LinkingProvidersResponse = {
        providers: ['dfspA', 'dfspB'],
        currentState: 'providersLookupSuccess'
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linkingProvidersResponse = await axios.get<any>(linkingProvidersURI)
      expect(linkingProvidersResponse.status).toEqual(200)
      expect(linkingProvidersResponse.data.currentState).toEqual('providersLookupSuccess')
      expect(linkingProvidersResponse.data).toEqual(expectedResponse)
    })
  })

  // There's no arguments that can be used for conditions for rules to make the
  // ml-testing-toolkit return an error with the GET /services/{ServiceType} request
  it.todo('/linking/providers: start->errored')
})
