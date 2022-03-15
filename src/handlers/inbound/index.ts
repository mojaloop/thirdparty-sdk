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

 - Paweł Marzec <pawel.marzec@modusbox.com>
 - Kevin Leyow <kevin.leyow@modusbox.com>
 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/
import ThirdpartyRequestsTransactions from './thirdpartyRequests/transactions'
import ThirdpartyRequestsAuthorizations from './thirdpartyRequests/authorizations'
import ThirdpartyRequestsVerifications from './thirdpartyRequests/verifications'
import InboundConsents from './consents'
import InboundConsentsId from './consents/{ID}'
import InboundConsentsIdError from './consents/{ID}/error'
import InboundConsentRequests from './consentRequests'
import InboundConsentRequestsId from './consentRequests/{ID}'
import InboundConsentRequestsIdError from './consentRequests/{ID}/error'
import NotifyThirdpartyTransactionRequests from './thirdpartyRequests/transactions/{ID}'
import ThirdpartyTransactionRequestsError from './thirdpartyRequests/transactions/{ID}/error'
import InboundAccounts from './accounts/{ID}'
import InboundAccountsError from './accounts/{ID}/error'
import InboundServices from './services/{ServiceType}'
import InboundServicesError from './services/{ServiceType}/error'
import ParticipantsID from './participants/{ID}'
import ParticipantsIDError from './participants/{ID}/error'
import ParticipantsTypeID from './participants/{Type}/{ID}'
import ParticipantsTypeIDError from './participants/{Type}/{ID}/error'

export default {
  CreateThirdpartyTransactionRequests: ThirdpartyRequestsTransactions.post,
  NotifyThirdpartyTransactionRequests: NotifyThirdpartyTransactionRequests.patch,
  UpdateThirdPartyTransactionRequests: NotifyThirdpartyTransactionRequests.put,
  ThirdpartyTransactionRequestsError: ThirdpartyTransactionRequestsError.put,
  GetAccountsByUserId: InboundAccounts.get,
  UpdateAccountsByUserId: InboundAccounts.put,
  UpdateAccountsByUserIdError: InboundAccountsError.put,
  CreateConsentRequest: InboundConsentRequests.post,
  PatchConsentRequest: InboundConsentRequestsId.patch,
  UpdateConsentRequest: InboundConsentRequestsId.put,
  NotifyErrorConsentRequests: InboundConsentRequestsIdError.put,
  PostConsents: InboundConsents.post,
  PutServicesByServiceType: InboundServices.put,
  PutServicesByServiceTypeAndError: InboundServicesError.put,
  PatchConsentByID: InboundConsentsId.patch,
  PutConsentByID: InboundConsentsId.put,
  NotifyErrorConsents: InboundConsentsIdError.put,
  PutParticipantsByID: ParticipantsID.put,
  PutParticipantsByIDAndError:  ParticipantsIDError.put,
  ParticipantsByTypeAndID3: ParticipantsTypeID.put,
  ParticipantsErrorByTypeAndID: ParticipantsTypeIDError.put,
  PostThirdpartyRequestsAuthorizations: ThirdpartyRequestsAuthorizations.post,
  PutThirdpartyRequestsAuthorizationsById: ThirdpartyRequestsAuthorizations.put,
  PutThirdpartyRequestsAuthorizationsByIdAndError: ThirdpartyRequestsAuthorizations.put,
  PutThirdpartyRequestsVerificationsById: ThirdpartyRequestsVerifications.put,
  PutThirdpartyRequestsVerificationsByIdAndError: ThirdpartyRequestsVerifications.put,
}
