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

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import { Errors } from '@mojaloop/sdk-standard-components'
import { HTTPResponseError } from '~/shared/http-response-error'

/**
 * @function reformatError
 * @description Helper function for formatting error details
 * @param {Error} error object
 * @returns {Promise<MojaloopApiErrorObject>}
 */
async function reformatError (err: Error): Promise<Errors.MojaloopApiErrorObject> {
  if (err instanceof Errors.MojaloopFSPIOPError) {
    return err.toApiErrorObject()
  }

  let mojaloopErrorCode = Errors.MojaloopApiErrorCodes.INTERNAL_SERVER_ERROR

  if (err instanceof HTTPResponseError) {
    const e = err.getData()
    if (e.res && (e.res.body || e.res.data)) {
      if (e.res.body) {
        try {
          const bodyObj = JSON.parse(e.res.body)
          mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${bodyObj.statusCode}`)
        } catch (ex) {
          // do nothing
        }
      } else if (e.res.data) {
        mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${e.res.data.statusCode}`)
      }
    }
  }

  return new Errors.MojaloopFSPIOPError(
    err,
    null as unknown as string,
    null as unknown as string,
    mojaloopErrorCode
  ).toApiErrorObject()
}

export {
  reformatError
}
