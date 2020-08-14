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
import { ConvictConfig, PACKAGE } from '~/shared/config'
import { ServerAPI, ServerConfig } from '~/server'
import { Command } from 'commander'
import { Handler } from 'openapi-backend'
import Handlers from '~/handlers'
import index from './index'
import path from 'path'

// handle script parameters
const program = new Command(PACKAGE.name)
/**
 * prepares commander action
 * @param api {string} the name of the api to start can be `inbound` or `outbound`
 * @param handlers { { [handler: string]: Handler } } dictionary with api handlers, will be joined with Handlers.Shared
 * @returns () => Promise<void> asynchronous commander action to start api
 */
function mkStartAPI (api: ServerAPI, handlers: { [handler: string]: Handler }): () => Promise<void> {
  return async (): Promise<void> => {
    // update config from program parameters,
    // so setupAndStart will know on which PORT/HOST bind the server
    const apiConfig = ConvictConfig.get(api.toUpperCase())

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
      api
    }
    // setup & start @hapi server
    await index.server.setupAndStart(serverConfig, apiPath, joinedHandlers)
  }
}

const startInboundAPI = mkStartAPI(ServerAPI.inbound, Handlers.Inbound)
const startOutboundAPI = mkStartAPI(ServerAPI.outbound, Handlers.Outbound)

// setup cli program
program
  .version(PACKAGE.version)
  .description('thirdparty-scheme-adapter')
  .option('-p, --port <number>', 'listen on port')
  .option('-H, --host <string>', 'listen on host')

// setup standalone command to start Inbound service
program.command('inbound')
  .description('start Inbound API service')
  .action(startInboundAPI)

// setup standalone command to start Outbound service
program.command('outbound')
  .description('start Outbound API service')
  .action(startOutboundAPI)

// fetch parameters from command line and execute
program.parseAsync(process.argv)
