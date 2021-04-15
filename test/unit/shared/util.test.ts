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
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { reformatError, mkMojaloopFSPIOPError } from '~/shared/util'
import { HTTPResponseError } from '~/shared/http-response-error'
import { Errors } from '@mojaloop/sdk-standard-components'

describe('shared/reformatError', (): void => {
  it('reformating of generic Error', async () => {
    const expected = {
      errorInformation: {
        errorCode: '2001',
        errorDescription: 'Internal server error'
      }
    }

    const result = await reformatError(new Error('generic-error'))
    expect(result).toEqual(expected)
  })

  it('reformating of exception when res.body present', async () => {
    const expected = {
      errorInformation: {
        errorCode: '2003',
        errorDescription: 'Service currently unavailable'
      }
    }

    const result = await reformatError(new HTTPResponseError({
      msg: 'mocked-error',
      res: {
        body: JSON.stringify({ statusCode: '2003' })
      }
    }))
    expect(result).toEqual(expected)
  })

  it('reformating of exception when res.data present and using different statusCode', async () => {
    const expected = {
      errorInformation: {
        errorCode: '2002',
        errorDescription: 'Not implemented'
      }
    }

    const result = await reformatError(new HTTPResponseError({
      msg: 'mocked-error',
      res: {
        data: { statusCode: '2002' }
      }
    }))
    expect(result).toEqual(expected)
  })

  it('reformating of exception type MojaloopFSPIOPError', async () => {
    const expected = {
      errorInformation: {
        errorCode: '7204',
        errorDescription: 'FSP does not support any requested scope actions'
      }
    }

    const result = await reformatError(new Errors.MojaloopFSPIOPError('', '', '', Errors.MojaloopApiErrorCodes.TP_NO_SUPPORTED_SCOPE_ACTIONS
    ))
    expect(result).toEqual(expected)
  })

})
describe('shared/mkMojaloopFSPIOPError', (): void => {
  it('mkMojaloopFSPIOPError', () => {
    const errorObj = mkMojaloopFSPIOPError(Errors.MojaloopApiErrorCodeFromCode('7204'))
    expect(errorObj.apiErrorCode.code).toEqual('7204')
    expect(errorObj.apiErrorCode.message).toEqual('FSP does not support any requested scope actions')
  })
})