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

import { Server } from '@hapi/hapi'
import onValidateFail from '~/handlers/shared/onValidateFail'
import { validateRoutes } from '@mojaloop/central-services-error-handling'
import { BaseRequestTLSConfig } from '@mojaloop/sdk-standard-components'
import { ServiceConfig } from '~/shared/config'

// distinguish APIs exposed
export enum ServerAPI {
  inbound = 'inbound',
  outbound = 'outbound'
}
// minimal server configuration
export interface ServerConfig {
  host: string
  port: number
  // the exposed api descriptor
  api: ServerAPI
  tls: BaseRequestTLSConfig
  serviceConfig: ServiceConfig
}
// server app interface accessible in handlers and plugins via settings.app[key]
export interface ServerApp {
  // specify which API is exposed
  api: ServerAPI
  serviceConfig: ServiceConfig
}

export default async function create(config: ServerConfig): Promise<Server> {
  const server: Server = new Server({
    host: config.host,
    port: config.port,
    routes: {
      validate: {
        options: validateRoutes(),
        failAction: onValidateFail
      }
    },
    app: {
      api: config.api,
      serviceConfig: config.serviceConfig
    },
    // only the inbound hapi server needs tls enabled
    tls: config.api == ServerAPI.inbound && config.tls.mutualTLS.enabled ? config.tls.creds : false
  })
  return server
}
