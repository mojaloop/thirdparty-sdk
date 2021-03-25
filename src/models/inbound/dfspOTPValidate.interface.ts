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

 - Kevin Leyow - kevin.leyow@modusbox.com
 --------------
 ******/
import {
  ControlledStateMachine,
  PersistentModelConfig, StateData
} from '~/models/persistent.model'
import { Method } from 'javascript-state-machine'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components';
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { PubSub } from '~/shared/pub-sub'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests';

export enum DFSPOTPValidateModelState {
  start = 'start',
  validateOTP = 'validateOTP',
  requestScopes = 'requestScopes',
  sendConsent = 'sendConsent',
  errored = 'errored'
}

export interface BackendValidateOTPResponse {
  isValid: boolean
}

export interface BackendGetScopesResponse {
  scopes: tpAPI.Schemas.Scope[]
}

export interface DFSPOTPValidateStateMachine extends ControlledStateMachine {
  validateOTP: Method
  onValidateOTP: Method
  requestScopes: Method
  onRequestScopes: Method
  sendConsent: Method
  onSendConsent: Method
}

export interface DFSPOTPValidateModelConfig extends PersistentModelConfig {
  pubSub: PubSub
  thirdpartyRequests: ThirdpartyRequests
  dfspBackendRequests: DFSPBackendRequests
}

// state machine does not return a response as an inbound handler state machine
export interface DFSPOTPValidateData extends StateData {
  toParticipantId: string
  consentRequestsRequestId: string
  authToken: string
  scopes?: BackendGetScopesResponse
}
