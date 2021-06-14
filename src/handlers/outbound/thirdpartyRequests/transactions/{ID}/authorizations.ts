/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the 'License') and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
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

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/

import { StateResponseToolkit } from '~/server/plugins/state'
import { Request, ResponseObject } from '@hapi/hapi'
import {
  OutboundThirdpartyAuthorizationsPostRequest,
  OutboundThirdpartyAuthorizationsData,
  OutboundThirdpartyAuthorizationsModelConfig,
  OutboundThirdpartyAuthorizationsPostResponse
} from '~/models/thirdparty.authorizations.interface'
import {
  OutboundThirdpartyAuthorizationsModel,
  create
} from '~/models/outbound/thirdparty.authorizations.model'

/**
 * Handles outbound POST /thirdpartyRequests/transactions/{ID}/authorizations request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {

  const authRequest = request.payload as OutboundThirdpartyAuthorizationsPostRequest
  const transactionRequestId: string = request.params.ID
  // prepare config
  const data: OutboundThirdpartyAuthorizationsData = {
    toParticipantId: authRequest.toParticipantId,
    request: authRequest,
    currentState: 'start'
  }
  const config: OutboundThirdpartyAuthorizationsModelConfig = {
    key: transactionRequestId,
    kvs: h.getKVS(),
    logger: h.getLogger(),
    subscriber: h.getSubscriber(),
    requests: h.getThirdpartyRequests()
  }

  const model: OutboundThirdpartyAuthorizationsModel = await create(data, config)
  const result = await model.run();
  // TODO: handle errors
  return h.response(result as OutboundThirdpartyAuthorizationsPostResponse).code(200)
}

export default {
  post
}
