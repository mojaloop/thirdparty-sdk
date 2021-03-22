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
import { resolve } from 'path'
import { A2SModelConfig } from './a2s.model'
import { KVS } from '../shared/kvs'
import { PubSub, Message } from '../shared/pub-sub'
import { ThirdpartyRequests, Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import { OutboundOTPValidateResponse } from './OTPValidate.interface'

export interface OTPValidateModelArgs {
  consentRequestId: string,
  fspId?: string,
  consentRequest?: tpAPI.Schemas.ConsentRequestsIDPatchRequest
}

export class OTPValidateModelConfig implements A2SModelConfig<OTPValidateModelArgs, OutboundOTPValidateResponse> {
  public readonly key: string
  public readonly kvs: KVS
  public readonly logger: SDKLogger.Logger
  public readonly pubSub: PubSub
  public readonly modelName = 'OTPValidate'
  public readonly thirdpartyRequests: ThirdpartyRequests
  public readonly requestProcessingTimeoutSeconds = 10000

  constructor (key: string, kvs: KVS, logger: SDKLogger.Logger, pubSub: PubSub, thirdpartyRequests: ThirdpartyRequests) {
    this.key = key
    this.kvs = kvs
    this.logger = logger
    this.pubSub = pubSub
    this.thirdpartyRequests = thirdpartyRequests
  }

  channelName (args: OTPValidateModelArgs): string {
    const tokens = [this.modelName, args.consentRequestId]
    return tokens.map(x => `${x}`).join('-')
  }

  async requestAction (args: OTPValidateModelArgs): Promise<void> {
    if (!args.fspId) {
      throw new Error('OTPValidate args requires \'fspId\' to be nonempty string')
    }

    if (!(args.consentRequest && typeof (args.consentRequest) === 'object')) {
      throw new Error('OTPValidate.requestAction args requires \'transfer\' to be specified')
    }
    this.thirdpartyRequests.patchConsentRequests(args.consentRequestId, args.consentRequest, args.fspId)
    resolve()
  }

  throwIfInvalidArgs (args: OTPValidateModelArgs) {
    if (!(args.consentRequestId && typeof (args.consentRequestId) === 'string' && args.consentRequestId.length > 0)) {
      throw new Error('TransfersModel args requires \'args.consentRequestId\' is nonempty string and mandatory property')
    }
    if (args.fspId && !(typeof (args.fspId) === 'string' && args.fspId.length > 0)) {
      throw new Error('TransfersModel args requires \'args.fspId\' to be nonempty string')
    }
  }

  reformatMessage (message: Message) {
    const messageObj = message as Record<string, unknown>
    if (messageObj.errorInformation) {
      return {
        ...messageObj
      } as OutboundOTPValidateResponse
    }

    return {
      consent: { ...messageObj }
    } as OutboundOTPValidateResponse
  }
}
