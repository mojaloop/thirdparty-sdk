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
import { InboundAuthorizationsPostRequest, InboundAuthorizationsPutRequest } from '~/models/authorizations.interface'
import { Message } from '~/shared/pub-sub'
import {
  OutboundAuthorizationsModel
} from '~/models/outbound/authorizations.model'
import {
  InboundAuthorizationsModel,
  InboundAuthorizationsModelConfig
} from '~/models/inbound/authorizations.model'
import {
  PISPTransactionModel
} from '~/models/pispTransaction.model'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'
import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function put (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as unknown as InboundAuthorizationsPutRequest
  const authChannel = OutboundAuthorizationsModel.notificationChannel(request.params.ID)
  const pispChannel = PISPTransactionModel.notificationChannel(PISPTransactionPhase.initiation, request.params.ID)
  const pubSub = h.getPubSub()

  // don't await on promise to resolve
  // let finish publish in background
  pubSub.publish(authChannel, payload as unknown as Message)
  pubSub.publish(pispChannel, payload as unknown as Message)

  // return asap
  return h.response().code(200)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  // TODO: this handler will be shared with ThirdpartyRequestTransactionModel so there is a need
  // to properly handle two different models here - maybe via some configuration flag?
  const logger = h.getLogger()
  try {
    const sourceFspId = request.headers['fspiop-source']
    const payload = request.payload as InboundAuthorizationsPostRequest
    const config: InboundAuthorizationsModelConfig = {
      logger,
      backendRequests: h.getBackendRequests(),
      mojaloopRequests: h.getMojaloopRequests()
    }
    const model = new InboundAuthorizationsModel(config)
    const response = await model.postAuthorizations(payload, sourceFspId)
    logger.push({ response }).info('InboundAuthorizationsModel handled POST /authorizations request')
  } catch (err) {
    // nothing we can do if an error gets thrown back to us here apart from log it and continue
    logger.push({ err }).error('Error handling POST /authorizations request')
  }

  // Note that we will have passed request validation, JWS etc... by this point
  // so it is safe to return 202
  return h.response().code(202)
}

export default {
  post,
  put
}
