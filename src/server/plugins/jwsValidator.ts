/* eslint-disable @typescript-eslint/ban-ts-comment */

import { Server } from '@hapi/hapi'
// @ts-ignore
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

export const jwsValidatorPlugin = {
  name: 'jws-validator',
  register: function (server: Server) {
    server.ext('onPostAuth', (request, h) => {
      let jwsVerificationKeys: Record<string, Buffer>
      const logger = new SDKLogger.Logger()

      if ((server.settings.app as ServerApp).serviceConfig.validateInboundJws) {
        // Is jws verification a pm4ml only feature? double check why the sdk-scheme-adapter has this
        // conditional.
        jwsVerificationKeys = (server.settings.app as ServerApp).serviceConfig.pm4mlEnabled
          ? getJwsKeys((server.settings.app as ServerApp).serviceConfig.jwsVerificationKeysDirectory)
          : {}

        // @ts-ignore
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
            jwsValidator.validate(
              {
                headers: request.headers,
                body: request.payload
              },
              logger
            )
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
