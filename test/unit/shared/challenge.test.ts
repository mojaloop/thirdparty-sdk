import { AuthRequestPartial, deriveTransactionChallenge } from "~/shared/challenge"
import sha256 from 'crypto-js/sha256'

describe('challenge', () => {
  describe('deriveTransactionChallenge', () => {
    it('derives the challenge based on the authRequestPartial', () => {
      // Arrange
      const authRequestPartial: AuthRequestPartial = {
        authorizationRequestId: '5f8ee7f9-290f-4e03-ae1c-1e81ecf398df',
        transactionRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
        transferAmount: { amount: '100', currency: 'USD' },
        payeeReceiveAmount: { amount: '99', currency: 'USD' },
        fees: { amount: '1', currency: 'USD' },
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

      // cjson
      const cjsonString = '{"authorizationRequestId":"5f8ee7f9-290f-4e03-ae1c-1e81ecf398df","expiration":"2020-06-15T12:00:00.000Z","fees":{"amount":"1","currency":"USD"},"payee":{"partyIdInfo":{"fspId":"dfspb","partyIdType":"MSISDN","partyIdentifier":"+4412345678"}},"payeeReceiveAmount":{"amount":"99","currency":"USD"},"payer":{"fspId":"dfspa","partyIdType":"THIRD_PARTY_LINK","partyIdentifier":"qwerty-123456"},"transactionRequestId":"b51ec534-ee48-4575-b6a9-ead2955b8069","transactionType":{"initiator":"PAYER","initiatorType":"CONSUMER","scenario":"TRANSFER"},"transferAmount":{"amount":"100","currency":"USD"}}'
      const sha256Hash = sha256(cjsonString).toString()
      
      // Act
      const result = deriveTransactionChallenge(authRequestPartial)
      
      // Assert
      expect(result).toEqual(sha256Hash)
    })
  })
})