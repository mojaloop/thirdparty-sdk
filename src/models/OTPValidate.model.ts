import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components';
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
import { resolve } from 'path';


interface channelNameArgs {
  consentRequestId: string
}

 /**
 * @name channelName
 * @description generates the pub/sub channel name
 * @param {object} - args
 * @param {string} args.consentRequestId - the consent request  id
 * @returns {string} - the pub/sub channel name
 */
function notificationChannel (args: channelNameArgs): string {
  if (!args.consentRequestId) {
    throw new Error('PISPConsentRequest.notificationChannel: \'consentRequestId\' parameter is required')
  }
  // channel name
  return `consent_request_${args.consentRequestId}`
}

interface requestActionArgs {
  requests: ThirdpartyRequests,
  consentRequestId: string,
  fspId: string,
  consentRequest: tpAPI.Schemas.ConsentRequestsIDPatchRequest
}

async function requestAction(args: requestActionArgs): Promise<void> {
  if ( !args.fspId ) {
      throw new Error('OTPValidate args requires \'fspId\' to be nonempty string');
  }

  if ( !(args.consentRequest  && typeof(args.consentRequest) === 'object') ) {
      throw new Error('OTPValidate.requestAction args requires \'transfer\' to be specified');
  }
  args.requests.patchConsentRequests(args.consentRequestId, args.consentRequest, args.fspId);
  resolve()
}


function argsValidation(args: requestActionArgs) {
  if (!(args.consentRequestId && typeof(args.consentRequestId) === 'string' && args.consentRequestId.length > 0)) {
      throw new Error('TransfersModel args requires \'args.consentRequestId\' is nonempty string and mandatory property');
  }
  if (args.fspId && !(typeof (args.fspId) === 'string' && args.fspId.length > 0)) {
      throw new Error('TransfersModel args requires \'args.fspId\' to be nonempty string');
  }
}

const OTPValidateModel = {
  notificationChannel: notificationChannel,
  requestAction: requestAction,
  argsValidation: argsValidation
}

export default OTPValidateModel;
