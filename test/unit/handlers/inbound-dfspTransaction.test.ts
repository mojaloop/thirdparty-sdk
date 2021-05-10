// import { logger } from '~/shared/logger'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { KVS } from '~/shared/kvs'
import { uuid } from 'uuidv4'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { StateResponseToolkit } from '~/server/plugins/state'
import ThirdpartyRequestsTransactions from '~/handlers/inbound/thirdpartyRequests/transactions'
import { Request } from '@hapi/hapi'
import { Context } from 'openapi-backend'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import mockLogger from '../mockLogger'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'

describe('Inbound DFSP Transaction handler', () => {
  let requestQuoteResponse: SDKOutboundAPI.Schemas.quotesPostResponse
  let requestAuthorizationResponse: SDKOutboundAPI.Schemas.authorizationsPostResponse
  let requestTransferResponse: SDKOutboundAPI.Schemas.simpleTransfersPostResponse
  let kvsMock: KVS
  let transactionRequestId: string
  let transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest
  let toolkit: StateResponseToolkit
  let thirdpartyRequestsMock: ThirdpartyRequests
  let dfspBackendRequestsMock: DFSPBackendRequests
  let sdkOutgoingRequestsMock: SDKOutgoingRequests
  beforeEach(() => {
    transactionRequestId = uuid()
    transactionRequestRequest = {
      transactionRequestId,
      payee: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '+44 1234 5678',
          fspId: 'dfspb'
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
    requestQuoteResponse = {
      quotes: {
        transferAmount: { ...transactionRequestRequest.amount },
        ilpPacket: 'abcd...',
        condition: 'xyz....',
        expiration: (new Date()).toISOString()
      },
      currentState: 'COMPLETED'
    }

    requestAuthorizationResponse = {
      authorizations: {
        authenticationInfo: {
          authentication: 'U2F',
          authenticationValue: {
            pinValue: 'some-pin-value',
            counter: '1'
          } as string & Partial<{pinValue: string, counter: string}>
        },
        responseType: 'ENTERED'
      },
      currentState: 'COMPLETED'
    }

    requestTransferResponse = {
      transfer: {
        fulfilment: 'some-fulfilment',
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED'
      },
      currentState: 'COMPLETED'
    }
    kvsMock = {
      get: jest.fn(),
      set: jest.fn()
    } as unknown as KVS

    thirdpartyRequestsMock = {
      putThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
      patchThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
      putThirdpartyRequestsTransactionsError: jest.fn(() => Promise.resolve({ statusCode: 200 }))
    } as unknown as ThirdpartyRequests

    dfspBackendRequestsMock = {
      validateThirdpartyTransactionRequest: jest.fn(() => Promise.resolve({ isValid: true })),
      verifyAuthorization: jest.fn(() => Promise.resolve({ isValid: true }))
    } as unknown as DFSPBackendRequests
    sdkOutgoingRequestsMock = {
      requestQuote: jest.fn(() => Promise.resolve(requestQuoteResponse)),
      requestAuthorization: jest.fn(() => Promise.resolve(requestAuthorizationResponse)),
      requestTransfer: jest.fn(() => Promise.resolve(requestTransferResponse))
    } as unknown as SDKOutgoingRequests
    toolkit = {
      getDFSPId: jest.fn(() => 'pisp'),
      getLogger: jest.fn(() => mockLogger()),
      getKVS: jest.fn(() => kvsMock),
      getThirdpartyRequests: jest.fn(() => thirdpartyRequestsMock),
      getDFSPBackendRequests: jest.fn(() => dfspBackendRequestsMock),
      getSDKOutgoingRequests: jest.fn(() => sdkOutgoingRequestsMock),
      response: jest.fn(() => ({
        code: jest.fn((code: number) => ({
          statusCode: code
        }))
      }))
    } as unknown as StateResponseToolkit
  })

  it('POST /thirdPartyRequests/transactions', async (done) => {
    const request = {
      method: 'POST',
      url: '/thirdpartyRequests/transactions',
      headers: {
        'Content-Type': 'application/json',
        'fspiop-source': 'sourceDfspId'
      },
      payload: transactionRequestRequest
    }
    const result = await ThirdpartyRequestsTransactions.post(
      {} as unknown as Context,
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(202)

    // give 100ms for post background job to be done
    setTimeout(async () => {
      // it is the happy flow so no error callback should be called
      expect(thirdpartyRequestsMock.putThirdpartyRequestsTransactionsError).not.toBeCalled()

      // all these endpoints are used by the flow
      expect(thirdpartyRequestsMock.putThirdpartyRequestsTransactions).toBeCalledTimes(1)
      expect(thirdpartyRequestsMock.patchThirdpartyRequestsTransactions).toBeCalledTimes(1)
      expect(dfspBackendRequestsMock.validateThirdpartyTransactionRequest).toBeCalledTimes(1)
      expect(dfspBackendRequestsMock.verifyAuthorization).toBeCalledTimes(1)
      expect(sdkOutgoingRequestsMock.requestQuote).toBeCalledTimes(1)
      expect(sdkOutgoingRequestsMock.requestAuthorization).toBeCalledTimes(1)
      expect(sdkOutgoingRequestsMock.requestTransfer).toBeCalledTimes(1)

      // we are done!
      done()
    }, 100)
  })
})
