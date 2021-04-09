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

import { SDKOutgoingRequestsConfig, SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import config from '~/shared/config'
import { Scheme } from '~/shared/http-scheme'
import mockLogger from 'test/unit/mockLogger'

describe('SDKOutgoingRequests', () => {
  describe('requestPartiesInformation', () => {
    const sdkConfig: SDKOutgoingRequestsConfig = {
      logger: mockLogger(),
      scheme: Scheme.http,
      uri: config.SHARED.SDK_OUTGOING_URI,
      // requestAuthorizationPath: string
      requestPartiesInformationPath: config.SHARED.SDK_OUTGOING_PARTIES_INFORMATION_PATH,
      requestToPayTransferPath: config.SHARED.SDK_REQUEST_TO_PAY_TRANSFER_URI,
      requestQuotePath: config.SHARED.SDK_OUTGOING_REQUEST_QUOTE_PATH
    }

    it('should return parties information', async () => {
      const sdkOutRequest = new SDKOutgoingRequests(sdkConfig)

      // Act
      const result = await sdkOutRequest.requestPartiesInformation('MSISDN', '4412345678')

      // Assert
      expect(result).toBeDefined()

      // result could be void, so Typescript enforce code branching
      if (result) {
        expect(result.party).toBeDefined()
        expect(result.currentState).toEqual('COMPLETED')
      }
    })
  })
})
