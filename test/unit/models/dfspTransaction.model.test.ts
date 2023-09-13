/* eslint-disable @typescript-eslint/no-non-null-assertion */
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

 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
******/

import { mocked } from "jest-mock";
import { v4 as uuidv4 } from 'uuid'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import { DFSPTransactionData, DFSPTransactionModelConfig } from '~/models/dfspTransaction.interface'
import { DFSPTransactionModel, create, loadFromKVS } from '~/models/dfspTransaction.model'

import mockLogger from 'test/unit/mockLogger'
import sortedArray from 'test/unit/sortedArray'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import { ThirdpartyRequests, Errors } from '@mojaloop/sdk-standard-components'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'
import { reformatError } from '~/shared/api-error'
import { PubSub } from '~/shared/pub-sub'
import { mockDeferredJobWithCallbackMessage } from '../mockDeferredJob'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

// Mock deferredJob to inject our async callbacks
jest.mock('~/shared/deferred-job')

describe('DFSPTransactionModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }

  let modelConfig: DFSPTransactionModelConfig
  let transactionRequestId: string
  let participantId: string
  let transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest
  let transactionRequestPutUpdate: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse
  let requestQuoteRequest: SDKOutboundAPI.Schemas.quotesPostRequest
  let requestQuoteResponse: SDKOutboundAPI.Schemas.quotesPostResponse
  let requestAuthorizationResponse: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponse
  let requestVerificationResponse: tpAPI.Schemas.ThirdpartyRequestsVerificationsIDPutResponse
  let requestTransferResponse: SDKOutboundAPI.Schemas.simpleTransfersPostResponse
  let transferRequest: SDKOutboundAPI.Schemas.simpleTransfersPostRequest
  let transferId: string

  beforeEach(async () => {
    modelConfig = {
      dfspId: 'dfsp_a',
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      subscriber: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        putThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
        patchThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
        putThirdpartyRequestsTransactionsError: jest.fn(() => Promise.resolve({ statusCode: 200 })),
        postThirdpartyRequestsAuthorizations: jest.fn(() => Promise.resolve({ statusCode: 200 })),
        postThirdpartyRequestsVerifications: jest.fn(() => Promise.resolve({ statusCode: 200 }))
      } as unknown as ThirdpartyRequests,
      sdkOutgoingRequests: {
        requestQuote: jest.fn(() => Promise.resolve(requestQuoteResponse)),
        requestAuthorization: jest.fn(() => Promise.resolve(requestAuthorizationResponse)),
        requestTransfer: jest.fn(() => Promise.resolve(requestTransferResponse))
      } as unknown as SDKOutgoingRequests,
      dfspBackendRequests: {
        validateThirdpartyTransactionRequestAndGetContext: jest.fn(() =>
          Promise.resolve({
            isValid: true,
            consentId: '123456789',
            payerPartyIdInfo: {
              partyIdType: 'MSISDN',
              partyIdentifier: '61414414414'
            }
          })
        ),
        verifyAuthorization: jest.fn(() => Promise.resolve({ isValid: true }))
      } as unknown as DFSPBackendRequests,
      transactionRequestAuthorizationTimeoutSeconds: 100,
      transactionRequestVerificationTimeoutSeconds: 15,
      authServiceParticipantId: 'centralAuth'
    }
    transactionRequestId = uuidv4()
    participantId = uuidv4()
    transferId = uuidv4()
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
      expiration: new Date().toISOString()
    }
    transactionRequestPutUpdate = {
      transactionId: uuidv4(),
      transactionRequestState: 'RECEIVED'
    }
    requestQuoteRequest = {
      fspId: transactionRequestRequest.payee.partyIdInfo.fspId!,
      quotesPostRequest: {
        quoteId: uuidv4(),
        transactionId: transactionRequestPutUpdate.transactionId!,
        transactionRequestId,
        payee: { ...transactionRequestRequest.payee },
        payer: { partyIdInfo: { ...transactionRequestRequest.payer } },
        amountType: transactionRequestRequest.amountType,
        amount: { ...transactionRequestRequest.amount },
        transactionType: { ...transactionRequestRequest.transactionType }
      }
    }

    requestQuoteResponse = {
      quotes: {
        body: {
          transferAmount: { ...transactionRequestRequest.amount },
          ilpPacket: 'abcd...',
          condition: 'xyz....',
          expiration: new Date().toISOString(),
          payeeReceiveAmount: { ...transactionRequestRequest.amount }
        },
        headers: {}
      },
      currentState: 'COMPLETED'
    }

    requestVerificationResponse = {
      authenticationResponse: 'VERIFIED'
    }

    requestAuthorizationResponse = {
      responseType: 'ACCEPTED',
      signedPayload: {
        signedPayloadType: 'FIDO',
        fidoSignedPayload: {
          id: '45c-TkfkjQovQeAWmOy-RLBHEJ_e4jYzQYgD8VdbkePgM5d98BaAadadNYrknxgH0jQEON8zBydLgh1EqoC9DA',
          rawId: '45c+TkfkjQovQeAWmOy+RLBHEJ/e4jYzQYgD8VdbkePgM5d98BaAadadNYrknxgH0jQEON8zBydLgh1EqoC9DA==',
          response: {
            authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4/krrmihjLHmVzzuoMdl2MBAAAACA==',
            clientDataJSON:
              'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiQUFBQUFBQUFBQUFBQUFBQUFBRUNBdyIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDIxODEiLCJjcm9zc09yaWdpbiI6ZmFsc2UsIm90aGVyX2tleXNfY2FuX2JlX2FkZGVkX2hlcmUiOiJkbyBub3QgY29tcGFyZSBjbGllbnREYXRhSlNPTiBhZ2FpbnN0IGEgdGVtcGxhdGUuIFNlZSBodHRwczovL2dvby5nbC95YWJQZXgifQ==',
            signature:
              'MEUCIDcJRBu5aOLJVc/sPyECmYi23w8xF35n3RNhyUNVwQ2nAiEA+Lnd8dBn06OKkEgAq00BVbmH87ybQHfXlf1Y4RJqwQ8='
          },
          type: 'public-key'
        }
      }
    } as tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseFIDO

    transferRequest = {
      fspId: transactionRequestRequest.payer.fspId!,
      transfersPostRequest: {
        transferId,
        payeeFsp: transactionRequestRequest.payee.partyIdInfo.fspId!,
        payerFsp: transactionRequestRequest.payer.fspId!,
        amount: { ...requestQuoteResponse.quotes.body.transferAmount },
        ilpPacket: 'abcd...',
        condition: 'xyz....',
        expiration: new Date().toISOString()
      }
    }

    requestTransferResponse = {
      transfer: {
        body: {
          fulfilment: 'some-fulfilment',
          completedTimestamp: new Date().toISOString(),
          transferState: 'COMMITTED'
        },
        headers: {}
      },
      currentState: 'COMPLETED'
    }
    await modelConfig.kvs.connect()
  })

  afterEach(async () => {
    await modelConfig.kvs.disconnect()
  })

  function checkDTMLayout(dtm: DFSPTransactionModel, optData?: DFSPTransactionData) {
    expect(dtm).toBeDefined()
    expect(dtm.data).toBeDefined()
    expect(dtm.fsm.state).toEqual(optData!.currentState || 'start')

    // check new getters
    expect(dtm.sdkOutgoingRequests).toEqual(modelConfig.sdkOutgoingRequests)

    // check fsm transitions
    expect(typeof dtm.fsm.init).toEqual('function')
    expect(typeof dtm.fsm.validateTransactionRequest).toEqual('function')
    expect(typeof dtm.fsm.notifyTransactionRequestIsValid).toEqual('function')
    expect(typeof dtm.fsm.requestQuote).toEqual('function')
    expect(typeof dtm.fsm.requestAuthorization).toEqual('function')
    expect(typeof dtm.fsm.verifyAuthorization).toEqual('function')
    expect(typeof dtm.fsm.requestTransfer).toEqual('function')
    expect(typeof dtm.fsm.notifyTransferIsDone).toEqual('function')

    // check fsm notification handlers
    expect(typeof dtm.onValidateTransactionRequest).toEqual('function')
    expect(typeof dtm.onNotifyTransactionRequestIsValid).toEqual('function')
    expect(typeof dtm.onRequestQuote).toEqual('function')
    expect(typeof dtm.onRequestAuthorization).toEqual('function')
    expect(typeof dtm.onVerifyAuthorization).toEqual('function')
    expect(typeof dtm.onRequestTransfer).toEqual('function')
    expect(typeof dtm.onNotifyTransferIsDone).toEqual('function')

    expect(sortedArray(dtm.fsm.allStates())).toEqual([
      'authorizationReceived',
      'authorizationReceivedIsValid',
      'errored',
      'none',
      'notifiedTransactionRequestIsValid',
      'quoteReceived',
      'start',
      'transactionRequestIsDone',
      'transactionRequestIsValid',
      'transferIsDone'
    ])

    expect(sortedArray(dtm.fsm.allTransitions())).toEqual([
      'error',
      'init',
      'notifyTransactionRequestIsValid',
      'notifyTransferIsDone',
      'requestAuthorization',
      'requestQuote',
      'requestTransfer',
      'validateTransactionRequest',
      'verifyAuthorization'
    ])
  }

  it('module layout', () => {
    expect(typeof DFSPTransactionModel).toEqual('function')
    expect(typeof create).toEqual('function')
    expect(typeof loadFromKVS).toEqual('function')
  })

  describe('workflow', () => {
    it('should do a happy flow', async () => {
      mocked(modelConfig.kvs.set).mockImplementation(() => Promise.resolve(true))

      // mock async callback(s)
      mockDeferredJobWithCallbackMessage('testAuthChannel', requestAuthorizationResponse)
      mockDeferredJobWithCallbackMessage('testVerifyChannel', requestVerificationResponse)

      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        currentState: 'start'
      }
      const model = await create(data, modelConfig)
      checkDTMLayout(model, data)

      // ensure state data is correct before starting workflow
      expect(model.data).toEqual(data)

      // execute workflow
      await model.run()

      // the end state for workflow: transactionRequestIsDone
      expect(model.data.currentState).toEqual('transactionRequestIsDone')

      // there are seven steps in workflow
      expect(mocked(modelConfig.kvs.set)).toBeCalledTimes(7)

      expect(model.data.transactionId).toBeDefined()
      expect(model.data.transactionRequestState).toEqual('ACCEPTED')

      // onValidateTransactionRequest
      expect(model.data.transactionRequestPutUpdate).toEqual({
        transactionId: model.data.transactionId,
        transactionRequestState: 'RECEIVED'
      })
      expect(modelConfig.dfspBackendRequests.validateThirdpartyTransactionRequestAndGetContext).toBeCalledWith(
        transactionRequestRequest
      )

      // onNotifyTransactionRequestIsValid
      expect(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactions).toBeCalledWith(
        model.data.transactionRequestPutUpdate,
        model.data.transactionRequestId,
        model.data.participantId
      )

      // check properly requestQuoteRequest
      expect(model.data.requestQuoteRequest).toBeDefined()
      expect(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactions).toBeCalledWith(
        model.data.transactionRequestPutUpdate,
        model.data.transactionRequestId,
        model.data.participantId
      )
      // check properly requestQuoteRequest
      expect(model.data.requestQuoteRequest).toBeDefined()

      // shortcuts
      const rq = model.data.requestQuoteRequest!
      const tr = model.data.transactionRequestRequest

      // payee's DFSP should be asked for quote
      expect(rq.fspId).toEqual(tr.payee.partyIdInfo.fspId)

      // quote id should be allocated
      expect(rq.quotesPostRequest.quoteId).toBeDefined()

      // shortcut
      const rqr = rq.quotesPostRequest

      // transactionId should be the same as sent to PISP
      expect(rqr.transactionId).toEqual(model.data.transactionRequestPutUpdate!.transactionId)

      // transactionRequestId should be the same as received
      expect(rqr.transactionRequestId).toEqual(tr.transactionRequestId)

      // payee should be the same as received
      expect(rqr.payee).toEqual(tr.payee)

      // payer should be build from transaction request context
      expect(rqr.payer).toEqual({
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '61414414414'
        }
      })

      // amountType should be the same as received
      expect(rqr.amountType).toEqual(tr.amountType)

      // amount should be the same as received
      expect(rqr.amount).toEqual(tr.amount)

      // transactionType should be the same as received
      expect(rqr.transactionType).toEqual(tr.transactionType)

      // payee's DFSP should be asked for quote
      expect(rq.fspId).toEqual(tr.payee.partyIdInfo.fspId)

      // quote id should be allocated
      expect(rq.quotesPostRequest.quoteId).toBeDefined()

      // transactionId should be the same as sent to PISP
      expect(rqr.transactionId).toEqual(model.data.transactionRequestPutUpdate!.transactionId)

      // transactionRequestId should be the same as received
      expect(rqr.transactionRequestId).toEqual(tr.transactionRequestId)

      // payee should be the same as received
      expect(rqr.payee).toEqual(tr.payee)

      // amountType should be the same as received
      expect(rqr.amountType).toEqual(tr.amountType)

      // amount should be the same as received
      expect(rqr.amount).toEqual(tr.amount)

      // transactionType should be the same as received
      expect(rqr.transactionType).toEqual(tr.transactionType)

      // onRequestQuote
      expect(model.data.requestQuoteResponse).toBeDefined()
      expect(model.data.requestQuoteResponse!.quotes).toBeDefined()
      expect(model.data.requestQuoteResponse!.currentState).toEqual('COMPLETED')

      expect(model.sdkOutgoingRequests.requestQuote).toHaveBeenCalledWith(model.data.requestQuoteRequest)

      // onRequestAuthorization
      expect(model.data.requestAuthorizationPostRequest).toBeDefined()
      expect(modelConfig.thirdpartyRequests.postThirdpartyRequestsAuthorizations).toBeCalledWith(
        model.data.requestAuthorizationPostRequest,
        model.data.participantId
      )

      // validate requestAuthorization response
      expect(model.data.requestAuthorizationResponse).toBeDefined()

      // authorizationsResponse is send by mock
      expect(model.data.requestAuthorizationResponse).toEqual(requestAuthorizationResponse)

      // onVerifyAuthorization
      // check did we do proper call back to Switch
      expect(modelConfig.thirdpartyRequests.postThirdpartyRequestsVerifications).toBeCalledWith(
        model.data.requestVerificationPostRequest,
        'centralAuth'
      )

      // check the setup of transferRequest
      expect(model.data.transferRequest).toBeDefined()
      const rtr = model.data.transferRequest!
      const quote = model.data.requestQuoteResponse!.quotes.body
      expect(rtr.fspId).toEqual('dfsp_a')
      expect(rtr.transfersPostRequest).toEqual({
        transferId: model.data.transferId!,
        payeeFsp: tr.payee.partyIdInfo.fspId!,
        payerFsp: 'dfsp_a',
        amount: { ...quote.transferAmount },
        ilpPacket: quote.ilpPacket,
        condition: quote.condition,
        expiration: tr.expiration
      })

      // onRequestTransfer
      expect(model.sdkOutgoingRequests.requestTransfer).toBeCalledWith(model.data.transferRequest)

      expect(model.data.transferResponse).toBeDefined()
      expect(model.data.transferResponse).toEqual(requestTransferResponse)

      expect(model.data.transactionRequestPatchUpdate).toBeDefined()
      expect(model.data.transactionRequestPatchUpdate).toEqual({
        transactionRequestState: model.data.transactionRequestState,
        transactionState: 'COMPLETED'
      })

      // onNotifyTransferIsDone
      expect(model.thirdpartyRequests.patchThirdpartyRequestsTransactions).toHaveBeenCalledWith(
        model.data.transactionRequestPatchUpdate,
        model.data.transactionRequestId,
        model.data.participantId
      )
    })

    it('should throw if transactionRequestRequest is not valid', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.dfspBackendRequests.validateThirdpartyTransactionRequestAndGetContext).mockImplementationOnce(
        () =>
          Promise.resolve({
            isValid: false,
            consentId: '123456789',
            payerPartyIdInfo: {
              partyIdType: 'MSISDN',
              partyIdentifier: '61414414414'
            },
            payerPersonalInfo: {
              complexName: {
                firstName: 'Alice',
                lastName: 'K'
              }
            }
          })
      )

      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        currentState: 'start'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.validateTransactionRequest()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_NOT_VALID)
        done()
      }
    })

    it('should throw if PUT /thirdpartyRequests/transactions/{ID} failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactions)
        // eslint-disable-next-line prefer-promise-reject-errors
        .mockImplementationOnce(() => Promise.reject({ statusCode: 400 }))
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        currentState: 'transactionRequestIsValid',
        transactionRequestContext: {
          consentId: '123456789',
          payerPartyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '61414414414'
          },
          payerPersonalInfo: {
            complexName: {
              firstName: 'Alice',
              lastName: 'K'
            }
          }
        }
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.notifyTransactionRequestIsValid()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_UPDATE_FAILED)
        done()
      }
    })

    it('should throw if requestQuotes failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.sdkOutgoingRequests.requestQuote).mockImplementationOnce(() =>
        Promise.resolve({ currentState: 'ERROR_OCCURRED' } as SDKOutboundAPI.Schemas.quotesPostResponse)
      )
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        requestQuoteRequest,
        currentState: 'notifiedTransactionRequestIsValid'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.requestQuote()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_QUOTE_FAILED)
        done()
      }
    })

    it('should throw if requestAuthorization failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactionsError).mockImplementationOnce(() =>
        Promise.resolve(undefined)
      )
      mocked(modelConfig.thirdpartyRequests.postThirdpartyRequestsAuthorizations).mockImplementationOnce(() =>
        Promise.resolve(undefined)
      )

      // mock PUT /thirdpartyRequests/authorizations/{ID}/error callback
      mockDeferredJobWithCallbackMessage('testAuthChannel', {
        errorInformation: {
          errorCode: Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_AUTHORIZATION_FAILED,
          errorDescription: 'Failed to forward request to PISP'
        }
      })

      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        requestQuoteRequest,
        requestQuoteResponse,
        currentState: 'quoteReceived'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.requestAuthorization()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_AUTHORIZATION_UNEXPECTED)
        done()
      }
    })

    it('should throw if verifyAuthorization failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.thirdpartyRequests.postThirdpartyRequestsVerifications).mockImplementationOnce(() =>
        Promise.resolve(undefined)
      )

      // mock PUT /thirdpartyRequests/verifications/{ID}/error callback
      mockDeferredJobWithCallbackMessage('testAuthChannel', {
        errorInformation: {
          errorCode: Errors.MojaloopApiErrorCodes.TP_AUTH_SERVICE_ERROR,
          errorDescription: 'Invalid signed challenge'
        }
      })

      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        requestQuoteRequest,
        requestQuoteResponse,
        requestAuthorizationResponse,
        currentState: 'authorizationReceived'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.verifyAuthorization()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_AUTH_SERVICE_ERROR)
        done()
      }
    })

    // TODO: fix me - latest API needs to add back REJECTED option... :(
    it.skip('should throw if user REJECTED authorization/transfer', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.dfspBackendRequests.verifyAuthorization).mockImplementationOnce(() =>
        Promise.resolve({ isValid: false })
      )
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        requestQuoteRequest,
        requestQuoteResponse,
        requestAuthorizationResponse: {
          ...requestAuthorizationResponse
          // authorizations: {
          //   ...requestAuthorizationResponse.authorizations,
          //   responseType: 'REJECTED'
          // }
        },
        currentState: 'authorizationReceived'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.verifyAuthorization()
      } catch (err) {
        expect(model.data.transactionRequestState).toEqual('REJECTED')
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_AUTHORIZATION_REJECTED_BY_USER)
        done()
      }
    })

    it('should throw if transfer failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.sdkOutgoingRequests.requestTransfer).mockImplementationOnce(() =>
        Promise.resolve({ currentState: 'ERROR_OCCURRED' } as SDKOutboundAPI.Schemas.simpleTransfersPostResponse)
      )
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'ACCEPTED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        requestQuoteRequest,
        requestQuoteResponse,
        requestAuthorizationResponse: {
          ...requestAuthorizationResponse
          // TODO: remove me?
          // authorizations: {
          //   ...requestAuthorizationResponse.authorizations,
          //   responseType: 'RESEND'
          // }
        },
        transferRequest,
        currentState: 'authorizationReceivedIsValid'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.onRequestTransfer()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_TRANSFER_FAILED)
        done()
      }
    })

    it('should throw if notify transfer patch failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.thirdpartyRequests.patchThirdpartyRequestsTransactions).mockImplementationOnce(() =>
        Promise.reject(new Error('error from patch'))
      )
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'ACCEPTED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        requestQuoteRequest,
        requestQuoteResponse,
        requestAuthorizationResponse: {
          ...requestAuthorizationResponse
          // TODO: remove me?
          // authorizations: {
          //   ...requestAuthorizationResponse.authorizations,
          //   responseType: 'RESEND'
          // }
        },
        transferRequest,
        transactionRequestPatchUpdate: {
          transactionRequestState: 'ACCEPTED',
          transactionState: 'COMPLETED'
        },
        currentState: 'transferIsDone'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.onNotifyTransferIsDone()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_NOTIFICATION_FAILED)
        done()
      }
    })
    it('should handle errored state', async () => {
      mocked(modelConfig.kvs.set).mockImplementation(() => Promise.resolve(true))
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        currentState: 'errored'
      }
      const model = await create(data, modelConfig)
      checkDTMLayout(model, data)

      // execute workflow
      await model.run()

      // the state shouldn't be changed
      expect(model.data.currentState).toEqual('errored')

      // errored state should be saved
      expect(mocked(modelConfig.kvs.set)).toBeCalledTimes(1)

      // state data shouldn't be modified
      expect(model.data).toEqual(data)
    })
  })

  it('should propagate error to callback', async () => {
    mocked(modelConfig.kvs.set).mockImplementation(() => Promise.resolve(true))
    mocked(modelConfig.dfspBackendRequests.validateThirdpartyTransactionRequestAndGetContext).mockImplementationOnce(
      () =>
        Promise.resolve({
          isValid: false,
          consentId: '123456789',
          payerPartyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '61414414414'
          },
          payerPersonalInfo: {
            complexName: {
              firstName: 'Alice',
              lastName: 'K'
            }
          }
        })
    )

    const data: DFSPTransactionData = {
      transactionRequestId,
      transactionRequestState: 'RECEIVED',
      participantId,
      transactionRequestRequest,
      currentState: 'start'
    }
    const model = await create(data, modelConfig)
    checkDTMLayout(model, data)

    // execute workflow
    await model.run()

    // the state shouldn't be changed
    expect(model.data.currentState).toEqual('errored')

    // errored state should be saved
    expect(mocked(modelConfig.kvs.set)).toBeCalledTimes(1)

    // the error callback should be called
    expect(mocked(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactionsError)).toBeCalledWith(
      reformatError(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_NOT_VALID, model.logger),
      model.data.transactionRequestId,
      model.data.participantId
    )
  })

  describe('loadFromKVS', () => {
    it('should properly call `KVS.get`, get expected data in `context.data` and setup state of machine', async () => {
      const dataFromCache: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        currentState: 'start'
      }
      mocked(modelConfig.kvs.get).mockImplementationOnce(async () => dataFromCache)
      const model = await loadFromKVS(modelConfig)
      checkDTMLayout(model, dataFromCache)

      // to get value from cache proper key should be used
      expect(mocked(modelConfig.kvs.get)).toHaveBeenCalledWith(modelConfig.key)

      // check what has been stored in `data`
      expect(model.data).toEqual(dataFromCache)
    })

    it('should throw when received invalid data from `KVS.get`', async () => {
      mocked(modelConfig.kvs.get).mockImplementationOnce(async () => null)
      try {
        await loadFromKVS(modelConfig)
        shouldNotBeExecuted()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.message).toEqual(`No data found in KVS for: ${modelConfig.key}`)
      }
    })
  })

  describe('saveToKVS', () => {
    it('should store using KVS.set', async () => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        currentState: 'start'
      }
      const model = await create(data, modelConfig)
      checkDTMLayout(model, data)

      // transition `init` should encounter exception when saving `context.data`
      await model.saveToKVS()
      expect(mocked(modelConfig.kvs.set)).toBeCalledWith(model.key, model.data)
    })
    it('should propagate error from KVS.set', async () => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => {
        throw new Error('error from KVS.set')
      })
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        currentState: 'errored'
      }
      const model = await create(data, modelConfig)
      checkDTMLayout(model, data)

      // transition `init` should encounter exception when saving `context.data`
      expect(() => model.saveToKVS()).rejects.toEqual(new Error('error from KVS.set'))
      expect(mocked(modelConfig.kvs.set)).toBeCalledWith(model.key, model.data)
    })
  })
})
