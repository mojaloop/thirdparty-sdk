import axios from 'axios'
import env from '../env'
import { PISPTransactionModelState } from '~/models/pispTransaction.interface'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Config from '~/shared/config'
import mockLogger from '../../unit/mockLogger'

describe('PISP Transaction', (): void => {
  const config: RedisConnectionConfig = {
    host: Config.REDIS.HOST,
    port: Config.REDIS.PORT,
    logger: mockLogger(),
    timeout: Config.REDIS.TIMEOUT
  }
  let kvs: KVS
  const transactionRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  const lookupURI = `${env.outbound.baseUri}/thirdpartyTransaction/partyLookup`

  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  describe('/thirdpartyTransaction: partyLookup->initiate->approve', (): void => {
    it('transactionRequestState should be ACCEPTED', async (): Promise<void> => {
      const lookupRequest = {
        payee: {
          partyIdType: 'MSISDN',
          partyIdentifier: '4412345678'
        },
        transactionRequestId: transactionRequestId
      }
      // be sure we disable guard
      await kvs.del(transactionRequestId)

      const lookupResponse = await axios.post(lookupURI, lookupRequest)
      expect(lookupResponse.status).toEqual(200)
      expect(lookupResponse.data.currentState).toEqual(PISPTransactionModelState.partyLookupSuccess)

      const initiateURI = `${env.outbound.baseUri}/thirdpartyTransaction/${transactionRequestId}/initiate`
      const initiateRequest = {
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+44 1234 5678',
            fspId: 'dfspb'
          }
        },
        payer: {
          partyIdType: 'THIRD_PARTY_LINK',
          partyIdentifier: 'qwerty-123456',
          fspId: 'dfspa'
        },
        amountType: 'SEND',
        amount: {
          amount: '100',
          currency: 'USD'
        },
        transactionType: {
          scenario: 'TRANSFER',
          initiator: 'PAYER',
          initiatorType: 'CONSUMER'
        },
        expiration: '2020-07-15T22:17:28.985-01:00'
      }
      const initiateresponse = await axios.post(initiateURI, initiateRequest)
      expect(initiateresponse.status).toEqual(200)
      expect(initiateresponse.data.currentState).toEqual(PISPTransactionModelState.authorizationReceived)

      const approveURI = `${env.outbound.baseUri}/thirdpartyTransaction/${transactionRequestId}/approve`
      const approveRequest = {
        authorizationResponse: {
          authenticationInfo: {
            authentication: 'U2F',
            authenticationValue: {
              pinValue: 'xxxxxxxxxxx',
              counter: '1'
            }
          },
          responseType: 'ENTERED'
        }
      }
      const approveResponse = await axios.post(approveURI, approveRequest)
      expect(approveResponse.status).toEqual(200)
      expect(approveResponse.data.currentState).toEqual(PISPTransactionModelState.transactionStatusReceived)
      expect(approveResponse.data.transactionStatus.transactionRequestState).toEqual('ACCEPTED')
    })
  })
})
