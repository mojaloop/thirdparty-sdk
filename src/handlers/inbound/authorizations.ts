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

import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { Message } from '~/shared/pub-sub'
import { OutboundAuthorizationsModel } from '~/models/outbound/authorizations.model'
import {
  InboundAuthorizationsModel,
  InboundAuthorizationsModelConfig
} from '~/models/inbound/authorizations.model'
import { PISPTransactionModel } from '~/models/pispTransaction.model'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'
import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'

import config from '~/shared/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function put (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as unknown as fspiopAPI.Schemas.AuthorizationsIDPutResponse
  const pubSub = h.getPubSub()

  // select proper workflow to where message will be published
  if (config.INBOUND.PISP_TRANSACTION_MODE) {
    // don't await on promise to resolve
    // let finish publish in background
    PISPTransactionModel.triggerWorkflow(
      PISPTransactionPhase.initiation,
      request.params.ID,
      pubSub,
      payload as unknown as Message
    )
  } else {
    const channel = OutboundAuthorizationsModel.notificationChannel(request.params.ID)
    // don't await on promise to resolve
    // let finish publish in background
    pubSub.publish(channel, payload as unknown as Message)
  }

  // return asap
  return h.response().code(200)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  // this handler will be shared with ThirdpartyRequestTransactionModel so there is a need
  // to properly handle two different models here - via configuration flag
  const payload = request.payload as tpAPI.Schemas.AuthorizationsPostRequest
  const logger = h.getLogger()
  if (config.INBOUND.PISP_TRANSACTION_MODE) {
    // PISP transaction mode
    const channel = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.initiation,
      payload.transactionRequestId
    )
    const pubSub = h.getPubSub()
    // don't await on promise to resolve
    // let finish publish in background
    pubSub.publish(channel, payload as unknown as Message)
    logger.info('PISPTransactionModel handled POST /authorization request')
  } else {
    // authorization mode
    const sourceFspId = request.headers['fspiop-source']
    const config: InboundAuthorizationsModelConfig = {
      logger,
      pispBackendRequests: h.getPISPBackendRequests(),
      mojaloopRequests: h.getMojaloopRequests()
    }
    const model = new InboundAuthorizationsModel(config)
    const response = await model.postAuthorizations(payload, sourceFspId)
    logger.push({ response }).info('InboundAuthorizationsModel handled POST /authorizations request')
  }

  // Note that we will have passed request validation, JWS etc... by this point
  // so it is safe to return 202
  return h.response().code(202)
}

export default {
  post,
  put
}
