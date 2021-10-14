import axios from 'axios'
import env from '../env'
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
        transactionRequestId
      }
      // be sure we disable guard
      await kvs.del(transactionRequestId)

      // lookup and resolve payee
      const lookupResponse = await axios.post<any>(lookupURI, lookupRequest)
      expect(lookupResponse.status).toEqual(200)
      expect(lookupResponse.data.currentState).toEqual('partyLookupSuccess')

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

      // TTK allows to setup only one callback by standard simulate
      // initiate - receive authorization to sign
      const initiateresponse = await axios.post<any>(initiateURI, initiateRequest)
      expect(initiateresponse.status).toEqual(200)
      expect(initiateresponse.data.currentState).toEqual('authorizationReceived')

      const approveURI = `${env.outbound.baseUri}/thirdpartyTransaction/${transactionRequestId}/approve`
      const approveRequest = {
        authorizationResponse: {
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
      }
    
      // send approve with signed authorization and wait for transfer to complete
      const approveResponse = await axios.post<any>(approveURI, approveRequest)

      expect(approveResponse.status).toEqual(200)
      expect(approveResponse.data.currentState).toEqual('transactionStatusReceived')
      expect(approveResponse.data.transactionStatus.transactionRequestState).toEqual('ACCEPTED')
    })
  })
})
