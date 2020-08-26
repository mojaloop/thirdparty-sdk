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
  buildPayeeQuoteRequestFromTptRequest,
  forwardPostQuoteRequestToPayee,
  verifyConsentId,
  verifySourceAccountId,
  verifyPispId,
  validateGrantedConsent
} from '~/domain/thirdpartyRequests/transactions'
import TestData from 'test/unit/data/mockData.json'
import { resetUuid } from 'test/unit/__mocks__/uuidv4'

const mockData = JSON.parse(JSON.stringify(TestData))
const postThirdpartyRequestsTransactionRequest = mockData.postThirdpartyRequestsTransactionRequest
const postQuoteRequest = mockData.postQuotesRequest
const __postQuotes = jest.fn(() => Promise.resolve())

jest.mock('@mojaloop/sdk-standard-components', () => {
  return {
    MojaloopRequests: jest.fn(() => {
      return {
        postQuotes: __postQuotes
      }
    })
  }
})

describe('thirdpartyRequests/transactions', (): void => {
  beforeEach((): void => {
    jest.clearAllMocks()
    resetUuid()
  })

  it('buildPayeeQuoteRequestFromTptRequest should construct a proper quote request from tptRequest', (): void => {
    const expectMockQuoteRequest = expect(buildPayeeQuoteRequestFromTptRequest(
      postThirdpartyRequestsTransactionRequest.payload
    ))

    expectMockQuoteRequest.toEqual(expect.objectContaining({
      quoteId: '00000000-0000-1000-8000-000000000001',
      transactionId: '00000000-0000-1000-8000-000000000002',
      note: ''
    }))
    expectMockQuoteRequest.toEqual(expect.objectContaining({
      payee: postQuoteRequest.payload.payee,
      payer: postQuoteRequest.payload.payer,
      amount: postQuoteRequest.payload.amount,
      amountType: postQuoteRequest.payload.amountType,
      transactionType: postQuoteRequest.payload.transactionType
    }))
  })

  it('forwardPostQuoteRequestToPayee should forward a quote request and forward it to a payee', (): void => {
    // build expected quote request
    const quoteRequest = buildPayeeQuoteRequestFromTptRequest(
      postThirdpartyRequestsTransactionRequest.payload
    )

    resetUuid()

    forwardPostQuoteRequestToPayee(
      postThirdpartyRequestsTransactionRequest.payload
    )

    expect(__postQuotes).toBeCalledWith(quoteRequest, quoteRequest.payee.partyIdInfo.fspId)
  })

  it('verifyConsentId should resolve', (): void => {
    expect(verifyConsentId('ddab7438-a8a8-2dc0-b6bf-25c8e28a7561'))
      .toEqual(true)
  })

  it('verifySourceAccountId should resolve', (): void => {
    expect(verifySourceAccountId('dfspa.alice.1234'))
      .toEqual(true)
  })

  it('verifyPispId should resolve', (): void => {
    expect(verifyPispId('pispa'))
      .toEqual(true)
  })

  it('validateGrantedConsent should resolve', (): void => {
    expect(validateGrantedConsent('ddab7438-a8a8-2dc0-b6bf-25c8e28a7561'))
      .toEqual(true)
  })
})
