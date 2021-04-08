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
  let transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest

  beforeEach(async () => {
    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      logger: connectionConfig.logger,
      sdkOutgoingRequests: {
      } as unknown as SDKOutgoingRequests
    }
    transactionRequestId = uuid()
    transactionRequestRequest = {
      transactionRequestId,
      payee: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '+44 1234 5678'
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

      // state data should be extended by workflow transition handlers
      // onValidateTransactionRequest
      expect(model.data.transactionRequestPutUpdate).toEqual({
        transactionId: expect.anything(),
        transactionRequestState: 'RECEIVED'
      })

      // onNotifyTransactionRequestIsValid
      // TODO: check properly requestQuoteRequest
      expect(model.data.requestQuoteRequest).toBeDefined()

      // onRequestQuote
      // TODO: check properly requestQuoteResponse
      expect(model.data.requestQuoteResponse).toBeDefined()

      // onRequestAuthorization
      // TODO: check properly requestAuthorizationPostRequest & requestAuthorizationPostResponse
      expect(model.data.requestAuthorizationPostRequest).toBeDefined()
      expect(model.data.requestAuthorizationPostResponse).toBeDefined()

      // onVerifyAuthorization
      // TODO: check properly transferRequest
      expect(model.data.transferRequest).toBeDefined()

      // onRequestTransfer
      // TODO: check properly transferResponse & transactionRequestPatchUpdate
      expect(model.data.transferResponse).toBeDefined()
      expect(model.data.transactionRequestPatchUpdate).toBeDefined()

      // onNotifyTransferIsDone - nothing to check
    })

    it('should handle errored state', async () => {
      mocked(modelConfig.kvs.set).mockImplementation(() => Promise.resolve(true))
      const data: DFSPTransactionData = {
        transactionRequestId,
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
