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
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { PubSub } from '~/shared/pub-sub'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'

export enum DFSPLinkingPhase {
  requestConsent = 'requestConsent',
  requestConsentAuthenticate = 'requestConsentAuthenticate',
  waitOnAuthServiceResponse = 'waitOnAuthServiceResponse',
  waitOnALSParticipantResponse = 'waitOnALSParticipantResponse'
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

export interface BackendValidateOTPResponse {
  isValid: boolean
}

export interface BackendGetScopesResponse {
  scopes: tpAPI.Schemas.Scope[]
}

export interface DFSPLinkingStateMachine extends ControlledStateMachine {
  validateRequest: Method
  onValidateRequest: Method
  storeReqAndSendOTP: Method
  onStoreReqAndSendOTP: Method
  validateAuthToken: Method
  onValidateAuthToken: Method
  grantConsent: Method
  onGrantConsent: Method
  validateWithAuthService: Method
  onValidateWithAuthService: Method
  finalizeConsentWithALS: Method
  onFinalizeConsentWithALS: Method
  notifyVerificationToPISP: Method
  onNotifyVerificationToPISP: Method
}

export interface DFSPLinkingModelConfig extends PersistentModelConfig {
  pubSub: PubSub
  thirdpartyRequests: ThirdpartyRequests
  dfspBackendRequests: DFSPBackendRequests
  requestProcessingTimeoutSeconds: number
}
export interface DFSPLinkingData extends StateData {
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
  consentRequestsIDPatchRequest?: tpAPI.Schemas.ConsentRequestsIDPatchRequest

  // grant consent phase
  consentPostRequest?: tpAPI.Schemas.ConsentsPostRequest

  // credential registration phase
  consentIDPutRequest?: tpAPI.Schemas.ConsentsIDPutResponseSigned
  consentPostRequestToAuthService?: tpAPI.Schemas.ConsentsPostRequest
  consentIDPutRequestFromAuthService?: tpAPI.Schemas.ConsentsIDPutResponseVerified
  participantPutRequestFromALS?: fspiopAPI.Schemas.ParticipantsIDPutResponse
  thirdpartyLinkRequestsToALS?: tpAPI.Schemas.ParticipantsPostRequest[]
  consentIDPatchRequest?: tpAPI.Schemas.ConsentRequestsIDPatchRequest
}
