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

import { requests } from '@mojaloop/sdk-standard-components'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { HttpRequestConfig, HttpRequest } from '~/shared/http-request'
import {
  OutboundRequestToPayTransferPostRequest,
  OutboundRequestToPayTransferPostResponse
} from '../thirdparty.transactions.interface'
import config from '~/shared/config'
import { ValidateOTPResponse } from './consentRequests.model';
import {
  RequestPartiesInformationResponse,
  ThirdpartyTransactionStatus
} from '../pispTransaction.interface'

export interface BackendConfig extends HttpRequestConfig {
  // the path for signAuthorizationRequest
  signAuthorizationPath: string
  validateOTPPath: string
  getScopesPath: string
  uri: string
}

/**
 * @class BackendRequests
 * @description tiny wrapper dedicated to make requests to DFSP backend endpoint
 */
export class BackendRequests extends HttpRequest {
  // we want this constructor for better code support
  // eslint-disable-next-line no-useless-constructor
  constructor (config: BackendConfig) {
    super(config)
  }

  // GETTERS
  get signAuthorizationPath (): string {
    return (this.config as unknown as BackendConfig).signAuthorizationPath
  }
  get validateOTPPath (): string {
    return (this.config as unknown as BackendConfig).validateOTPPath
  }
  get getScopesPath (): string {
    return (this.config as unknown as BackendConfig).getScopesPath
  }
  get backendURI (): string {
    return (this.config as unknown as BackendConfig).uri
  }
  // requests signing of Authorization Request
  // PISP Backend will ask the User to sign AuthorizationRequest
  // and in response delivers the cryptographic proof of signing in AuthenticationValue.pinValue
  async signAuthorizationRequest (
    inRequest: tpAPI.Schemas.AuthorizationsPostRequest
  ): Promise<fspiopAPI.Schemas.AuthenticationValue | void> {
    return this.post<tpAPI.Schemas.AuthorizationsPostRequest, fspiopAPI.Schemas.AuthenticationValue>(
      this.signAuthorizationPath, inRequest
    )
  }

  // get user account details from DFSP Backend
  async getUserAccounts (userId: string): Promise<tpAPI.Schemas.AccountsIDPutResponse | void> {
    const accountsPath = `accounts/${userId}`;
    return this.get<tpAPI.Schemas.AccountsIDPutResponse>(accountsPath)
  }

  async requestToPayTransfer (
    request: OutboundRequestToPayTransferPostRequest
  ): Promise<OutboundRequestToPayTransferPostResponse | void> {
    return this.loggedRequest<OutboundRequestToPayTransferPostResponse>({
      uri: this.prependScheme(config.SHARED.SDK_REQUEST_TO_PAY_TRANSFER_URI),
      method: 'POST',
      body: requests.common.bodyStringifier(request),
      headers: this.headers,
      agent: this.agent
    })
  }

  async notifyAboutTransfer (
    request: ThirdpartyTransactionStatus,
    id: string
  ): Promise<void> {
    return this.loggedRequest<void>({
      uri: this.prependScheme(config.SHARED.NOTIFY_ABOUT_TRANSFER_URI.replace('{ID}', id)),
      method: 'PATCH',
      body: requests.common.bodyStringifier(request),
      headers: {
        ...this.headers,
        'fspiop-source': config.SHARED.DFSP_ID
      },

      agent: this.agent
    })
  }

  async requestPartiesInformation (
    type: string, id: string, subId?: string
  ): Promise<RequestPartiesInformationResponse | void> {
    // generate uri from template
    const uri = this.prependScheme(
      config.SHARED.SDK_PARTIES_INFORMATION_URI
        .replace('{Type}', type)
        .replace('{ID}', id)
        // SubId is optional so replace placeholder or cleanup the path
        .replace(
          subId ? '{SubId}' : '/{SubId}',
          subId || ''
        )
    )
    this.logger.push({ uri, template: config.SHARED.SDK_PARTIES_INFORMATION_URI }).info('requestPartiesInformation')

    // make the GET /parties/{Type}/{ID}[/{SubId}] call
    return this.loggedRequest<RequestPartiesInformationResponse>({
      uri,
      method: 'GET',
      headers: this.headers,
      agent: this.agent
    })
  }

  // POST the consent request ID and authToken for a DFSP to validate.
  // This check is needed to continue the flow of responding to a /consentRequest
  // with either a POST /consents or PUT /consentRequests/{ID}/error
  async validateOTPSecret (consentRequestId: string, authToken: string): Promise<ValidateOTPResponse | void> {
    const uri = this.prependScheme(
      this.backendURI + '/' +
      this.validateOTPPath
    )
    this.logger.push({ uri, template: config.SHARED.DFSP_BACKEND_VALIDATE_OTP_PATH }).info('validateOTPSecret')

    const validateRequest = requests.common.bodyStringifier({
      "consentRequestId": consentRequestId,
      "authToken": authToken
    })

    return this.loggedRequest<ValidateOTPResponse>({
      uri,
      method: 'POST',
      headers: this.headers,
      agent: this.agent,
      body: validateRequest
    })
  }

  // retrieve the scopes that PISP is granted on a user's behalf
  async getScopes (consentRequestId: string): Promise<tpAPI.Schemas.Scope[] | void> {
    const uri = this.prependScheme(
      this.backendURI + '/' +
      this.getScopesPath
        .replace('{ID}', consentRequestId)
    )
    this.logger.push({ uri, template: config.SHARED.DFSP_BACKEND_GET_SCOPES_PATH }).info('getScopes')

    return this.loggedRequest<tpAPI.Schemas.Scope[]>({
      uri,
      method: 'GET',
      headers: this.headers,
      agent: this.agent
    })
  }
}
