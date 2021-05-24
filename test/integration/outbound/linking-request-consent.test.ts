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

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import axios from 'axios'
import env from '../env'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Config from '~/shared/config'
import mockLogger from '../../unit/mockLogger'
import TestData from 'test/unit/data/mockData.json'

const mockData = JSON.parse(JSON.stringify(TestData))

describe('PISP requests DFSP to validate user consentRequests for linking', (): void => {
  const config: RedisConnectionConfig = {
    host: Config.REDIS.HOST,
    port: Config.REDIS.PORT,
    logger: mockLogger(),
    timeout: Config.REDIS.TIMEOUT
  }
  let kvs: KVS
  const linkingRequestConsentURI = `${env.outbound.baseUri}/linking/request-consent`

  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  describe('PISP Linking flow Web', (): void => {
    it('WEB: request consent should be success', async (): Promise<void> => {
      // ttk returns WEB response for id 'b51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentRequest = {
        ...mockData.linkingRequestConsentPostRequest.payload,
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        toParticipantId: 'dfspa'
      }
      const expectedResponse = {
        channelResponse: { ...mockData.consentRequestsPut.payload },
        currentState: 'WebAuthenticationChannelResponseRecieved'
      }
      const consentRequestsResponse = await axios.post(linkingRequestConsentURI, linkingRequestConsentRequest)
      expect(consentRequestsResponse.status).toEqual(200)
      expect(consentRequestsResponse.data).toEqual(expectedResponse)
    })

    it('WEB: request consent validate should be success', async (): Promise<void> => {
      const consentRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentValidateURI = `${env.outbound.baseUri}/linking/request-consent/${consentRequestId}/validate`

      // ttk uses an authToken of 123456 to return a valid response
      const linkingRequestConsentValidateRequest = {
        authToken: '123456'
      }
      const expectedResponse = {
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        consentRequestId: consentRequestId,
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }
        ]
      }
      const consentRequestsResponse = await axios.patch(linkingRequestConsentValidateURI, linkingRequestConsentValidateRequest)
      expect(consentRequestsResponse.status).toEqual(200)
      expect(consentRequestsResponse.data.currentState).toEqual('consentReceivedAwaitingCredential')
      expect(consentRequestsResponse.data.consent).toEqual(expectedResponse)
    })
  })

  describe('PISP Linking flow OTP', (): void => {
    it('OTP: request consent should be success', async (): Promise<void> => {
      // ttk returns OTP response for id 'c51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentRequest = {
        ...mockData.linkingRequestConsentPostRequest.payload,
        consentRequestId: 'c51ec534-ee48-4575-b6a9-ead2955b8069',
        toParticipantId: 'dfspa'
      }
      const expectedResponse = {
        channelResponse: { ...mockData.consentRequestsPutOTP.payload },
        currentState: 'OTPAuthenticationChannelResponseRecieved'
      }
      const consentRequestsResponse = await axios.post(linkingRequestConsentURI, linkingRequestConsentRequest)
      expect(consentRequestsResponse.status).toEqual(200)
      expect(consentRequestsResponse.data).toEqual(expectedResponse)
    })

    it('OTP: request consent validate should be success', async (): Promise<void> => {
      const consentRequestId = 'c51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentValidateURI = `${env.outbound.baseUri}/linking/request-consent/${consentRequestId}/validate`

      // ttk uses an authToken of 123456 to return a valid response
      const linkingRequestConsentValidateRequest = {
        authToken: '123456'
      }
      const expectedResponse = {
        consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
        consentRequestId: consentRequestId,
        scopes: [{
          accountId: 'some-id',
          actions: [
            'accounts.getBalance',
            'accounts.transfer'
          ]
        }
        ]
      }
      const consentRequestsResponse = await axios.patch(linkingRequestConsentValidateURI, linkingRequestConsentValidateRequest)
      expect(consentRequestsResponse.status).toEqual(200)
      expect(consentRequestsResponse.data.currentState).toEqual('consentReceivedAwaitingCredential')
      expect(consentRequestsResponse.data.consent).toEqual(expectedResponse)
    })
  })


  describe('PISP Linking flow OTP - Error @ consent request stage', (): void => {
    it('validateRequest should be errored', async (done): Promise<void> => {
      // ttk returns Error reponse for id 'd51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentRequest = {
        ...mockData.linkingRequestConsentPostRequest.payload,
        consentRequestId: 'd51ec534-ee48-4575-b6a9-ead2955b8069',
        toParticipantId: 'dfspa'
      }
      const expectedResponse = {
        ...mockData.consentRequestsPutError.payload,
        currentState: 'errored'
      }
      await axios.post(linkingRequestConsentURI, linkingRequestConsentRequest)
        .catch(error => {
          expect(error.response.status).toEqual(500)
          expect(error.response.data).toEqual(expectedResponse)
          done()
        })
    })
  })


  describe('PISP Linking flow WEB - Error @ consent request validate stage', (): void => {
    it('WEB: request consent should be success', async (): Promise<void> => {
      // ttk returns WEB response for id 'b51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentRequest = {
        ...mockData.linkingRequestConsentPostRequest.payload,
        consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        toParticipantId: 'dfspa'
      }
      const expectedResponse = {
        channelResponse: { ...mockData.consentRequestsPut.payload },
        currentState: 'WebAuthenticationChannelResponseRecieved'
      }
      const consentRequestsResponse = await axios.post(linkingRequestConsentURI, linkingRequestConsentRequest)
      expect(consentRequestsResponse.status).toEqual(200)
      expect(consentRequestsResponse.data).toEqual(expectedResponse)
    })

    it('WEB: request consent validate should be errored', async (): Promise<void> => {
      const consentRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
      const linkingRequestConsentValidateURI = `${env.outbound.baseUri}/linking/request-consent/${consentRequestId}/validate`

      // ttk uses an authToken of 123456 to return a valid response
      const linkingRequestConsentValidateRequest = {
        authToken: '654321'
      }
      const expectedResponse = {
        errorInformation: {
          errorCode: "7000",
          errorDescription: "Generic thirdparty error"
        },
        currentState: 'errored'
      }

      await axios.patch(linkingRequestConsentValidateURI, linkingRequestConsentValidateRequest)
      .catch(error => {
        expect(error.response.status).toEqual(500)
        expect(error.response.data.currentState).toEqual('errored')
        expect(error.response.data).toEqual(expectedResponse)
      })
    })
  })
})
