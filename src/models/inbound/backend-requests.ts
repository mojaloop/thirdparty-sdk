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
import { uuid } from 'uuidv4';
import {
  RequestPartiesInformationResponse,
  ThirdpartyTransactionStatus
} from '../pispTransaction.interface'

export interface BackendConfig extends HttpRequestConfig {
  // the path for signAuthorizationRequest
  signAuthorizationPath: string
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

  // todo: create dfsp outbound calls for checking if OTP is valid.
  //       this is mocked for now
  async validateOTPSecret (_consentRequestId: string, _consentId: string): Promise<boolean> {
    return true
  }

  // todo: the dfsp needs to return the accounts and scopes for the consent request.
  //       this are mocked for now.
  async getScopesAndAccounts (_consentRequestId: string): Promise<tpAPI.Schemas.Scope[]> {
    return [
      {
        accountId: uuid(),
        actions: [
          'accounts.getBalance',
          'accounts.transfer'
        ]
      }]
  }
}
