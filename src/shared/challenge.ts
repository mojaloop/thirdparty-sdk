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

 - Lewis Daly <lewisd@crosslaketech.com>
 --------------
 ******/

import { thirdparty as tpAPI } from '@mojaloop/api-snippets'
import { canonicalize } from 'json-canonicalize'
import sha256 from 'crypto-js/sha256'
import config from './config'
import { logger } from './logger'

// copy of ThirdpartyRequestsAuthorizationsPostRequest, without extensions or challenge
export interface AuthRequestPartial {
  authorizationRequestId: string,
  transactionRequestId: string,
  transferAmount: tpAPI.Schemas.Money
  payeeReceiveAmount: tpAPI.Schemas.Money
  fees: tpAPI.Schemas.Money
  payer: tpAPI.Schemas.PartyIdInfo
  payee: tpAPI.Schemas.Party
  transactionType: tpAPI.Schemas.TransactionType
  expiration: string
}

/**
 * @function deriveTransactionChallenge
 * @description Derive a 'meaningful' challenge based on the
 *  authorization object. The DFSP can decide how to do this
 *
 *  We recommend to use a SHA256(canonicalJSON(AuthRequestPartial)),
 *  where AuthRequestPartial is the payload of POST /thirdpartyRequests/authorizations
 *  without the extensions or challenge fields
 */
export function deriveTransactionChallenge (authRequestPartial: AuthRequestPartial): string {
  if (config.SHARED.TEST_OVERRIDE_TRANSACTION_CHALLENGE && config.SHARED.TEST_OVERRIDE_TRANSACTION_CHALLENGE !== '') {
    logger.warn('TEST_OVERRIDE_TRANSACTION_CHALLENGE is configured - for testing purposes only')
    return config.SHARED.TEST_OVERRIDE_TRANSACTION_CHALLENGE
  }

  const cJSONRequest = canonicalize(authRequestPartial)
  const hash = sha256(cJSONRequest)
  return hash.toString()
}
