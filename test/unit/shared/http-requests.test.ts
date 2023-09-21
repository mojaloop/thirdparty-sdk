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

import { HttpRequestsConfig, HttpRequests } from '~/shared/http-requests'
import { Scheme } from '~/shared/http-scheme'
import SDK, { RequestResponse, requests } from '@mojaloop/sdk-standard-components'
import mockLogger from '../mockLogger'
import http from 'http'
import { HTTPResponseError } from '~/shared/http-response-error'

describe('HttpRequests', () => {
  let httpRequest: HttpRequests

  const config: HttpRequestsConfig = {
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

  beforeEach(() => {
    httpRequest = new HttpRequests(config)
  })

  it('should create instance successfully', () => {
    expect(httpRequest).toBeTruthy()

    // check getters
    expect(httpRequest.endpoint).toEqual('http://backend-uri')

    // check methods layout
    expect(typeof httpRequest.get).toEqual('function')
    expect(typeof httpRequest.patch).toEqual('function')
    expect(typeof httpRequest.post).toEqual('function')
    expect(typeof httpRequest.put).toEqual('function')
  })

  describe('http methods', () => {
    it('should properly GET', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => Promise.resolve(response))
      const result = await httpRequest.get('zzz')
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
      const result = await httpRequest.patch('zzz', payload)
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
      const result = await httpRequest.post('zzz', payload)
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
      const result = await httpRequest.put('zzz', payload)
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
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() => {
        throw new Error('exception')
      })
      expect(httpRequest.put('zzz', payload)).rejects.toThrowError('exception')
      expect(requestSpy).toBeCalledWith({
        agent: expect.anything(),
        headers,
        method: 'PUT',
        uri: 'http://backend-uri/zzz',
        body: requests.common.bodyStringifier(payload)
      })
    })

    it('should return void for 204', async () => {
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() =>
        Promise.resolve({
          statusCode: 204,
          data: { It: 'does not matter' }
        })
      )
      const result = await httpRequest.put('zzz', payload)
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
      const requestSpy = jest.spyOn(SDK, 'request').mockImplementationOnce(() =>
        Promise.resolve({
          statusCode: 304,
          data: { It: 'does not matter' }
        })
      )
      expect(httpRequest.put('zzz', payload)).rejects.toThrow(
        new HTTPResponseError({
          msg: `Request returned non-success status code ${304}`,
          res: {
            statusCode: 304,
            data: { It: 'does not matter' }
          }
        })
      )
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
    const agentSpy = jest
      .spyOn(http, 'Agent')
      .mockImplementationOnce(() => ({ Iam: 'mocked-agent' }) as unknown as http.Agent)

    const kaConfig: HttpRequestsConfig = {
      ...config,
      keepAlive: false
    }

    const request = new HttpRequests(kaConfig)
    expect(request).toBeTruthy()
    expect(agentSpy).toBeCalledWith({ keepAlive: false })
  })
})
