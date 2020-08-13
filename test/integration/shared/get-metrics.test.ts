import axios from 'axios'
import env from '../env'

describe('GET /metrics', (): void => {
  describe('Inbound API', (): void => {
    const scenarioUri = `${env.inbound.baseUri}/metrics`
    it('should give metrics status', async (): Promise<void> => {
      // Act
      const response = await axios.get(scenarioUri)

      // Assert
      expect(response.status).toEqual(200)
    })
  })

  describe('Outbound API', (): void => {
    const scenarioUri = `${env.outbound.baseUri}/metrics`
    it('should give metrics status', async (): Promise<void> => {
      // Act
      const response = await axios.get(scenarioUri)

      // Assert
      expect(response.status).toEqual(200)
    })
  })
})
