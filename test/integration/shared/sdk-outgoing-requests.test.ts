/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/

import { SDKOutgoingRequestsConfig, SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import config from '~/shared/config'
import { Scheme } from '~/shared/http-scheme'
import mockLogger from 'test/unit/mockLogger'
import { OutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { v4 as uuidv4 } from 'uuid'

describe('SDKOutgoingRequests', () => {
  const sdkConfig: SDKOutgoingRequestsConfig = {
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: config.shared.sdkOutgoingUri,
    requestPartiesInformationPath: config.shared.sdkOutgoingPartiesInformationPath,
    requestToPayTransferPath: config.shared.sdkRequestToPayTransferUri,
    requestQuotePath: config.shared.sdkOutgoingRequestQuotePath,
    requestAuthorizationPath: config.shared.sdkOutgoingRequestAuthorizationPath,
    requestTransferPath: config.shared.sdkOutgoingRequestTransferPath
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
        expect(result.party.headers).toBeDefined()
        expect(result.party.body).toBeDefined()
        expect(result.currentState).toEqual('COMPLETED')
      }
    })
  })

  describe('requestQuote', () => {
    it('should return quotes information', async () => {
      const request: OutboundAPI.Schemas.quotesPostRequest = {
        fspId: uuidv4().substr(0, 32), // fspid has limited length
        quotesPostRequest: {
          quoteId: uuidv4(),
          transactionId: uuidv4(),
          payee: {
            partyIdInfo: {
              partyIdType: 'MSISDN',
              partyIdentifier: '+44 1234 5678'
            }
          },
          payer: {
            partyIdInfo: {
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
        expect(result.quotes.body).toBeDefined()
        expect(result.quotes.headers).toBeDefined()
        expect(result.currentState).toEqual('COMPLETED')
      }
    })
  })
  describe('requestTransfer', () => {
    it('should return transfer details', async () => {
      const transferId = uuidv4()
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
          ilpPacket:
            'AYIBgQAAAAAAAASwNGxldmVsb25lLmRmc3AxLm1lci45T2RTOF81MDdqUUZERmZlakgyOVc4bXFmNEpLMHlGTFGCAUBQU0svMS4wCk5vbmNlOiB1SXlweUYzY3pYSXBFdzVVc05TYWh3CkVuY3J5cHRpb246IG5vbmUKUGF5bWVudC1JZDogMTMyMzZhM2ItOGZhOC00MTYzLTg0NDctNGMzZWQzZGE5OGE3CgpDb250ZW50LUxlbmd0aDogMTM1CkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvbgpTZW5kZXItSWRlbnRpZmllcjogOTI4MDYzOTEKCiJ7XCJmZWVcIjowLFwidHJhbnNmZXJDb2RlXCI6XCJpbnZvaWNlXCIsXCJkZWJpdE5hbWVcIjpcImFsaWNlIGNvb3BlclwiLFwiY3JlZGl0TmFtZVwiOlwibWVyIGNoYW50XCIsXCJkZWJpdElkZW50aWZpZXJcIjpcIjkyODA2MzkxXCJ9IgA',
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
            body: {
              transferState: 'COMMITTED',
              completedTimestamp: expect.anything(),
              fulfilment: expect.anything()
            },
            headers: expect.any(Object)
          },
          currentState: 'COMPLETED'
        })
        expect(result.transfer).toBeDefined()
        expect(result.transfer.body).toBeDefined()
        expect(result.transfer.headers).toBeDefined()
        expect(result.transfer.body.transferState).toEqual('COMMITTED')
        expect(result.currentState).toEqual('COMPLETED')
        await new Promise(process.nextTick)
      }
    })
  })
})
