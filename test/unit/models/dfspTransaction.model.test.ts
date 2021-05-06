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

import { mocked } from 'ts-jest/utils'
import { uuid } from 'uuidv4'
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
import { GenericRequestResponse, ThirdpartyRequests, Errors } from '@mojaloop/sdk-standard-components'
import { OutboundAPI as SDKOutboundAPI } from '@mojaloop/sdk-scheme-adapter'

// mock KVS default exported class
jest.mock('~/shared/kvs')

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
  let requestAuthorizationResponse: SDKOutboundAPI.Schemas.authorizationsPostResponse
  let requestTransferResponse: SDKOutboundAPI.Schemas.simpleTransfersPostResponse
  let transferRequest: SDKOutboundAPI.Schemas.simpleTransfersPostRequest
  let transferId: string

  beforeEach(async () => {
    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        putThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 })),
        patchThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 200 }))
      } as unknown as ThirdpartyRequests,
      sdkOutgoingRequests: {
        requestQuote: jest.fn(() => Promise.resolve(requestQuoteResponse)),
        requestAuthorization: jest.fn(() => Promise.resolve(requestAuthorizationResponse)),
        requestTransfer: jest.fn(() => Promise.resolve(requestTransferResponse))
      } as unknown as SDKOutgoingRequests,
      dfspBackendRequests: {
        validateThirdpartyTransactionRequest: jest.fn(() => Promise.resolve({ isValid: true })),
        verifyAuthorization: jest.fn(() => Promise.resolve({ isValid: true }))
      } as unknown as DFSPBackendRequests
    }
    transactionRequestId = uuid()
    participantId = uuid()
    transferId = uuid()
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
    transactionRequestPutUpdate = {
      transactionId: uuid(),
      transactionRequestState: 'RECEIVED'
    }
    requestQuoteRequest = {
      fspId: transactionRequestRequest.payee.partyIdInfo.fspId!,
      quotesPostRequest: {
        quoteId: uuid(),
        transactionId: transactionRequestPutUpdate.transactionId,
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

    transferRequest = {
      fspId: transactionRequestRequest.payer.fspId!,
      transfersPostRequest: {
        transferId,
        payeeFsp: transactionRequestRequest.payee.partyIdInfo.fspId!,
        payerFsp: transactionRequestRequest.payer.fspId!,
        amount: { ...requestQuoteResponse.quotes.transferAmount },
        ilpPacket: 'abcd...',
        condition: 'xyz....',
        expiration: (new Date()).toISOString()
      }
    }

    requestTransferResponse = {
      transfer: {
        fulfilment: 'some-fulfilment',
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED'
      },
      currentState: 'COMPLETED'
    }
    await modelConfig.kvs.connect()
  })

  afterEach(async () => {
    await modelConfig.kvs.disconnect()
  })

  function checkDTMLayout (dtm: DFSPTransactionModel, optData?: DFSPTransactionData) {
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
      expect(modelConfig.dfspBackendRequests.validateThirdpartyTransactionRequest)
        .toBeCalledWith(transactionRequestRequest)

      // onNotifyTransactionRequestIsValid
      expect(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactions)
        .toBeCalledWith(
          model.data.transactionRequestPutUpdate,
          model.data.transactionRequestId,
          model.data.participantId
        )

      // check properly requestQuoteRequest
      expect(model.data.requestQuoteRequest).toBeDefined()
      expect(modelConfig.thirdpartyRequests.putThirdpartyRequestsTransactions)
        .toBeCalledWith(
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
      expect(rqr.transactionId)
        .toEqual(model.data.transactionRequestPutUpdate!.transactionId)

      // transactionRequestId should be the same as received
      expect(rqr.transactionRequestId)
        .toEqual(tr.transactionRequestId)

      // payee should be the same as received
      expect(rqr.payee).toEqual(tr.payee)

      // payer should be build from received payer.partyIdInfo
      expect(rqr.payer).toEqual({ partyIdInfo: { ...tr.payer } })

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
      expect(rqr.transactionId)
        .toEqual(model.data.transactionRequestPutUpdate!.transactionId)

      // transactionRequestId should be the same as received
      expect(rqr.transactionRequestId)
        .toEqual(tr.transactionRequestId)

      // payee should be the same as received
      expect(rqr.payee).toEqual(tr.payee)

      // payer should be build from received payer.partyIdInfo
      expect(rqr.payer).toEqual({ partyIdInfo: { ...tr.payer } })

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
      expect(model.sdkOutgoingRequests.requestAuthorization).toBeCalledWith(model.data.requestAuthorizationPostRequest)

      // shortcut
      const rar = model.data.requestAuthorizationPostRequest!

      // fspId should be set to PISP
      expect(rar.fspId).toEqual(model.data.participantId)
      expect(rar.authorizationsPostRequest).toBeDefined()

      // only U2F with 1 retry
      expect(rar.authorizationsPostRequest.authenticationType).toEqual('U2F')
      expect(rar.authorizationsPostRequest.retriesLeft).toEqual('1')

      // amount should be propagated from ThirdpartyRequestsRequest
      expect(rar.authorizationsPostRequest.amount).toEqual(tr.amount)

      // quotes must be propagated
      expect(rar.authorizationsPostRequest.quote).toEqual(model.data.requestQuoteResponse!.quotes)

      // transactionId must be propagated
      expect(rar.authorizationsPostRequest.transactionId).toEqual(model.data.transactionRequestPutUpdate!.transactionId)
      expect(rar.authorizationsPostRequest.transactionRequestId).toEqual(model.data.transactionRequestId)

      // validate requestAuthorization response
      expect(model.data.requestAuthorizationResponse).toBeDefined()

      // authorizationsResponse is send by mock
      expect(model.data.requestAuthorizationResponse).toEqual(requestAuthorizationResponse)

      // onVerifyAuthorization
      // check did we do proper call downstream
      expect(model.dfspBackendRequests.verifyAuthorization).toHaveBeenCalledWith(
        model.data.requestAuthorizationResponse!.authorizations
      )

      // check the setup of transferRequest
      expect(model.data.transferRequest).toBeDefined()
      const rtr = model.data.transferRequest!
      const quote = model.data.requestQuoteResponse!.quotes
      expect(rtr.fspId).toEqual(tr.payer.fspId)
      expect(rtr.transfersPostRequest).toEqual({
        transferId: model.data.transferId!,
        payeeFsp: tr.payee.partyIdInfo.fspId!,
        payerFsp: tr.payer.fspId!,
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
        transactionId: model.data.transactionId!,
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
      mocked(modelConfig.dfspBackendRequests.validateThirdpartyTransactionRequest)
        .mockImplementationOnce(() => Promise.resolve({ isValid: false }))

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
        .mockImplementationOnce(() => Promise.resolve({ statusCode: 400 } as GenericRequestResponse))
      const data: DFSPTransactionData = {
        transactionRequestId,
        transactionRequestState: 'RECEIVED',
        participantId,
        transactionRequestRequest,
        transactionRequestPutUpdate,
        currentState: 'transactionRequestIsValid'
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
      mocked(modelConfig.sdkOutgoingRequests.requestQuote).mockImplementationOnce(
        () => Promise.resolve({ currentState: 'ERROR_OCCURRED' } as SDKOutboundAPI.Schemas.quotesPostResponse)
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
      mocked(modelConfig.sdkOutgoingRequests.requestAuthorization).mockImplementationOnce(
        () => Promise.resolve({ currentState: 'ERROR_OCCURRED' } as SDKOutboundAPI.Schemas.authorizationsPostResponse)
      )
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
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_REQUEST_AUTHORIZATION_FAILED)
        done()
      }
    })

    it('should throw if verifyAuthorization failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.dfspBackendRequests.verifyAuthorization).mockImplementationOnce(
        () => Promise.resolve({ isValid: false })
      )
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
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_AUTHORIZATION_NOT_VALID)
        done()
      }
    })

    it('should throw if user REJECTED authorization/transfer', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.dfspBackendRequests.verifyAuthorization).mockImplementationOnce(
        () => Promise.resolve({ isValid: false })
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
          ...requestAuthorizationResponse,
          authorizations: {
            ...requestAuthorizationResponse.authorizations,
            responseType: 'REJECTED'
          }
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

    it('should throw if unexpected responseType received', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.dfspBackendRequests.verifyAuthorization).mockImplementationOnce(
        () => Promise.resolve({ isValid: false })
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
          ...requestAuthorizationResponse,
          authorizations: {
            ...requestAuthorizationResponse.authorizations,
            responseType: 'RESEND'
          }
        },
        currentState: 'authorizationReceived'
      }
      const model = await create(data, modelConfig)
      try {
        await model.fsm.verifyAuthorization()
      } catch (err) {
        expect(err).toEqual(Errors.MojaloopApiErrorCodes.TP_FSP_TRANSACTION_AUTHORIZATION_UNEXPECTED)
        done()
      }
    })

    it('should throw if transfer failed', async (done) => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      mocked(modelConfig.sdkOutgoingRequests.requestTransfer).mockImplementationOnce(
        () => Promise.resolve(
          { currentState: 'ERROR_OCCURRED' } as SDKOutboundAPI.Schemas.simpleTransfersPostResponse)
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
          ...requestAuthorizationResponse,
          authorizations: {
            ...requestAuthorizationResponse.authorizations,
            responseType: 'RESEND'
          }
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
      mocked(modelConfig.thirdpartyRequests.patchThirdpartyRequestsTransactions).mockImplementationOnce(
        () => Promise.resolve(undefined)
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
          ...requestAuthorizationResponse,
          authorizations: {
            ...requestAuthorizationResponse.authorizations,
            responseType: 'RESEND'
          }
        },
        transferRequest,
        transactionRequestPatchUpdate: {
          transactionId: transactionRequestPutUpdate.transactionId,
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
      } catch (error) {
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
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => { throw new Error('error from KVS.set') })
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
