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
import { Message, NotificationCallback, PubSub } from '~/shared/pub-sub'
import { MojaloopRequests, ThirdpartyRequests } from '@mojaloop/sdk-standard-components'
import {
  PISPTransactionData,
  PISPTransactionModelConfig,
  PISPTransactionPhase,
  RequestPartiesInformationState
} from '~/models/pispTransaction.interface'
import { PISPTransactionModel, create, loadFromKVS } from '~/models/pispTransaction.model'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import { mocked } from "jest-mock";

import mockLogger from 'test/unit/mockLogger'
import shouldNotBeExecuted from 'test/unit/shouldNotBeExecuted'
import sortedArray from 'test/unit/sortedArray'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { HTTPResponseError } from '~/shared/http-response-error'
import { SDKOutgoingRequests } from '~/shared/sdk-outgoing-requests'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'
import { v4 } from 'uuid'
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
  const party: tpAPI.Schemas.Party = {
    partyIdInfo: {
      fspId: 'fsp-id',
      partyIdType: 'PERSONAL_ID',
      partyIdentifier: 'party-identifier'
    }
  }
  let modelConfig: PISPTransactionModelConfig
  let publisher: PubSub

  beforeEach(async () => {
    let subId = 0
    const handlers: { [key: string]: NotificationCallback } = {}

    publisher = new PubSub(connectionConfig)
    await publisher.connect()

    mocked(publisher.publish).mockImplementation(async (channel: string, message: Message) =>
      handlers[channel](channel, message, subId)
    )

    modelConfig = {
      key: 'cache-key',
      kvs: new KVS(connectionConfig),
      subscriber: new PubSub(connectionConfig),
      logger: connectionConfig.logger,
      thirdpartyRequests: {
        postThirdpartyRequestsTransactions: jest.fn(() => Promise.resolve({ statusCode: 202 })),
        putThirdpartyRequestsAuthorizations: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as ThirdpartyRequests,
      mojaloopRequests: {
        getParties: jest.fn(() => Promise.resolve({ statusCode: 202 }))
      } as unknown as MojaloopRequests,
      sdkOutgoingRequests: {
        requestPartiesInformation: jest.fn(() =>
          Promise.resolve({
            party: { Iam: 'mocked-party' },
            currentStatus: 'COMPLETED'
          })
        )
      } as unknown as SDKOutgoingRequests,
      initiateTimeoutInSeconds: 3,
      approveTimeoutInSeconds: 3
    }

    mocked(modelConfig.subscriber.subscribe).mockImplementation((channel: string, cb: NotificationCallback) => {
      handlers[channel] = cb
      return ++subId
    })

    await modelConfig.kvs.connect()
    await modelConfig.subscriber.connect()
  })

  afterEach(async () => {
    await publisher.disconnect()
    await modelConfig.kvs.disconnect()
    await modelConfig.subscriber.disconnect()
  })

  function checkPTMLayout(ptm: PISPTransactionModel, optData?: PISPTransactionData) {
    expect(ptm).toBeTruthy()
    expect(ptm.data).toBeDefined()
    expect(ptm.fsm.state).toEqual(optData?.currentState || 'start')

    // check new getters
    expect(ptm.subscriber).toEqual(modelConfig.subscriber)
    expect(ptm.mojaloopRequests).toEqual(modelConfig.mojaloopRequests)
    expect(ptm.thirdpartyRequests).toEqual(modelConfig.thirdpartyRequests)

    // check fsm transitions
    expect(typeof ptm.fsm.init).toEqual('function')
    expect(typeof ptm.fsm.requestPartyLookup).toEqual('function')
    expect(typeof ptm.fsm.initiate).toEqual('function')
    expect(typeof ptm.fsm.approve).toEqual('function')

    // check fsm notification handlers
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
    describe('Party Lookup Phase', () => {
      let lookupData: PISPTransactionData

      beforeEach(async () => {
        lookupData = {
          transactionRequestId: '1234-1234',
          currentState: 'start',
          payeeRequest: {
            transactionRequestId: '1234-1234',
            payee: {
              partyIdType: 'MSISDN',
              partyIdentifier: 'party-identifier'
            }
          }
        }
      })

      it('should be well constructed', async () => {
        const model = await create(lookupData, modelConfig)
        checkPTMLayout(model, lookupData)
      })

      it('should give response properly populated from backendRequests.requestPartiesInformation', async () => {
        const model = await create(lookupData, modelConfig)
        mocked(modelConfig.sdkOutgoingRequests.requestPartiesInformation).mockImplementationOnce(() =>
          Promise.resolve({
            party: {
              body: party,
              headers: {}
            },
            currentState: RequestPartiesInformationState.COMPLETED
          })
        )
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
          party: {
            body: party,
            headers: {}
          },
          currentState: RequestPartiesInformationState.COMPLETED
        })

        // check we got lookup response phase response stored
        expect(model.data.partyLookupResponse).toEqual({
          party,
          currentState: 'partyLookupSuccess'
        })

        // check we made a call to mojaloopRequest.getParties
        expect(modelConfig.sdkOutgoingRequests.requestPartiesInformation).toBeCalledWith(
          'MSISDN',
          'party-identifier',
          undefined
        )
      })

      it('should handle error', async () => {
        mocked(modelConfig.sdkOutgoingRequests.requestPartiesInformation).mockImplementationOnce(() => {
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
        })
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
      let channelTransPut: string
      let channelAuthPost: string
      const transactionRequestId = v4()
      const transactionId = v4()
      const authorizationRequest: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsPostRequest = {
        authorizationRequestId: '5f8ee7f9-290f-4e03-ae1c-1e81ecf398df',
        transactionRequestId: '2cf08eed-3540-489e-85fa-b2477838a8c5',
        challenge: '<base64 encoded binary - the encoded challenge>',
        transferAmount: {
          amount: '100',
          currency: 'USD'
        },
        payeeReceiveAmount: {
          amount: '99',
          currency: 'USD'
        },
        fees: {
          amount: '1',
          currency: 'USD'
        },
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+4412345678',
            fspId: 'dfspb'
          }
        },
        payer: {
          partyIdType: 'THIRD_PARTY_LINK',
          partyIdentifier: 'qwerty-123456',
          fspId: 'dfspa'
        },
        transactionType: {
          scenario: 'TRANSFER',
          initiator: 'PAYER',
          initiatorType: 'CONSUMER'
        },
        expiration: '2020-06-15T12:00:00.000Z'
      }

      const transactionStatus: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse = {
        transactionId,
        transactionRequestState: 'RECEIVED'
      }
      beforeEach(async () => {
        data = {
          transactionRequestId,
          currentState: 'partyLookupSuccess',
          payeeRequest: {
            transactionRequestId,
            payee: {
              partyIdType: 'MSISDN',
              partyIdentifier: 'party-identifier'
            }
          },
          payeeResolved: {
            party: {
              body: party,
              headers: {}
            },
            currentState: RequestPartiesInformationState.COMPLETED
          },
          initiateRequest: {
            payee: party,
            payer: {
              fspId: 'payer-fsp-id',
              partyIdType: 'THIRD_PARTY_LINK',
              partyIdentifier: 'payer-party-identifier'
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
        channelTransPut = PISPTransactionModel.notificationChannel(
          PISPTransactionPhase.waitOnTransactionPut,
          transactionRequestId
        )
        channelAuthPost = PISPTransactionModel.notificationChannel(
          PISPTransactionPhase.waitOnAuthorizationPost,
          transactionRequestId
        )
      })

      it('should be well constructed', async () => {
        const model = await create(data, modelConfig)
        checkPTMLayout(model, data)
        expect(channelTransPut).toEqual(`pisp_transaction_waitOnTransactionPut_${transactionRequestId}`)
        expect(channelAuthPost).toEqual(`pisp_transaction_waitOnAuthorizationPost_${transactionRequestId}`)
      })

      it('should give response properly populated from notification channel', async () => {
        const model = await create(data, modelConfig)
        // defer publication to notification channel
        setImmediate(() => {
          // publish authorization request
          publisher.publish(channelAuthPost, authorizationRequest as unknown as Message)
          // publish transaction status update
          publisher.publish(channelTransPut, transactionStatus as unknown as Message)
        })
        // let be sure we don't have expected data yet
        expect(model.data.authorizationRequest).toBeFalsy()
        expect(model.data.transactionStatus).toBeFalsy()
        expect(model.data.initiateResponse).toBeFalsy()

        // do a request and await on published Message
        const result = await model.run()
        expect(result).toEqual({
          authorization: { ...authorizationRequest },
          currentState: 'authorizationReceived'
        })

        // check that correct subscription has been done
        expect(modelConfig.subscriber.subscribe).toBeCalledWith(channelAuthPost, expect.anything())
        expect(modelConfig.subscriber.subscribe).toBeCalledWith(channelTransPut, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.subscriber.unsubscribe).toBeCalledWith(channelAuthPost, expect.anything())
        expect(modelConfig.subscriber.unsubscribe).toBeCalledWith(channelTransPut, expect.anything())

        // check we got needed part of response stored
        expect(model.data.authorizationRequest).toEqual(authorizationRequest)
        expect(model.data.transactionStatusPut).toEqual(transactionStatus)

        // check we got initiate response phase response stored
        expect(model.data.initiateResponse).toEqual({
          authorization: { ...authorizationRequest },
          currentState: 'authorizationReceived'
        })

        // check we made a call to hirdpartyRequests.postThirdpartyRequestsTransactions
        expect(modelConfig.thirdpartyRequests.postThirdpartyRequestsTransactions).toBeCalledWith(
          {
            transactionRequestId: data.transactionRequestId,
            ...data.initiateRequest
          },
          data.initiateRequest?.payer.fspId
        )
      })

      it('should handle error', async (done) => {
        mocked(modelConfig.thirdpartyRequests.postThirdpartyRequestsTransactions).mockImplementationOnce(() => {
          throw new Error('mocked postThirdpartyRequestsTransactions exception')
        })
        const model = await create(data, modelConfig)

        try {
          await model.run()
          shouldNotBeExecuted()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          expect(err.message).toEqual('mocked postThirdpartyRequestsTransactions exception')

          // check that correct subscription has been done
          expect(modelConfig.subscriber.subscribe).toBeCalledWith(channelTransPut, expect.anything())

          // check that correct unsubscription has been done
          expect(modelConfig.subscriber.unsubscribe).toBeCalledWith(channelTransPut, expect.anything())
          done()
        }
      })
    })

    describe('Approve Transaction Phase', () => {
      let data: PISPTransactionData
      let channel: string
      const authorizationRequest: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsPostRequest = {
        authorizationRequestId: '5f8ee7f9-290f-4e03-ae1c-1e81ecf398df',
        transactionRequestId: '2cf08eed-3540-489e-85fa-b2477838a8c5',
        challenge: '<base64 encoded binary - the encoded challenge>',
        transferAmount: {
          amount: '100',
          currency: 'USD'
        },
        payeeReceiveAmount: {
          amount: '99',
          currency: 'USD'
        },
        fees: {
          amount: '1',
          currency: 'USD'
        },
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+4412345678',
            fspId: 'dfspb'
          }
        },
        payer: {
          partyIdType: 'THIRD_PARTY_LINK',
          partyIdentifier: 'qwerty-123456',
          fspId: 'dfspa'
        },
        transactionType: {
          scenario: 'TRANSFER',
          initiator: 'PAYER',
          initiatorType: 'CONSUMER'
        },
        expiration: '2020-06-15T12:00:00.000Z'
      }

      const authorizationResponse: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseFIDO = {
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
      }

      const transactionStatus: tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse = {
        transactionRequestState: 'ACCEPTED',
        transactionState: 'COMPLETED'
      }

      beforeEach(async () => {
        data = {
          transactionRequestId: '1234-1234',
          currentState: 'authorizationReceived',
          payeeRequest: {
            transactionRequestId: '1234-1234',
            payee: {
              partyIdType: 'MSISDN',
              partyIdentifier: 'party-identifier'
            }
          },
          payeeResolved: {
            party: {
              body: party,
              headers: {}
            },
            currentState: RequestPartiesInformationState.COMPLETED
          },
          initiateRequest: {
            payee: party,
            payer: {
              fspId: 'payer-fsp-id',
              partyIdType: 'THIRD_PARTY_LINK',
              partyIdentifier: 'payer-party-identifier'
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
          authorizationRequest,
          approveRequest: {
            authorizationResponse
          }
        }
        channel = PISPTransactionModel.notificationChannel(PISPTransactionPhase.approval, '1234-1234')
      })

      it('should be well constructed', async () => {
        const model = await create(data, modelConfig)
        checkPTMLayout(model, data)
        expect(channel).toEqual('pisp_transaction_approval_1234-1234')
      })

      it('should give response properly populated from notification channel', async () => {
        const model = await create(data, modelConfig)

        // let be sure we don't have expected data yet
        expect(model.data.transactionStatus).toBeFalsy()
        expect(model.data.approveResponse).toBeFalsy()

        // defer publication to notification channel
        setImmediate(() => publisher.publish(channel, transactionStatus as unknown as Message))
        // do a request and await on published Message
        const result = await model.run()
        expect(result).toEqual({
          transactionStatus: { ...transactionStatus },
          currentState: 'transactionStatusReceived'
        })

        // check that correct subscription has been done
        expect(modelConfig.subscriber.subscribe).toBeCalledWith(channel, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.subscriber.unsubscribe).toBeCalledWith(channel, 1)

        // check we got needed part of response stored
        expect(model.data.transactionStatusPatch).toEqual(transactionStatus)

        // check we got initiate response phase response stored
        expect(model.data.approveResponse).toEqual({
          transactionStatus: { ...transactionStatus },
          currentState: 'transactionStatusReceived'
        })

        // check we made a call to thirdpartyRequests.putThirdpartyRequestsAuthorizations
        expect(modelConfig.thirdpartyRequests.putThirdpartyRequestsAuthorizations).toBeCalledWith(
          authorizationResponse,
          data.authorizationRequest?.authorizationRequestId,
          data.initiateRequest?.payer.fspId
        )
      })

      it('should handle error', async () => {
        mocked(modelConfig.thirdpartyRequests.putThirdpartyRequestsAuthorizations).mockImplementationOnce(() => {
          throw new Error('mocked putThirdpartyRequestsAuthorizations exception')
        })
        const model = await create(data, modelConfig)

        try {
          await model.run()
          shouldNotBeExecuted()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          expect(err.message).toEqual('mocked putThirdpartyRequestsAuthorizations exception')
        }

        // check that correct subscription has been done
        expect(modelConfig.subscriber.subscribe).toBeCalledWith(channel, expect.anything())

        // check that correct unsubscription has been done
        expect(modelConfig.subscriber.unsubscribe).toBeCalledWith(channel, 1)
      })
    })

    it('errored state', async () => {
      const erroredData: PISPTransactionData = {
        transactionRequestId: '123',
        currentState: 'errored'
      }
      const model = await create(erroredData, modelConfig)
      expect(model.fsm.state).toEqual('errored')

      const result = await model.run()
      expect(result).toBeUndefined()
    })

    it('should do throw if requestLookup was not done before calling initialization', async () => {
      const invalidData: PISPTransactionData = {
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
      const phases = [PISPTransactionPhase.lookup, PISPTransactionPhase.initiation, PISPTransactionPhase.approval]

      phases.forEach((phase) => {
        expect(PISPTransactionModel.notificationChannel(phase, 'trx-id')).toEqual(`pisp_transaction_${phase}_trx-id`)
        expect(() => PISPTransactionModel.notificationChannel(phase, '')).toThrowError(
          "PISPTransactionModel.notificationChannel: 'transactionRequestId' parameter is required"
        )
        expect(() => PISPTransactionModel.notificationChannel(phase, null as unknown as string)).toThrowError(
          "PISPTransactionModel.notificationChannel: 'transactionRequestId' parameter is required"
        )
      })
    })
  })

  describe('getResponse', () => {
    it('should give valid response', async () => {
      const data: PISPTransactionData = {
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
      model.data.partyLookupResponse = {
        am: 'party-lookup-mocked-response'
      } as unknown as OutboundAPI.Schemas.ThirdpartyTransactionPartyLookupResponse
      expect(model.getResponse()).toEqual({ am: 'party-lookup-mocked-response' })

      model.data.currentState = 'authorizationReceived'
      model.data.initiateResponse = {
        am: 'authorization-received-mocked-response'
      } as unknown as OutboundAPI.Schemas.ThirdpartyTransactionIDInitiateResponse
      expect(model.getResponse()).toEqual({ am: 'authorization-received-mocked-response' })

      model.data.currentState = 'transactionStatusReceived'
      model.data.approveResponse = {
        am: 'transaction-status-mocked-response'
      } as unknown as OutboundAPI.Schemas.ThirdpartyTransactionIDApproveResponse
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.message).toEqual(`No data found in KVS for: ${modelConfig.key}`)
      }
    })

    it('should propagate error received from `KVS.get`', async () => {
      mocked(modelConfig.kvs.get).mockImplementationOnce(
        jest.fn(async () => {
          throw new Error('error from KVS.get')
        })
      )
      expect(() => loadFromKVS(modelConfig)).rejects.toEqual(new Error('error from KVS.get'))
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
      mocked(modelConfig.kvs.set).mockImplementationOnce(() => {
        throw new Error('error from KVS.set')
      })
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
