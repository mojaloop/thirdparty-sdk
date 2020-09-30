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

import { Logger as SDKLogger, RequestOptions, RequestResponse, request, requests } from '@mojaloop/sdk-standard-components'
import { AuthenticationValue, InboundAuthorizationsPostRequest } from '~/models/authorizations.interface'
import { PrependFun, Scheme, prepend2Uri } from '~/shared/http-scheme'
import { throwOrExtractData } from '~/shared/throw-or-extract-data'

import http from 'http'

export interface BackendConfig {
  // FSP id of this DFSP
  dfspId: string

  logger: SDKLogger.Logger

  // type of http scheme
  scheme: Scheme

  // target uri for all requests
  uri: string

  // should we keep alive connection with backend,
  // default 'true' if not specified
  keepAlive?: boolean
}

/**
 * @class BackendRequests
 * @description tiny wrapper dedicated to make requests to DFSP backend endpoint
 */
export class BackendRequests {
  // requests config
  protected config: BackendConfig

  // the http agent to make requests
  protected agent: http.Agent

  constructor (config: BackendConfig) {
    this.config = config
    this.agent = new http.Agent({
      keepAlive: typeof config.keepAlive === 'undefined' ? true : config.keepAlive
    })
  }

  protected get logger (): SDKLogger.Logger {
    return this.config.logger
  }

  // generates minimal set of headers for request
  protected get headers (): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Date: new Date().toUTCString()
    }
  }

  // getter used to implement dynamic protected method
  // which is used to generate fullUri
  protected get prependScheme (): PrependFun {
    return prepend2Uri(this.config.scheme)
  }

  // build full URI pointing to backend endpoint using config.uri and config.scheme
  get endpoint (): string {
    return this.prependScheme(this.config.uri)
  }

  fullUri (path: string): string {
    return `${this.endpoint}/${path}`
  }

  // makes the requests with proper logging
  async loggedRequest<Response> (opts: RequestOptions): Promise<Response | void> {
    try {
      this.logger.push({ opts }).info(`Executing Backend ${this.config.scheme} ${opts.method} request`)
      return request<Response>(opts).then((res: RequestResponse<Response>) => throwOrExtractData<Response>(res))
    } catch (err) {
      this.logger.push({ err }).error(`Error attempting Backend ${this.config.scheme} ${opts.method} request`)
      throw err
    }
  }

  // makes a GET to Backend
  async get<Response> (uri: string): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(uri),
      method: 'GET',
      headers: this.headers,
      agent: this.agent
    })
  }

  // makes a PATCH to Backend
  async patch<Body, Response> (uri: string, body: Body): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(uri),
      method: 'PATCH',
      body: requests.common.bodyStringifier(body),
      headers: this.headers,
      agent: this.agent
    })
  }

  // makes a POST to Backend
  async post<Body, Response> (uri: string, body: Body): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(uri),
      method: 'POST',
      body: requests.common.bodyStringifier(body),
      headers: this.headers,
      agent: this.agent
    })
  }

  // makes a PUT to Backend
  async put<Body, Response> (uri: string, body: Body): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(uri),
      method: 'PUT',
      body: requests.common.bodyStringifier(body),
      headers: this.headers,
      agent: this.agent
    })
  }

  // requests signing of Authorization Request
  // PISP Backend will ask the User to sign AuthorizationRequest
  // and in response delivers the cryptographic proof of signing in AuthenticationValue.pinValue
  async signAuthorizationRequest (
    inRequest: InboundAuthorizationsPostRequest
  ): Promise<AuthenticationValue | void> {
    return this.post<InboundAuthorizationsPostRequest, AuthenticationValue>(
      'signchallenge', inRequest
    )
  }
}
