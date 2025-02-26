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

- Sridhar Voruganti - sridhar.voruganti@modusbox.com
--------------
******/
import { jest } from '@jest/globals'
import { InboundAccountsModel, InboundAccountsModelConfig } from '~/models/inbound/accounts.model'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import * as mockData from 'test/unit/data/mockData'

import mockLogger from '../../mockLogger'
import { HTTPResponseError } from '../../../../src/shared/http-response-error'

const { mocked } = jest

describe('InboundAccountsModel', () => {
  const logger = mockLogger()

  describe('accounts', () => {
    let model: InboundAccountsModel
    let config: InboundAccountsModelConfig
    let dfspBackendRequests: DFSPBackendRequests
    let thirdpartyRequests: ThirdpartyRequests
    const dfspId = 'dfsp-id'
    const userId = mockData.accountsRequest.params.ID
    const putRequest = mockData.accountsRequest.payload

    beforeEach(async () => {
      thirdpartyRequests = {
        putAccounts: jest.fn(() => Promise.resolve()),
        putAccountsError: jest.fn(() => Promise.resolve())
      } as unknown as ThirdpartyRequests

      dfspBackendRequests = {
        getUserAccounts: jest.fn(() => Promise.resolve(putRequest))
      } as unknown as DFSPBackendRequests

      config = {
        logger,
        dfspBackendRequests,
        thirdpartyRequests
      }

      model = new InboundAccountsModel(config)
    })

    test('happy flow', async () => {
      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccounts).toHaveBeenCalledWith(userId, putRequest, dfspId)
    })

    test('reformating of thrown exception when res.body present', async () => {
      mocked(config.thirdpartyRequests.putAccounts).mockImplementationOnce(() => {
        throw new HTTPResponseError({
          msg: 'mocked-error',
          res: {
            body: JSON.stringify({ statusCode: '2003' })
          }
        })
      })

      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccountsError).toHaveBeenCalledWith(
        userId,
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
      mocked(config.thirdpartyRequests.putAccounts).mockImplementationOnce(() => {
        throw new HTTPResponseError({
          msg: 'mocked-error',
          res: {
            data: { statusCode: '2002' }
          }
        })
      })

      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccountsError).toHaveBeenCalledWith(
        userId,
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
      mocked(config.thirdpartyRequests.putAccounts).mockImplementationOnce(() => {
        throw new Error('generic-error')
      })

      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccountsError).toHaveBeenCalledWith(
        userId,
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
      mocked(config.thirdpartyRequests.putAccounts).mockImplementationOnce(() => {
        throw new HTTPResponseError({
          msg: 'mocked-error',
          res: {
            body: '['
          }
        })
      })

      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccountsError).toHaveBeenCalledWith(
        userId,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        dfspId
      )
    })

    test('reformating of thrown exception incase of empty response', async () => {
      mocked(config.dfspBackendRequests.getUserAccounts).mockImplementationOnce(() => Promise.resolve())
      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccountsError).toHaveBeenCalledWith(
        userId,
        {
          errorInformation: {
            errorCode: '2001',
            errorDescription: 'Internal server error'
          }
        },
        dfspId
      )
    })

    test('reformating of thrown exception when no user accounts returned', async () => {
      mocked(config.dfspBackendRequests.getUserAccounts).mockImplementationOnce(() => {
        throw new HTTPResponseError({
          msg: 'mocked-error',
          res: {
            body: JSON.stringify({ statusCode: '3200' })
          }
        })
      })
      await model.getUserAccounts(userId, dfspId)

      expect(config.dfspBackendRequests.getUserAccounts).toHaveBeenCalledWith(userId)
      expect(config.thirdpartyRequests.putAccountsError).toHaveBeenCalledWith(
        userId,
        {
          errorInformation: {
            errorCode: '3200',
            errorDescription: 'Generic ID not found'
          }
        },
        dfspId
      )
    })
  })
})
