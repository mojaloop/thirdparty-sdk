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
import * as mockData from 'test/unit/data/mockData'
import { v4 as uuidv4 } from 'uuid'
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
    validateAuthTokenPath: 'validateAuthToken',
    validateThirdpartyTransactionRequestPath: 'validate-third-party-transaction-request',
    validateConsentRequestsPath: 'validateConsentRequests',
    sendOTPPath: 'sendOTP',
    storeConsentRequestsPath: 'store/consentRequests/{ID}',
    storeValidatedConsentForAccountIdPath: 'accountConsentInfo'
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
    expect(typeof dfspBackendRequests.validateThirdpartyTransactionRequestAndGetContext).toEqual('function')
    expect(typeof dfspBackendRequests.validateConsentRequests).toEqual('function')
    expect(typeof dfspBackendRequests.sendOTP).toEqual('function')
    expect(typeof dfspBackendRequests.storeConsentRequests).toEqual('function')
    expect(typeof dfspBackendRequests.storeValidatedConsentForAccountId).toEqual('function')

    /**
     * TODO: check for methods
     *  - verifyAuthorization
     */
  })

  describe('getUserAccounts', () => {
    it('should propagate call to get', async () => {
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

  describe('validateAuthToken', () => {
    it('should propagate the call to post', async () => {
      const response = { isValid: true }
      const postSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(response)
      )
      const consentRequestId = uuidv4()
      const authToken = uuidv4()
      const result = await dfspBackendRequests.validateAuthToken(consentRequestId, authToken)
      expect(result).toEqual(response)
      expect(postSpy).toBeCalledWith(dfspBackendRequests.validateAuthTokenPath, { authToken, consentRequestId })
    })
  })

  describe('validateThirdpartyTransactionRequest', () => {
    it('should propagate the call to post', async () => {
      const response = { isValid: true }
      const transactionRequestId = uuidv4()
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
      const result = await dfspBackendRequests.validateThirdpartyTransactionRequestAndGetContext(transactionRequestRequest)
      expect(result).toEqual(response)
      expect(postSpy).toBeCalledWith(
        dfspBackendRequests.validateThirdpartyTransactionRequestPath,
        transactionRequestRequest
      )
    })
  })

  describe('validateConsentRequests', () => {
    it('should propagate call to post', async () => {
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
      const request = mockData.consentRequestsPost.payload
      const getSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve()
      )
      const result = await dfspBackendRequests.storeConsentRequests(request)
      expect(result).toBeUndefined()
      expect(getSpy).toBeCalledWith(`store/consentRequests/${request.consentRequestId}`, { scopes: request.scopes })
    })
  })

  describe('storeValidatedConsentForAccountId', () => {
    it('should propagate call to post', async () => {
      const postSpy = jest.spyOn(dfspBackendRequests, 'post').mockImplementation(
        () => Promise.resolve()
      )
      const result = await dfspBackendRequests.storeValidatedConsentForAccountId(
        [
          {
            address: 'dfspa.username.1234',
            actions: [
              'ACCOUNTS_TRANSFER',
              'ACCOUNTS_GET_BALANCE'
            ]
          },
          {
            address: 'dfspa.username.5678',
            actions: [
              'ACCOUNTS_TRANSFER',
              'ACCOUNTS_GET_BALANCE'
            ]
          }
        ],
        'ced49ef2-2393-46e3-a6e5-527d64e61eab',
        'b51ec534-ee48-4575-b6a9-ead2955b8069',
        'c4adabb33e9306b038088132affcde556c50d82f603f47711a9510bf3beef6d6',
        {
          credentialType: 'FIDO',
          status: 'VERIFIED',
          fidoPayload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON: 'clientDataJSON-must-not-have-fewer-' +
                'than-121-characters Lorem ipsum dolor sit amet, ' +
                'consectetur adipiscing elit, sed do eiusmod tempor ' +
                'incididunt ut labore et dolore magna aliqua.',
              attestationObject: 'attestationObject-must-not-have-fewer' +
                '-than-306-characters Lorem ipsum dolor sit amet, ' +
                'consectetur adipiscing elit, sed do eiusmod tempor ' +
                'incididunt ut labore et dolore magna aliqua. Ut enim ' +
                'ad minim veniam, quis nostrud exercitation ullamco ' +
                'laboris nisi ut aliquip ex ea commodo consequat. Duis ' +
                'aute irure dolor in reprehenderit in voluptate velit ' +
                'esse cillum dolore eu fugiat nulla pariatur.'
            },
            type: 'public-key'
          }
        }
      )
      expect(result).toBeUndefined()
      expect(postSpy).toBeCalledWith('accountConsentInfo', {
        scopes: [
          {
            address: 'dfspa.username.1234',
            actions: [
              'ACCOUNTS_TRANSFER',
              'ACCOUNTS_GET_BALANCE'
            ]
          },
          {
            address: 'dfspa.username.5678',
            actions: [
              'ACCOUNTS_TRANSFER',
              'ACCOUNTS_GET_BALANCE'
            ]
          }
        ],
        consentId: 'ced49ef2-2393-46e3-a6e5-527d64e61eab',
        registrationChallenge: 'c4adabb33e9306b038088132affcde556c50d82f603f47711a9510bf3beef6d6',
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        credential: {
          credentialType: 'FIDO',
          status: 'VERIFIED',
          fidoPayload: {
            id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
            rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
            response: {
              clientDataJSON: 'clientDataJSON-must-not-have-fewer-' +
                'than-121-characters Lorem ipsum dolor sit amet, ' +
                'consectetur adipiscing elit, sed do eiusmod tempor ' +
                'incididunt ut labore et dolore magna aliqua.',
              attestationObject: 'attestationObject-must-not-have-fewer' +
                '-than-306-characters Lorem ipsum dolor sit amet, ' +
                'consectetur adipiscing elit, sed do eiusmod tempor ' +
                'incididunt ut labore et dolore magna aliqua. Ut enim ' +
                'ad minim veniam, quis nostrud exercitation ullamco ' +
                'laboris nisi ut aliquip ex ea commodo consequat. Duis ' +
                'aute irure dolor in reprehenderit in voluptate velit ' +
                'esse cillum dolore eu fugiat nulla pariatur.'
            },
            type: 'public-key'
          }
        }
      })
    })
  })
})
