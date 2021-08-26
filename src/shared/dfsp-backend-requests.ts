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
import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
export interface BackendValidateConsentRequestsResponse {
  isValid: boolean
  data: {
    authChannels: tpAPI.Schemas.ConsentRequestChannelType[]
    authUri?: string
  }
  errorInformation?: fspiopAPI.Schemas.ErrorInformation
}

export interface BackendSendOTPRequest {
  consentRequestId: string
  username: string
  message: string
}

export interface BackendSendOTPResponse {
  otp: string
}

export interface BackendStoreScopesRequest {
  scopes: tpAPI.Schemas.Scope[]
}

export interface BackendValidateAuthTokenResponse {
  isValid: boolean
}

export interface BackendGetScopesResponse {
  scopes: tpAPI.Schemas.Scope[]
}

export interface BackendStoreValidatedConsentRequest {
  scopes: tpAPI.Schemas.Scope[]
  consentId: string
  consentRequestId: string
  registrationChallenge: string
  credential: tpAPI.Schemas.VerifiedCredential
}

export interface BackendTransactionRequestContext {
  // The FSPIOP-compatible payer.payerPartyIdInfo field
  payerPartyIdInfo: fspiopAPI.Schemas.PartyIdInfo,

  // The ID of the consent for the transaction request
  // based on the payer.idValue of the Thirdparty Transaction Request
  consentId: string
}

export interface IsValidResponse {
  isValid: boolean
}
export interface DFSPBackendConfig extends HttpRequestsConfig {
  verifyAuthorizationPath: string
  verifyConsentPath: string
  getUserAccountsPath: string
  validateAuthTokenPath: string
  validateThirdpartyTransactionRequestPath: string
  validateConsentRequestsPath: string
  sendOTPPath: string
  storeConsentRequestsPath: string
  storeValidatedConsentForAccountIdPath: string
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

  // validate auth token path getter
  get validateAuthTokenPath (): string {
    return this.config.validateAuthTokenPath
  }

  // get path for validation of ThirdpartyTransactionRequest
  get validateThirdpartyTransactionRequestPath (): string {
    return this.config.validateThirdpartyTransactionRequestPath
  }

  // validate ConsentRequests path getter
  get validateConsentRequestsPath (): string {
    return this.config.validateConsentRequestsPath
  }

  // validate ConsentRequests path getter
  get sendOTPPath (): string {
    return this.config.sendOTPPath
  }

  // validate ConsentRequests path getter
  get storeConsentRequestsPath (): string {
    return this.config.storeConsentRequestsPath
  }

  get storeValidatedConsentForAccountIdPath (): string {
    return this.config.storeValidatedConsentForAccountIdPath
  }


  // REQUESTS

  // request user's accounts details from DFSP Backend
  async getUserAccounts (userId: string): Promise<tpAPI.Schemas.AccountsIDPutResponse | void> {
    const accountsPath = this.getUserAccountsPath.replace('{ID}', userId)
    return this.get<tpAPI.Schemas.AccountsIDPutResponse>(accountsPath)
  }

  async validateConsentRequests (
    request: tpAPI.Schemas.ConsentRequestsPostRequest
  ): Promise<BackendValidateConsentRequestsResponse | void> {
    const path = this.validateConsentRequestsPath
    return this.post<tpAPI.Schemas.ConsentRequestsPostRequest, BackendValidateConsentRequestsResponse>(path, request)
  }

  async sendOTP (
    request: tpAPI.Schemas.ConsentRequestsPostRequest
  ): Promise<BackendSendOTPResponse | void> {
    const otpRequest: BackendSendOTPRequest = {
      consentRequestId: request.consentRequestId,
      username: 'TBD',
      message: 'TBD'
    }
    return this.post<BackendSendOTPRequest, BackendSendOTPResponse>(this.sendOTPPath, otpRequest)
  }

  async storeConsentRequests (
    request: tpAPI.Schemas.ConsentRequestsPostRequest
  ): Promise<void> {
    const path = this.storeConsentRequestsPath.replace('{ID}', request.consentRequestId)
    const scopesReq: BackendStoreScopesRequest = {
      scopes: request.scopes
    }
    return this.post<BackendStoreScopesRequest, Promise<void>>(path, scopesReq)
  }

  // POST the consent request ID and authToken for a DFSP to validate.
  // This check is needed to continue the flow of responding to a /consentRequest
  // with either a POST /consents or PUT /consentRequests/{ID}/error
  async validateAuthToken (consentRequestId: string, authToken: string): Promise<BackendValidateAuthTokenResponse | void> {
    const validateRequest = {
      consentRequestId: consentRequestId,
      authToken: authToken
    }

    return this.post(this.validateAuthTokenPath, validateRequest)
  }

  // validate ThirdpartyTransactionRequest and get context we will need to complete the transaction
  async validateThirdpartyTransactionRequestAndGetContext (
    request: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest
  ): Promise<IsValidResponse & BackendTransactionRequestContext | void> {
    return this.post(this.validateThirdpartyTransactionRequestPath, request)
  }

  // validate Authorization response received from PISP
  async verifyAuthorization (
    request: fspiopAPI.Schemas.AuthorizationsIDPutResponse
  ): Promise<IsValidResponse | void> {
    return this.post(this.verifyAuthorizationPath, request)
  }

  async storeValidatedConsentForAccountId (
    scopes: tpAPI.Schemas.Scope[],
    consentId: string,
    consentRequestId: string,
    registrationChallenge: string,
    credential: tpAPI.Schemas.VerifiedCredential
  ): Promise<void> {
    const validatedConsent: BackendStoreValidatedConsentRequest = {
      scopes,
      consentId,
      consentRequestId,
      registrationChallenge,
      credential
    }
    return this.post(this.storeValidatedConsentForAccountIdPath, validatedConsent)
  }
}
