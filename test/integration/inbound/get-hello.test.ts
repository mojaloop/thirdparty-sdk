import axios from 'axios'
import env from '../env'

describe('GET /hello', (): void => {
  const scenarioUri = `${env.inbound.baseUri}/hello`
  describe('Inbound API', (): void => {
    it('should give health status', async (): Promise<void> => {
      // Act
      const response = await axios.get(scenarioUri)

      // Assert
      expect(response.status).toEqual(200)
      expect(response.data.hello).toEqual('inbound')
    })
  })
})
