/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { Request, ResponseObject } from '@hapi/hapi'
import { Message } from '~/shared/pub-sub'
import { StateResponseToolkit } from '~/server/plugins/state'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'
import { PISPTransactionModel } from '~/models/pispTransaction.model'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

/**
 * Handles a inbound PATCH /thirdpartyRequests/transactions/{ID} request
 */
async function patch(_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse
  h.getLogger().push({ payload }).info('PATCH /thirdpartyRequests/transactions/{ID} pushing to channel')

  // don't await on promise to resolve, let finish publish in background
  PISPTransactionModel.triggerWorkflow(
    PISPTransactionPhase.approval,
    request.params.ID,
    h.getPublisher(),
    payload as unknown as Message
  )

  return h.response({}).code(200)
}

async function put(_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
  h.getLogger().push({ payload }).info('PUT /thirdpartyRequests/transactions/{ID} pushing to channel')

  // don't await on promise to resolve, let finish publish in background
  PISPTransactionModel.triggerWorkflow(
    PISPTransactionPhase.waitOnTransactionPut,
    request.params.ID,
    h.getPublisher(),
    payload as unknown as Message
  )

  return h.response({}).code(200)
}

export default {
  patch,
  put
}
