import axios from 'axios'
import env from '../env'

describe('GET /health', (): void => {
  describe('Inbound API', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/health`
    it('should give health status', async (): Promise<void> => {
      // Act
      const response = await axios.get(scenarioUri)

      // Assert
      expect(response.status).toEqual(200)
      expect(response.data.status).toEqual('OK')
    })
  })

  describe('Outbound API', (): void => {
    const scenarioUri = `${env.outbound.baseUri}/health`
    it('should give health status', async (): Promise<void> => {
      // Act
      const response = await axios.get(scenarioUri)

      // Assert
      expect(response.status).toEqual(200)
      expect(response.data.status).toEqual('OK')
    })
  })
})
