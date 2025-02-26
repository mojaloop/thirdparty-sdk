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

  - Sridhar Voruganti - sridhar.voruganti@modusbox.com

 --------------
 ******/

import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { Message } from '~/shared/pub-sub'
import { InboundAccountsModel, InboundAccountsModelConfig } from '~/models/inbound/accounts.model'
import { PISPDiscoveryModel } from '~/models/outbound/pispDiscovery.model'
import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'

/**
 * Handles an inbound PUT /accounts/{ID} request
 */
async function put(_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as unknown as tpAPI.Schemas.AccountsIDPutResponse
  const userId: string = request.params.ID
  const channel = PISPDiscoveryModel.notificationChannel(userId)
  const publisher = h.getPublisher()
  // don't await on promise to resolve, let finish publish in background
  publisher.publish(channel, payload as unknown as Message)
  return h.response().code(200)
}

/**
 * Handles an inbound GET /accounts/{ID} request
 */

async function get(_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const userId: string = request.params.ID
  const logger = h.getLogger()
  const sourceFspId = request.headers['fspiop-source']
  const config: InboundAccountsModelConfig = {
    logger,
    dfspBackendRequests: h.getDFSPBackendRequests(),
    thirdpartyRequests: h.getThirdpartyRequests()
  }
  const model = new InboundAccountsModel(config)
  // don't await on promise to be resolved
  setImmediate(async () => {
    const response = await model.getUserAccounts(userId, sourceFspId)
    logger.push({ response }).info('InboundAccountsModel handled GET /accounts/{ID} request')
  })

  return h.response().code(202)
}

export default {
  get,
  put
}
