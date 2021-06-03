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

 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/

import { StateResponseToolkit } from '~/server/plugins/state'
import { Request, ResponseObject } from '@hapi/hapi'
import { PISPPrelinkingModel, create } from '~/models/outbound/pispPrelinking.model'
import {
  PISPPrelinkingData,
  PISPPrelinkingModelConfig
} from '~/models/outbound/pispPrelinking.interface'
import config from '~/shared/config'
import inspect from '~/shared/inspect'

/**
 * Handles outbound GET /linking/providers request
 */
async function get (_context: unknown, _request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const serviceType = 'THIRD_PARTY_DFSP'

  // prepare config
  const data: PISPPrelinkingData = {
    currentState: 'start',
    serviceType
  }

  const modelConfig: PISPPrelinkingModelConfig = {
    kvs: h.getKVS(),
    pubSub: h.getPubSub(),
    key: serviceType,
    logger: h.getLogger(),
    thirdpartyRequests: h.getThirdpartyRequests(),
    requestProcessingTimeoutSeconds: config.REQUEST_PROCESSING_TIMEOUT_SECONDS
  }

  try {
    const model: PISPPrelinkingModel = await create(data, modelConfig)
    const result = await model.run()
    if (!result) {
      h.getLogger().error('outbound GET /linking/providers unexpected result from workflow')
      // todo: change to `central-services` Enum code once typescript is updated
      return h.response({}).code(500)
    }

    const statusCode = (result.currentState == 'errored') ? 500 : 200
    return h.response(result).code(statusCode)
  } catch(error) {
    h.getLogger().info(`Error running PISPPrelinkingModel : ${inspect(error)}`)
    // todo: change to `central-services` Enum code once typescript is updated
    return h.response({}).code(500)
  }
}

export default {
  get
}
