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
 --------------
 ******/
import { Method } from 'javascript-state-machine'
import { ControlledStateMachine, StateData, PersistentModelConfig } from '~/models/persistent.model'
import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { BackendTransactionRequestContext, DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'

export type DFSPTransactionModelState =
  'start' |
  'errored' |
  'transactionRequestIsValid' |
  'notifiedTransactionRequestIsValid' |
  'quoteReceived' |
  'authorizationReceived' |
  'authorizationReceivedIsValid' |
  'authorizationIsValid' |
  'transferIsDone' |
  'transactionRequestIsDone'

export interface DFSPTransactionStateMachine extends ControlledStateMachine {
  // on Initiate PISPTransactionModel phase
  validateTransactionRequest: Method
  onValidateTransactionRequest: Method
  notifyTransactionRequestIsValid: Method
  onNotifyTransactionRequestIsValid: Method
  requestQuote: Method
  onRequestQuote: Method
  requestAuthorization: Method
  onRequestAuthorization: Method

  // on Approve PISPTransactionModel phase
  verifyAuthorization: Method
  onVerifyAuthorization: Method
  requestTransfer: Method
  onRequestTransfer: Method
  notifyTransferIsDone: Method
  onNotifyTransferIsDone: Method
}

export interface DFSPTransactionModelConfig extends PersistentModelConfig {
  dfspId: string
  thirdpartyRequests: ThirdpartyRequests
  sdkOutgoingRequests: SDKOutgoingRequests
  dfspBackendRequests: DFSPBackendRequests
  tempOverrideQuotesPartyIdType?: fspiopAPI.Schemas.PartyIdType
}

export interface DFSPTransactionData extends StateData<DFSPTransactionModelState> {
  // transactionRequest
  transactionRequestId: string
  transactionRequestState: tpAPI.Schemas.TransactionRequestState
  transactionId?: string
  transferId?: string
  transactionRequestContext?: BackendTransactionRequestContext

  // id of participant (PISP) which sends ThirdpartyTransactionRequest to DFSP
  // used as target dfspId param for calls to PISP via switch
  participantId: string

  // used by validateTransactionRequest
  transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest
  transactionRequestPutUpdate?: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse

  // used by requestQuote
  requestQuoteRequest?: SDKOutboundAPI.Schemas.quotesPostRequest
  requestQuoteResponse?: SDKOutboundAPI.Schemas.quotesPostResponse

  // used by requestAuthorization & verifyAuthorization
  requestAuthorizationPostRequest?: SDKOutboundAPI.Schemas.authorizationsPostRequest
  requestAuthorizationResponse?: SDKOutboundAPI.Schemas.authorizationsPostResponse

  // used by requestTransfer
  // TODO: proper type for transferRequest
  transferRequest?: SDKOutboundAPI.Schemas.simpleTransfersPostRequest
  transferResponse?: SDKOutboundAPI.Schemas.simpleTransfersPostResponse
  transactionRequestPatchUpdate?: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse
}
