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

 - Sridhar Voruganti - sridhar.voruganti@modusbox.com

 --------------
 ******/

import {
  thirdparty as tpAPI,
} from '@mojaloop/api-snippets'
import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import { Enum } from '@mojaloop/central-services-shared'
import {
  DFSPLinkingData,
  DFSPLinkingModelConfig
} from '~/models/inbound/dfspLinking.interface'
import { DFSPLinkingModel, create } from '~/models/inbound/dfspLinking.model'
import inspect from '~/shared/inspect'
import config from '~/shared/config'


/**
 * Handles an inbound `POST /consentRequests` request
 */
async function post (_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const logger = h.getLogger()
  const payload = request.payload as tpAPI.Schemas.ConsentRequestsPostRequest
  const consentRequestId = payload.consentRequestId
  // pull the PISP's ID to send back the PUT /consentRequests/{ID}
  const sourceFspId = request.headers['fspiop-source']

  const data: DFSPLinkingData = {
    dfspId: h.getDFSPId(),
    currentState: 'start',
    toParticipantId: sourceFspId,
    toAuthServiceParticipantId: h.getAuthServiceParticipantId(),
    consentRequestsPostRequest: payload,
    consentRequestId: consentRequestId
  }

  // if the request is valid then DFSP returns response via PUT /consentRequests/{ID} call.
  const modelConfig: DFSPLinkingModelConfig = {
    kvs: h.getKVS(),
    subscriber: h.getSubscriber(),
    key: consentRequestId,
    logger: logger,
    dfspBackendRequests: h.getDFSPBackendRequests(),
    thirdpartyRequests: h.getThirdpartyRequests(),
    mojaloopRequests: h.getMojaloopRequests(),
    requestProcessingTimeoutSeconds: config.REQUEST_PROCESSING_TIMEOUT_SECONDS,
    testOverrideConsentID: config.SHARED.TEST_OVERRIDE_CONSENT_ID
  }

  // postpone model execution to next event loop cycle so we can return response ASAP
  setImmediate(async () => {
    try {
      const model: DFSPLinkingModel = await create(data, modelConfig)
      await model.run()
    } catch (error) {
      // the model catches all planned, catches unplanned errors,
      // handles callbacks and also rethrows the error to stop the state machine
      h.getLogger().info(`Error running DFSPLinkingModel : ${inspect(error)}`)
    }
  })

  // Note that we will have passed request validation, JWS etc... by this point
  // so it is safe to return 202
  return h.response().code(Enum.Http.ReturnCodes.ACCEPTED.CODE)
}

export default {
  post
}
