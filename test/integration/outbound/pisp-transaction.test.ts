import axios from 'axios'
import env from '../env'
import { PISPTransactionModelState } from '~/models/pispTransaction.interface'
describe('PISP Transaction', (): void => {
  const transactionRequestId = 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  const lookupURI = `${env.outbound.baseUri}/thirdpartyTransaction/partyLookup`
  describe('/thirdpartyTransaction: partyLookup->initiate->approve', (): void => {
    it('transactionRequestState should be ACCEPTED', async (): Promise<void> => {

      const lookupRequest = {
        payee: {
          partyIdType: "MSISDN",
          partyIdentifier: "+4412345678"

        },
        transactionRequestId: transactionRequestId
      }
      const lookupResponse = await axios.post(lookupURI, lookupRequest)
      expect(lookupResponse.status).toEqual(200)
      expect(lookupResponse.data.currentState).toEqual(PISPTransactionModelState.partyLookupSuccess)

      const initiateURI = `${env.outbound.baseUri}/thirdpartyTransaction/${transactionRequestId}/initiate`
      const initiateRequest = {
        sourceAccountId: "dfspa.alice.1234",
        consentId: "8e34f91d-d078-4077-8263-2c047876fcf6",
        payee: {
          partyIdInfo: {
            partyIdType: "MSISDN",
            partyIdentifier: "+44 1234 5678",
            fspId: "dfspb"
          }
        },
        payer: {
          personalInfo: {
            complexName: {
              firstName: "Alice",
              lastName: "K"
            }
          },
          partyIdInfo: {
            partyIdType: "MSISDN",
            partyIdentifier: "+44 8765 4321",
            fspId: "dfspa"
          }
        },
        amountType: "SEND",
        amount: {
          amount: "100",
          currency: "USD"
        },
        transactionType: {
          scenario: "TRANSFER",
          initiator: "PAYER",
          initiatorType: "CONSUMER"
        },
        expiration: "2020-07-15T22:17:28.985-01:00"
      }
      const initiateresponse = await axios.post(initiateURI, initiateRequest)
      expect(initiateresponse.status).toEqual(200)
      expect(initiateresponse.data.currentState).toEqual(PISPTransactionModelState.authorizationReceived)

      const approveURI = `${env.outbound.baseUri}/thirdpartyTransaction/${transactionRequestId}/approve`
      const approveRequest = {
        authorizationResponse: {
          authenticationInfo: {
            authentication: "OTP",
            authenticationValue: "xxxxxxxxxxxxxxxxxxxxxx"
          },
          responseType: "ENTERED"
        }
      }
      const approveResponse = await axios.post(approveURI, approveRequest)
      expect(approveResponse.status).toEqual(200)
      expect(approveResponse.data.currentState).toEqual(PISPTransactionModelState.transactionStatusReceived)
      expect(approveResponse.data.transactionStatus.transactionRequestState).toEqual('ACCEPTED')
    })
  })
})
