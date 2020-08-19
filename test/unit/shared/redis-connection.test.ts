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

 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/

import {
  RedisConnection,
  RedisConnectionConfig,
  RedisConnectionError
} from '~/shared/redis-connection'

import mockLogger from '../mockLogger'
jest.mock('redis')

describe('RedisConnection', () => {
  const config: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }

  it('should be well constructed', () => {
    const redis = new RedisConnection(config)
    expect(redis.port).toBe(config.port)
    expect(redis.host).toEqual(config.host)
    expect(redis.logger).toEqual(config.logger)
    expect(redis.isConnected).toBeFalsy()
  })

  it('should connect', async (): Promise<void> => {
    const redis = new RedisConnection(config)
    await redis.connect()
    expect(redis.isConnected).toBeTruthy()
    expect(config.logger.info).toBeCalledWith(`Connected to REDIS at: ${config.host}:${config.port}`)
  })

  it('should throw if trying to access \'client\' property when not connected ', async (): Promise<void> => {
    const redis = new RedisConnection(config)
    expect(redis.isConnected).toBeFalsy()
    expect(() => redis.client).toThrowError(new RedisConnectionError(config.port, config.host))
  })

  it('should disconnect when connected', async (): Promise<void> => {
    const redis = new RedisConnection(config)
    await redis.connect()
    expect(redis.isConnected).toBeTruthy()
    await redis.disconnect()
    expect(redis.isConnected).toBeFalsy()
  })

  it('should do nothing at disconnect when not connected', async (): Promise<void> => {
    const redis = new RedisConnection(config)
    expect(redis.isConnected).toBeFalsy()
    await redis.disconnect()
    expect(redis.isConnected).toBeFalsy()
  })
})
