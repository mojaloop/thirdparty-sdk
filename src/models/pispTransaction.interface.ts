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
 - Lewis Daly <lewisd@crosslaketech.com>
 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { ThirdpartyRequests, MojaloopRequests } from '@mojaloop/sdk-standard-components'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { Method } from 'javascript-state-machine'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'
import { ControlledStateMachine, StateData, PersistentModelConfig } from '~/models/persistent.model'
import { PubSub } from '~/shared/pub-sub'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'

export enum RequestPartiesInformationState {
  COMPLETED = 'COMPLETED',
  WAITING_FOR_REQUEST_PARTY_INFORMATION = 'WAITING_FOR_REQUEST_PARTY_INFORMATION',
  ERROR_OCCURRED = 'ERROR_OCCURRED'
}

export type PISPTransactionModelState =
  | OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupState
  | OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateState
  | OutboundAPI.Schemas.ThirdpartyTransactionIDApproveState

export enum PISPTransactionPhase {
  lookup = 'lookup',
  initiation = 'initiation',
  waitOnTransactionPut = 'waitOnTransactionPut',
  waitOnAuthorizationPost = 'waitOnAuthorizationPost',
  approval = 'approval'
}
export interface PISPTransactionStateMachine extends ControlledStateMachine {
  requestPartyLookup: Method
  onRequestPartyLookup: Method
  failPartyLookup: Method
  onFailPartyLookup: Method
  initiate: Method
  onInitiate: Method
  approve: Method
  onApprove: Method
}

export interface PISPTransactionModelConfig extends PersistentModelConfig {
  subscriber: PubSub
  thirdpartyRequests: ThirdpartyRequests
  mojaloopRequests: MojaloopRequests
  sdkOutgoingRequests: SDKOutgoingRequests
  initiateTimeoutInSeconds: number
  approveTimeoutInSeconds: number
}

export interface PISPTransactionData extends StateData<PISPTransactionModelState> {
  transactionRequestId?: string

  // party lookup
  payeeRequest?: OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupRequest
  payeeResolved?: SDKOutboundAPI.Schemas.partiesByIdResponse
  partyLookupResponse?: OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupResponse

  // initiate
  initiateRequest?: OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateRequest
  authorizationRequest?: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsPostRequest
  initiateResponse?: OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateResponse

  // approve
  approveRequest?: OutboundAPI.Schemas.ThirdpartyTransactionIDApproveRequest
  transactionStatusPut?: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
  transactionStatusPatch?: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse
  approveResponse?: OutboundAPI.Schemas.ThirdpartyTransactionIDApproveResponse
}
