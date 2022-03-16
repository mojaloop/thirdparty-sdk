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
import { HttpRequestsConfig, HttpRequests } from '~/shared/http-requests'
import {
  OutboundRequestToPayTransferPostRequest,
  OutboundRequestToPayTransferPostResponse
} from '../models/thirdparty.transactions.interface'
import { OutboundAPI } from '@mojaloop/sdk-scheme-adapter'
export interface SDKOutgoingRequestsConfig extends HttpRequestsConfig {
  requestPartiesInformationPath: string
  requestToPayTransferPath: string
  requestQuotePath: string
  requestAuthorizationPath: string
  requestTransferPath: string
}

/**
 * @class SDKOutgoingRequest
 * @description tiny wrapper dedicated to make requests to Mojaloop SDK Outgoing
 *
 */
export class SDKOutgoingRequests extends HttpRequests {
  // we want this constructor for better code support
  // eslint-disable-next-line no-useless-constructor
  constructor (config: SDKOutgoingRequestsConfig) {
    super(config)
  }

  // GETTERS

  // config getter
  // polymorphism for getters can be handy and saves a lot of type casting
  protected get config (): SDKOutgoingRequestsConfig {
    return super.config as unknown as SDKOutgoingRequestsConfig
  }

  // requestToPayTransfer path getter
  get requestPartiesInformationPath (): string {
    return this.config.requestPartiesInformationPath
  }

  // requestToPayTransfer path getter
  get requestToPayTransferPath (): string {
    return this.config.requestToPayTransferPath
  }

  // requestQuote path getter
  get requestQuotePath (): string {
    return this.config.requestQuotePath
  }

  // requestAuthorization path getter
  get requestAuthorizationPath (): string {
    return this.config.requestAuthorizationPath
  }

  // requestTransfer path getter
  get requestTransferPath (): string {
    return this.config.requestTransferPath
  }

  // REQUESTS - synchronous calls to SDKOutgoing

  /**
   * @method requestPartiesInformation
   * @description used to retrieve information about the Party
   * @param {string} type - type of party
   * @param {string} id - id of party
   * @param {string} [subId] - optional sub id of party
   * @returns {Promise<OutboundAPI.Schemas.partiesByIdResponse | void>} information about the party
   */
  async requestPartiesInformation (
    type: string, id: string, subId?: string
  ): Promise<OutboundAPI.Schemas.partiesByIdResponse | void> {
    // generate uri from template
    const uri = this.fullUri(
      // config.SHARED.SDK_OUTGOING_PARTIES_INFORMATION_PATH
      this.requestPartiesInformationPath
        .replace('{Type}', type)
        .replace('{ID}', id)
        // SubId is optional so replace placeholder or cleanup the path
        .replace(
          subId ? '{SubId}' : '/{SubId}',
          subId || ''
        )
    )
    this.logger.push({ uri }).info('requestPartiesInformation')

    // make the GET /parties/{Type}/{ID}[/{SubId}] call
    return this.loggedRequest<OutboundAPI.Schemas.partiesByIdResponse>({
      uri,
      method: 'GET',
      headers: this.headers,
      agent: this.agent
    })
  }

  /**
   * @method requestQuote
   * @param {OutboundAPI.Schemas.quotesPostRequest} request - quotes request
   * @returns {Promise<<OutboundAPI.Schemas.quotesPostResponse|void>} - quotes response
   */
  async requestQuote (
    request: OutboundAPI.Schemas.quotesPostRequest
  ): Promise<OutboundAPI.Schemas.quotesPostResponse | void> {
    return this.post(this.requestQuotePath, request)
  }

  /**
   * @method requestTransfer
   * @param {OutboundAPI.Schemas.simpleTransfersPostRequest} request - transfer request
   * @returns {Promise<OutboundAPI.Schemas.simpleTransfersPostResponse | void>}
   */
  async requestTransfer (
    request: OutboundAPI.Schemas.simpleTransfersPostRequest
  ): Promise<OutboundAPI.Schemas.simpleTransfersPostResponse | void> {
    return this.post(this.requestTransferPath, request)
  }

  // TODO: drop it and replace by requestTransfer
  async requestToPayTransfer (
    request: OutboundRequestToPayTransferPostRequest
  ): Promise<OutboundRequestToPayTransferPostResponse | void> {
    return this.loggedRequest<OutboundRequestToPayTransferPostResponse>({
      uri: this.fullUri(this.requestToPayTransferPath),
      method: 'POST',
      body: requests.common.bodyStringifier(request),
      headers: this.headers,
      agent: this.agent
    })
  }
}
