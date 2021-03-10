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

import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { BackendConfig, BackendRequests } from '~/models/inbound/backend-requests'
import { Scheme } from '~/shared/http-scheme'
import mockLogger from '../../mockLogger'
import { ThirdpartyTransactionStatus } from '~/models/pispTransaction.interface'
import TestData from 'test/unit/data/mockData.json'

describe('backendRequests', () => {
  let backendRequests: BackendRequests

  const config: BackendConfig = {
    dfspId: 'the-dfsp-id',
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: 'backend-uri',
    signAuthorizationPath: 'singchallenge'
  }

  const authenticationValue = {
    pinValue: 'the-mocked-pin-value',
    counter: '1'
  }

  const authorizationsPostRequest:  tpAPI.Schemas.AuthorizationsPostRequest = {
    authenticationType: 'U2F',
    retriesLeft: '1',
    amount: {
      currency: 'USD',
      amount: '100'
    },
    transactionId: 'c87e9f61-e0d1-4a1c-a992-002718daf402',
    transactionRequestId: 'aca279be-60c6-42ff-aab5-901d61b5e35c',
    quote: {
      transferAmount: {
        currency: 'USD',
        amount: '105'
      },
      expiration: '2020-07-15T09:48:54.961Z',
      ilpPacket: 'ilp-packet-value',
      condition: 'condition-000000000-111111111-222222222-abc'
    }
  }

  const transactionStatus: ThirdpartyTransactionStatus = {
    transactionId: 'mocked-transaction-id',
    transactionRequestState: 'ACCEPTED'
  }

  beforeEach(() => {
    backendRequests = new BackendRequests(config)
  })

  it('should create instance successfully', () => {
    expect(backendRequests).toBeTruthy()

    // check getters
    expect(backendRequests.endpoint).toEqual('http://backend-uri')

    // check methods layout
    expect(typeof backendRequests.get).toEqual('function')
    expect(typeof backendRequests.patch).toEqual('function')
    expect(typeof backendRequests.post).toEqual('function')
    expect(typeof backendRequests.put).toEqual('function')
    expect(typeof backendRequests.signAuthorizationRequest).toEqual('function')
    expect(typeof backendRequests.notifyAboutTransfer).toEqual('function')
    expect(typeof backendRequests.requestPartiesInformation).toEqual('function')
  })

  describe('signAuthorizationRequest', () => {
    it('should propagate call to post', async () => {
      const postSpy = jest.spyOn(backendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(authenticationValue)
      )
      const result = await backendRequests.signAuthorizationRequest(authorizationsPostRequest)
      expect(result).toEqual(authenticationValue)
      expect(postSpy).toBeCalledWith(config.signAuthorizationPath, authorizationsPostRequest)
    })
  })

  describe('notifyAboutTransfer', () => {
    it('should propagate call loggedRequest', async () => {
      const loggedRequestSpy = jest.spyOn(backendRequests, 'loggedRequest').mockImplementationOnce(
        () => Promise.resolve()
      )
      const result = await backendRequests.notifyAboutTransfer(transactionStatus, 'mocked-transaction-request-id')
      expect(result).toBeUndefined()
      expect(loggedRequestSpy).toHaveBeenCalledWith({
        method: 'PATCH',
        uri: 'http://localhost:9000/thridpartyRequests/transactions/mocked-transaction-request-id',
        body: JSON.stringify(transactionStatus),
        agent: expect.anything(),
        headers: expect.anything()
      })
    })
  })

  describe('requestPartiesInformation', () => {
    it('should propagate call loggedRequest', async () => {
      const loggedRequestSpy = jest.spyOn(backendRequests, 'loggedRequest').mockImplementationOnce(
        () => Promise.resolve({
          party: { Iam: 'mocked-party' },
          currentState: 'COMPLETED'
        })
      )
      const result = await backendRequests.requestPartiesInformation('type', 'id', 'subId')
      expect(result).toEqual({
        party: { Iam: 'mocked-party' },
        currentState: 'COMPLETED'
      })
      expect(loggedRequestSpy).toHaveBeenCalledWith({
        method: 'GET',
        uri: 'http://0.0.0.0:7002/parties/type/id/subId',
        agent: expect.anything(),
        headers: expect.anything()
      })
    })
  })

  describe('getUserAccounts', () => {
    it('should propagate call to get', async () => {
      const mockData = JSON.parse(JSON.stringify(TestData))
      const userId = mockData.accountsRequest.params.ID
      const response = mockData.accountsRequest.payload
      const getSpy = jest.spyOn(backendRequests, 'get').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await backendRequests.getUserAccounts(userId)
      expect(result).toEqual(response)
      expect(getSpy).toBeCalledWith(`accounts/${userId}`)
    })
  })
})
