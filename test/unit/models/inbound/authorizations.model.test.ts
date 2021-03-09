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

- Sridhar Voruganti - sridhar.voruganti@modusbox.com
- Paweł Marzec <pawel.marzec@modusbox.com>
--------------
******/

import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { InboundAuthorizationsModel, InboundAuthorizationsModelConfig } from '~/models/inbound/authorizations.model'
import { BackendRequests } from '~/models/inbound/backend-requests'
import { MojaloopRequests } from '@mojaloop/sdk-standard-components'

import mockLogger from '../../mockLogger'
import { mocked } from 'ts-jest/utils'
import { HTTPResponseError } from '../../../../src/shared/http-response-error'

describe('InboundAuthorizationModel', () => {
  const logger = mockLogger()

  describe('authorizations', () => {
    let model: InboundAuthorizationsModel
    let config: InboundAuthorizationsModelConfig
    let backendRequests: BackendRequests
    let mojaloopRequests: MojaloopRequests
    const dfspId = 'dfsp-id'
    const authenticationValue = {
      pinValue: 'pin-value',
      counter: '1'
    }

    const authorizationRequest: tpAPI.Schemas.AuthorizationsPostRequest = {
      authenticationType: 'U2F',
      retriesLeft: '1',
      amount: {
        currency: 'USD',
        amount: '100'
      },
      transactionId: '2f169631-ef99-4cb1-96dc-91e8fc08f539',
      transactionRequestId: '02e28448-3c05-4059-b5f7-d518d0a2d8ea',
      quote: {
        transferAmount: {
          currency: 'USD',
          amount: '100'
        },
        payeeReceiveAmount: {
          currency: 'USD',
          amount: '99'
        },
        payeeFspFee: {
          currency: 'USD',
          amount: '1'
        },
        payeeFspCommission: {
          currency: 'USD',
          amount: '0'
        },
        expiration: '2020-05-17T15:28:54.250Z',
        geoCode: {
          latitude: '+45.4215',
          longitude: '+75.6972'
        },
        ilpPacket: 'AYIBgQAAAAAAAASwNGxldmVsb25lLmRmc3AxLm1lci45T2RTOF81MDdqUUZERmZlakgy...',
        condition: 'f5sqb7tBTWPd5Y8BDFdMm9BJR_MNI4isf8p8n4D5pHA',
        extensionList: {
          extension: [
            {
              key: 'errorDescription1',
              value: 'This is a more detailed error description'
            }
          ]
        }
      }
    }
    beforeEach(async () => {
      mojaloopRequests = {
        putAuthorizations: jest.fn(() => Promise.resolve()),
        putAuthorizationsError: jest.fn(() => Promise.resolve())
      } as unknown as MojaloopRequests

      backendRequests = {
        signAuthorizationRequest: jest.fn(() => Promise.resolve(authenticationValue))
      } as unknown as BackendRequests

      config = {
        logger,
        backendRequests,
        mojaloopRequests
      }

      model = new InboundAuthorizationsModel(config)
    })

    test('happy flow', async () => {
      await model.postAuthorizations(
        authorizationRequest,
        dfspId
      )

      const authorizationPutPayload: fspiopAPI.Schemas.AuthorizationsIDPutResponse = {
        authenticationInfo: {
          authentication: 'U2F',
          authenticationValue: authenticationValue as fspiopAPI.Schemas.AuthenticationValue
        },
        responseType: 'ENTERED'
      }
      expect(config.backendRequests.signAuthorizationRequest).toHaveBeenCalledWith(authorizationRequest)

      expect(config.mojaloopRequests.putAuthorizations).toHaveBeenCalledWith(
        authorizationRequest.transactionRequestId,
        authorizationPutPayload,
        dfspId
      )
    })

    test('reformating of thrown exception when res.body present', async () => {
      mocked(config.mojaloopRequests.putAuthorizations).mockImplementationOnce(
        () => {
          throw new HTTPResponseError({
            msg: 'mocked-error',
            res: {
              body: JSON.stringify({ statusCode: '2003' })
            }
          })
        }
      )

      await model.postAuthorizations(
        authorizationRequest,
        dfspId
      )

      expect(config.backendRequests.signAuthorizationRequest).toHaveBeenCalledWith(authorizationRequest)
      expect(config.mojaloopRequests.putAuthorizationsError).toHaveBeenCalledWith(
        authorizationRequest.transactionRequestId,
        {
          errorInformation: {
            errorCode: '2003',
            errorDescription: 'Service currently unavailable'
          }
        },
        dfspId
      )
    })

    test('reformating of thrown exception when res.data present and using different statusCode', async () => {
      mocked(config.mojaloopRequests.putAuthorizations).mockImplementationOnce(
        () => {
          throw new HTTPResponseError({
            msg: 'mocked-error',
            res: {
              data: { statusCode: '2002' }
            }
          })
        }
      )

      await model.postAuthorizations(
        authorizationRequest,
        dfspId
      )

      expect(config.backendRequests.signAuthorizationRequest).toHaveBeenCalledWith(authorizationRequest)
      expect(config.mojaloopRequests.putAuthorizationsError).toHaveBeenCalledWith(
        authorizationRequest.transactionRequestId,
        {
          errorInformation: {
            errorCode: '2002',
            errorDescription: 'Not implemented'
          }
        },
        dfspId
      )
    })

    test('reformating of thrown generic Error', async () => {
      mocked(config.mojaloopRequests.putAuthorizations).mockImplementationOnce(
        () => {
          throw new Error('generic-error')
        }
      )

      await model.postAuthorizations(
        authorizationRequest,
        dfspId
      )

      expect(config.backendRequests.signAuthorizationRequest).toHaveBeenCalledWith(authorizationRequest)
      expect(config.mojaloopRequests.putAuthorizationsError).toHaveBeenCalledWith(
        authorizationRequest.transactionRequestId,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        dfspId
      )
    })

    test('reformating of thrown exception when res.body is not valid JSON string', async () => {
      mocked(config.mojaloopRequests.putAuthorizations).mockImplementationOnce(
        () => {
          throw new HTTPResponseError({
            msg: 'mocked-error',
            res: {
              body: { statusCode: '2002' }
            }
          })
        }
      )

      await model.postAuthorizations(
        authorizationRequest,
        dfspId
      )

      expect(config.backendRequests.signAuthorizationRequest).toHaveBeenCalledWith(authorizationRequest)
      expect(config.mojaloopRequests.putAuthorizationsError).toHaveBeenCalledWith(
        authorizationRequest.transactionRequestId,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        dfspId
      )
    })
    test('reformating of thrown exception when no-authentication-value returned', async () => {
      mocked(config.backendRequests.signAuthorizationRequest).mockImplementationOnce(() => Promise.resolve())

      await model.postAuthorizations(
        authorizationRequest,
        dfspId
      )

      expect(config.backendRequests.signAuthorizationRequest).toHaveBeenCalledWith(authorizationRequest)
      expect(config.mojaloopRequests.putAuthorizationsError).toHaveBeenCalledWith(
        authorizationRequest.transactionRequestId,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        dfspId
      )
    })
  })
})
