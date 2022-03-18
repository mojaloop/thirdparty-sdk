import axios from 'axios'
import env from '../env'
import { KVS } from '~/shared/kvs'
import { RedisConnectionConfig } from '~/shared/redis-connection'
import Config from '~/shared/config'
import mockLogger from '../../unit/mockLogger'
import { TTKHistory } from '../ttkHistory'
import { thirdparty as tpAPI } from '@mojaloop/api-snippets'

describe('DFSP Transaction', (): void => {
  // helper to lookup ttk history calls
  const ttkHistory = new TTKHistory('http://localhost:5050')
  const axiosConfig = {
    headers: {
      'Content-Type': 'application/json',
      'FSPIOP-Source': 'pisp',
      Date: (new Date()).toISOString(),
      'FSPIOP-Destination': 'dfspA'
    }
  }
  const config: RedisConnectionConfig = {
    host: Config.REDIS.HOST,
    port: Config.REDIS.PORT,
    logger: mockLogger(),
    timeout: Config.REDIS.TIMEOUT
  }
  let kvs: KVS
  const transactionRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  let authorizationRequestId: string
  let verificationRequestId: string
  const transactionRequestRequest: tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest = {
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
    amountType: 'RECEIVE',
    amount: {
      currency: 'USD',
      amount: '200'
    },
    transactionType: {
      scenario: 'TRANSFER',
      initiator: 'PAYER',
      initiatorType: 'CONSUMER'
    },
    expiration: (new Date()).toISOString()
  }

  const requestAuthorizationResponse: tpAPI.Schemas.ThirdpartyRequestsAuthorizationsIDPutResponseFIDO = {
    responseType: 'ACCEPTED',
    signedPayload: {
      signedPayloadType: 'FIDO',
      fidoSignedPayload: {
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

  const requestVerificationResponse = {
    authenticationResponse: 'VERIFIED'
  }

  beforeAll(async (): Promise<void> => {
    kvs = new KVS(config)
    await kvs.connect()
  })

  afterAll(async (): Promise<void> => {
    await kvs.disconnect()
  })

  beforeEach(async (): Promise<void> => {
    // clear the request history in TTK between tests.
    await ttkHistory.clear()
  })

  describe('POST /thirdpartyRequests/transactions', (): void => {
    it('should send back a PUT /thirdpartyRequests/transactions', async () => {
      const uri = `${env.inbound.baseUri}/thirdpartyRequests/transactions`
      const result = await axios.post(uri, transactionRequestRequest, axiosConfig)
      expect(result.status).toBe(202)

      // check that the DFSP has sent a PUT /thirdpartyRequests/transactions/{ID} to the PISP
      const historyTPRT = await ttkHistory.getAndFilterWithRetries(2, 'put', `/thirdpartyRequests/transactions/${transactionRequestId}`)
      expect(historyTPRT.length).toEqual(1)
      const tprTransactionsPayload = historyTPRT[0].body as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPutResponse

      expect(tprTransactionsPayload).toStrictEqual({
        transactionId: expect.stringMatching('.*'),
        transactionRequestState: 'RECEIVED'
      })

      // check that the DFSP has sent a POST /thirdpartyRequests/authorizations
      const historyAuth = await ttkHistory.getAndFilterWithRetries(3, 'post', '/thirdpartyRequests/authorizations')
      expect(historyAuth.length).toEqual(1)
      const historyAuthPayload = historyAuth[0].body as tpAPI.Schemas.ThirdpartyRequestsAuthorizationsPostRequest
      authorizationRequestId = historyAuthPayload.authorizationRequestId

      expect(historyAuthPayload).toStrictEqual({
        authorizationRequestId: expect.stringMatching('.*'),
        transactionRequestId,
        challenge: expect.stringMatching('.*'),
        transferAmount: { currency: 'USD', amount: '200' },
        payeeReceiveAmount: { currency: 'USD', amount: '198' },
        fees: { currency: 'USD', amount: '2' },
        payer: { partyIdType: 'THIRD_PARTY_LINK', partyIdentifier: 'qwerty-1234' },
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '+44 1234 5678',
            fspId: 'dfspb'
          }
        },
        transactionType: {
          scenario: 'TRANSFER',
          initiator: 'PAYER',
          initiatorType: 'CONSUMER'
        },
        // note - this will fail in ~970 years
        expiration: expect.stringMatching('2.*')
      })
    })
  })

  describe('PUT /thirdpartyRequests/authorizations/{ID}', () => {
    it('should send a POST /thirdpartyRequests/verifications to the auth service', async () => {
      expect(authorizationRequestId).toBeDefined()

      const uri = `${env.inbound.baseUri}/thirdpartyRequests/authorizations/${authorizationRequestId}`
      const result = await axios.put(uri, requestAuthorizationResponse, axiosConfig)
      expect(result.status).toBe(200)

      // check that the DFSP has sent a POST /thirdpartyRequests/verifications to the auth service
      const historyPostVerifications = await ttkHistory.getAndFilterWithRetries(2, 'post', '/thirdpartyRequests/verifications')
      expect(historyPostVerifications.length).toEqual(1)
      const historyPostVerificationsPayload = historyPostVerifications[0].body as tpAPI.Schemas.ThirdpartyRequestsVerificationsPostRequest

      console.log(historyPostVerificationsPayload)
      verificationRequestId = historyPostVerificationsPayload.verificationRequestId

      expect(historyPostVerificationsPayload).toStrictEqual({
        verificationRequestId: expect.stringMatching('.*'),
        consentId: expect.stringMatching('.*'),
        fidoSignedPayload: requestAuthorizationResponse.signedPayload.fidoSignedPayload,
        signedPayloadType: requestAuthorizationResponse.signedPayload.signedPayloadType,
        challenge: expect.stringMatching('.*')
      })
    })
  })

  describe('PUT /thirdpartyRequests/verifications/{ID}', () => {
    it('should send a POST /thirdpartyRequests/verifications to the auth service', async () => {
      expect(verificationRequestId).toBeDefined()

      const uri = `${env.inbound.baseUri}/thirdpartyRequests/verifications/${verificationRequestId}`
      const result = await axios.put(uri, requestVerificationResponse, axiosConfig)
      expect(result.status).toBe(200)

      // check that the DFSP has sent a patch /thirdpartyRequests/transactions/{ID} to the pisp
      const history = await ttkHistory.getAndFilterWithRetries(3, 'patch', `/thirdpartyRequests/transactions/${transactionRequestId}`)
      expect(history.length).toEqual(1)
      const payload = history[0].body as tpAPI.Schemas.ThirdpartyRequestsTransactionsIDPatchResponse

      expect(payload).toStrictEqual({
        transactionRequestState: 'ACCEPTED',
        transactionState: 'COMPLETED'
      })
    })
  })
})
