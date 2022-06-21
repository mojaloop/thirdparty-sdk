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
import { MgmtApiConfig } from './interface/types'
import { stop } from './server/start'

/**
 * prepares commander action
 * @param api {string} the name of the api to start can be `inbound` or `outbound`
 * @param handlers { { [handler: string]: Handler } } dictionary with api handlers, will be joined with Handlers.Shared
 * @param serviceConfig {ServiceConfig} dictionary with config options. see `src/shared/config` for interface
 * @param restart {boolean} option for when you need to restart the api
 * @returns () => Promise<void> asynchronous commander action to start api
 */
export async function mkStartAPI(
  api: ServerAPI,
  handlers: { [handler: string]: Handler },
  serviceConfig: ServiceConfig = config
): Promise<HapiServer> {
  // update config from program parameters,
  // so setupAndStart will know on which PORT/HOST bind the server
  const apiConfig: OutConfig = serviceConfig[api] as OutConfig

  // resolve the path to openapi v3 definition file
  const apiPath = path.resolve(__dirname, `../src/interface/api-${api}.yaml`)

  // prepare API handlers
  const joinedHandlers = {
    ...Handlers.Shared,
    ...handlers
  }

  const serverConfig: ServerConfig = {
    port: apiConfig.port,
    host: apiConfig.host,
    api,
    tls: apiConfig.tls,
    // we are just going pass all of the config here for convenience purposes
    // so that when the server is restarted with a config that isn't on the local
    // disk
    serviceConfig: serviceConfig
  }
  // setup & start @hapi server
  return await index.server.setupAndStart(serverConfig, apiPath, joinedHandlers)
}

async function GetUpdatedConfigFromMgmtAPI(
  conf: ControlConfig,
  logger: SDKLogger.Logger,
  client: ControlAgent.Client
): Promise<MgmtApiConfig> {
  logger.log(`Getting updated config from Management API at ${conf.mgmtAPIWsUrl}:${conf.mgmtAPIWsPort}...`)

  await client.send(ControlAgent.build.CONFIGURATION.READ(null))
  const responseRead = (await client.receive()) as { data: MgmtApiConfig }
  logger.log('client receive returned:: ', responseRead)
  return responseRead.data
}

export class Server {
  private conf!: ServiceConfig
  private controlConfig!: ControlConfig
  public logger!: SDKLogger.Logger
  public inboundServer!: HapiServer
  public outboundServer!: HapiServer
  public controlClient!: ControlAgent.Client

  async initialize(conf: ServiceConfig): Promise<void> {
    this.conf = conf
    this.controlConfig = conf.control
    this.logger = new SDKLogger.Logger()
    // Check Management API for updated config
    // We only start the control client if we're running within Mojaloop Payment Manager.
    // The control server is the Payment Manager Management API Service.
    // We only start the client to connect to and listen to the Management API service for
    // management protocol messages e.g configuration changes, certificate updates etc.
    if (config.pm4mlEnabled) {
      this.controlClient = await ControlAgent.Client.Create(
        this.controlConfig.mgmtAPIWsUrl,
        this.controlConfig.mgmtAPIWsPort,
        conf
      )
      const updatedConfigFromMgmtAPI = await GetUpdatedConfigFromMgmtAPI(
        this.controlConfig,
        this.logger,
        this.controlClient
      )
      this.logger.info(`updatedConfigFromMgmtAPI: ${JSON.stringify(updatedConfigFromMgmtAPI)}`)
      _.merge(this.conf, updatedConfigFromMgmtAPI)

      this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this))
    }

    this.inboundServer = await mkStartAPI(ServerAPI.inbound, Handlers.Inbound, conf)
    this.outboundServer = await mkStartAPI(ServerAPI.outbound, Handlers.Outbound, conf)
    await Promise.all([this.inboundServer, this.outboundServer])
  }

  static async create(conf: ServiceConfig): Promise<Server> {
    const server = new Server()
    await server.initialize(conf)
    return server
  }

  async restart(conf: ServiceConfig) {
    this.logger.info(`Received new config. Restarting servers: ${JSON.stringify(conf)}`)
    await Promise.all([stop(this.inboundServer), stop(this.outboundServer)])
    this.inboundServer = await mkStartAPI(ServerAPI.inbound, Handlers.Inbound, conf)
    this.outboundServer = await mkStartAPI(ServerAPI.outbound, Handlers.Outbound, conf)
    await Promise.all([this.inboundServer, this.outboundServer])
  }

  async stop() {
    return Promise.all([stop(this.inboundServer), stop(this.outboundServer), this.controlClient.stop()])
  }
}

export function startAPISuite() {
  return async (): Promise<void> => {
    const logger = new SDKLogger.Logger()
    const svr = await Server.create(config)

    // handle SIGTERM to exit gracefully
    process.on('SIGTERM', async () => {
      logger.log('SIGTERM received. Shutting down APIs...')
      await svr.stop()
      process.exit(0)
    })
  }
}
