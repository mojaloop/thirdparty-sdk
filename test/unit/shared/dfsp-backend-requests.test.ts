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

import { DFSPBackendConfig, DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { Scheme } from '~/shared/http-scheme'
import mockLogger from '../mockLogger'
import TestData from 'test/unit/data/mockData.json'
import { uuid } from 'uuidv4'
import { BackendGetScopesResponse } from '~/models/inbound/dfspOTPValidate.interface'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

describe('backendRequests', () => {
  let dfspBackendRequests: DFSPBackendRequests

  const config: DFSPBackendConfig = {
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: 'backend-uri',
    verifyAuthorizationPath: 'verify-authorization',
    verifyConsentPath: 'verify-consent',
    getUserAccountsPath: 'accounts/{ID}',
    validateOTPPath: 'validateOTP',
    getScopesPath: 'scopes/{ID}',
    validateThirdpartyTransactionRequestPath: 'validate-third-party-transaction-request',
    validateConsentRequestsPath: 'validateConsentRequests',
    sendOTPPath: 'sendOTP',
    storeConsentRequestsPath: 'store/consentRequests/{ID}'
  }

  beforeEach(() => {
    dfspBackendRequests = new DFSPBackendRequests(config)
  })

  it('should create instance successfully', () => {
    expect(dfspBackendRequests).toBeTruthy()

    // check getters
    expect(dfspBackendRequests.endpoint).toEqual('http://backend-uri')

    // check methods layout
    expect(typeof dfspBackendRequests.get).toEqual('function')
    expect(typeof dfspBackendRequests.patch).toEqual('function')
    expect(typeof dfspBackendRequests.post).toEqual('function')
    expect(typeof dfspBackendRequests.put).toEqual('function')
    expect(typeof dfspBackendRequests.getUserAccounts).toEqual('function')
    expect(typeof dfspBackendRequests.validateThirdpartyTransactionRequest).toEqual('function')
    expect(typeof dfspBackendRequests.validateConsentRequests).toEqual('function')
    expect(typeof dfspBackendRequests.sendOTP).toEqual('function')
    expect(typeof dfspBackendRequests.storeConsentRequests).toEqual('function')

    /**
     * TODO: check for methods
     *  - verifyAuthorization
     */
  })

  describe('getUserAccounts', () => {
    it('should propagate call to get', async () => {
      const mockData = JSON.parse(JSON.stringify(TestData))
      const userId = mockData.accountsRequest.params.ID
      const response = mockData.accountsRequest.payload
      const getSpy = jest.spyOn(dfspBackendRequests, 'get').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await dfspBackendRequests.getUserAccounts(userId)
      expect(result).toEqual(response)
      expect(getSpy).toBeCalledWith(`accounts/${userId}`)
    })
  })

  describe('validateOTPSecret', () => {
    it('should propagate the call to post', async () => {
      const response = { isValid: true }
      const postSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const consentRequestId = uuid()
      const authToken = uuid()
      const result = await dfspBackendRequests.validateOTPSecret(consentRequestId, authToken)
      expect(result).toEqual(response)
      expect(postSpy).toBeCalledWith(dfspBackendRequests.validateOTPPath, { authToken, consentRequestId })
    })
  })

  describe('getScopes', () => {
    it('should propagate the call to get', async () => {
      const consentRequestId = uuid()
      const response: BackendGetScopesResponse = {
        scopes: [
          {
            accountId: uuid(),
            actions: ['accounts.getBalance']
          }
        ]
      }
      const getSpy = jest.spyOn(dfspBackendRequests, 'get').mockImplementationOnce(
        () => Promise.resolve(response)
      )

      const result = await dfspBackendRequests.getScopes(consentRequestId)
      expect(result).toEqual(response)
      expect(getSpy).toBeCalledWith(dfspBackendRequests.getScopesPath.replace('{ID}', consentRequestId))
    })
  })

  describe('validateThirdpartyTransactionRequest', () => {
    it('should propagate the call to post', async () => {
      const response = { isValid: true }
      const transactionRequestId = uuid()
      const transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest = {
        transactionRequestId,
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+44 1234 5678'
          }
        },
        payer: {
          partyIdType: 'THIRD_PARTY_LINK',
          partyIdentifier: 'qwerty-1234'
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
        },
        expiration: (new Date()).toISOString()
      }
      const postSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await dfspBackendRequests.validateThirdpartyTransactionRequest(transactionRequestRequest)
      expect(result).toEqual(response)
      expect(postSpy).toBeCalledWith(
        dfspBackendRequests.validateThirdpartyTransactionRequestPath,
        transactionRequestRequest
      )
    })
  })

  describe('verifyAuthorization', () => {
    it('should propagate the call to post', async () => {
      const response = { isValid: true }
      const authorizationResponse: tpAPI.Schemas.AuthorizationsIDPutResponse = {
        authenticationInfo: {
          authentication: 'U2F',
          authenticationValue: {
            pinValue: 'some-pin-value',
            counter: '1'
          } as string & Partial<{pinValue: string, counter: string}>
        },
        responseType: 'ENTERED'
      }
      const postSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await dfspBackendRequests.verifyAuthorization(authorizationResponse)
      expect(result).toEqual(response)
      expect(postSpy).toBeCalledWith(
        dfspBackendRequests.verifyAuthorizationPath,
        authorizationResponse
      )
    })
  })
  describe('validateConsentRequests', () => {
    it('should propagate call to post', async () => {
      const mockData = JSON.parse(JSON.stringify(TestData))
      const request = mockData.consentRequestsPost.payload
      const response = mockData.consentRequestsPost.response
      const getSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await dfspBackendRequests.validateConsentRequests(request)
      expect(result).toEqual(response)
      expect(getSpy).toBeCalledWith('validateConsentRequests', request)
    })
  })

  describe('sendOTP', () => {
    it('should propagate call to post', async () => {
      const mockData = JSON.parse(JSON.stringify(TestData))
      const request = mockData.consentRequestsPost.payload
      const otpRequest = mockData.consentRequestsPost.otpRequest
      const response = mockData.consentRequestsPost.otpResponse
      const getSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const result = await dfspBackendRequests.sendOTP(request)
      expect(result).toEqual(response)
      expect(getSpy).toBeCalledWith('sendOTP', otpRequest)
    })
  })

  describe('storeConsentRequests', () => {
    it('should propagate call to post', async () => {
      const mockData = JSON.parse(JSON.stringify(TestData))
      const request = mockData.consentRequestsPost.payload
      const getSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve()
      )
      const result = await dfspBackendRequests.storeConsentRequests(request)
      expect(result).toBeUndefined()
      expect(getSpy).toBeCalledWith(`store/consentRequests/${request.id}`, { scopes: request.scopes })
    })
  })
})
