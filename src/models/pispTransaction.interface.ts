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
  partyLookup = 'partyLookup',
  partyLookupSuccess = 'partyLookupSuccess',
  requestTransaction = 'requestTransaction',
  authorizationReceived = 'authorizationReceived',
  approvalReceived = 'approvalReceived',
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
  onResolvedPartyLookup: Method,
  initiate: Method,
  onInitiate: Method,
  requestAuthorization: Method,
  onRequestAuthorization: Method,
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

export interface PayeeLookupRequest {
  type: string,
  id: string,
  subId?: string
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

export interface ThirdpartyTransactionApproveRequest {
  signedChallenge: InboundAuthorizationsPutRequest
}

export interface ThirdpartyTransactionApproveResponse {
  transactionId: string
  transactionRequestState: 'RECEIVED' | 'PENDING' | 'ACCEPTED' | 'REJECTED'
}

export interface PISPTransactionData extends StateData {
  transactionRequestId: string
  payeeRequest: PayeeLookupRequest
  partyLookupResponse: ThirdpartyTransactionPartyLookupResponse
  payeeResolved: TParty
  initiateRequest: ThirdpartyTransactionInitiateRequest
  authorizationRequest: InboundAuthorizationsPostRequest
  initiateResponse: ThirdpartyTransactionInitiateResponse
}
