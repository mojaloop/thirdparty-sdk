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
  MojaloopRequests,
  TMoney, TParty, TAmountType, TransactionType
} from '@mojaloop/sdk-standard-components'
import { Method } from 'javascript-state-machine'
import { ControlledStateMachine, PersistentModelConfig, StateData } from '~/models/persistent.model'
import { PubSub } from '~/shared/pub-sub'
import { InboundAuthorizationsPostRequest, InboundAuthorizationsPutRequest } from './authorizations.interface'

export interface PartiesPutResponse {
  party: TParty
}

export enum PISPTransactionModelState {
  start = 'start',
  partyLookupSuccess = 'partyLookupSuccess',
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
  requestPartyLookup: Method,
  onRequestPartyLookup: Method,
  initiate: Method,
  onInitiate: Method,
  approve: Method,
  onApprove: Method,
}

export interface PISPTransactionModelConfig extends PersistentModelConfig {
  pubSub: PubSub
  thirdpartyRequests: ThirdpartyRequests
  mojaloopRequests: MojaloopRequests
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
  party: TParty
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionInitiateRequest {
  sourceAccountId: string
  consentId: string
  payee: TParty
  payer: TParty
  amountType: TAmountType
  amount: TMoney
  transactionType: TransactionType
  expiration: string
}

export interface ThirdpartyTransactionInitiateResponse {
  authorization: InboundAuthorizationsPostRequest
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionStatus {
  transactionId: string
  transactionRequestState: 'RECEIVED' | 'PENDING' | 'ACCEPTED' | 'REJECTED'
}

export interface ThirdpartyTransactionApproveResponse {
  transactionStatus: ThirdpartyTransactionStatus
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionApproveRequest {
  authorizationResponse: InboundAuthorizationsPutRequest
}

export interface PISPTransactionData extends StateData {
  transactionRequestId?: string

  // party lookup
  payeeRequest?: PayeeLookupRequest
  payeeResolved?: PartiesPutResponse
  partyLookupResponse?: ThirdpartyTransactionPartyLookupResponse

  // initiate
  initiateRequest?: ThirdpartyTransactionInitiateRequest
  authorizationRequest?: InboundAuthorizationsPostRequest
  initiateResponse?: ThirdpartyTransactionInitiateResponse

  // approve
  approveRequest?: ThirdpartyTransactionApproveRequest
  transactionStatus?: ThirdpartyTransactionStatus
  approveResponse?: ThirdpartyTransactionApproveResponse
}
