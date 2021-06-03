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
  PersistentModelConfig, StateData
} from '~/models/persistent.model'
import { Method } from 'javascript-state-machine'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { PubSub } from '~/shared/pub-sub'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'


export enum PISPLinkingPhase {
  requestConsent = 'requestConsent',
  requestConsentAuthenticate = 'requestConsentAuthenticate',
  registerCredential = 'registerCredential'
}

export type PISPLinkingModelState =
  OutboundAPI.Schemas.LinkingRequestConsentState |
  OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateState |
  OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialState

export interface PISPLinkingStateMachine extends ControlledStateMachine {
  requestConsent: Method
  onRequestConsent: Method
  changeToWebAuthentication: Method
  changeToOTPAuthentication: Method
  authenticate: Method
  onAuthenticate: Method
  registerCredential: Method
  onRegisterCredential: Method
}

export interface PISPLinkingModelConfig extends PersistentModelConfig {
  pubSub: PubSub
  thirdpartyRequests: ThirdpartyRequests
  requestProcessingTimeoutSeconds: number
}

export interface PISPLinkingData extends StateData<PISPLinkingModelState> {
  consentRequestId: string
  // all subsequent outbound requests will use `model.data.toParticipantId`
  // taken from `linkingRequestConsentPostRequest.toParticipantId` vs. specifying
  // `toParticipantId` in each outbound request
  toParticipantId?: string

  // request consent phase
  linkingRequestConsentPostRequest: OutboundAPI.Schemas.LinkingRequestConsentPostRequest
  linkingRequestConsentInboundChannelResponse?:
    tpAPI.Schemas.ConsentRequestsIDPutResponseWeb |
    tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
  linkingRequestConsentPostResponse?: OutboundAPI.Schemas.LinkingRequestConsentResponse

  // authentication phase
  linkingRequestConsentIDAuthenticatePatchRequest?: OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateRequest
  linkingRequestConsentIDAuthenticateInboundConsentResponse?: tpAPI.Schemas.ConsentsPostRequest
  linkingRequestConsentIDAuthenticateResponse?: OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateResponse

  // pass/register credential phase
  linkingRequestConsentIDPassCredentialPostRequest?: OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialRequest
  linkingRequestConsentIDPassCredentialInboundConsentResponse?: tpAPI.Schemas.ConsentsIDPatchResponseVerified
  linkingRequestConsentIDPassCredentialResponse?: OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialResponse

  errorInformation?: tpAPI.Schemas.ErrorInformation
}
