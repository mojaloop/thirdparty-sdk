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
import { InboundAuthorizationsPutRequest } from '~/models/authorizations.interface'
import { Message } from '~/shared/pub-sub'
import {
  OutboundAuthorizationsModel
} from '~/models/outbound/authorizations.model'
import { Request, ResponseObject } from '@hapi/hapi'
import { StateResponseToolkit } from '~/server/plugins/state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function put (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as unknown as InboundAuthorizationsPutRequest
  const channel = OutboundAuthorizationsModel.notificationChannel(request.params.ID)
  const pubSub = h.getPubSub()

  // don't await on promise to resolve
  // let finish publish in background
  pubSub.publish(channel, payload as unknown as Message)

  // return asap
  return h.response().code(200)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post (_context: any, _request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  return h.response({ to: 'be implemented' }).code(202)
}

export default {
  post,
  put
}
