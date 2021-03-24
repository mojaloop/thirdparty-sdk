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
import {
  ThirdpartyRequests,
  MojaloopRequests
} from '@mojaloop/sdk-standard-components'
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { OutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { Method } from 'javascript-state-machine'
import { ErrorInformation } from '~/interface/types'
import { ControlledStateMachine, StateData, PersistentModelConfig } from '~/models/persistent.model'
import { PubSub } from '~/shared/pub-sub'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'

export enum RequestPartiesInformationState {
  COMPLETED = 'COMPLETED',
  WAITING_FOR_REQUEST_PARTY_INFORMATION = 'WAITING_FOR_REQUEST_PARTY_INFORMATION',
  ERROR_OCCURRED = 'ERROR_OCCURRED'
}

export enum PISPTransactionModelState {
  start = 'start',
  partyLookupSuccess = 'partyLookupSuccess',
  partyLookupFailure = 'partyLookupFailure',
  authorizationReceived = 'authorizationReceived',
  transactionStatusReceived = 'transactionStatusReceived',
  errored = 'errored'
}

export enum PISPTransactionPhase {
  lookup = 'lookup',
  initiation = 'initiation',
  approval = 'approval',
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
  pubSub: PubSub
  thirdpartyRequests: ThirdpartyRequests
  mojaloopRequests: MojaloopRequests
  sdkOutgoingRequests: SDKOutgoingRequests
}

// derived from request body specification
// '../../node_modules/@mojaloop/api-snippets/v1.0/openapi3/schemas/PartyIdInfo.yaml'
export interface PayeeLookupRequest {
  partyIdType: string,
  partyIdentifier: string,
  partySubIdOrType?: string
  // `fspId` optional field intentionally skipped
}

export interface ThirdpartyTransactionPartyLookupRequest {
  transactionRequestId: string
  payee: PayeeLookupRequest
}

export interface ThirdpartyTransactionPartyLookupResponse {
  party?: tpAPI.Schemas.Party
  errorInformation?: ErrorInformation
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionInitiateRequest {
  sourceAccountId: string
  consentId: string
  payee: tpAPI.Schemas.Party
  payer: tpAPI.Schemas.PartyTPLink
  amountType: tpAPI.Schemas.AmountType
  amount: tpAPI.Schemas.Money
  transactionType: tpAPI.Schemas.TransactionType
  expiration: string
}

export interface ThirdpartyTransactionInitiateResponse {
  authorization: tpAPI.Schemas.AuthorizationsPostRequest
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionStatus {
  transactionId: string
  transactionRequestState: 'RECEIVED' | 'PENDING' | 'ACCEPTED' | 'REJECTED',
  transactionState: 'RECEIVED' | 'PENDING' | 'COMPLETED' | 'REJECTED'
}

export interface ThirdpartyTransactionApproveResponse {
  transactionStatus: ThirdpartyTransactionStatus
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionApproveRequest {
  authorizationResponse: tpAPI.Schemas.AuthorizationsIDPutResponse
}

export interface PISPTransactionData extends StateData {
  transactionRequestId?: string

  // party lookup
  payeeRequest?: PayeeLookupRequest
  payeeResolved?: OutboundAPI.Schemas.partiesByIdResponse
  partyLookupResponse?: ThirdpartyTransactionPartyLookupResponse

  // initiate
  initiateRequest?: ThirdpartyTransactionInitiateRequest
  authorizationRequest?: tpAPI.Schemas.AuthorizationsPostRequest
  initiateResponse?: ThirdpartyTransactionInitiateResponse

  // approve
  approveRequest?: ThirdpartyTransactionApproveRequest
  transactionStatus?: ThirdpartyTransactionStatus
  approveResponse?: ThirdpartyTransactionApproveResponse
}
