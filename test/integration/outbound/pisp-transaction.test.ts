import axios from 'axios'
import env from '../env'

//TODO: add all scenarios
describe('PISP Transaction', (): void => {
  const scenariosURI = `${env.outbound.baseUri}/thirdpartyTransaction/partyLookup`
  describe('/thirdpartyTransaction/partyLookup', (): void => {
    it('should return party info', async (): Promise<void> => {

      const options = {
        payee: {
          partyIdType: "MSISDN",
          partyIdentifier: "+4412345678"

        },
        transactionRequestId: "b51ec534-ee48-4575-b6a9-ead2955b8069"
      }
      // Act
      const response = await axios.post(scenariosURI, options)

      // Assert
      expect(response.status).toEqual(200)
    })
  })
})
