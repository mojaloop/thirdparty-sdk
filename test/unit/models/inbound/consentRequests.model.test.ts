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

- Kevin Leyow - kevin.leyow@modusbox.com
--------------
******/

import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { InboundConsentRequestsRequestModel, InboundConsentRequestsRequestModelConfig } from '~/models/inbound/consentRequests.model'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components';

import mockLogger from '../../mockLogger'
import { uuid } from 'uuidv4';

describe('InboundConsentRequestsRequestModel', () => {
  const logger = mockLogger()

  describe('consentRequests', () => {
    let model: InboundConsentRequestsRequestModel
    let config: InboundConsentRequestsRequestModelConfig
    let dfspBackendRequests: DFSPBackendRequests
    let thirdpartyRequests: ThirdpartyRequests
    const dfspId = 'dfsp-id'

    const patchConsentRequests: tpAPI.Schemas.ConsentRequestsIDPatchRequest = {
        authToken: '12345'
    }
    beforeEach(async () => {
      thirdpartyRequests = {
        postConsents: jest.fn(() => Promise.resolve()),
      } as unknown as ThirdpartyRequests

      dfspBackendRequests = {
        validateOTPSecret: jest.fn(() => Promise.resolve({
          isValid: true
        })),
        getScopes: jest.fn(() => Promise.resolve({
          scopes: [{
            accountId: "35ad7f40-1646-4237-b24c-d6b2d507fe59",
            actions: [
              'accounts.getBalance',
              'accounts.transfer'
            ]
          }]
        }))
      } as unknown as DFSPBackendRequests

      config = {
        logger,
        dfspBackendRequests,
        thirdpartyRequests
      }

      model = new InboundConsentRequestsRequestModel(config)
    })

    test('happy flow', async () => {
      const id = uuid()
      await model.postConsentsRequest(
        id,
        dfspId,
        patchConsentRequests.authToken
      )
      expect(config.dfspBackendRequests.validateOTPSecret).toHaveBeenCalledWith(id, patchConsentRequests.authToken)
      expect(config.dfspBackendRequests.getScopes).toHaveBeenCalledWith(id)

      expect(config.thirdpartyRequests.postConsents).toHaveBeenCalledWith(
        expect.objectContaining({
          consentRequestId: id,
          scopes: [{
              accountId: "35ad7f40-1646-4237-b24c-d6b2d507fe59",
              actions: [
                'accounts.getBalance',
                'accounts.transfer'
              ]
            }
          ]
         }),
        dfspId
      )
    })
  })
})
