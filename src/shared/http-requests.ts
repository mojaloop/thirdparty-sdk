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

import { Logger as SDKLogger, RequestOptions, request, requests } from '@mojaloop/sdk-standard-components'
import { PrependFun, Scheme, prepend2Uri } from '~/shared/http-scheme'
import { throwOrExtractData } from '~/shared/throw-or-extract-data'
import http from 'http'

export interface HttpRequestsConfig {
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
 * @class HttpRequest
 * @description tiny wrapper dedicated to make requests with proper logging
 */
export class HttpRequests {
  // request config
  protected _config: HttpRequestsConfig

  // the http agent to make requests
  protected agent: http.Agent

  constructor(config: HttpRequestsConfig) {
    this._config = config
    this.agent = new http.Agent({
      keepAlive: typeof config.keepAlive === 'undefined' ? true : config.keepAlive
    })
  }

  // GETTERS

  // config getter
  // to allow polymorphic properties in derived classes later
  protected get config(): HttpRequestsConfig {
    return this._config
  }

  // get sdk logger
  protected get logger(): SDKLogger.Logger {
    return this.config.logger
  }

  // generates minimal set of headers for request
  protected get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Date: new Date().toUTCString()
    }
  }

  // getter used to implement dynamic protected method
  // which is used to generate fullUri
  protected get prependScheme(): PrependFun {
    return prepend2Uri(this.config.scheme)
  }

  // METHODS

  // build full URI pointing to backend endpoint using config.uri and config.scheme
  get endpoint(): string {
    return this.prependScheme(this.config.uri)
  }

  // generates the full uri from given path
  fullUri(path: string): string {
    return `${this.endpoint}/${path}`
  }

  // request with proper logging
  // extracts data from response
  // throws HTTPResponseError exception if received response has non-successful statusCode
  async loggedRequest<Response>(opts: RequestOptions): Promise<Response | void> {
    const optsWithDefaults = {
      headers: this.headers,
      ...opts
    }
    try {
      this.logger.push({ optsWithDefaults }).info(`Executing ${this.config.scheme} ${opts.method} request`)
      const res = await request<Response>(optsWithDefaults)
      return throwOrExtractData<Response>(res)
    } catch (err) {
      this.logger
        .push({ err })
        .error(`Error attempting ${this.config.scheme} ${optsWithDefaults.method} ${optsWithDefaults.uri}`)
      throw err
    }
  }

  // HTTP methods helpers to stringify
  // GET
  async get<Response>(path: string): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(path),
      agent: this.agent,
      method: 'GET'
    })
  }

  // PATCH
  async patch<Body, Response>(path: string, body: Body): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(path),
      agent: this.agent,
      method: 'PATCH',
      body: requests.common.bodyStringifier(body)
    })
  }

  // POST
  async post<Body, Response>(path: string, body: Body): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(path),
      agent: this.agent,
      method: 'POST',
      body: requests.common.bodyStringifier(body)
    })
  }

  // PUT
  async put<Body, Response>(path: string, body: Body): Promise<Response | void> {
    return this.loggedRequest({
      uri: this.fullUri(path),
      agent: this.agent,
      method: 'PUT',
      body: requests.common.bodyStringifier(body)
    })
  }
}
