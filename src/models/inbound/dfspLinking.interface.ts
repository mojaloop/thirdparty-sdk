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

 - Sridhar Voruganti - sridhar.voruganti@modusbox.com
 --------------
 ******/
import {
  ControlledStateMachine,
  PersistentModelConfig,
  StateData
} from '~/models/persistent.model'
import { Method } from 'javascript-state-machine'
import { ThirdpartyRequests, MojaloopRequests } from '@mojaloop/sdk-standard-components'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { PubSub } from '~/shared/pub-sub'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'

export enum DFSPLinkingPhase {
  requestConsent = 'requestConsent',
  requestConsentAuthenticate = 'requestConsentAuthenticate',
  waitOnAuthTokenFromPISPResponse = 'waitOnAuthTokenFromPISPResponse',
  waitOnSignedCredentialFromPISPResponse = 'waitOnSignedCredentialFromPISPResponse',
  waitOnAuthServiceResponse = 'waitOnAuthServiceResponse',
  waitOnThirdpartyLinkRegistrationResponse = 'waitOnThirdpartyLinkRegistrationResponse',
  waitOnVerificationNotification = 'waitOnVerificationNotification'
}

// TODO: Let keep Backend* interfaces in DFSPBackendRequests
// https://github.com/mojaloop/thirdparty-scheme-adapter/blob/master/src/shared/dfsp-backend-requests.ts
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
  accountId: string
  consentId: string
  registrationChallenge: string
}

export interface DFSPLinkingStateMachine extends ControlledStateMachine {
  validateRequest: Method
  onValidateRequest: Method
  storeReqAndSendOTP: Method
  onStoreReqAndSendOTP: Method
  sendLinkingChannelResponse: Method
  onSendLinkingChannelResponse: Method
  validateAuthToken: Method
  onValidateAuthToken: Method
  grantConsent: Method
  onGrantConsent: Method
  validateWithAuthService: Method
  onValidateWithAuthService: Method
  storeValidatedConsentWithDFSP: Method
  onStoreValidatedConsentWithDFSP: Method
  finalizeThirdpartyLinkWithALS: Method
  onFinalizeThirdpartyLinkWithALS: Method
  notifyVerificationToPISP: Method
  onNotifyVerificationToPISP: Method
}

export interface DFSPLinkingModelConfig extends PersistentModelConfig {
  subscriber: PubSub
  thirdpartyRequests: ThirdpartyRequests
  mojaloopRequests: MojaloopRequests
  dfspBackendRequests: DFSPBackendRequests
  requestProcessingTimeoutSeconds: number
  testOverrideConsentID?: string | undefined
}
export interface DFSPLinkingData extends StateData {
  dfspId: string
  toParticipantId: string
  toAuthServiceParticipantId: string
  consentRequestId: string
  consentId?: string
  // scopes from the initial `consentRequestsPostRequest` will be stored
  // for later reference to save the DFSP from having to retrieve them from
  // their backend
  scopes?: tpAPI.Schemas.Scope[]

  // request consent phase
  consentRequestsPostRequest: tpAPI.Schemas.ConsentRequestsPostRequest
  backendValidateConsentRequestsResponse?: BackendValidateConsentRequestsResponse

  // authenticate phase
  consentRequestsIDPutRequest?:
    tpAPI.Schemas.ConsentRequestsIDPutResponseOTP |
    tpAPI.Schemas.ConsentRequestsIDPutResponseWeb
  consentRequestsIDPatchResponse?: tpAPI.Schemas.ConsentRequestsIDPatchRequest

  // grant consent phase
  consentPostRequest?: tpAPI.Schemas.ConsentsPostRequestPISP

  // credential registration phase
  // inbound PUT /consent/{ID} response which contains the signed credential
  consentIDPutResponseSignedCredentialFromPISP?: tpAPI.Schemas.ConsentsIDPutResponseSigned

  // request that passes signed credential to auth-service
  consentPostRequestToAuthService?: tpAPI.Schemas.ConsentsPostRequestAUTH

  // response expected from the consentPostRequestToAuthService request
  consentIDPutResponseFromAuthService?: tpAPI.Schemas.ConsentsIDPutResponseVerified

  // unimplemented request to ALS to batch create THIRD_PARTY_LINK objects
  // for accountId's
  thirdpartyLinkRequestsToALS?: tpAPI.Schemas.ParticipantsPostRequest[]
  thirdpartyLinkResponseFromALS?: tpAPI.Schemas.ParticipantsIDPutResponse

  // final request to notify the PISP that consent has been established
  consentIDPatchRequest?: tpAPI.Schemas.ConsentRequestsIDPatchRequest

  errorInformation?: tpAPI.Schemas.ErrorInformation
}
