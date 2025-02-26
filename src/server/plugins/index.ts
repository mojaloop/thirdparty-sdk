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

import { Server, ServerRoute } from '@hapi/hapi'
import Blip from 'blipp'
import ErrorHandling from '@mojaloop/central-services-error-handling'
import Good from './good'
import { Handler } from 'openapi-backend'
import Inert from '@hapi/inert'
import OpenAPI from './openAPI'
import { StatePlugin } from './state'
import { Util } from '@mojaloop/central-services-shared'
import Vision from '@hapi/vision'
import { jwsValidatorPlugin } from './jwsValidator'
import { ServerAPI, ServerApp } from '../create'

async function register(server: Server, apiPath: string, handlers: { [handler: string]: Handler }): Promise<Server> {
  const openapiBackend = await OpenAPI.initialize(apiPath, handlers)

  const api = (server.settings.app as ServerApp).api

  let plugins = [
    StatePlugin,
    // only the inbound server needs the jws validation
    // order of plugins is important, giving it a high priority seems fitting
    api == ServerAPI.inbound ? jwsValidatorPlugin : null,
    Util.Hapi.OpenapiBackendValidator,
    Good,
    openapiBackend,
    Inert,
    Vision,
    Blip,
    ErrorHandling,
    Util.Hapi.HapiEventPlugin
    // TODO: check do we really need this headers validation for Outbound/Inbound services
    // Util.Hapi.FSPIOPHeaderValidation
  ]

  // filter out any null values
  plugins = plugins.filter(function (e) {
    return e != null
  })

  await server.register(plugins)

  // use as a catch-all handler
  server.route({
    method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    path: '/{path*}',
    handler: (req, h): ServerRoute =>
      openapiBackend.options.openapi.handleRequest(
        {
          method: req.method,
          path: req.path,
          body: req.payload,
          query: req.query,
          headers: req.headers
        },
        req,
        h
      )
    // TODO: follow instructions
    // https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#postresponsehandler-handler
  })

  return server
}

export default {
  register
}
