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

 - Lewis Daly <lewisd@crosslaketech.com>
 --------------
 ******/

import { Request, ResponseObject } from '@hapi/hapi'
import { Context } from 'openapi-backend'
import { StateResponseToolkit } from '~/server/plugins/state'
import { DFSPTransactionModel, DFSPTransactionPhase } from '~/models/dfspTransaction.model'
import { Message } from '~/shared/pub-sub'

import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { PISPTransactionModel } from '~/models/pispTransaction.model'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'

/**
 * POST /thirdpartyRequests/authorizations
 */
async function post(_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as tpAPI.Schemas.ThirdpartyRequestsAuthorizationsPostRequest
  const publisher = h.getPublisher()

  PISPTransactionModel.triggerWorkflow(
    PISPTransactionPhase.waitOnAuthorizationPost,
    payload.transactionRequestId,
    publisher,
    payload as unknown as Message
  )

  // Note that we will have passed request validation, JWS etc... by this point
  // so it is safe to return 202
  return h.response().code(202)
}

/**
 * PUT /thirdpartyRequests/authorizations/{ID}
 *
 * or
 *
 * PUT /thirdpartyRequests/authorizations/{ID}/error
 */
async function put(_context: Context, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const authorizationRequestId = request.params.ID
  // This could be an error payload or ThirdpartyRequestsAuthorizationsIDPutResponse
  const authorizationResponse = request.payload
  const publisher = h.getPublisher()

  // load the DFSPTransactionModel based on the authorizationId
  const channel = DFSPTransactionModel.notificationChannel(
    DFSPTransactionPhase.waitOnAuthResponseFromPISPChannel,
    authorizationRequestId
  )
  publisher.publish(channel, authorizationResponse as Message)

  return h.response().code(200)
}

export default {
  post,
  put
}
