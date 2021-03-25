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

import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'
import { Enum } from '@mojaloop/central-services-shared'
import { DFSPOTPValidateModel } from '../../../models/inbound/dfspOTPValidate.model';
import {
  DFSPOTPValidateData,
  DFSPOTPValidateModelConfig
} from '~/models/inbound/dfspOTPValidate.interface'
import inspect from '~/shared/inspect';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patch (_context: unknown, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as tpAPI.Schemas.ConsentRequestsIDPatchRequest
  const consentRequestsRequestId = request.params.ID
  const authToken = payload.authToken

  // pull the PISP's ID to send back the POST /consents
  const sourceFspId = request.headers['fspiop-source']

  const data: DFSPOTPValidateData = {
    currentState: 'start',
    consentRequestsRequestId: consentRequestsRequestId,
    authToken: authToken,
    toParticipantId: sourceFspId
  }
  // if the OTP is valid the DFSP issues out a POST /consents request.
  const modelConfig: DFSPOTPValidateModelConfig = {
    kvs: h.getKVS(),
    pubSub: h.getPubSub(),
    key: consentRequestsRequestId,
    logger: h.getLogger(),
    dfspBackendRequests: h.getDFSPBackendRequests(),
    thirdpartyRequests: h.getThirdpartyRequests(),
  }
  const model = new DFSPOTPValidateModel(data, modelConfig)

  // don't await on promise to be resolved
  setImmediate(async () => {
    try {
      await model.run()
    } catch (error) {
      h.getLogger().info(`Error running DFSPOTPValidateModel : ${inspect(error)}`)
    }
  })

  // Note that we will have passed request validation, JWS etc... by this point
  // so it is safe to return 202
  return h.response().code(Enum.Http.ReturnCodes.ACCEPTED.CODE)
}

export default {
  patch
}
