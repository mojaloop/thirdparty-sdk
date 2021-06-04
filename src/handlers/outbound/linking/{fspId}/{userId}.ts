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
import { Enum } from '@mojaloop/central-services-shared';
import {
  PISPDiscoveryData,
  PISPDiscoveryModelConfig,
  PISPDiscoveryGetResponse
} from '~/models/outbound/pispDiscovery.interface'
import {
  PISPDiscoveryModel,
  create
} from '~/models/outbound/pispDiscovery.model'

/**
 * Handles outbound GET /linking/accounts/{fspId}/{userId} request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const userId: string = request.params.userId
  // prepare config
  const data: PISPDiscoveryData = {
    toParticipantId: request.params.fspId,
    userId: userId,
    currentState: 'start'
  }
  const config: PISPDiscoveryModelConfig = {
    key: userId,
    kvs: h.getKVS(),
    logger: h.getLogger(),
    pubSub: h.getPubSub(),
    thirdpartyRequests: h.getThirdpartyRequests()
  }

  const model: PISPDiscoveryModel = await create(data, config)
  const result = (await model.run()) as PISPDiscoveryGetResponse
  const statusCode = (result.errorInformation) ?
    Enum.Http.ReturnCodes.INTERNALSERVERERRROR.CODE :
    Enum.Http.ReturnCodes.OK.CODE
  return h.response(result).code(statusCode)
}

export default {
  get
}
