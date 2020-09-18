import { ThirdpartyRequests, MojaloopRequests, TParty } from '@mojaloop/sdk-standard-components';
import { Method } from 'javascript-state-machine';
import { ControlledStateMachine, PersistentModelConfig, StateData } from '~/models/persistent.model'
import { PubSub } from '~/shared/pub-sub';


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
  partyLookup: Method,
  onPartyLookup: Method,
  initiate: Method,
  onPostAuthorizations: Method,
  approve: Method
  onTransactionSuccess: Method,
}

export interface PISPTransactionModelConfig extends PersistentModelConfig {
  pubSub: PubSub
  thirdpartyRequests: ThirdpartyRequests
  mojaloopRequests: MojaloopRequests
}

export interface PISPTransactionData extends StateData {
  //TODO:
  transactionRequestId: string
  payeeRequest: {
    type: string,
    id: string,
    subId?: string
  }
  payeeResolved: TParty,

}

//Need to store 2 things -
