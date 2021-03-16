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
import SDK from '@mojaloop/sdk-standard-components'
import { KVS } from '~/shared/kvs'
import { PubSub } from '~/shared/pub-sub'
import { ResponseToolkit, Server } from '@hapi/hapi'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { logger } from '~/shared/logger'

import config from '~/shared/config'
import { PISPBackendRequests } from '~/shared/pisp-backend-requests'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { SDKRequests } from '~/shared/sdk-requests'
import { Scheme } from '~/shared/http-scheme'

export interface StateResponseToolkit extends ResponseToolkit {
  getKVS: () => KVS
  getPubSub: () => PubSub
  getLogger: () => SDK.Logger.Logger
  getMojaloopRequests: () => SDK.MojaloopRequests
  getThirdpartyRequests: () => SDK.ThirdpartyRequests
  getWSO2Auth: () => SDK.WSO2Auth
  getPISPBackendRequests: () => PISPBackendRequests
  getDFSPBackendRequests: () => DFSPBackendRequests
  getSDKRequests: () => SDKRequests
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
      logger
    }

    // prepare redis connection instances
    const kvs = new KVS(connection)
    const pubSub = new PubSub(connection)

    // interface to help casting
    interface TLSCreds {
      ca: string
      cert: string
      key: string
    }
    // prepare WSO2Auth
    const wso2Auth = new SDK.WSO2Auth({
      ...config.WSO2_AUTH,
      logger,
      tlsCreds: config.SHARED.TLS.mutualTLS.enabled
        ? config.SHARED.TLS.creds as TLSCreds
        : undefined
    })

    // prepare Requests instances
    const mojaloopRequests = new SDK.MojaloopRequests({
      logger,
      peerEndpoint: config.SHARED.PEER_ENDPOINT,
      alsEndpoint: config.SHARED.ALS_ENDPOINT,
      quotesEndpoint: config.SHARED.QUOTES_ENDPOINT,
      transfersEndpoint: config.SHARED.TRANSFERS_ENDPOINT,
      bulkTransfersEndpoint: config.SHARED.BULK_TRANSFERS_ENDPOINT,
      thirdpartyRequestsEndpoint: config.SHARED.THIRDPARTY_REQUESTS_ENDPOINT,
      transactionRequestsEndpoint: config.SHARED.TRANSACTION_REQUEST_ENDPOINT,
      dfspId: config.SHARED.DFSP_ID,
      tls: config.SHARED.TLS,
      jwsSign: config.SHARED.JWS_SIGN,
      jwsSigningKey: <Buffer> config.SHARED.JWS_SIGNING_KEY
    })

    const thirdpartyRequest = new SDK.ThirdpartyRequests({
      logger,
      peerEndpoint: config.SHARED.PEER_ENDPOINT,
      alsEndpoint: config.SHARED.ALS_ENDPOINT,
      quotesEndpoint: config.SHARED.QUOTES_ENDPOINT,
      transfersEndpoint: config.SHARED.TRANSFERS_ENDPOINT,
      bulkTransfersEndpoint: config.SHARED.BULK_TRANSFERS_ENDPOINT,
      thirdpartyRequestsEndpoint: config.SHARED.THIRDPARTY_REQUESTS_ENDPOINT,
      transactionRequestsEndpoint: config.SHARED.TRANSACTION_REQUEST_ENDPOINT,
      dfspId: config.SHARED.DFSP_ID,
      tls: config.SHARED.TLS,
      jwsSign: config.SHARED.JWS_SIGN,
      jwsSigningKey: <Buffer> config.SHARED.JWS_SIGNING_KEY
    })

    const pispBackendRequests = new PISPBackendRequests({
      logger,
      uri: config.SHARED.PISP_BACKEND_URI,
      scheme: config.SHARED.PISP_BACKEND_HTTP_SCHEME as Scheme,
      signAuthorizationPath: config.SHARED.PISP_BACKEND_SIGN_AUTHORIZATION_PATH
    })

    const dfspBackendRequests = new DFSPBackendRequests({
      logger,
      uri: config.SHARED.DFSP_BACKEND_URI,
      scheme: config.SHARED.DFSP_BACKEND_HTTP_SCHEME as Scheme,
      verifyAuthorizationPath: config.SHARED.DFSP_BACKEND_VERIFY_AUTHORIZATION_PATH,
      verifyConsentPath: config.SHARED.DFSP_BACKEND_VERIFY_CONSENT_PATH,
      getUserAccountsPath: config.SHARED.DFSP_BACKEND_GET_USER_ACCOUNTS_PATH,
      validateOTPPath: config.SHARED.DFSP_BACKEND_VALIDATE_OTP_PATH,
      getScopesPath: config.SHARED.DFSP_BACKEND_GET_SCOPES_PATH
    })

    const sdkRequests = new SDKRequests({
      logger,
      dfspId: config.SHARED.DFSP_ID,
      uri: config.SHARED.SDK_OUTGOING_URI,
      scheme: config.SHARED.SDK_OUTGOING_HTTP_SCHEME as Scheme,
      requestPartiesInformationPath: config.SHARED.SDK_PARTIES_INFORMATION_URI,
      requestToPayTransferPath: config.SHARED.SDK_REQUEST_TO_PAY_TRANSFER_URI,
      notifyAboutTransferPath: config.SHARED.SDK_NOTIFY_ABOUT_TRANSFER_URI
    })

    try {
      // connect them all to Redis instance
      await Promise.all([kvs.connect(), pubSub.connect()])
      logger.info(`StatePlugin: connecting KVS(${kvs.isConnected}) & PubSub(${pubSub.isConnected}):`)

      // prepare toolkit accessors
      server.decorate('toolkit', 'getKVS', (): KVS => kvs)
      server.decorate('toolkit', 'getPubSub', (): PubSub => pubSub)
      server.decorate('toolkit', 'getLogger', (): SDK.Logger.Logger => logger)
      server.decorate('toolkit', 'getMojaloopRequests', (): SDK.MojaloopRequests => mojaloopRequests)
      server.decorate('toolkit', 'getThirdpartyRequests', (): SDK.ThirdpartyRequests => thirdpartyRequest)
      server.decorate('toolkit', 'getWSO2Auth', (): SDK.WSO2Auth => wso2Auth)
      server.decorate('toolkit', 'getPISPBackendRequests', (): PISPBackendRequests => pispBackendRequests)
      server.decorate('toolkit', 'getDFSPBackendRequests', (): DFSPBackendRequests => dfspBackendRequests)
      server.decorate('toolkit', 'getSDKRequests', (): SDKRequests => sdkRequests)

      // disconnect from redis when server is stopped
      server.events.on('stop', async () => {
        await Promise.allSettled([kvs.disconnect(), pubSub.disconnect()])
        logger.info('StatePlugin: Server stopped -> disconnecting KVS & PubSub')
      })
    } catch (err) {
      logger.error('StatePlugin: unexpected exception during plugin registration')
      logger.error(err)
      logger.error('StatePlugin: exiting process')
      process.exit(1)
    }
  }
}
