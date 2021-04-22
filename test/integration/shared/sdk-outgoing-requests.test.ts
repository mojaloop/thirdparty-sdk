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
import { OutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { uuid } from 'uuidv4'

describe('SDKOutgoingRequests', () => {
  const sdkConfig: SDKOutgoingRequestsConfig = {
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: config.SHARED.SDK_OUTGOING_URI,
    requestPartiesInformationPath: config.SHARED.SDK_OUTGOING_PARTIES_INFORMATION_PATH,
    requestToPayTransferPath: config.SHARED.SDK_REQUEST_TO_PAY_TRANSFER_URI,
    requestQuotePath: config.SHARED.SDK_OUTGOING_REQUEST_QUOTE_PATH,
    requestAuthorizationPath: config.SHARED.SDK_OUTGOING_REQUEST_AUTHORIZATION_PATH,
    requestTransferPath: config.SHARED.SDK_OUTGOING_REQUEST_TRANSFER_PATH
  }
  const sdkOutRequest = new SDKOutgoingRequests(sdkConfig)

  describe('requestPartiesInformation', () => {
    it('should return parties information', async () => {
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

  describe('requestQuote', () => {
    it('should return quotes information', async () => {
      const request: OutboundAPI.Schemas.quotesPostRequest = {
        fspId: uuid().substr(0, 32), // fspid has limited length
        quotesPostRequest: {
          quoteId: uuid(),
          transactionId: uuid(),
          payee: {
            partyIdInfo: {
              partyIdType: 'MSISDN',
              partyIdentifier: '+44 1234 5678'
            }
          },
          payer: {
            partyIdInfo: {
              // TODO: investigate quotes interface and payer 'THIRD_PARTY_LINK' problem
              partyIdType: 'MSISDN',
              partyIdentifier: '+44 5678 1234'
            }
          },
          amountType: 'SEND',
          amount: {
            currency: 'USD',
            amount: '100'
          },
          transactionType: {
            scenario: 'TRANSFER',
            initiator: 'PAYER',
            initiatorType: 'CONSUMER'
          }
        }
      }

      // Act
      const result = await sdkOutRequest.requestQuote(request)

      // Assert
      expect(result).toBeDefined()
      // result could be void, so Typescript enforce code branching
      if (result) {
        expect(result.quotes).toBeDefined()
        expect(result.currentState).toEqual('COMPLETED')
      }
    })
  })

  describe('requestAuthorization', () => {
    it('should return received authorization information', async () => {
      const request: OutboundAPI.Schemas.authorizationsPostRequest = {
        fspId: 'pisp',
        authorizationsPostRequest: {
          transactionId: uuid(),
          transactionRequestId: uuid(),
          authenticationType: 'U2F',
          retriesLeft: '1',
          amount: {
            currency: 'USD',
            amount: '100'
          },
          quote: {
            transferAmount: {
              currency: 'USD',
              amount: '100'
            },
            expiration: (new Date()).toISOString(),
            ilpPacket: 'abc',
            condition: '0123456789012345678901234567890123456789012'
          }
        }
      }

      // Act
      const result = await sdkOutRequest.requestAuthorization(request)

      // Assert
      expect(result).toBeDefined()
      // result could be void, so Typescript enforce code branching
      if (result) {
        expect(result.authorizations.authenticationInfo).toEqual({
          authentication: 'U2F',
          authenticationValue: {
            pinValue: expect.anything(),
            counter: '1'
          }
        })
        expect(result.authorizations.responseType).toBeDefined()
        expect(result.currentState).toEqual('COMPLETED')
      }
    })
  })

  describe('requestTransfer', () => {
    it('should return transfer details', async () => {
      const transferId = uuid();
      const request: OutboundAPI.Schemas.simpleTransfersPostRequest = {
        fspId: 'dfspa',
        transfersPostRequest: {
          transferId,
          payeeFsp: 'sim',
          payerFsp: 'mojaloop-sdk',
          amount: {
            amount: '100',
            currency: 'USD'
          },
          ilpPacket: 'AYIBgQAAAAAAAASwNGxldmVsb25lLmRmc3AxLm1lci45T2RTOF81MDdqUUZERmZlakgyOVc4bXFmNEpLMHlGTFGCAUBQU0svMS4wCk5vbmNlOiB1SXlweUYzY3pYSXBFdzVVc05TYWh3CkVuY3J5cHRpb246IG5vbmUKUGF5bWVudC1JZDogMTMyMzZhM2ItOGZhOC00MTYzLTg0NDctNGMzZWQzZGE5OGE3CgpDb250ZW50LUxlbmd0aDogMTM1CkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvbgpTZW5kZXItSWRlbnRpZmllcjogOTI4MDYzOTEKCiJ7XCJmZWVcIjowLFwidHJhbnNmZXJDb2RlXCI6XCJpbnZvaWNlXCIsXCJkZWJpdE5hbWVcIjpcImFsaWNlIGNvb3BlclwiLFwiY3JlZGl0TmFtZVwiOlwibWVyIGNoYW50XCIsXCJkZWJpdElkZW50aWZpZXJcIjpcIjkyODA2MzkxXCJ9IgA',
          condition: 'f5sqb7tBTWPd5Y8BDFdMm9BJR_MNI4isf8p8n4D5pHA',
          expiration: '2020-01-20T11:31:49.325Z',
          extensionList: {
            extension: [
              {
                key: 'qreqkey1',
                value: 'qreqvalue1'
              },
              {
                key: 'qreqkey2',
                value: 'qreqvalue2'
              }
            ]
          }
        }
      }

      // Act
      const result = await sdkOutRequest.requestTransfer(request)
      // Assert
      expect(result).toBeDefined()
      // result could be void, so Typescript enforce code branching
      if (result) {
        expect(result).toEqual({
          transfer: {
            transferState: 'COMMITTED',
            completedTimestamp: expect.anything(),
            fulfilment: expect.anything()
          },
          currentState: 'COMPLETED'
        })
        expect(result.transfer.transferState).toEqual('COMMITTED')
        expect(result.currentState).toEqual('COMPLETED')
      }
    })
  })
})
