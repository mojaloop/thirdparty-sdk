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
import { KVS } from '~/shared/kvs'
import {
  Message,
  NotificationCallback,
  PubSub
} from '~/shared/pub-sub'
import { MojaloopRequests, ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import {
  PISPTransactionData,
  PISPTransactionModelConfig,
  PISPTransactionPhase,
  RequestPartiesInformationState,
  ThirdpartyTransactionApproveResponse,
  ThirdpartyTransactionInitiateResponse,
  ThirdpartyTransactionPartyLookupResponse,
  ThirdpartyTransactionStatus
} from '~/models/pispTransaction.interface'
import {
  PISPTransactionModel,
  create,
  loadFromKVS
} from '~/models/pispTransaction.model'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from 'ts-jest/utils'

import mockLogger from 'test/unit/mockLogger'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import sortedArray from 'test/unit/sortedArray'
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { HTTPResponseError } from '~/shared/http-response-error'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'

// mock KVS default exported class
jest.mock('~/shared/kvs')

// mock PubSub default exported class
jest.mock('~/shared/pub-sub')

describe('pipsTransactionModel', () => {
  const connectionConfig: RedisConnectionConfig = {
    port: 6789,
    host: 'localhost',
    logger: mockLogger()
  }
  let modelConfig: PISPTransactionModelConfig

  beforeEach(async () => {
    let subId = 0
    let handler: NotificationCallback

    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      pubSub: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        postThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as ThirdpartyRequests,
      mojaloopRequests: {
        getParties: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        putAuthorizations: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as MojaloopRequests,
      sdkOutgoingRequests: {
        requestPartiesInformation: jest.fn(() => Promise.resolve({
          party: { Iam: 'mocked-party' },
          currentStatus: 'COMPLETED'
        }))
      } as unknown as SDKOutgoingRequests
    }
    mocked(modelConfig.pubSub.subscribe).mockImplementationOnce(
      (_channel: string, cb: NotificationCallback) => {
        handler = cb
        return ++subId
      }
    )

    mocked(modelConfig.pubSub.publish).mockImplementationOnce(
      async (channel: string, message: Message) => handler(channel, message, subId)
    )
    await modelConfig.kvs.connect()
    await modelConfig.pubSub.connect()
  })

  afterEach(async () => {
    await modelConfig.kvs.disconnect()
    await modelConfig.pubSub.disconnect()
  })

  function checkPTMLayout (ptm: PISPTransactionModel, optData?: PISPTransactionData) {
    expect(ptm).toBeTruthy()
    expect(ptm.data).toBeDefined()
    expect(ptm.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(ptm.pubSub).toEqual(modelConfig.pubSub)
    expect(ptm.mojaloopRequests).toEqual(modelConfig.mojaloopRequests)
    expect(ptm.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check is fsm correctly constructed
    expect(typeof ptm.fsm.init).toEqual('function')
    expect(typeof ptm.fsm.requestPartyLookup).toEqual('function')
    expect(typeof ptm.fsm.initiate).toEqual('function')
    expect(typeof ptm.fsm.approve).toEqual('function')

    // check fsm notification handler
    expect(typeof ptm.onRequestPartyLookup).toEqual('function')
    expect(typeof ptm.onInitiate).toEqual('function')
    expect(typeof ptm.onApprove).toEqual('function')

    expect(sortedArray(ptm.fsm.allStates())).toEqual([
      'authorizationReceived',
      'errored',
      'none',
      'partyLookupFailure',
      'partyLookupSuccess',
      'start',
      'transactionStatusReceived'
    ])
    expect(sortedArray(ptm.fsm.allTransitions())).toEqual([
      'approve',
      'error',
      'failPartyLookup',
      'init',
      'initiate',
      'requestPartyLookup'
    ])
  }

  it('module layout', () => {
    expect(typeof PISPTransactionModel).toEqual('function')
    expect(typeof loadFromKVS).toEqual('function')
    expect(typeof create).toEqual('function')
  })

  describe('transaction flow', () => {
    const party: tpAPI.Schemas.Party = {
      partyIdInfo: {
        fspId: 'fsp-id',
        partyIdType: 'PERSONAL_ID',
        partyIdentifier: 'party-identifier'
      }
    }

    describe('Party Lookup Phase', () => {
      let lookupData: PISPTransactionData

      beforeEach(async () => {
        lookupData = {
          transactionRequestId: '1234-1234',
          currentState: 'start',
          payeeRequest: {
            partyIdType: 'party-id-type',
            partyIdentifier: 'party-identifier'
          }
        }
      })

      it('should be well constructed', async () => {
        const model = await create(lookupData, modelConfig)
        checkPTMLayout(model, lookupData)
      })

      it('should give response properly populated from backendRequests.requestPartiesInformation', async () => {
        const model = await create(lookupData, modelConfig)
        mocked(modelConfig.sdkOutgoingRequests.requestPartiesInformation).mockImplementationOnce(() => Promise.resolve({
          party,
          currentState: RequestPartiesInformationState.COMPLETED
        }))
        // let be sure we don't have expected data yet
        expect(model.data.payeeResolved).toBeFalsy()
        expect(model.data.partyLookupResponse).toBeFalsy()

        // start workflow
        const result = await model.run()
        expect(result).toEqual({
          party,
          currentState: 'partyLookupSuccess'
        })

        // check we got needed part of response stored
        expect(model.data.payeeResolved).toEqual({
          party,
          currentState: RequestPartiesInformationState.COMPLETED
        })

        // check we got lookup response phase response stored
        expect(model.data.partyLookupResponse).toEqual({
          party,
          currentState: 'partyLookupSuccess'
        })

        // check we made a call to mojaloopRequest.getParties
        expect(modelConfig.sdkOutgoingRequests.requestPartiesInformation).toBeCalledWith(
          'party-id-type', 'party-identifier', undefined
        )
      })

      it('should handle error', async () => {
        mocked(
          modelConfig.sdkOutgoingRequests.requestPartiesInformation
        ).mockImplementationOnce(
          () => {
            const err = new HTTPResponseError({
              msg: 'error-message',
              res: {
                statusCode: 404,
                data: {
                  errorInformation: {
                    errorCode: '3204',
                    errorDescription: 'Party not found'
                  },
                  currentState: 'COMPLETED'
                }
              }
            })
            throw err
          }
        )
        const model = await create(lookupData, modelConfig)

        const result = await model.run()
        expect(result).toEqual({
          currentState: 'partyLookupFailure',
          errorInformation: {
            errorCode: '3204',
            errorDescription: 'Party not found'
          }
        })
      })
    })

    describe('Initiate Transaction Phase', () => {
      let data: PISPTransactionData
      let channel: string

      const authorizationRequest: tpAPI.Schemas.AuthorizationsPostRequest = {
        transactionRequestId: '1234-1234',
        transactionId: '5678-5678',
        authenticationType: 'U2F',
        retriesLeft: '1',
        amount: {
          amount: '123.00',
          currency: 'USD'
        },
        quote: {
          transferAmount: {
            amount: '123.00',
            currency: 'USD'
          },
          expiration: 'quote-expiration',
          ilpPacket: 'quote-ilp-packet',
          condition: 'quote-condition'
        }
      }

      beforeEach(async () => {
        data = {
          transactionRequestId: '1234-1234',
          currentState: 'partyLookupSuccess',
          payeeRequest: {
            partyIdType: 'party-id-type',
            partyIdentifier: 'party-identifier'
          },
          payeeResolved: {
            party,
            currentState: RequestPartiesInformationState.COMPLETED
          },
          initiateRequest: {
            sourceAccountId: 'source-account-id',
            consentId: 'consent-id',
            payee: party,
            payer: {
              partyIdInfo: {
                fspId: 'payer-fsp-id',
                partyIdType: 'THIRD_PARTY_LINK',
                partyIdentifier: 'payer-party-identifier'
              }
            },
            amountType: 'SEND' as tpAPI.Schemas.AmountType,
            amount: {
              amount: '123.00',
              currency: 'USD'
            },
            transactionType: {
              scenario: 'PAYMENT',
              initiator: 'PAYER',
              initiatorType: 'BUSINESS'
            },
            expiration: 'expiration'
          }
        }
        channel = PISPTransactionModel.notificationChannel(
          PISPTransactionPhase.initiation,
          '1234-1234'
        )
      })

      it('should be well constructed', async () => {
        const model = await create(data, modelConfig)
        checkPTMLayout(model, data)
        expect(channel).toEqual('pisp_transaction_initiation_1234-1234')
      })

      it('should give response properly populated from notification channel', async () => {
        const model = await create(data, modelConfig)
        // defer publication to notification channel
        setImmediate(() => model.pubSub.publish(
          channel,
          authorizationRequest as unknown as Message
        ))
        // let be sure we don't have expected data yet
        expect(model.data.authorizationRequest).toBeFalsy()
        expect(model.data.initiateResponse).toBeFalsy()

        // do a request and await on published Message
        const result = await model.run()
        expect(result).toEqual({
          authorization: { ...authorizationRequest },
          currentState: 'authorizationReceived'
        })

        // check that correct subscription has been done
        expect(modelConfig.pubSub.subscribe).toBeCalledWith(channel, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.pubSub.unsubscribe).toBeCalledWith(channel, 1)

        // check we got needed part of response stored
        expect(model.data.authorizationRequest).toEqual(authorizationRequest)

        // check we got initiate response phase response stored
        expect(model.data.initiateResponse).toEqual({
          authorization: { ...authorizationRequest },
          currentState: 'authorizationReceived'
        })

        // check we made a call to mojaloopRequest.getParties
        expect(modelConfig.thirdpartyRequests.postThirdpartyRequestsTransactions).toBeCalledWith(
          {
            transactionRequestId: data.transactionRequestId,
            ...data.initiateRequest
          },
          data.initiateRequest?.payer.partyIdInfo.fspId
        )
      })

      it('should handle error', async () => {
        mocked(
          modelConfig.thirdpartyRequests.postThirdpartyRequestsTransactions
        ).mockImplementationOnce(
          () => {
            throw new Error('mocked postThirdpartyRequestsTransactions exception')
          }
        )
        const model = await create(data, modelConfig)

        try {
          await model.run()
          shouldNotBeExecuted()
        } catch (err) {
          expect(err.message).toEqual('mocked postThirdpartyRequestsTransactions exception')
        }

        // check that correct subscription has been done
        expect(modelConfig.pubSub.subscribe).toBeCalledWith(channel, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.pubSub.unsubscribe).toBeCalledWith(channel, 1)
      })
    })

    describe('Approve Transaction Phase', () => {
      let data: PISPTransactionData
      let channel: string

      const authorizationResponse: tpAPI.Schemas.AuthorizationsIDPutResponse = {
        authenticationInfo: {
          authentication: 'U2F',
          authenticationValue: {
            pinValue: 'pin-value',
            counter: '1'
          } as fspiopAPI.Schemas.AuthenticationValue
        },
        responseType: 'ENTERED'
      }

      const transactionStatus: ThirdpartyTransactionStatus = {
        transactionId: '5678-5678',
        transactionRequestState: 'ACCEPTED',
        transactionState: 'COMPLETED'
      }

      beforeEach(async () => {
        data = {
          transactionRequestId: '1234-1234',
          currentState: 'authorizationReceived',
          payeeRequest: {
            partyIdType: 'party-id-type',
            partyIdentifier: 'party-identifier'
          },
          payeeResolved: {
            party,
            currentState: RequestPartiesInformationState.COMPLETED
          },
          initiateRequest: {
            sourceAccountId: 'source-account-id',
            consentId: 'consent-id',
            payee: party,
            payer: {
              partyIdInfo: {
                fspId: 'payer-fsp-id',
                partyIdType: 'THIRD_PARTY_LINK',
                partyIdentifier: 'payer-party-identifier'
              }
            },
            amountType: 'SEND' as tpAPI.Schemas.AmountType,
            amount: {
              amount: '123.00',
              currency: 'USD'
            },
            transactionType: {
              scenario: 'PAYMENT',
              initiator: 'PAYER',
              initiatorType: 'BUSINESS'
            },
            expiration: 'expiration'
          },
          approveRequest: {
            authorizationResponse
          }
        }
        channel = PISPTransactionModel.notificationChannel(
          PISPTransactionPhase.approval,
          '1234-1234'
        )
      })

      it('should be well constructed', async () => {
        const model = await create(data, modelConfig)
        checkPTMLayout(model, data)
        expect(channel).toEqual('pisp_transaction_approval_1234-1234')
      })

      it('should give response properly populated from notification channel', async () => {
        const model = await create(data, modelConfig)
        // defer publication to notification channel
        setImmediate(() => model.pubSub.publish(
          channel,
          transactionStatus as unknown as Message
        ))
        // let be sure we don't have expected data yet
        expect(model.data.transactionStatus).toBeFalsy()
        expect(model.data.approveResponse).toBeFalsy()

        // do a request and await on published Message
        const result = await model.run()
        expect(result).toEqual({
          transactionStatus: { ...transactionStatus },
          currentState: 'transactionStatusReceived'
        })

        // check that correct subscription has been done
        expect(modelConfig.pubSub.subscribe).toBeCalledWith(channel, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.pubSub.unsubscribe).toBeCalledWith(channel, 1)

        // check we got needed part of response stored
        expect(model.data.transactionStatus).toEqual(transactionStatus)

        // check we got initiate response phase response stored
        expect(model.data.approveResponse).toEqual({
          transactionStatus: { ...transactionStatus },
          currentState: 'transactionStatusReceived'
        })

        // check we made a call to mojaloopRequest.putAuthorizations
        expect(modelConfig.mojaloopRequests.putAuthorizations).toBeCalledWith(
          data.transactionRequestId,
          authorizationResponse,
          data.initiateRequest?.payer.partyIdInfo.fspId
        )
      })

      it('should handle error', async () => {
        mocked(modelConfig.mojaloopRequests.putAuthorizations).mockImplementationOnce(
          () => {
            throw new Error('mocked putAuthorization exception')
          }
        )
        const model = await create(data, modelConfig)

        try {
          await model.run()
          shouldNotBeExecuted()
        } catch (err) {
          expect(err.message).toEqual('mocked putAuthorization exception')
        }

        // check that correct subscription has been done
        expect(modelConfig.pubSub.subscribe).toBeCalledWith(channel, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.pubSub.unsubscribe).toBeCalledWith(channel, 1)
      })
    })

    it('errored state', async () => {
      const erroredData = {
        transactionRequestId: '123',
        currentState: 'errored'
      }
      const model = await create(erroredData, modelConfig)
      expect(model.fsm.state).toEqual('errored')

      const result = await model.run()
      expect(result).toBeUndefined()
    })

    it('should do throw if requestLookup was not done before calling initialization', async () => {
      const invalidData = {
        transactionRequestId: '1234-1234',
        currentState: 'partyLookupSuccess'
        // lack of these properties
        // payeeRequest
        // payeeResolved
        // initiateRequest
        // should enforce throwing exception when model.run() will be called
      }
      const model = await create(invalidData, modelConfig)
      expect(model.fsm.state).toEqual('partyLookupSuccess')
      expect(model.run()).rejects.toThrowError('invalid payeeRequest data')
    })
  })

  describe('channel names', () => {
    test('notificationChannel', () => {
      const phases = [
        PISPTransactionPhase.lookup,
        PISPTransactionPhase.initiation,
        PISPTransactionPhase.approval
      ]

      phases.forEach((phase) => {
        expect(PISPTransactionModel.notificationChannel(phase, 'trx-id')).toEqual(`pisp_transaction_${phase}_trx-id`)
        expect(
          () => PISPTransactionModel.notificationChannel(phase, '')
        ).toThrowError('PISPTransactionModel.notificationChannel: \'transactionRequestId\' parameter is required')
        expect(
          () => PISPTransactionModel.notificationChannel(phase, null as unknown as string)
        ).toThrowError('PISPTransactionModel.notificationChannel: \'transactionRequestId\' parameter is required')
      })
    })
  })

  describe('getResponse', () => {
    it('should give valid response', async () => {
      const data = {
        transactionRequestId: '1234-1234',
        currentState: 'start'
      }
      const model = await create(data, modelConfig)

      // void responses
      model.data.currentState = 'start'
      expect(model.getResponse()).toBeUndefined()

      model.data.currentState = 'errored'
      expect(model.getResponse()).toBeUndefined()

      model.data.currentState = 'partyLookupSuccess'
      model.data.partyLookupResponse = { am: 'party-lookup-mocked-response' } as unknown as ThirdpartyTransactionPartyLookupResponse
      expect(model.getResponse()).toEqual({ am: 'party-lookup-mocked-response' })

      model.data.currentState = 'authorizationReceived'
      model.data.initiateResponse = { am: 'authorization-received-mocked-response' } as unknown as ThirdpartyTransactionInitiateResponse
      expect(model.getResponse()).toEqual({ am: 'authorization-received-mocked-response' })

      model.data.currentState = 'transactionStatusReceived'
      model.data.approveResponse = { am: 'transaction-status-mocked-response' } as unknown as ThirdpartyTransactionApproveResponse
      expect(model.getResponse()).toEqual({ am: 'transaction-status-mocked-response' })
    })
  })

  describe('loadFromKVS', () => {
    it('should properly call `KVS.get`, get expected data in `context.data` and setup state of machine', async () => {
      const dataFromCache: PISPTransactionData = {
        transactionRequestId: '1234-1234',
        currentState: 'transactionStatusReceived'
      }
      mocked(modelConfig.kvs.get).mockImplementationOnce(async () => dataFromCache)
      const model = await loadFromKVS(modelConfig)
      checkPTMLayout(model, dataFromCache)

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

    it('should propagate error received from `KVS.get`', async () => {
      mocked(modelConfig.kvs.get).mockImplementationOnce(jest.fn(async () => { throw new Error('error from KVS.get') }))
      expect(() => loadFromKVS(modelConfig))
        .rejects.toEqual(new Error('error from KVS.get'))
    })
  })

  describe('saveToKVS', () => {
    it('should store using KVS.set', async () => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => Promise.resolve(true))
      const data: PISPTransactionData = {
        transactionRequestId: '1234-1234',
        currentState: 'transactionStatusReceived'
      }
      const model = await create(data, modelConfig)
      checkPTMLayout(model, data)

      // transition `init` should encounter exception when saving `context.data`
      await model.saveToKVS()
      expect(mocked(modelConfig.kvs.set)).toBeCalledWith(model.key, model.data)
    })
    it('should propagate error from KVS.set', async () => {
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => { throw new Error('error from KVS.set') })
      const data: PISPTransactionData = {
        transactionRequestId: '1234-1234',
        currentState: 'transactionStatusReceived'
      }
      const model = await create(data, modelConfig)
      checkPTMLayout(model, data)

      // transition `init` should encounter exception when saving `context.data`
      expect(() => model.saveToKVS()).rejects.toEqual(new Error('error from KVS.set'))
      expect(mocked(modelConfig.kvs.set)).toBeCalledWith(model.key, model.data)
    })
  })
})
