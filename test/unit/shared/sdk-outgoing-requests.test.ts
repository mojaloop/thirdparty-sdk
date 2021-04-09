/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the 'License')
 and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed
 on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
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
import { Scheme } from '~/shared/http-scheme'
import mockLogger from '../mockLogger'
import { uuid } from 'uuidv4'
import { OutboundRequestToPayTransferPostRequest } from '~/models/thirdparty.transactions.interface'
import { OutboundAPI } from '@mojaloop/sdk-scheme-adapter'

describe('SDKOutgoingRequests', () => {
  let sdkRequest: SDKOutgoingRequests

  const config: SDKOutgoingRequestsConfig = {
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: 'backend-uri',
    // PATHS
    // requestAuthorizationPath: 'authorizations',
    requestPartiesInformationPath: 'parties/{Type}/{ID}/{SubId}',
    requestToPayTransferPath: 'request-to-pay-transfer',
    requestQuotePath: 'request-quote',
    requestAuthorizationPath: 'request-authorization',
    requestTransferPath: 'request-transfer'
  }

  const requestToPayTransfer: OutboundRequestToPayTransferPostRequest = {
    requestToPayTransactionId: uuid(),
    from: {
      idType: 'MSISDN',
      idValue: '1234567890'
    },
    to: {
      idType: 'MSISDN',
      idValue: '0987654321'
    },
    amountType: 'SEND',
    currency: 'USD',
    amount: '100',
    scenario: 'TRANSFER',
    initiator: 'PAYER',
    initiatorType: 'CONSUMER'
  }

  beforeEach(() => {
    sdkRequest = new SDKOutgoingRequests(config)
  })

  it('should create instance successfully', () => {
    expect(sdkRequest).toBeTruthy()

    // check getters
    expect(sdkRequest.endpoint).toEqual('http://backend-uri')

    // check methods layout
    expect(typeof sdkRequest.get).toEqual('function')
    expect(typeof sdkRequest.patch).toEqual('function')
    expect(typeof sdkRequest.post).toEqual('function')
    expect(typeof sdkRequest.put).toEqual('function')
    expect(typeof sdkRequest.requestPartiesInformation).toEqual('function')
  })

  describe('requestPartiesInformation', () => {
    it('should propagate call loggedRequest', async () => {
      const loggedRequestSpy = jest.spyOn(sdkRequest, 'loggedRequest').mockImplementationOnce(
        () => Promise.resolve({
          party: { Iam: 'mocked-party' },
          currentState: 'COMPLETED'
        })
      )
      const partyId = uuid()
      const result = await sdkRequest.requestPartiesInformation('type', partyId, 'subId')
      expect(result).toEqual({
        party: { Iam: 'mocked-party' },
        currentState: 'COMPLETED'
      })
      const path = config.requestPartiesInformationPath
        .replace('{Type}', 'type')
        .replace('{ID}', partyId)
        .replace('{SubId}', 'subId')
      const uri = `${config.scheme}://${config.uri}/${path}`
      expect(loggedRequestSpy).toHaveBeenCalledWith({
        method: 'GET',
        // uri: 'http://0.0.0.0:7002/parties/type/id/subId',
        uri,
        agent: expect.anything(),
        headers: expect.anything()
      })
    })
  })

  describe('requestQuote', () => {
    it('should propagate the call to post', async () => {
      const request: OutboundAPI.Schemas.quotesPostRequest = {
        fspId: uuid(),
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
              partyIdType: 'THIRD_PARTY_LINK',
              partyIdentifier: 'qwerty-0987'
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
      const response: OutboundAPI.Schemas.quotesPostResponse = {
        quotes: {
          transferAmount: {
            currency: 'USD',
            amount: '100'
          },
          ilpPacket: 'abcd...',
          condition: 'xyz....',
          expiration: (new Date()).toISOString()
        },
        currentState: 'COMPLETED'
      }
      const postSpy = jest.spyOn(sdkRequest, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )

      const result = await sdkRequest.requestQuote(request)
      expect(result).toEqual(response)
      expect(postSpy).toHaveBeenCalledWith(sdkRequest.requestQuotePath, request)
    })
  })

  describe('requestAuthorization', () => {
    it('should propagate the call to post', async () => {
      const request: OutboundAPI.Schemas.authorizationsPostRequest = {
        fspId: uuid().substr(0, 32), // fspid has limited length
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
            ilpPacket: '...abc',
            condition: 'xyz...'
          }
        }
      }

      const response: OutboundAPI.Schemas.authorizationsPostResponse = {
        authorizations: {
          authenticationInfo: {
            authentication: 'U2F',
            authenticationValue: {
              pinValue: 'abc...xyz',
              counter: '1'
            } as string & Partial<{ pinValue: string, counter: string }>
          },
          responseType: 'ENTERED'
        },
        currentState: 'COMPLETED'
      }

      const postSpy = jest.spyOn(sdkRequest, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await sdkRequest.requestAuthorization(request)
      expect(result).toEqual(response)
      expect(postSpy).toHaveBeenCalledWith(sdkRequest.requestAuthorizationPath, request)
    })
  })

  describe('requestTransfer', () => {
    it('should propagate the call to post', async () => {
      const transferId = uuid()
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

      const response: OutboundAPI.Schemas.simpleTransfersPostResponse = {
        transfer: {
          fulfilment: 'fulfilment',
          completedTimestamp: 'completedTimestamp',
          transferState: 'RECEIVED',
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
        },
        currentState: 'COMPLETED'
      }

      const postSpy = jest.spyOn(sdkRequest, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await sdkRequest.requestTransfer(request)
      expect(result).toEqual(response)
      expect(postSpy).toHaveBeenCalledWith(sdkRequest.requestTransferPath, request)
    })
  })

  describe('requestToPayTransfer', () => {
    it('should propagate call loggedRequest', async () => {
      // TODO: should use proper method from ThirdpartyRequests class from SDK
      const loggedRequestSpy = jest.spyOn(sdkRequest, 'loggedRequest').mockImplementationOnce(
        () => Promise.resolve()
      )
      const result = await sdkRequest.requestToPayTransfer(requestToPayTransfer)
      expect(result).toBeUndefined()
      expect(loggedRequestSpy).toHaveBeenCalledWith({
        method: 'POST',
        // uri: 'http://localhost:9000/thridpartyRequests/transactions/mocked-transaction-request-id',
        uri: `${config.scheme}://${config.uri}/${config.requestToPayTransferPath}`,
        body: JSON.stringify(requestToPayTransfer),
        agent: expect.anything(),
        headers: expect.anything()
      })
    })
  })
})
