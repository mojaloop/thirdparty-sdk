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

import { HttpRequestsConfig, HttpRequests } from '~/shared/http-requests'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { requests } from '@mojaloop/sdk-standard-components'
import { BackendValidateOTPResponse, BackendGetScopesResponse } from '../models/inbound/dfspOTPValidate.interface'

export interface DFSPBackendConfig extends HttpRequestsConfig {
  verifyAuthorizationPath: string
  verifyConsentPath: string
  getUserAccountsPath: string
  validateOTPPath: string
  getScopesPath: string
}

/**
 * @class DFSPBackendRequests
 * @description tiny wrapper dedicated to make requests to DFSP backend endpoint
 */
export class DFSPBackendRequests extends HttpRequests {
  // we want this constructor for better code support
  // eslint-disable-next-line no-useless-constructor
  constructor (config: DFSPBackendConfig) {
    super(config)
  }

  // GETTERS

  // config getter
  // polymorphism for getters can be handy and saves a lot of type casting
  protected get config (): DFSPBackendConfig {
    return super.config as unknown as DFSPBackendConfig
  }

  // verify authorization path getter
  get verifyAuthorizationPath (): string {
    return this.config.verifyAuthorizationPath
  }

  // verify consent path getter
  get verifyConsentPath (): string {
    return this.config.verifyConsentPath
  }

  // get accounts path getter
  get getUserAccountsPath (): string {
    return this.config.getUserAccountsPath
  }

  // validate OTP path getter
  get validateOTPPath (): string {
    return this.config.validateOTPPath
  }

  // get scopes path getter
  get getScopesPath (): string {
    return this.config.getScopesPath
  }

  // REQUESTS
  /**
   * TODO:
   *  verifyConsent
   *  verifyAuthorization
   */

  // request user's accounts details from DFSP Backend
  async getUserAccounts (userId: string): Promise<tpAPI.Schemas.AccountsIDPutResponse | void> {
    const accountsPath = this.getUserAccountsPath.replace('{ID}', userId)
    return this.get<tpAPI.Schemas.AccountsIDPutResponse>(accountsPath)
  }

  // POST the consent request ID and authToken for a DFSP to validate.
  // This check is needed to continue the flow of responding to a /consentRequest
  // with either a POST /consents or PUT /consentRequests/{ID}/error
  async validateOTPSecret (consentRequestId: string, authToken: string): Promise<BackendValidateOTPResponse | void> {
    const uri = this.fullUri(this.validateOTPPath)
    this.logger.push({ uri, template: this.validateOTPPath }).info('validateOTPSecret')

    const validateRequest = requests.common.bodyStringifier({
      consentRequestId: consentRequestId,
      authToken: authToken
    })

    return this.loggedRequest<BackendValidateOTPResponse>({
      uri,
      method: 'POST',
      headers: this.headers,
      agent: this.agent,
      body: validateRequest
    })
  }

  // retrieve the scopes that PISP is granted on a user's behalf
  async getScopes (consentRequestId: string): Promise<BackendGetScopesResponse | void> {
    const uri = this.fullUri(
      this.getScopesPath.replace('{ID}', consentRequestId)
    )
    this.logger.push({ uri, template: this.getScopesPath }).info('getScopes')

    return this.loggedRequest<BackendGetScopesResponse>({
      uri,
      method: 'GET',
      headers: this.headers,
      agent: this.agent
    })
  }
}
