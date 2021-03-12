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

 - Sridhar Voruganti - sridhar.voruganti@modusbox.com
 --------------
 ******/

import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'
import {
  Logger as SDKLogger,
  ThirdpartyRequests,
  Errors
} from '@mojaloop/sdk-standard-components'
import {
  v1_1 as fspiopAPI
} from '@mojaloop/api-snippets'
import { HTTPResponseError } from '~/shared/http-response-error'

export interface InboundAccountsModelConfig {
  logger: SDKLogger.Logger
  dfspBackendRequests: DFSPBackendRequests
  thirdpartyRequests: ThirdpartyRequests
}

export class InboundAccountsModel {
  protected config: InboundAccountsModelConfig

  constructor (config: InboundAccountsModelConfig) {
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

  async getUserAccounts (userId: string, srcDfspId: string): Promise<void> {
    try {
      const userAccounts = await this.dfspBackendRequests.getUserAccounts(userId)
      if (!userAccounts) {
        throw new Error('No user accounts found for the specified userId')
      }

      await this.thirdpartyRequests.putAccounts(userId, userAccounts, srcDfspId)
    } catch (err) {
      this.logger.push({ err }).error('Error in getUserAccounts @ Inbound')
      const mojaloopError = this.reformatError(err)
      this.logger.push({ mojaloopError }).info(`Sending error response to ${srcDfspId}`)
      await this.thirdpartyRequests.putAccountsError(
        userId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        srcDfspId
      )
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
            mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${bodyObj?.statusCode}`)
          } catch (ex) {
            // do nothing
            this.logger.push({ ex }).error('Error parsing error message body as JSON')
          }
        } else if (e.res.data) {
          mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${e.res.data?.statusCode}`)
        }
      }
    }
    return new Errors.MojaloopFSPIOPError(
      err,
      'Error1 in getUserAccounts @ Inbound' as unknown as string,
      null as unknown as string,
      mojaloopErrorCode
    ).toApiErrorObject()
  }
}
