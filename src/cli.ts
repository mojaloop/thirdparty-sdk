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

import config, { OutConfig, PACKAGE, ServiceConfig, ControlConfig } from '~/shared/config'
import { ServerAPI, ServerConfig } from '~/server'
import { Command } from 'commander'
import { Handler } from 'openapi-backend'
import Handlers from '~/handlers'
import index from './index'
import path from 'path'

import { Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import _ from 'lodash'
import { KeyObject } from 'crypto'
import * as ControlAgent from '~/reconfiguration/controlAgent'

// handle script parameters
const program = new Command(PACKAGE.name)
/**
 * prepares commander action
 * @param api {string} the name of the api to start can be `inbound` or `outbound`
 * @param handlers { { [handler: string]: Handler } } dictionary with api handlers, will be joined with Handlers.Shared
 * @returns () => Promise<void> asynchronous commander action to start api
 */
export function mkStartAPI(api: ServerAPI, handlers: { [handler: string]: Handler }): () => Promise<void> {
  return async (): Promise<void> => {
    // update config from program parameters,
    // so setupAndStart will know on which PORT/HOST bind the server
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const apiConfig: OutConfig = config[api.toUpperCase()] as OutConfig

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

    // Check Management API for updated config
    const controlConfig: ControlConfig = config.CONTROL
    const serviceConfig: ServiceConfig = config
    const logger = new SDKLogger.Logger()

    if (config.PM4ML_ENABLED) {
      const controlClient = await ControlAgent.Client.Create(
        controlConfig.MGMT_API_WS_URL,
        controlConfig.MGMT_API_WS_PORT,
        serviceConfig
      )
      const updatedConfigFromMgmtAPI = await GetUpdatedConfigFromMgmtAPI(controlConfig, logger, controlClient)
      logger.info(`updatedConfigFromMgmtAPI: ${JSON.stringify(updatedConfigFromMgmtAPI)}`)
      _.merge(serviceConfig, updatedConfigFromMgmtAPI)
      controlClient.close()
    }

    // setup & start @hapi server
    await index.server.setupAndStart(serverConfig, apiPath, joinedHandlers)
  }
}

interface MgmtApiConfig {
  outbound: {
    tls: {
      creds: {
        ca: string | Buffer | Array<string | Buffer>
        cert: string | Buffer | Array<string | Buffer>
        key?: string | Buffer | Array<Buffer | KeyObject>
      }
    }
  }
  inbound: {
    tls: {
      creds: {
        ca: string | Buffer | Array<string | Buffer>
        cert: string | Buffer | Array<string | Buffer>
        key?: string | Buffer | Array<Buffer | KeyObject>
      }
    }
  }
}

interface ConformedMgmtApiConfig {
  OUTBOUND: {
    tls: {
      creds: {
        ca: string | Buffer | Array<string | Buffer>
        cert: string | Buffer | Array<string | Buffer>
        key?: string | Buffer | Array<Buffer | KeyObject>
      }
    }
  }
  INBOUND: {
    tls: {
      creds: {
        ca: string | Buffer | Array<string | Buffer>
        cert: string | Buffer | Array<string | Buffer>
        key?: string | Buffer | Array<Buffer | KeyObject>
      }
    }
  }
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

const startInboundAPI = mkStartAPI(ServerAPI.inbound, Handlers.Inbound)
const startOutboundAPI = mkStartAPI(ServerAPI.outbound, Handlers.Outbound)

// setup cli program
program
  .version(PACKAGE.version)
  .description('thirdparty-sdk')
  .option('-p, --port <number>', 'listen on port')
  .option('-H, --host <string>', 'listen on host')

// setup standalone command to start Inbound service
program.command('inbound').description('start Inbound API service').action(startInboundAPI)

// setup standalone command to start Outbound service
program.command('outbound').description('start Outbound API service').action(startOutboundAPI)

// fetch parameters from command line and execute
program.parseAsync(process.argv)
