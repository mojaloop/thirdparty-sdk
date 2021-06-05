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
  WSO2Auth,
  MojaloopRequests,
  ThirdpartyRequests,
  Logger as SDKLogger
} from '@mojaloop/sdk-standard-components'
import { KVS } from '~/shared/kvs'
import { PubSub } from '~/shared/pub-sub'
import { ResponseToolkit, Server } from '@hapi/hapi'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { logger } from '~/shared/logger'

import config from '~/shared/config'
import { PISPBackendRequests } from '~/shared/pisp-backend-requests'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { Scheme } from '~/shared/http-scheme'

export interface StateResponseToolkit extends ResponseToolkit {
  getKVS: () => KVS
  getPubSub: () => PubSub
  getLogger: () => SDKLogger.Logger
  getMojaloopRequests: () => MojaloopRequests
  getThirdpartyRequests: () => ThirdpartyRequests
  getWSO2Auth: () => WSO2Auth
  getPISPBackendRequests: () => PISPBackendRequests
  getDFSPBackendRequests: () => DFSPBackendRequests
  getSDKOutgoingRequests: () => SDKOutgoingRequests
  getDFSPId: () => string
  getAuthServiceParticipantId: () => string
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
    const wso2Auth = new WSO2Auth({
      ...config.WSO2_AUTH,
      logger,
      tlsCreds: config.SHARED.TLS.mutualTLS.enabled
        ? config.SHARED.TLS.creds as TLSCreds
        : undefined
    })

    // prepare Requests instances
    const mojaloopRequests = new MojaloopRequests({
      logger,
      peerEndpoint: config.SHARED.PEER_ENDPOINT,
      alsEndpoint: config.SHARED.ALS_ENDPOINT,
      quotesEndpoint: config.SHARED.QUOTES_ENDPOINT,
      transfersEndpoint: config.SHARED.TRANSFERS_ENDPOINT,
      bulkTransfersEndpoint: config.SHARED.BULK_TRANSFERS_ENDPOINT,
      servicesEndpoint: config.SHARED.SERVICES_ENDPOINT,
      thirdpartyRequestsEndpoint: config.SHARED.THIRDPARTY_REQUESTS_ENDPOINT,
      transactionRequestsEndpoint: config.SHARED.TRANSACTION_REQUEST_ENDPOINT,
      dfspId: config.SHARED.DFSP_ID,
      tls: config.SHARED.TLS,
      jwsSign: config.SHARED.JWS_SIGN,
      jwsSigningKey: <Buffer>config.SHARED.JWS_SIGNING_KEY
    })

    const thirdpartyRequest = new ThirdpartyRequests({
      logger,
      peerEndpoint: config.SHARED.PEER_ENDPOINT,
      alsEndpoint: config.SHARED.ALS_ENDPOINT,
      quotesEndpoint: config.SHARED.QUOTES_ENDPOINT,
      transfersEndpoint: config.SHARED.TRANSFERS_ENDPOINT,
      bulkTransfersEndpoint: config.SHARED.BULK_TRANSFERS_ENDPOINT,
      servicesEndpoint: config.SHARED.SERVICES_ENDPOINT,
      thirdpartyRequestsEndpoint: config.SHARED.THIRDPARTY_REQUESTS_ENDPOINT,
      transactionRequestsEndpoint: config.SHARED.TRANSACTION_REQUEST_ENDPOINT,
      dfspId: config.SHARED.DFSP_ID,
      tls: config.SHARED.TLS,
      jwsSign: config.SHARED.JWS_SIGN,
      jwsSigningKey: <Buffer>config.SHARED.JWS_SIGNING_KEY
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
      validateAuthTokenPath: config.SHARED.DFSP_BACKEND_VALIDATE_AUTH_TOKEN_PATH,
      validateThirdpartyTransactionRequestPath: config.SHARED.DFSP_BACKEND_VALIDATE_THIRDPARTY_TRANSACTION_REQUEST,
      validateConsentRequestsPath: config.SHARED.DFSP_BACKEND_VALIDATE_CONS_REQ_PATH,
      sendOTPPath: config.SHARED.DFSP_BACKEND_SEND_OTP_REQ_PATH,
      storeConsentRequestsPath: config.SHARED.DFSP_BACKEND_STORE_CONS_REQ_PATH
    })

    const sdkOutgoingRequests = new SDKOutgoingRequests({
      logger,
      uri: config.SHARED.SDK_OUTGOING_URI,
      scheme: config.SHARED.SDK_OUTGOING_HTTP_SCHEME as Scheme,
      requestPartiesInformationPath: config.SHARED.SDK_OUTGOING_PARTIES_INFORMATION_PATH,
      requestToPayTransferPath: config.SHARED.SDK_REQUEST_TO_PAY_TRANSFER_URI,
      requestQuotePath: config.SHARED.SDK_OUTGOING_REQUEST_QUOTE_PATH,
      requestAuthorizationPath: config.SHARED.SDK_OUTGOING_REQUEST_AUTHORIZATION_PATH,
      requestTransferPath: config.SHARED.SDK_OUTGOING_REQUEST_TRANSFER_PATH
    })

    try {
      // connect them all to Redis instance
      await Promise.all([kvs.connect(), pubSub.connect()])
      logger.info(`StatePlugin: connecting KVS(${kvs.areAllClientsConnected}) & PubSub(${pubSub.areAllClientsConnected}):`)

      // prepare toolkit accessors
      server.decorate('toolkit', 'getKVS', (): KVS => kvs)
      server.decorate('toolkit', 'getPubSub', (): PubSub => pubSub)
      server.decorate('toolkit', 'getLogger', (): SDKLogger.Logger => logger)
      server.decorate('toolkit', 'getMojaloopRequests', (): MojaloopRequests => mojaloopRequests)
      server.decorate('toolkit', 'getThirdpartyRequests', (): ThirdpartyRequests => thirdpartyRequest)
      server.decorate('toolkit', 'getWSO2Auth', (): WSO2Auth => wso2Auth)
      server.decorate('toolkit', 'getPISPBackendRequests', (): PISPBackendRequests => pispBackendRequests)
      server.decorate('toolkit', 'getDFSPBackendRequests', (): DFSPBackendRequests => dfspBackendRequests)
      server.decorate('toolkit', 'getSDKOutgoingRequests', (): SDKOutgoingRequests => sdkOutgoingRequests)
      server.decorate('toolkit', 'getDFSPId', (): string => config.SHARED.DFSP_ID)
      server.decorate('toolkit', 'getAuthServiceParticipantId', (): string => config.SHARED.AUTH_SERVICE_PARTICIPANT_ID)
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
