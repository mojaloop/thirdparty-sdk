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
import { OutboundOTPValidateData } from '~/models/OTPValidate.interface';
import {
  create
} from '~/models/a2s.model'
import { OTPValidateModelArgs, OTPValidateModelConfig } from '~/models/OTPValidate.model';
import { OutboundOTPValidateResponse } from '~/models/OTPValidate.interface';
import { A2SData } from '~/models/a2s.model';
import { StateData } from '~/models/persistent.model';

/**
 * Handles outbound PATCH /consentRequests/{ID} request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patch (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as OutboundOTPValidateData
  const consentRequestId: string = request.params.ID
  const args: OTPValidateModelArgs = {
    consentRequestId: consentRequestId,
    consentRequest: {
      authToken: payload.authToken
    },
    fspId: payload.toParticipantId,
  }

  // prepare config
  const data: A2SData<StateData> = {
    currentState: 'start'
  }

  const config: OTPValidateModelConfig = new OTPValidateModelConfig(
    consentRequestId,
    h.getKVS(),
    h.getLogger(),
    h.getPubSub(),
    h.getThirdpartyRequests()
  )

  const model = await create(data, config)

  const result = (await model.run(args)) as unknown as OutboundOTPValidateResponse
  const statusCode = (result == undefined || result.errorInformation) ? 500 : 200

  return h.response(result).code(statusCode)
}

export default {
  patch
}
