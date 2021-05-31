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

 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/
import { Request, ResponseObject } from '@hapi/hapi'
import {
  v1_1 as fspiopAPI
} from '@mojaloop/api-snippets'
import { Message } from '~/shared/pub-sub'
import { StateResponseToolkit } from '~/server/plugins/state'
import { Enum } from '@mojaloop/central-services-shared'
import { PISPLinkingModel } from '~/models/outbound/pispLinking.model'
import { PISPLinkingPhase } from '~/models/outbound/pispLinking.interface'
import { DFSPLinkingModel } from '~/models/inbound/dfspLinking.model'
import { DFSPLinkingPhase } from '~/models/inbound/dfspLinking.interface'

/**
* Handles a inbound PUT /consents/{ID}/error request
*/
async function put (_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  // PUT /consents/{ID}/error is a response to PUT /consents/{ID}
  // when something went wrong registering a credential
  const consentId = request.params.ID
  const payload = request.payload as fspiopAPI.Schemas.ErrorInformation

  PISPLinkingModel.triggerWorkflow(
    PISPLinkingPhase.registerCredential,
    consentId,
    h.getPubSub(),
    payload as unknown as Message
  )

  DFSPLinkingModel.triggerWorkflow(
    DFSPLinkingPhase.waitOnAuthServiceResponse,
    consentId,
    h.getPubSub(),
    payload as unknown as Message
  )

  return h.response({}).code(Enum.Http.ReturnCodes.OK.CODE)
}

export default {
  put
}
