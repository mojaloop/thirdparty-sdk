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

import { SDKRequestConfig, SDKRequest } from '~/shared/sdk-requests'
import { Scheme } from '~/shared/http-scheme'
import mockLogger from '../mockLogger'
import { ThirdpartyTransactionStatus } from '~/models/pispTransaction.interface'
import { uuid } from 'uuidv4'
describe('SDKRequests', () => {
  let sdkRequest: SDKRequest

  const config: SDKRequestConfig = {
    dfspId: 'the-dfsp-id',
    logger: mockLogger(),
    scheme: Scheme.http,
    uri: 'backend-uri',
    // PATHS
    notifyAboutTransferPath: 'notify-about-transfer/{ID}',
    requestPartiesInformationPath: 'parties/{Type}/{ID}/{SubId}',
    requestToPayTransferPath: 'request-to-pay-transfer'
  }

  const transactionStatus: ThirdpartyTransactionStatus = {
    transactionId: 'mocked-transaction-id',
    transactionRequestState: 'ACCEPTED'
  }

  beforeEach(() => {
    sdkRequest = new SDKRequest(config)
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
    expect(typeof sdkRequest.notifyAboutTransfer).toEqual('function')
  })

  describe('notifyAboutTransfer', () => {
    it('should propagate call loggedRequest', async () => {
      // TODO: should use proper method from ThirdpartyRequests class from SDK
      const loggedRequestSpy = jest.spyOn(sdkRequest, 'loggedRequest').mockImplementationOnce(
        () => Promise.resolve()
      )
      const transactionRequestId = uuid()
      const result = await sdkRequest.notifyAboutTransfer(transactionStatus, transactionRequestId)
      expect(result).toBeUndefined()
      expect(loggedRequestSpy).toHaveBeenCalledWith({
        method: 'PATCH',
        // uri: 'http://localhost:9000/thridpartyRequests/transactions/mocked-transaction-request-id',
        uri: `${config.scheme}://${config.uri}/${config.notifyAboutTransferPath.replace('{ID}', transactionRequestId)}`,
        body: JSON.stringify(transactionStatus),
        agent: expect.anything(),
        headers: expect.anything()
      })
    })
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
})
