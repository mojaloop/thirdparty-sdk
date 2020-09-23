import {
  ThirdpartyRequests,
  MojaloopRequests,
  TMoney, TParty, TAmountType, TransactionType
} from '@mojaloop/sdk-standard-components'
import { Method } from 'javascript-state-machine'
import { ControlledStateMachine, PersistentModelConfig, StateData } from '~/models/persistent.model'
import { PubSub } from '~/shared/pub-sub'
import { InboundAuthorizationsPostRequest, InboundAuthorizationsPutRequest } from './authorizations.interface'

export enum PISPTransactionModelState {
  start = 'start',
  partyLookupSuccess = 'partyLookupSuccess',
  authorizationReceived = 'authorizationReceived',
  transactionSuccess = 'transactionSuccess'
}

export enum PISPTransactionPhase {
  lookup = 'lookup',
  initiation = 'initiation',
  approval = 'approval',
}

export interface PISPTransactionStateMachine extends ControlledStateMachine {
  requestPartyLookup: Method,
  onRequestPartyLookup: Method,
  resolvedPartyLookup: Method,
  // probably not needed
  // onResolvedPartyLookup: Method,
  initiate: Method,
  onInitiate: Method,
  requestAuthorization: Method,
  // probably not needed
  // onRequestAuthorization: Method,
  approve: Method,
  onApprove: Method,
  notifySuccess: Method,
  onNotifySuccess: Method
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

// Need to store 2 things -
export interface ThirdpartyTransactionPartyLookupRequest {
  transactionRequestId: string
  payee: PayeeLookupRequest
}

export interface ThirdpartyTransactionPartyLookupResponse {
  party: TParty
  currentState: PISPTransactionModelState
}

export interface ThirdpartyTransactionInitiateRequest {
  transactionRequestId: string
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
  transactionRequestId: string
}

export interface PISPTransactionData extends StateData {
  transactionRequestId?: string

  // party lookup
  payeeRequest?: PayeeLookupRequest
  payeeResolved?: TParty
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
