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

import { AuthenticationValue, InboundAuthorizationsPostRequest } from '~/models/authorizations.interface'
import { BackendConfig, BackendRequests } from '~/models/inbound/backend-requests'
import { Scheme } from '~/shared/http-scheme'
import SDK, { RequestResponse, requests } from '@mojaloop/sdk-standard-components'
import mockLogger from '../../mockLogger'
import http from 'http'
import { HTTPResponseError } from '~/shared/http-response-error'

describe('backendRequests', () => {
  let backendRequests: BackendRequests

  const config: BackendConfig = {
    dfspId: 'the-dfsp-id',
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: 'backend-uri'
  }

  const headers = {
    Accept: 'application/json',
    Date: expect.anything(),
    'Content-Type': 'application/json'
  }

  const payload = { Iam: 'the-mocked-payload' }

  const response: RequestResponse = {
    statusCode: 200,
    data: { Iam: 'mocked-response' },
    headers
  }

  const authenticationValue: AuthenticationValue = {
    pinValue: 'the-mocked-pin-value',
    counter: '1'
  }

  const authorizationsPostRequest: InboundAuthorizationsPostRequest = {
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
  })

  describe('http methods', () => {
    it('should properly GET', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve(response))
      const result = await backendRequests.get('zzz')
      expect(result).toEqual(response.data)
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'GET',
        uri: 'http://backend-uri/zzz'
      })
    })

    it('should properly PATCH', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve(response))
      const result = await backendRequests.patch('zzz', payload)
      expect(result).toEqual(response.data)
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'PATCH',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })

    it('should properly POST', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve(response))
      const result = await backendRequests.post('zzz', payload)
      expect(result).toEqual(response.data)
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'POST',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })

    it('should properly PUT', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve(response))
      const result = await backendRequests.put('zzz', payload)
      expect(result).toEqual(response.data)
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'PUT',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })

    it('should propagate thrown exception', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => { throw new Error('exception') })
      expect(backendRequests.put('zzz', payload)).rejects.toThrowError('exception')
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'PUT',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })

    it('should return void for 204', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve({
        statusCode: 204,
        data: { It: 'does not matter' }
      }))
      const result = await backendRequests.put('zzz', payload)
      expect(result).toBeUndefined()
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'PUT',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })

    it('should throw exception non success full status code', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve({
        statusCode: 304,
        data: { It: 'does not matter' }
      }))
      expect(backendRequests.put('zzz', payload)).rejects.toThrow(new HTTPResponseError({
        msg: `Request returned non-success status code ${304}`,
        res: {
          statusCode: 304,
          data: { It: 'does not matter' }
        }
      }))
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'PUT',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })
  })

  describe('keepAlive flag', () => {
    const agentSpy = jest.spyOn(http, 'Agent').mockImplementationOnce(
      () => ({ Iam: 'mocked-agent' } as unknown as http.Agent)
    )

    const kaConfig: BackendConfig = {
      ...config,
      keepAlive: false
    }

    const request = new BackendRequests(kaConfig)
    expect(request).toBeTruthy()
    expect(agentSpy).toBeCalledWith({ keepAlive: false })
  })

  describe('signAuthorizationRequest', () => {
    it('should propagate call to post', async () => {
      const postSpy = jest.spyOn(backendRequests, 'post').mockImplementationOnce(
        () => Promise.resolve(authenticationValue)
      )
      const result = await backendRequests.signAuthorizationRequest(authorizationsPostRequest)
      expect(result).toEqual(authenticationValue)
      expect(postSpy).toBeCalledWith('http://backend-uri/signAuthorizationRequest', authorizationsPostRequest)
    })
  })
})
