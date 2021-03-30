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

import { StateResponseToolkit } from '~/server/plugins/state'
import { Request, ResponseObject } from '@hapi/hapi'
import { PISPOTPValidateModel, create } from '~/models/outbound/pispOTPValidate.model';
import {
  PISPOTPValidateData,
  PISPOTPValidateModelConfig,
  OutboundOTPValidateData,
  PISPOTPValidateModelState
} from '~/models/outbound/pispOTPValidate.interface'

/**
 * Handles outbound PATCH /consentRequests/{ID} request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patch (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as OutboundOTPValidateData
  const consentRequestsRequestId = request.params.ID
  const authToken = payload.authToken
  const toParticipantId = payload.toParticipantId

  // prepare config
  const data: PISPOTPValidateData = {
    currentState: 'start',
    consentRequestsRequestId,
    authToken,
    toParticipantId
  }

  const modelConfig: PISPOTPValidateModelConfig = {
    kvs: h.getKVS(),
    pubSub: h.getPubSub(),
    key: consentRequestsRequestId,
    logger: h.getLogger(),
    thirdpartyRequests: h.getThirdpartyRequests(),
  }

  const model: PISPOTPValidateModel = await create(data, modelConfig)

  const result = await model.run()
  if (!result) {
    h.getLogger().error('outbound PATCH /consentRequests/{ID}/validate unexpected result from workflow')
    return h.response({}).code(500)
  }
  const statusCode = (result.currentState == PISPOTPValidateModelState.errored) ? 500 : 200
  return h.response(result).code(statusCode)
}

export default {
  patch
}
