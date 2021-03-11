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

 // TODO: use Async2sync model for this.
/**
 * @name channelName
 * @description generates the pub/sub channel name
 * @param {object} - args
 * @param {string} args.consentRequestId - the consent request  id
 * @returns {string} - the pub/sub channel name
 */
export function notificationChannel(consentRequestId: string) {
  if (!consentRequestId) {
    throw new Error('PISPConsentRequest.notificationChannel: \'consentRequestId\' parameter is required')
  }
  // channel name
  return `consent_request_${consentRequestId}`
}


