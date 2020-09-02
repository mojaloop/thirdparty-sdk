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

import config from '~/shared/config'

import { Logger as WinstonLogger } from 'winston'
import SDK from '@mojaloop/sdk-standard-components'
import { KVS } from '~/shared/kvs'
import { PubSub } from '~/shared/pub-sub'
import { ResponseToolkit, Server } from '@hapi/hapi'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Logger from '@mojaloop/central-services-logger'
export interface StateResponseToolkit extends ResponseToolkit {
  getKVS: () => KVS
  getPubSub: () => PubSub
  getLogger: () => WinstonLogger
  getMojaloopRequests: () => SDK.MojaloopRequests
  getThirdpartyRequests: () => SDK.ThirdpartyRequests
  getWSO2Auth: () => SDK.WSO2Auth
}

// wrapper for WSO2Auth Logger
// TODO: investigate any differences of Logger used in sdk-scheme-adapter and central-services-logger
interface SDKLogger {
  log: (message: string) => void
}

function wrapLogger (logger: WinstonLogger): SDKLogger {
  return {
    log: (message: string) => logger.info(message)
  }
}

export const StatePlugin = {
  version: '1.0.0',
  name: 'StatePlugin',
  once: true,

  register: async (server: Server): Promise<void> => {
    // KVS & PubSub are using the same Redis instance
    const connection: RedisConnectionConfig = {
      host: config.REDIS.HOST,
      port: config.REDIS.PORT,
      timeout: config.REDIS.TIMEOUT,
      logger: Logger
    }

    // prepare redis connection instances
    const kvs = new KVS(connection)
    const pubSub = new PubSub(connection)

    // prepare WSO2Auth
    const wso2Auth = new SDK.WSO2Auth({
      ...config.WSO2_AUTH,
      logger: wrapLogger(Logger),
      tlsCreds: config.SHARED.TLS.outbound.mutualTLS.enabled && config.SHARED.TLS.outbound.creds
    })

    // prepare Requests instances
    const mojaloopRequests = new SDK.MojaloopRequests({
      logger: Logger,
      peerEndpoint: config.SHARED.PEER_ENDPOINT,
      alsEndpoint: config.SHARED.ALS_ENDPOINT,
      quotesEndpoint: config.SHARED.QUOTES_ENDPOINT,
      transfersEndpoint: config.SHARED.TRANSFERS_ENDPOINT,
      bulkTransfersEndpoint: config.SHARED.BULK_TRANSFERS_ENDPOINT,
      dfspId: config.SHARED.DFSP_ID,
      tls: config.SHARED.TLS,
      jwsSign: config.SHARED.JWS_SIGN,
      jwsSigningKey: <Buffer> config.SHARED.JWS_SIGNING_KEY
    })

    const thirdpartyRequest = new SDK.ThirdpartyRequests({
      logger: Logger,
      peerEndpoint: config.SHARED.PEER_ENDPOINT,
      alsEndpoint: config.SHARED.ALS_ENDPOINT,
      quotesEndpoint: config.SHARED.QUOTES_ENDPOINT,
      transfersEndpoint: config.SHARED.TRANSFERS_ENDPOINT,
      bulkTransfersEndpoint: config.SHARED.BULK_TRANSFERS_ENDPOINT,
      dfspId: config.SHARED.DFSP_ID,
      tls: config.SHARED.TLS,
      jwsSign: config.SHARED.JWS_SIGN,
      jwsSigningKey: <Buffer> config.SHARED.JWS_SIGNING_KEY
    })

    try {
      // connect them all to Redis instance
      await Promise.all([kvs.connect(), pubSub.connect()])
      Logger.info('StatePlugin: connecting KVS & PubSub')

      // prepare toolkit accessors
      server.decorate('toolkit', 'getKVS', (): KVS => kvs)
      server.decorate('toolkit', 'getPubSub', (): PubSub => pubSub)
      server.decorate('toolkit', 'getLogger', (): WinstonLogger => Logger)
      server.decorate('toolkit', 'getMojaloopRequests', (): SDK.MojaloopRequests => mojaloopRequests)
      server.decorate('toolkit', 'getThirdpartyRequests', (): SDK.ThirdpartyRequests => thirdpartyRequest)
      server.decorate('toolkit', 'getWSO2Auth', (): SDK.WSO2Auth => wso2Auth)

      // disconnect from redis when server is stopped
      server.events.on('stop', async () => {
        await Promise.allSettled([kvs.disconnect(), pubSub.disconnect()])
        Logger.info('StatePlugin: Server stopped -> disconnecting KVS & PubSub')
      })
    } catch (err) {
      Logger.error('StatePlugin: unexpected exception during plugin registration')
      Logger.error(err)
      Logger.error('StatePlugin: exiting process')
      process.exit(1)
    }
  }
}
