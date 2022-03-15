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

import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import {
  Logger as SDKLogger,
  MojaloopRequests,
  ThirdpartyRequests
} from '@mojaloop/sdk-standard-components'
import {
  InboundThirdpartyTransactionPostRequest,
  OutboundRequestToPayTransferPostRequest,
  OutboundRequestToPayTransferPostResponse
} from '../thirdparty.transactions.interface'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

export interface InboundThridpartyTransactionsModelConfig {
  logger: SDKLogger.Logger
  sdkOutgoingRequests: SDKOutgoingRequests
  mojaloopRequests: MojaloopRequests
  thirdpartyRequests: ThirdpartyRequests
}

// TODO: replace this model by DFSPTransactionModel as described in docs/sequence/PISPTransactionApi.puml
export class InboundThridpartyTransactionsModel {
  protected config: InboundThridpartyTransactionsModelConfig

  constructor (config: InboundThridpartyTransactionsModelConfig) {
    this.config = config
  }

  protected get logger (): SDKLogger.Logger {
    return this.config.logger
  }

  protected get sdkOutgoingRequests (): SDKOutgoingRequests {
    return this.config.sdkOutgoingRequests
  }

  protected get mojaloopRequests (): MojaloopRequests {
    return this.config.mojaloopRequests
  }

  protected get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  // RequestToPay endpoint was used by POC PISPTransaction code
  // TODO: use it when PISPMerchantTransaction flow will be implemented in future
  async requestToPayTransfer (
    inRequest: InboundThirdpartyTransactionPostRequest,
    pispId: string
  ): Promise<OutboundRequestToPayTransferPostResponse> {
    this.logger.push({ inRequest }).info('requestToPayTransfer: inRequest')
    // propagate make the requestToPayTransfer on outbound sdk-scheme-adapter
    const requestToPayTransfer: OutboundRequestToPayTransferPostRequest = {
      // TODO: should we generate a new id or use the one from inRequest?
      requestToPayTransactionId: inRequest.transactionRequestId,
      from: {
        idType: inRequest.payer.partyIdInfo.partyIdType,
        idValue: inRequest.payer.partyIdInfo.partyIdentifier,
        idSubValue: inRequest.payer.partyIdInfo.partySubIdOrType,
        fspId: inRequest.payer.partyIdInfo.fspId
      },
      to: {
        idType: inRequest.payee.partyIdInfo.partyIdType,
        idValue: inRequest.payee.partyIdInfo.partyIdentifier,
        idSubValue: inRequest.payee.partyIdInfo.partySubIdOrType,
        fspId: inRequest.payee.partyIdInfo.fspId
      },
      amountType: inRequest.amountType,

      // TMoney
      currency: inRequest.amount.currency,
      amount: inRequest.amount.amount,

      // TransactionType
      scenario: inRequest.transactionType.scenario,
      initiator: inRequest.transactionType.initiator,
      initiatorType: inRequest.transactionType.initiatorType
    }
    this.logger.push({ requestToPayTransfer }).info('requestToPayTransfer: requestToPayTransfer')

    const response = await this.sdkOutgoingRequests.requestToPayTransfer(
      requestToPayTransfer
    ) as OutboundRequestToPayTransferPostResponse

    this.logger.push({ response }).info('requestToPayTransfer: response')

    // notifyThirdpartyAboutTransfer via PATCH
    const transactionStatus: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse = {
      transactionRequestState: 'ACCEPTED',
      transactionState: 'COMPLETED'
    }
    await this.thirdpartyRequests.patchThirdpartyRequestsTransactions(
      transactionStatus,
      inRequest.transactionRequestId,
      pispId
    )

    return response
  }
}
