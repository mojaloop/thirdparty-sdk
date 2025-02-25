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

 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/
import { Request, ResponseObject } from '@hapi/hapi'
import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
import { Message } from '~/shared/pub-sub'
import { StateResponseToolkit } from '~/server/plugins/state'
import { Enum } from '@mojaloop/central-services-shared'
import { PISPLinkingModel } from '~/models/outbound/pispLinking.model'
import { PISPLinkingPhase } from '~/models/outbound/pispLinking.interface'

/**
 * Handles a inbound PUT /consentRequests/{ID}/error request
 */
async function put(_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  // PUT /consentsRequests/{ID}/error is a response to PATCH /consentRequests
  // when an OTP or secret failed to validate.
  // We publish the request on the PISPConsentRequestModel
  const consentRequestId = request.params.ID
  const payload = request.payload as fspiopAPI.Schemas.ErrorInformation

  PISPLinkingModel.triggerWorkflow(
    PISPLinkingPhase.requestConsent,
    consentRequestId,
    h.getPublisher(),
    payload as unknown as Message
  )

  PISPLinkingModel.triggerWorkflow(
    PISPLinkingPhase.requestConsentAuthenticate,
    consentRequestId,
    h.getPublisher(),
    payload as unknown as Message
  )
  return h.response({}).code(Enum.Http.ReturnCodes.OK.CODE)
}

export default {
  put
}
