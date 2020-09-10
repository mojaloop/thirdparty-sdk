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

 - Paweł Marzec <pawel.marzec@modusbox.com>

 --------------
 ******/

import { StateResponseToolkit } from '~/server/plugins/state'
import {
  OutboundAuthorizationsModelConfig,
  OutboundAuthorizationData,
  OutboundAuthorizationsPostRequest
} from '~/models/authorizations.interface'
import {
  OutboundAuthorizationsModel,
  create
} from '~/models/outbound/authorizations.model'
import {
  TMoney,
  TQuotesIDPutResponse
} from '@mojaloop/sdk-standard-components'
import { Request, ResponseObject } from '@hapi/hapi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as OutboundAuthorizationsPostRequest

  const data: OutboundAuthorizationData = {
    toParticipantId: payload.toParticipantId,
    request: {
      authenticationType: payload.authenticationType as 'U2F',
      retriesLeft: payload.retriesLeft,
      transactionId: payload.transactionId,
      transactionRequestId: payload.transactionRequestId,
      amount: payload.amount as TMoney,
      quote: payload.quote as unknown as TQuotesIDPutResponse
    },
    currentState: 'start'
  }

  const modelConfig: OutboundAuthorizationsModelConfig = {
    kvs: h.getKVS(),
    pubSub: h.getPubSub(),
    key: OutboundAuthorizationsModel.notificationChannel(data.request.transactionRequestId),
    logger: h.getLogger(),
    requests: h.getThirdpartyRequests()
  }

  const model: OutboundAuthorizationsModel = await create(data, modelConfig)

  const result = await model.run()
  if (!result) {
    h.getLogger().error('outbound POST /authorizations unexpected result from workflow')
    return h.response({}).code(500)
  }

  return h.response(result).code(200)
}

export default {
  post
}
