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
import {
  ThirdpartyRequests
} from '@mojaloop/sdk-standard-components'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { PubSub } from '~/shared/pub-sub'

export enum OutboundAccountsModelState {
  start = 'WAITING_FOR_ACCOUNTS_REQUEST',
  succeeded = 'COMPLETED',
  errored = 'ERROR_OCCURRED'
}

export interface OutboundAccountsGetResponse {
  accounts: tpAPI.Schemas.AccountsIDPutResponse | fspiopAPI.Schemas.ErrorInformationObject,
  currentState: OutboundAccountsModelState;
}

export interface OutboundAccountsStateMachine extends ControlledStateMachine {
  requestAccounts: Method
  onRequestAccounts: Method
}

export interface OutboundAccountsModelConfig extends PersistentModelConfig {
  pubSub: PubSub
  requests: ThirdpartyRequests
}

export interface OutboundAccountsData extends StateData {
  toParticipantId: string
  userId: string
  response?: OutboundAccountsGetResponse
}
