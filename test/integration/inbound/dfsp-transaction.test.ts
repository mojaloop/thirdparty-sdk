import axios from 'axios'
import env from '../env'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Config from '~/shared/config'
import mockLogger from '../../unit/mockLogger'

describe('DFSP Transaction', (): void => {
  const config: RedisConnectionConfig = {
    host: Config.REDIS.HOST,
    port: Config.REDIS.PORT,
    logger: mockLogger(),
    timeout: Config.REDIS.TIMEOUT
  }
  let kvs: KVS
  const transactionRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  const lookupURI = `${env.inbound.baseUri}/thirdpartyRequests/transactions`
  const transactionRequestRequest = {
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
  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  describe('POST /thirdpartyRequests/transactions', (): void => {
    it('should perform happy flow', async () => {
      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json',
          'FSPIOP-Source': 'pisp',
          Date: (new Date()).toISOString(),
          'FSPIOP-Destination': 'dfspA'
        }
      }
      const result = await axios.post(lookupURI, transactionRequestRequest, axiosConfig)
      expect(result.status).toBe(202)
    })
  })
})
