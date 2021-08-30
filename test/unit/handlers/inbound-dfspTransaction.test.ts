import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { KVS } from '~/shared/kvs'
import { v4 as uuidv4 } from 'uuid'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { StateResponseToolkit } from '~/server/plugins/state'
import ThirdpartyRequestsTransactions from '~/handlers/inbound/thirdpartyRequests/transactions'
import ThirdpartyRequestsAuthorizations from '~/handlers/inbound/thirdpartyRequests/authorizations'
import { Request } from '@hapi/hapi'
import { Context } from 'openapi-backend'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import mockLogger from '../mockLogger'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { PubSub } from '~/shared/pub-sub'
import { DFSPTransactionModel } from '~/models/dfspTransaction.model'
import { mockDeferredJobWithCallbackMessage } from '../mockDeferredJob'


const requestAuthorizationResponse = {
  signedPayloadType: 'FIDO',
  signedPayload: {
    id: '45c-TkfkjQovQeAWmOy-RLBHEJ_e4jYzQYgD8VdbkePgM5d98BaAadadNYrknxgH0jQEON8zBydLgh1EqoC9DA',
    rawId: '45c+TkfkjQovQeAWmOy+RLBHEJ/e4jYzQYgD8VdbkePgM5d98BaAadadNYrknxgH0jQEON8zBydLgh1EqoC9DA==',
    response: {
      authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4/krrmihjLHmVzzuoMdl2MBAAAACA==',
      clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiQUFBQUFBQUFBQUFBQUFBQUFBRUNBdyIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDIxODEiLCJjcm9zc09yaWdpbiI6ZmFsc2UsIm90aGVyX2tleXNfY2FuX2JlX2FkZGVkX2hlcmUiOiJkbyBub3QgY29tcGFyZSBjbGllbnREYXRhSlNPTiBhZ2FpbnN0IGEgdGVtcGxhdGUuIFNlZSBodHRwczovL2dvby5nbC95YWJQZXgifQ==',
      signature: 'MEUCIDcJRBu5aOLJVc/sPyECmYi23w8xF35n3RNhyUNVwQ2nAiEA+Lnd8dBn06OKkEgAq00BVbmH87ybQHfXlf1Y4RJqwQ8='
    },
    type: 'public-key'
  }
}

// Mock deferredJob to inject our async callbacks
jest.mock('~/shared/deferred-job')

describe('Inbound DFSP Transaction handler', () => {
  let requestQuoteResponse: SDKOutboundAPI.Schemas.quotesPostResponse
  let requestTransferResponse: SDKOutboundAPI.Schemas.simpleTransfersPostResponse
  let kvsMock: KVS
  let pubSubMock: PubSub
  let transactionRequestId: string
  let transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest
  let toolkit: StateResponseToolkit
  let thirdpartyRequestsMock: ThirdpartyRequests
  let dfspBackendRequestsMock: DFSPBackendRequests
  let sdkOutgoingRequestsMock: SDKOutgoingRequests
  const publishMock = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    transactionRequestId = uuidv4()
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

    pubSubMock = {
      publish: jest.fn(),
      subscribe: jest.fn()
    } as unknown as PubSub

    thirdpartyRequestsMock = {
      putThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
      patchThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
      putThirdpartyRequestsTransactionsError: jest.fn(() => Promise.resolve({ statusCode: 200 })),
      // TODO: change to postThirdpartyRequestsAuthorizations once we've updated sdk-standard-components
      _post: jest.fn(() => Promise.resolve({ statusCode: 202 }))

    } as unknown as ThirdpartyRequests

    dfspBackendRequestsMock = {
      validateThirdpartyTransactionRequestAndGetContext: jest.fn(() => Promise.resolve({ isValid: true })),
    } as unknown as DFSPBackendRequests
    sdkOutgoingRequestsMock = {
      requestQuote: jest.fn(() => Promise.resolve(requestQuoteResponse)),
      requestTransfer: jest.fn(() => Promise.resolve(requestTransferResponse))
    } as unknown as SDKOutgoingRequests
    toolkit = {
      getPublisher: jest.fn(() => ({publish: publishMock})),
      getDFSPId: jest.fn(() => 'pisp'),
      getLogger: jest.fn(() => mockLogger()),
      getKVS: jest.fn(() => kvsMock),
      getSubscriber: jest.fn(() => pubSubMock),
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

    // Initial call
    mockDeferredJobWithCallbackMessage('testAuthChannel', requestAuthorizationResponse)
    const result = await ThirdpartyRequestsTransactions.post(
      {} as unknown as Context,
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    expect(result.statusCode).toBe(202)

    // PISP sends PUT /thirdpartyRequests/authorizations/{ID}
    // maybe we can just asserts that pubsub got called here

    // give 100ms for post background job to be done
    setTimeout(async () => {
      // it is the happy flow so no error callback should be called
      expect(thirdpartyRequestsMock.putThirdpartyRequestsTransactionsError).not.toBeCalled()

      // all these endpoints are used by the flow
      // @ts-ignore - will be fixed by updating sdk-standard-components and changing to proper method
      expect(thirdpartyRequestsMock._post).toBeCalledTimes(1)
      expect(thirdpartyRequestsMock.putThirdpartyRequestsTransactions).toBeCalledTimes(1)
      expect(thirdpartyRequestsMock.patchThirdpartyRequestsTransactions).toBeCalledTimes(1)
      expect(dfspBackendRequestsMock.validateThirdpartyTransactionRequestAndGetContext).toBeCalledTimes(1)
      expect(sdkOutgoingRequestsMock.requestQuote).toBeCalledTimes(1)
      expect(sdkOutgoingRequestsMock.requestTransfer).toBeCalledTimes(1)

      // we are done!
      done()
    }, 100)
  })

  it('PUT /thirdpartyRequests/authorizations/{ID}', async () =>{
    // Arrange
    jest.spyOn(DFSPTransactionModel, 'notificationChannel')
      .mockReturnValueOnce('channel1234')
    const authorizationRequestId = uuidv4()
    const request = {
      method: 'PUT',
      url: `/thirdpartyRequests/authorizations/${authorizationRequestId}`,
      headers: {
        'Content-Type': 'application/json',
        'fspiop-source': 'sourceDfspId'
      },
      params: {
        ID: authorizationRequestId
      },
      payload: requestAuthorizationResponse
    }
    const expectedNotificationChannel: unknown[] = [
      'waitOnAuthResponseFromPISPChannel',
      authorizationRequestId
    ]
    const expectedPublishMock: unknown[] = [
      'channel1234',
      requestAuthorizationResponse
    ]

    
    // Act
    const result = await ThirdpartyRequestsAuthorizations.put(
      {} as unknown as Context,
      request as unknown as Request,
      toolkit as unknown as StateResponseToolkit
    )
    
    // Assert
    expect(result.statusCode).toBe(200)
    expect(DFSPTransactionModel.notificationChannel).toHaveBeenCalledWith(...expectedNotificationChannel)
    expect(publishMock).toHaveBeenCalledWith(...expectedPublishMock)
  })

  // TODO: next PR
  it.todo('PUT /thirdpartyRequests/verifications/{ID}')
})
