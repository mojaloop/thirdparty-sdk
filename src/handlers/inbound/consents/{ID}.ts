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

import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import { PISPLinkingModel } from '~/models/outbound/pispLinking.model'
import { Message } from '~/shared/pub-sub'
import { PISPLinkingPhase } from '~/models/outbound/pispLinking.interface'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { loadFromKVS } from '~/models/inbound/dfspLinking.model'
import { DFSPLinkingModelConfig } from '~/models/inbound/dfspLinking.interface'
import { DFSPLinkingModel } from '~/models/inbound/dfspLinking.model'

/**
 * Handles an inbound `PATCH /consents/{ID}` request
 */
async function patch (_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const consentId = request.params.ID

  PISPLinkingModel.triggerWorkflow(
    PISPLinkingPhase.registerCredential,
    consentId,
    h.getPubSub(),
    request.payload as unknown as Message
  )
  h.getLogger().info(`Inbound received PATCH /consents/{ID} response`)

  return h.response().code(200)
}

/**
 * Handles an inbound `PUT /consents/{ID}` request
 */
 async function put (_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const consentId = request.params.ID
  const payload = request.payload as tpAPI.Schemas.ConsentsIDPutResponseSigned

  // prepare model config
  const modelConfig: DFSPLinkingModelConfig = {
    kvs: h.getKVS(),
    pubSub: h.getPubSub(),
    key: consentId,
    logger: h.getLogger(),
    dfspBackendRequests: h.getDFSPBackendRequests(),
    thirdpartyRequests: h.getThirdpartyRequests(),
  }
  // load model
  const model: DFSPLinkingModel = await loadFromKVS(modelConfig)
  model.data.consentIDPutRequest = payload


  return h.response().code(202)
}

export default {
  patch,
  put
}
