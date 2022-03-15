/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation The Mojaloop files are made available by the Mojaloop Foundation
 under the Apache License, Version 2.0 (the 'License') and you may not
 use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0 Unless required by applicable law or agreed to in
 writing, the Mojaloop files are distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS
 OF ANY KIND, either express or implied. See the License for the specific language governing
 permissions and limitations under the License. Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file. Names of the original
 copyright holders (individuals or organizations) should be listed with a '*' in the first column.
 People who have contributed from an organization can be listed under the organization that actually
 holds the copyright for their contributions (see the Gates Foundation organization for an example).
 Those individuals should have their names indented and be marked with a '-'. Email address can be
 added optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/
import {
  verifyConsentId,
  verifySourceAccountId,
  verifyPispId,
  validateGrantedConsent
} from '~/domain/thirdpartyRequests/transactions'
import * as mockData from 'test/unit/data/mockData'
import { resetUuid } from 'test/unit/__mocks__/uuid'
import { MojaloopRequests, BaseRequestConfigType } from '@mojaloop/sdk-standard-components'

const postThirdpartyRequestsTransactionRequest = mockData.postThirdpartyRequestsTransactionRequest
const postQuoteRequest = mockData.postQuotesRequest
const __postQuotes = jest.fn(() => Promise.resolve())

jest.mock('@mojaloop/sdk-standard-components', () => {
  return {
    MojaloopRequests: jest.fn(() => {
      return {
        postQuotes: __postQuotes
      }
    }),
    ThirdpartyRequests: jest.fn()
  }
})

describe('thirdpartyRequests/transactions', (): void => {
  beforeEach((): void => {
    jest.clearAllMocks()
    resetUuid()
  })

  it('verifyConsentId should resolve', async (): Promise<void> => {
    expect(await verifyConsentId('ddab7438-a8a8-2dc0-b6bf-25c8e28a7561'))
      .toEqual(true)
  })

  it('verifySourceAccountId should resolve', async (): Promise<void> => {
    expect(await verifySourceAccountId('dfspa.alice.1234'))
      .toEqual(true)
  })

  it('verifyPispId should resolve', async (): Promise<void> => {
    expect(await verifyPispId('pispa'))
      .toEqual(true)
  })

  it('validateGrantedConsent should resolve', async (): Promise<void> => {
    expect(await validateGrantedConsent('ddab7438-a8a8-2dc0-b6bf-25c8e28a7561'))
      .toEqual(true)
  })
})
