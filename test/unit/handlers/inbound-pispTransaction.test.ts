import { logger } from '~/shared/logger'
import { StateResponseToolkit } from '~/server/plugins/state'
import {
  PISPTransactionModel
} from '~/models/pispTransaction.model'
import { PISPTransactionPhase, ThirdpartyTransactionStatus } from '~/models/pispTransaction.interface'
import NotifyThirdpartyTransactionRequests from '~/handlers/inbound/thirdpartyRequests/transactions/{ID}'
import ThirdpartyTransactionRequestsError from '~/handlers/inbound/thirdpartyRequests/transactions/{ID}/error'
import { Request } from '@hapi/hapi'

describe('Inbound PISP transaction handlers', (): void => {
  const pubSubMock = {
    publish: jest.fn()
  }
  const toolkit = {
    getLogger: jest.fn(() => logger),
    getPubSub: jest.fn(() => pubSubMock),
    getBackendRequests: jest.fn(),
    getMojaloopRequests: jest.fn(),
    response: jest.fn(() => ({
      code: jest.fn((code: number) => ({
        statusCode: code
      }))
    }))
  }

  const approveResponse: ThirdpartyTransactionStatus = {
    transactionId: 'x42ec534-ae48-6575-g6a9-tad2955b8065',
    transactionRequestState: 'ACCEPTED',
    transactionState: 'COMPLETED'
  }
  const errorResponse = {
    errorInformation: {
      errorCode: 5100,
      errorDescription: 'This is an error description.',
      extensionList: {
        extension: [
          {
            key: 'sample error key',
            value: 'sample error value'
          }
        ]
      }
    }
  }

  it('PATCH /thirdpartyRequests/transactions/{ID}', async (): Promise<void> => {
    const request = {
      method: 'PATCH',
      url: '/thirdpartyRequests/transactions/{ID}',
      headers: {
        'Content-Type': 'application/json',
        'fspiop-source': 'sourceDfspId'
      },
      params: {
        ID: 'x42ec534-ae48-6575-g6a9-tad2955b8065'
      },
      payload: approveResponse
    }
    const result = await NotifyThirdpartyTransactionRequests.patch(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(200)

    const channel = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.approval,
      request.params.ID)

    expect(pubSubMock.publish).toBeCalledWith(channel, approveResponse)
  })
  it('PUT /thirdpartyRequests/transactions/{ID}/error', async (): Promise<void> => {
    const request = {
      method: 'PUT',
      url: '/thirdpartyRequests/transactions/{ID}/error',
      headers: {
        'Content-Type': 'application/json',
        'fspiop-source': 'sourceDfspId'
      },
      params: {
        ID: 'x42ec534-ae48-6575-g6a9-tad2955b8065'
      },
      payload: errorResponse
    }
    const result = await ThirdpartyTransactionRequestsError.put(
      {},
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(200)

    const channel = PISPTransactionModel.notificationChannel(
      PISPTransactionPhase.approval,
      request.params.ID)

    expect(pubSubMock.publish).toBeCalledWith(channel, errorResponse)
  })
})
