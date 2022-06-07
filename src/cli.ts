#!/usr/bin/env -S ./node_modules/.bin/ts-node-script --files --require tsconfig-paths/register
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

// This is required so that once we compile to js
// the js `require()` can resolve the '~' paths
require('module-alias/register')

import config, { OutConfig, ServiceConfig, ControlConfig } from '~/shared/config'
import { ServerAPI, ServerConfig } from '~/server'
import { Handler } from 'openapi-backend'
import Handlers from '~/handlers'
import index from './index'
import path from 'path'
import { Server as HapiServer } from '@hapi/hapi'

import { Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import _ from 'lodash'
import * as ControlAgent from '~/reconfiguration/controlAgent'
import { ConformedMgmtApiConfig } from './interface/types'
import { stop } from './server/start'
/**
 * prepares commander action
 * @param api {string} the name of the api to start can be `inbound` or `outbound`
 * @param handlers { { [handler: string]: Handler } } dictionary with api handlers, will be joined with Handlers.Shared
 * @returns () => Promise<void> asynchronous commander action to start api
 */
export async function mkStartAPI(
  api: ServerAPI,
  handlers: { [handler: string]: Handler },
  serviceConfig = config
): Promise<HapiServer> {
  // update config from program parameters,
  // so setupAndStart will know on which PORT/HOST bind the server
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const apiConfig: OutConfig = serviceConfig[api.toUpperCase()] as OutConfig

  // resolve the path to openapi v3 definition file
  const apiPath = path.resolve(__dirname, `../src/interface/api-${api}.yaml`)

  // prepare API handlers
  const joinedHandlers = {
    ...Handlers.Shared,
    ...handlers
  }

  const serverConfig: ServerConfig = {
    port: apiConfig.PORT,
    host: apiConfig.HOST,
    api,
    tls: apiConfig.TLS
  }

  // setup & start @hapi server
  return await index.server.setupAndStart(serverConfig, apiPath, joinedHandlers)
}

export async function mkRestartAPI(
  api: ServerAPI,
  handlers: { [handler: string]: Handler },
  serviceConfig = config
): Promise<HapiServer> {
  // update config from program parameters,
  // so setupAndStart will know on which PORT/HOST bind the server
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const apiConfig: OutConfig = serviceConfig[api.toUpperCase()] as OutConfig

  // resolve the path to openapi v3 definition file
  const apiPath = path.resolve(__dirname, `../src/interface/api-${api}.yaml`)

  // prepare API handlers
  const joinedHandlers = {
    ...Handlers.Shared,
    ...handlers
  }

  const serverConfig: ServerConfig = {
    port: apiConfig.PORT,
    host: apiConfig.HOST,
    api,
    tls: apiConfig.TLS
  }

  // setup & start @hapi server
  return await index.server.setupAndRestart(serverConfig, apiPath, joinedHandlers)
}

async function GetUpdatedConfigFromMgmtAPI(
  conf: ControlConfig,
  logger: SDKLogger.Logger,
  client: ControlAgent.Client
): Promise<ConformedMgmtApiConfig> {
  logger.log(`Getting updated config from Management API at ${conf.MGMT_API_WS_URL}:${conf.MGMT_API_WS_PORT}...`)

  await client.send(ControlAgent.build.CONFIGURATION.READ(null))
  const responseRead = await client.receive()

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore

  const creds: MgmtApiConfig = responseRead.data
  // Copy config over to all caps keys to match `thirdparty-sdk` keys
  const conformedConfig = {
    OUTBOUND: creds.outbound,
    INBOUND: creds.inbound
  }
  return conformedConfig
}

export class Server {
  private conf!: ServiceConfig
  private controlConfig!: ControlConfig
  public inboundServer!: HapiServer
  public outboundServer!: HapiServer
  public controlClient!: ControlAgent.Client

  async initialize(conf: ServiceConfig) {
    this.conf = conf
    this.controlConfig = conf.CONTROL

    // Check Management API for updated config
    // We only start the control client if we're running within Mojaloop Payment Manager.
    // The control server is the Payment Manager Management API Service.
    // We only start the client to connect to and listen to the Management API service for
    // management protocol messages e.g configuration changes, certificate updates etc.
    if (config.PM4ML_ENABLED) {
      const logger = new SDKLogger.Logger()
      this.controlClient = await ControlAgent.Client.Create(
        this.controlConfig.MGMT_API_WS_URL,
        this.controlConfig.MGMT_API_WS_PORT,
        conf
      )
      const updatedConfigFromMgmtAPI = await GetUpdatedConfigFromMgmtAPI(this.controlConfig, logger, this.controlClient)
      logger.info(`updatedConfigFromMgmtAPI: ${JSON.stringify(updatedConfigFromMgmtAPI)}`)
      _.merge(this.conf, updatedConfigFromMgmtAPI)

      this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this))
    }

    this.inboundServer = await mkStartAPI(ServerAPI.inbound, Handlers.Inbound, conf)
    this.outboundServer = await mkStartAPI(ServerAPI.outbound, Handlers.Outbound, conf)
  }

  static async create(conf: ServiceConfig) {
    const server = new Server()
    await server.initialize(conf)
    return server
  }

  async restart(conf: ServiceConfig) {
    this.inboundServer = await mkRestartAPI(ServerAPI.inbound, Handlers.Inbound, conf)
    this.outboundServer = await mkRestartAPI(ServerAPI.outbound, Handlers.Outbound, conf)
    await Promise.all([this.inboundServer, this.outboundServer])
  }

  async stop() {
    return Promise.all([stop(this.inboundServer), stop(this.outboundServer), this.controlClient.stop()])
  }
}

if (require.main === module) {
  ;(async () => {
    // this module is main i.e. we were started as a server;
    // not used in unit test or "require" scenarios
    const logger = new SDKLogger.Logger()

    const svr = await Server.create(config)

    // handle SIGTERM to exit gracefully
    process.on('SIGTERM', async () => {
      logger.log('SIGTERM received. Shutting down APIs...')
      await svr.stop()
      process.exit(0)
    })
  })()
}
