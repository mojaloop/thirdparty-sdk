/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License")
 and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 - Paweł Marzec <pawel.marzec@modusbox.com>

 --------------
 ******/

import { RequestLogged, logResponse, SchemeLogger } from '~/shared/logger'
import inspect from '~/shared/inspect'
import logger from '@mojaloop/central-services-logger'
import { mocked } from 'ts-jest/utils'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
jest.mock('@mojaloop/central-services-logger', () => ({
  level: 'info',
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  debug: jest.fn()
}))

describe('shared/logger', (): void => {
  afterEach((): typeof jest => jest.clearAllMocks())
  it('should do nothing if no request', (): void => {
    logResponse(null as unknown as RequestLogged)
    expect(logger.info).not.toBeCalled()
  })

  it('should log response via JSON.stringify', (): void => {
    const spyStringify = jest.spyOn(JSON, 'stringify')
    const request = { response: { source: 'abc', statusCode: 200 } }
    logResponse(request as RequestLogged)
    expect(spyStringify).toBeCalledWith('abc')
    expect(logger.info).toBeCalledWith(`AS-Trace - Response: ${JSON.stringify(request.response.source)} Status: ${request.response.statusCode}`)
  })

  it('should log response via inspect', (): void => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    jest.mock('~/shared/inspect', () => jest.fn())
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const spyStringify = jest.spyOn(JSON, 'stringify').mockImplementationOnce(() => { throw new Error('parse-error') })
    const request = { response: { source: 'abc', statusCode: 200 } }
    logResponse(request as RequestLogged)
    expect(spyStringify).toBeCalled()
    expect(logger.info).toBeCalledWith(`AS-Trace - Response: ${inspect(request.response.source)} Status: ${request.response.statusCode}`)
  })

  it('should log if there is no request.response', (): void => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const spyStringify = jest.spyOn(JSON, 'stringify').mockImplementationOnce(() => null as unknown as string)
    const request = { response: { source: 'abc', statusCode: 200 } }
    logResponse(request as RequestLogged)
    expect(spyStringify).toBeCalled()
    expect(logger.info).toBeCalledWith(`AS-Trace - Response: ${request.response.toString()}`)
  })

  describe('SchemeLogger', () => {
    let schemeLogger: SchemeLogger
    beforeEach(() => {
      schemeLogger = new SchemeLogger(logger)
    })

    it('should be well created', () => {
      expect(schemeLogger).toBeTruthy()
    })

    it('should log properly', () => {
      schemeLogger.log('something')
      expect(mocked(logger.log)).toBeCalledWith(logger.level, { msg: 'something' })
    })
    it('should info properly', () => {
      schemeLogger.info('something')
      expect(mocked(logger.log)).toBeCalledWith('info', { msg: 'something' })
    })
    it('should error properly', () => {
      schemeLogger.error('something')
      expect(mocked(logger.log)).toBeCalledWith('error', { msg: 'something' })
    })
    it('should debug properly', () => {
      schemeLogger.debug('something')
      expect(mocked(logger.log)).toBeCalledWith('debug', { msg: 'something' })
    })
    it('should push context properly', () => {
      const pushed = schemeLogger.push({ the: 'context' })
      pushed.info('something')
      expect(mocked(logger.log)).toBeCalledWith(logger.level, { ...{ the: 'context' }, msg: 'something' })
    })
  })
})
