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
import { PISPLinkingModel, loadFromKVS } from '~/models/outbound/pispLinking.model'
import {
  PISPLinkingModelConfig,
} from '~/models/outbound/pispLinking.interface'
import config from '~/shared/config'
import inspect from '~/shared/inspect'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'
import { Enum } from '@mojaloop/central-services-shared'


/**
 * Handles outbound PATCH /linking/request-consent/{ID}/authenticate request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patch (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateRequest
  const consentRequestId = request.params.ID

  const modelConfig: PISPLinkingModelConfig = {
    kvs: h.getKVS(),
    subscriber: h.getSubscriber(),
    key: consentRequestId,
    logger: h.getLogger(),
    thirdpartyRequests: h.getThirdpartyRequests(),
    requestProcessingTimeoutSeconds: config.REQUEST_PROCESSING_TIMEOUT_SECONDS
  }

  try {
    const model: PISPLinkingModel = await loadFromKVS(modelConfig)
    model.data.linkingRequestConsentIDAuthenticatePatchRequest = payload

    const result = await model.run()
    if (!result) {
      h.getLogger().error('outbound PATCH /linking/request-consent/{ID}/authenticate unexpected result from workflow')
      return h.response({}).code(Enum.Http.ReturnCodes.INTERNALSERVERERRROR.CODE)
    }

    const statusCode = (result.currentState == 'errored') ? 500 : 200
    return h.response(result).code(statusCode)
  } catch(error) {
    // todo: PUT /consentsRequest/{ID}/error to DFSP if PISP is unable to handle
    //       the previous PUT /consentRequests/{ID} request
    //       The handler doesn't know the DFSP's ID due to it being stored in the model
    //       if the model is not found then we don't know the ID
    //       We might need to pass the ID in LinkingRequestConsentIDAuthenticateRequest.
    h.getLogger().info(`Error running PISPLinkingModel : ${inspect(error)}`)
    return h.response({}).code(Enum.Http.ReturnCodes.INTERNALSERVERERRROR.CODE)
  }
}

export default {
  patch
}
