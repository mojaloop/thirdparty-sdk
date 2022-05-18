/* eslint-disable @typescript-eslint/no-namespace */
import { components } from './openapi'
export * as OutboundOpenAPI from './openapi'

export namespace Schemas {
  export type ErrorCode = components['schemas']['ErrorCode']
  export type ErrorDescription = components['schemas']['ErrorDescription']
  export type ExtensionKey = components['schemas']['ExtensionKey']
  export type ExtensionValue = components['schemas']['ExtensionValue']
  export type Extension = components['schemas']['Extension']
  export type ExtensionList = components['schemas']['ExtensionList']
  export type ErrorInformation = components['schemas']['ErrorInformation']
  export type ErrorInformationResponse = components['schemas']['ErrorInformationResponse']
  export type Currency = components['schemas']['Currency']
  export type Amount = components['schemas']['Amount']
  export type Money = components['schemas']['Money']
  export type CorrelationId = components['schemas']['CorrelationId']
  export type PartyIdType = components['schemas']['PartyIdType']
  export type PartyIdentifier = components['schemas']['PartyIdentifier']
  export type PartySubIdOrType = components['schemas']['PartySubIdOrType']
  export type FspId = components['schemas']['FspId']
  export type PartyIdInfo = components['schemas']['PartyIdInfo']
  export type ThirdpartyTransactionPartyLookupRequest = components['schemas']['ThirdpartyTransactionPartyLookupRequest']
  export type MerchantClassificationCode = components['schemas']['MerchantClassificationCode']
  export type PartyName = components['schemas']['PartyName']
  export type FirstName = components['schemas']['FirstName']
  export type MiddleName = components['schemas']['MiddleName']
  export type LastName = components['schemas']['LastName']
  export type PartyComplexName = components['schemas']['PartyComplexName']
  export type DateOfBirth = components['schemas']['DateOfBirth']
  export type PartyPersonalInfo = components['schemas']['PartyPersonalInfo']
  export type AccountAddress = components['schemas']['AccountAddress']
  export type Name = components['schemas']['Name']
  export type Account = components['schemas']['Account']
  export type ThirdpartyTransactionPartyLookupResponseSuccess =
    components['schemas']['ThirdpartyTransactionPartyLookupResponseSuccess']
  export type ThirdpartyTransactionPartyLookupResponseError =
    components['schemas']['ThirdpartyTransactionPartyLookupResponseError']
  export type ThirdpartyTransactionPartyLookupResponse =
    components['schemas']['ThirdpartyTransactionPartyLookupResponse']
  export type ThirdpartyTransactionPartyLookupState = components['schemas']['ThirdpartyTransactionPartyLookupState']
  export type Party = components['schemas']['Party']
  export type PartyIdTypeTPLink = components['schemas']['PartyIdTypeTPLink']
  export type PartyIdInfoTPLink = components['schemas']['PartyIdInfoTPLink']
  export type AmountType = components['schemas']['AmountType']
  export type TransactionScenario = components['schemas']['TransactionScenario']
  export type TransactionSubScenario = components['schemas']['TransactionSubScenario']
  export type TransactionInitiator = components['schemas']['TransactionInitiator']
  export type TransactionInitiatorType = components['schemas']['TransactionInitiatorType']
  export type RefundReason = components['schemas']['RefundReason']
  export type Refund = components['schemas']['Refund']
  export type BalanceOfPayments = components['schemas']['BalanceOfPayments']
  export type TransactionType = components['schemas']['TransactionType']
  export type ThirdpartyTransactionIDInitiateRequest = components['schemas']['ThirdpartyTransactionIDInitiateRequest']
  export type ThirdpartyTransactionIDInitiateState = components['schemas']['ThirdpartyTransactionIDInitiateState']
  export type ThirdpartyTransactionIDInitiateResponseError =
    components['schemas']['ThirdpartyTransactionIDInitiateResponseError']
  export type ThirdpartyRequestsAuthorizationsPostRequest =
    components['schemas']['ThirdpartyRequestsAuthorizationsPostRequest']
  export type ThirdpartyTransactionIDInitiateResponseSuccess =
    components['schemas']['ThirdpartyTransactionIDInitiateResponseSuccess']
  export type ThirdpartyTransactionIDInitiateResponse = components['schemas']['ThirdpartyTransactionIDInitiateResponse']
  export type ThirdpartyTransactionIDApproveRequest = components['schemas']['ThirdpartyTransactionIDApproveRequest']
  export type ThirdpartyTransactionIDApproveState = components['schemas']['ThirdpartyTransactionIDApproveState']
  export type ThirdpartyTransactionIDApproveResponseError =
    components['schemas']['ThirdpartyTransactionIDApproveResponseError']
  export type ThirdpartyTransactionIDApproveResponse = components['schemas']['ThirdpartyTransactionIDApproveResponse']
  export type TransactionRequestState = components['schemas']['TransactionRequestState']
  export type ThirdpartyTransactionIDApproveResponseSuccess =
    components['schemas']['ThirdpartyTransactionIDApproveResponseSuccess']
  export type AccountsIDPutResponse = components['schemas']['AccountsIDPutResponse']
  export type ScopeAction = components['schemas']['ScopeAction']
  export type Scope = components['schemas']['Scope']
  export type ConsentsPostRequestPISP = components['schemas']['ConsentsPostRequestPISP']
  export type LinkingProvidersState = components['schemas']['LinkingProvidersState']
  export type LinkingProvidersResponse = components['schemas']['LinkingProvidersResponse']
  export type LinkingRequestConsentResponse = components['schemas']['LinkingRequestConsentResponse']
  export type LinkingRequestConsentState = components['schemas']['LinkingRequestConsentState']
  export type LinkingRequestConsentPostRequest = components['schemas']['LinkingRequestConsentPostRequest']
  export type LinkingRequestConsentIDAuthenticateRequest =
    components['schemas']['LinkingRequestConsentIDAuthenticateRequest']
  export type LinkingRequestConsentIDAuthenticateState =
    components['schemas']['LinkingRequestConsentIDAuthenticateState']
  export type LinkingRequestConsentIDAuthenticateResponse =
    components['schemas']['LinkingRequestConsentIDAuthenticateResponse']
  export type LinkingRequestConsentIDPassCredentialRequest =
    components['schemas']['LinkingRequestConsentIDPassCredentialRequest']
  export type LinkingRequestConsentIDPassCredentialState =
    components['schemas']['LinkingRequestConsentIDPassCredentialState']
  export type LinkingRequestConsentIDPassCredentialResponse =
    components['schemas']['LinkingRequestConsentIDPassCredentialResponse']
}
