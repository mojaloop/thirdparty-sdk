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

 - Kevin Leyow - kevin.leyow@modusbox.com
 --------------
 ******/


import {
  Logger as SDKLogger,
  ThirdpartyRequests,
  Errors
} from '@mojaloop/sdk-standard-components'
import {
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import { HTTPResponseError } from '~/shared/http-response-error'
import { uuid } from '../../../test/unit/__mocks__/uuidv4';
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests';


export interface ValidateOTPResponse {
  isValid: boolean
}

export interface InboundConsentRequestsRequestModelConfig {
  logger: SDKLogger.Logger
  dfspBackendRequests: DFSPBackendRequests
  thirdpartyRequests: ThirdpartyRequests
}

export class InboundConsentRequestsRequestModel {
  protected config: InboundConsentRequestsRequestModelConfig

  constructor (config: InboundConsentRequestsRequestModelConfig) {
    this.config = config
  }

  protected get logger (): SDKLogger.Logger {
    return this.config.logger
  }

  protected get dfspBackendRequests (): DFSPBackendRequests {
    return this.config.dfspBackendRequests
  }

  protected get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  async postConsentsRequest (
    consentRequestsRequestId: string,
    srcDfspId: string,
    authToken: string
  ): Promise<void> {
    try {
      const isValidOTP = await this.dfspBackendRequests.validateOTPSecret(consentRequestsRequestId, authToken)
      if (!isValidOTP) {
        throw new Error('No response returned')
      }
      if (!isValidOTP.isValid) {
        throw new Error('Invalid OTP')
      }
      const scopesGranted = await this.dfspBackendRequests.getScopes(consentRequestsRequestId)
      if (!scopesGranted || scopesGranted.length < 1) {
        throw new Error('InvalidAuthToken')
      }

      const postConsentRequestsPayload: tpAPI.Schemas.ConsentsPostRequest = {
        consentId: uuid(),
        consentRequestId: consentRequestsRequestId,
        scopes: scopesGranted
      }
      await this.thirdpartyRequests.postConsents(
        postConsentRequestsPayload,
        srcDfspId
      )
    } catch (err) {
      this.logger.push({ err }).error('Error in patchConsentRequest @ Inbound')
      const mojaloopError = this.reformatError(err)
      this.logger.push({ mojaloopError }).info(`Sending error response to ${srcDfspId}`)
      // TODO: handle error. putConsentRequestsError needs to be added to
      //       sdk-standard-components
      // TODO: identify the errorCodes to match the error scenarios
      // await this.thirdpartyRequests.putConsentRequestsError(
      //  consentRequestsRequestId,
      //  mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
      //  srcDfspId
    }
  }

  protected reformatError (err: Error): Errors.MojaloopApiErrorObject {
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
            this.logger.push({ ex }).error('Error parsing error message body as JSON')
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
}
