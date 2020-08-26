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

 - Kevin Leyow <kevin.leyow@modusbox.com>

 --------------
 ******/
import {
  forwardPostQuoteRequestToPayee,
  verifyConsentId,
  verifyPispId,
  verifySourceAccountId,
  validateGrantedConsent
} from '~/domain/thirdpartyRequests/transactions'
import { Enum } from '@mojaloop/central-services-shared'
import { Request, ResponseObject, ResponseToolkit } from '@hapi/hapi'
import { ThirdpartyTransactionRequest } from '~/interface/types'
import { Enums } from '@mojaloop/central-services-error-handling'
import { Context } from 'openapi-backend'

/**
 * Handles a DFSP inbound POST /thirdpartyRequests/transaction request
 */
async function post (_context: Context, request: Request, h: ResponseToolkit): Promise<ResponseObject> {
  const transactionRequest = request.payload as ThirdpartyTransactionRequest

  // todo: this might need to be a state machine in the future
  if (!verifyConsentId(transactionRequest.consentId) ||
      !verifyPispId(request.headers['FSPIOP-Source']) ||
      !verifySourceAccountId(transactionRequest.sourceAccountId) ||
      !validateGrantedConsent(transactionRequest.consentId)) {
    // todo: change to a thirdparty specific error code here
    return h.response(Enums.FSPIOPErrorCodes.CLIENT_ERROR).code(Enum.Http.ReturnCodes.BADREQUEST.CODE)
  }

  forwardPostQuoteRequestToPayee(transactionRequest)

  return h.response({}).code(Enum.Http.ReturnCodes.ACCEPTED.CODE)
}

export default {
  post
}
