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
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { HttpRequestsConfig, HttpRequests } from '~/shared/http-requests'

export interface PISPBackendConfig extends HttpRequestsConfig {
  // the path for signAuthorizationRequest
  signAuthorizationPath: string
}

/**
 * @class PISPBackendRequests
 * @description tiny wrapper dedicated to make requests to DFSP backend endpoint
 */
export class PISPBackendRequests extends HttpRequests {
  // we want this constructor for better code support
  // eslint-disable-next-line no-useless-constructor
  constructor (config: PISPBackendConfig) {
    super(config)
  }

  // getters

  // config getter
  // polymorphism for getters can be handy and saves a lot of type casting
  protected get config (): PISPBackendConfig {
    return super.config as unknown as PISPBackendConfig
  }

  get signAuthorizationPath (): string {
    return this.config.signAuthorizationPath
  }

  // used by handler in POST /authorizations @ Ingoing
  // requests signing of Authorization Request
  // PISP Backend will ask the User to sign AuthorizationRequest
  // and in response delivers the cryptographic proof of signing in AuthenticationValue.pinValue
  async signAuthorization (
    inRequest: tpAPI.Schemas.AuthorizationsPostRequest
  ): Promise<fspiopAPI.Schemas.AuthenticationValue | void> {
    return this.post<tpAPI.Schemas.AuthorizationsPostRequest, fspiopAPI.Schemas.AuthenticationValue>(
      this.signAuthorizationPath, inRequest
    )
  }
}
