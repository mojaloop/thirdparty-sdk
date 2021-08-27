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

 - Lewis Daly <lewisd@crosslaketech.com>
 --------------
 ******/

import { Request, ResponseObject } from '@hapi/hapi'
import { Context } from 'openapi-backend'
import { StateResponseToolkit } from "~/server/plugins/state"
import { DFSPTransactionModel, DFSPTransactionPhase } from '~/models/dfspTransaction.model'
import { Message } from '~/shared/pub-sub'

/**
 * PUT /thirdpartyRequests/authorizations/{ID}
 * 
 * or 
 * 
 * PUT /thirdpartyRequests/authorizations/{ID}/error
 */
async function put(
  _context: Context, request: Request, h: StateResponseToolkit
): Promise<ResponseObject> {
  const authorizationRequestId = request.params.ID
  // This could be an error payload or ThirdpartyRequestsAuthorizationsIDPutResponse
  const authorizationResponse = request.payload
  const publisher = h.getPublisher()

  // TODO: load the DFSPTransactionModel based on the authorizationId
  const channel = DFSPTransactionModel.notificationChannel(
    DFSPTransactionPhase.waitOnAuthResponseFromPISPChannel,
    authorizationRequestId
  )
  publisher.publish(channel, authorizationResponse as Message)


  return h.response().code(200)
}

export default {
  put,
}
