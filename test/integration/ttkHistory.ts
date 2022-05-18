import axios from 'axios'

export interface MLTestingToolkitRequest {
  timestamp: string
  method: string
  path: string
  headers: Record<string, unknown>
  body: Record<string, unknown>
}

/**
 * @class TTKHistory
 * @description Test utility that helps lookup async callbacks
 */
export class TTKHistory {
  uri: string
  requestConfig = {
    headers: {
      'Content-Type': 'application/json',
      'FSPIOP-Source': 'switch',
      Date: 'Thu, 24 Jan 2019 10:23:12 GMT',
      'FSPIOP-Destination': 'dfspA'
    }
  }

  constructor(baseUrl: string) {
    this.uri = `${baseUrl}/api/history/requests`
  }

  public async getAndFilter(method?: string, path?: string): Promise<Array<MLTestingToolkitRequest>> {
    let requestHistory: MLTestingToolkitRequest[]
    try {
      requestHistory = (await axios.get(this.uri, this.requestConfig)).data as unknown as MLTestingToolkitRequest[]
    } catch (err) {
      console.log(err)
      return []
    }

    if (!method && !path) {
      // return the complete history without filtering
      return requestHistory
    }

    let filtered = requestHistory
    if (method) {
      filtered = filtered.filter((req) => req.method === method)
    }
    if (path) {
      filtered = filtered.filter((req) => req.path === path)
    }

    return filtered
  }

  public async getAndFilterWithRetries(
    retries: number,
    method?: string,
    path?: string
  ): Promise<Array<MLTestingToolkitRequest>> {
    let result = await this.getAndFilter(method, path)
    while (retries > 0 && result.length === 0) {
      result = await this.getAndFilter(method, path)
      // wait a bit for the DFSP adapter to process the request
      await new Promise((resolve) => setTimeout(resolve, 200))

      retries--
    }

    return result
  }

  public async clear(): Promise<void> {
    await axios.delete(this.uri, {})
  }
}
