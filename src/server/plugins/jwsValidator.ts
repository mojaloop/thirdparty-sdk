/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>
- Kevin Leyow <kevin.leyow@modusbox.com>
--------------
******/

import { Server } from '@hapi/hapi'
import { Errors, Jws, Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import fs, { PathLike } from 'fs'
import path from 'path'
import { ServerApp } from '../create'

function getJwsKeys(fromDir: PathLike | null) {
  const keys: Record<string, Buffer> = {}
  if (fromDir && fromDir instanceof String) {
    fs.readdirSync(fromDir)
      .filter((f) => f.endsWith('.pem'))
      .forEach((f) => {
        const keyName = path.basename(f, '.pem')
        const keyPath = path.join(fromDir as string, f)
        keys[keyName] = fs.readFileSync(keyPath)
      })
  }
  return keys
}

/*
  A Hapi plugin to intercept incoming requests on the inbound server and
  validate requests with `sdk-standard-components` JWS validator.
*/
export const jwsValidatorPlugin = {
  name: 'jws-validator',
  register: function (server: Server) {
    server.ext('onPostAuth', (request, h) => {
      let jwsVerificationKeys: Record<string, Buffer> | Record<string, string>
      const logger = new SDKLogger.Logger()
      if ((server.settings.app as ServerApp).serviceConfig.validateInboundJws) {
        // peerJWSKey is a special config option specifically for Payment Manager for Mojaloop
        // that is populated by a management api.
        // This map supersedes local keys that would be loaded in by jwsVerificationKeysDirectory.
        jwsVerificationKeys = (server.settings.app as ServerApp).serviceConfig.pm4mlEnabled
          ? (server.settings.app as ServerApp).serviceConfig.peerJWSKeys
          : getJwsKeys((server.settings.app as ServerApp).serviceConfig.jwsVerificationKeysDirectory)

        const jwsValidator = new Jws.validator({
          logger,
          validationKeys: jwsVerificationKeys
        })

        try {
          // We don't check signatures on GET requests
          // todo: validate this requirement. No state is mutated by GETs but
          // there are potential security issues if message origin is used to
          // determine permission sets i.e. what is "readable"
          if (request.method !== 'get') {
            logger.push({ request: request, body: request.payload }).log('Validating JWS')
            jwsValidator.validate({
              headers: request.headers,
              body: request.payload as Record<string, unknown>
            })
          }
        } catch (err) {
          logger.push({ err }).log('Inbound request failed JWS validation')
          const response: Record<string, unknown> = {}
          response.status = 400
          if (err instanceof Error) {
            response.body = new Errors.MojaloopFSPIOPError(
              err,
              err.message,
              '',
              Errors.MojaloopApiErrorCodes.INVALID_SIGNATURE
            ).toApiErrorObject()
          }
          return h.response(response).code(400).takeover()
        }
      }

      return h.continue
    })
  }
}

module.exports = {
  jwsValidatorPlugin
}
