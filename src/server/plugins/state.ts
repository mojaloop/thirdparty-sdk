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

 - Paweł Marzec <pawel.marzec@modusbox.com>

 --------------
 ******/
import { WSO2Auth, MojaloopRequests, ThirdpartyRequests, Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import { KVS } from '~/shared/kvs'
import { PubSub } from '~/shared/pub-sub'
import { ResponseToolkit, Server } from '@hapi/hapi'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { logger } from '~/shared/logger'

import config from '~/shared/config'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { Scheme } from '~/shared/http-scheme'

export interface StateResponseToolkit extends ResponseToolkit {
  getKVS: () => KVS
  getPublisher: () => PubSub
  getSubscriber: () => PubSub
  getLogger: () => SDKLogger.Logger
  getMojaloopRequests: () => MojaloopRequests
  getThirdpartyRequests: () => ThirdpartyRequests
  getWSO2Auth: () => WSO2Auth
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
      host: config.redis.host,
      port: config.redis.port,
      timeout: config.redis.timeout,
      logger
    }

    // prepare redis connection instances
    // once the client enters the subscribed state it is not supposed to issue
    // any other commands, except for additional SUBSCRIBE, PSUBSCRIBE,
    // UNSUBSCRIBE, PUNSUBSCRIBE, PING and QUIT commands.
    // So we create two connections, one for subscribing another for
    // and publishing
    const kvs = new KVS(connection)
    const publisher = new PubSub(connection)
    const subscriber = new PubSub(connection)

    // interface to help casting
    interface TLSCreds {
      ca: string
      cert: string
      key: string
    }
    // prepare WSO2Auth
    const wso2Auth = new WSO2Auth({
      ...config.wso2,
      logger,
      tlsCreds: config.outbound.tls.mutualTLS.enabled ? (config.outbound.tls.creds as TLSCreds) : undefined
    })

    // prepare Requests instances
    const mojaloopRequests = new MojaloopRequests({
      logger,
      peerEndpoint: config.shared.peerEndpoint,
      alsEndpoint: config.shared.alsEndpoint,
      quotesEndpoint: config.shared.quotesEndpoint,
      transfersEndpoint: config.shared.transfersEndpoint,
      bulkTransfersEndpoint: config.shared.bulkTransfersEndpoint,
      servicesEndpoint: config.shared.servicesEndpoint,
      thirdpartyRequestsEndpoint: config.shared.thirdpartyRequestsEndpoint,
      transactionRequestsEndpoint: config.shared.transactionRequestEndpoint,
      dfspId: config.shared.dfspId,
      tls: config.outbound.tls,
      jwsSign: config.jwsSign,
      jwsSigningKey: <Buffer>config.jwsSigningKey
    })

    const thirdpartyRequest = new ThirdpartyRequests({
      logger,
      peerEndpoint: config.shared.peerEndpoint,
      alsEndpoint: config.shared.alsEndpoint,
      quotesEndpoint: config.shared.quotesEndpoint,
      transfersEndpoint: config.shared.transfersEndpoint,
      bulkTransfersEndpoint: config.shared.bulkTransfersEndpoint,
      servicesEndpoint: config.shared.servicesEndpoint,
      thirdpartyRequestsEndpoint: config.shared.thirdpartyRequestsEndpoint,
      transactionRequestsEndpoint: config.shared.transactionRequestEndpoint,
      dfspId: config.shared.dfspId,
      tls: config.outbound.tls,
      jwsSign: config.jwsSign,
      jwsSigningKey: <Buffer>config.jwsSigningKey
    })

    const dfspBackendRequests = new DFSPBackendRequests({
      logger,
      uri: config.shared.dfspBackendUri,
      scheme: config.shared.dfspBackendHttpScheme as Scheme,
      verifyAuthorizationPath: config.shared.dfspBackendVerifyAuthorizationPath,
      verifyConsentPath: config.shared.dfspBackendVerifyConsentPath,
      getUserAccountsPath: config.shared.dfspBackendGetUserAccountsPath,
      validateAuthTokenPath: config.shared.dfspBackendValidateAuthTokenPath,
      validateThirdpartyTransactionRequestPath: config.shared.dfspBackendValidateThirdpartyTransactionRequest,
      validateConsentRequestsPath: config.shared.dfspBackendValidateConsReqPath,
      sendOTPPath: config.shared.dfspBackendSendOtpReqPath,
      storeConsentRequestsPath: config.shared.dfspBackendStoreConsReqPath,
      storeValidatedConsentForAccountIdPath: config.shared.dfspBackendStoreValidatedConsentForAccountIdPath
    })

    const sdkOutgoingRequests = new SDKOutgoingRequests({
      logger,
      uri: config.shared.sdkOutgoingUri,
      scheme: config.shared.sdkOutgoingHttpScheme as Scheme,
      requestPartiesInformationPath: config.shared.sdkOutgoingPartiesInformationPath,
      requestToPayTransferPath: config.shared.sdkRequestToPayTransferUri,
      requestQuotePath: config.shared.sdkOutgoingRequestQuotePath,
      requestAuthorizationPath: config.shared.sdkOutgoingRequestAuthorizationPath,
      requestTransferPath: config.shared.sdkOutgoingRequestTransferPath
    })

    try {
      // connect them all to Redis instance
      await Promise.all([kvs.connect(), subscriber.connect(), publisher.connect()])
      logger.info(`StatePlugin: connecting KVS(${kvs.isConnected}) &
        Publisher(${publisher.isConnected}) & Subscriber(${subscriber.isConnected}):`)

      // prepare toolkit accessors
      server.decorate('toolkit', 'getKVS', (): KVS => kvs)
      server.decorate('toolkit', 'getPublisher', (): PubSub => publisher)
      server.decorate('toolkit', 'getSubscriber', (): PubSub => subscriber)
      server.decorate('toolkit', 'getLogger', (): SDKLogger.Logger => logger)
      server.decorate('toolkit', 'getMojaloopRequests', (): MojaloopRequests => mojaloopRequests)
      server.decorate('toolkit', 'getThirdpartyRequests', (): ThirdpartyRequests => thirdpartyRequest)
      server.decorate('toolkit', 'getWSO2Auth', (): WSO2Auth => wso2Auth)
      server.decorate('toolkit', 'getDFSPBackendRequests', (): DFSPBackendRequests => dfspBackendRequests)
      server.decorate('toolkit', 'getSDKOutgoingRequests', (): SDKOutgoingRequests => sdkOutgoingRequests)
      server.decorate('toolkit', 'getDFSPId', (): string => config.shared.dfspId)
      server.decorate('toolkit', 'getAuthServiceParticipantId', (): string => config.shared.authServiceParticipantId)
      // disconnect from redis when server is stopped
      server.events.on('stop', async () => {
        await Promise.allSettled([kvs.disconnect(), publisher.disconnect(), subscriber.disconnect()])
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
