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

import { BackendRequests } from './backend-requests'
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
import config from '~/shared/config'
import { ThirdpartyTransactionStatus } from '../pispTransaction.interface'

export interface InboundThridpartyTransactionsModelConfig {
  logger: SDKLogger.Logger
  backendRequests: BackendRequests
  mojaloopRequests: MojaloopRequests
  thirdpartyRequests: ThirdpartyRequests
}

export class InboundThridpartyTransactionsModel {
  protected config: InboundThridpartyTransactionsModelConfig

  constructor (config: InboundThridpartyTransactionsModelConfig) {
    this.config = config
  }

  protected get logger (): SDKLogger.Logger {
    return this.config.logger
  }

  protected get backendRequests (): BackendRequests {
    return this.config.backendRequests
  }

  protected get mojaloopRequests (): MojaloopRequests {
    return this.config.mojaloopRequests
  }

  async requestToPayTransfer (
    inRequest: InboundThirdpartyTransactionPostRequest
  ): Promise<OutboundRequestToPayTransferPostResponse> {
    // TODO: lookup consentId, sourceAccountId and pispId
    // Verify that they exist and consent is granted with a valid credential

    // propagate make the requestToPayTransfer on outbound sdk-scheme-adapter
    const requestToPayTransfer: OutboundRequestToPayTransferPostRequest = {
      // TODO: should we generate a new id or use the one from inRequest?
      requestToPayTransactionId: inRequest.transactionRequestId,
      from: { ...inRequest.payer },
      to: { ...inRequest.payee },
      amountType: inRequest.amountType,

      // TMoney
      currency: inRequest.amount.currency,
      amount: inRequest.amount.amount,

      // TransactionType
      scenario: inRequest.transactionType.scenario,
      initiator: inRequest.transactionType.initiator,
      initiatorType: inRequest.transactionType.initiatorType
    }
    const response = await this.backendRequests.requestToPayTransfer(
      requestToPayTransfer
    ) as OutboundRequestToPayTransferPostResponse

    // optionally notify via PATCH
    if (config.SHARED.NOTIFY_ABOUT_TRANSFER_URI) {
      const transactionStatus: ThirdpartyTransactionStatus = {
        transactionId: inRequest.transactionRequestId,
        transactionRequestState: 'ACCEPTED'
      }
      await this.backendRequests.notifyAboutTransfer(transactionStatus, inRequest.transactionRequestId)
    }

    return response
  }
}
