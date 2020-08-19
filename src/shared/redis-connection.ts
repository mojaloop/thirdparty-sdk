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

import { RedisClient, createClient } from 'redis'
import { Logger } from 'winston'
import { promisify } from 'util'

export class RedisConnectionError extends Error {
  public readonly host: string
  public readonly port: number

  constructor (port: number, host: string) {
    super(`can not connect to ${host}:${port}`)
    this.host = host
    this.port = port
  }
}

export interface RedisConnectionConfig {
  host: string;
  port: number;
  logger: Logger;
}

export class RedisConnection {
  protected readonly config: RedisConnectionConfig

  private redisClient: RedisClient = null as unknown as RedisClient

  constructor (config: RedisConnectionConfig) {
    this.config = { ...config }
  }

  get client (): RedisClient {
    if (!this.isConnected) {
      throw new RedisConnectionError(this.port, this.host)
    }
    return this.redisClient
  }

  get host (): string {
    return this.config.host
  }

  get port (): number {
    return this.config.port
  }

  get logger (): Logger {
    return this.config.logger
  }

  get isConnected (): boolean {
    return this.redisClient && this.redisClient.connected
  }

  async connect (): Promise<void> {
    // do nothing if already connected
    if (this.isConnected) {
      return
    }

    // connect to redis
    this.redisClient = await this.createClient()
  }

  async disconnect (): Promise<void> {
    // do nothing if already disconnected
    if (!this.isConnected) {
      return
    }

    // disconnect from redis
    const asyncQuit = promisify(this.client.quit)
    await asyncQuit.call(this.client)

    // cleanup
    this.redisClient = null as unknown as RedisClient
  }

  private async createClient (): Promise<RedisClient> {
    return new Promise((resolve, reject) => {
      const client = createClient(this.port, this.host)

      client.on('error', (err) => {
        this.logger.push({ err })
        this.logger.error('Error from REDIS client')
        return reject(err)
      })

      client.on('ready', () => {
        this.logger.info(`Connected to REDIS at: ${this.host}:${this.port}`)
        return resolve(client)
      })
    })
  }
}
