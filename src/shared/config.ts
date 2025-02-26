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

 - Paweł Marzec <pawel.marzec@modusbox.com>
 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/

// https://github.com/mozilla/node-convict
import Convict from 'convict'
import PACKAGE from '../../package.json'
import fs, { PathLike } from 'fs'
import path from 'path'
import { BaseRequestTLSConfig } from '@mojaloop/sdk-standard-components'
import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'

export { PACKAGE }

export function getFileContent(path: PathLike): Buffer {
  if (!fs.existsSync(path)) {
    throw new Error("File doesn't exist")
  }
  return fs.readFileSync(path)
}

function getFileListContent(pathList: string): Array<Buffer> {
  return pathList.split(',').map((path) => getFileContent(path))
}
export interface OutConfig {
  host: string
  port: number
  tls: BaseRequestTLSConfig
}

export interface InConfig extends OutConfig {
  pispTransactionMode: boolean
}

export interface ControlConfig {
  mgmtAPIWsUrl: string
  mgmtAPIWsPort: number
}

// interface to represent service configuration
export interface ServiceConfig {
  env: string
  inbound: InConfig
  outbound: OutConfig
  control: ControlConfig
  requestProcessingTimeoutSeconds: number
  wso2: {
    auth: {
      staticToken: string
      tokenEndpoint: string
      clientKey: string
      clientSecret: string
      refreshSeconds: number
    }
  }
  redis: {
    host: string
    port: number
    timeout: number
  }
  inspect: {
    depth: number
    showHidden: boolean
    color: boolean
  }
  shared: {
    peerEndpoint: string
    alsEndpoint?: string
    quotesEndpoint?: string
    transfersEndpoint?: string
    bulkTransfersEndpoint?: string
    servicesEndpoint?: string
    thirdpartyRequestsEndpoint?: string
    transactionRequestEndpoint?: string
    authServiceParticipantId: string
    dfspId: string
    dfspBackendUri: string
    dfspBackendHttpScheme: string
    dfspBackendVerifyAuthorizationPath: string
    dfspBackendVerifyConsentPath: string
    dfspBackendValidateThirdpartyTransactionRequest: string
    dfspBackendGetUserAccountsPath: string
    dfspBackendStoreValidatedConsentForAccountIdPath: string
    dfspTransactionRequestAuthorizationTimeoutSeconds: number
    dfspTransactionRequestVerificationTimeoutSeconds: number
    pispTransactionInitiateTimeoutInSeconds: number
    pispTransactionApproveTimeoutInSeconds: number
    sdkOutgoingUri: string
    sdkOutgoingHttpScheme: string
    sdkOutgoingRequestQuotePath: string
    sdkOutgoingRequestAuthorizationPath: string
    sdkOutgoingRequestTransferPath: string
    sdkRequestToPayTransferUri: string
    sdkOutgoingPartiesInformationPath: string
    sdkNotifyAboutTransferUri: string
    dfspBackendValidateAuthTokenPath: string
    dfspBackendValidateConsReqPath: string
    dfspBackendSendOtpReqPath: string
    dfspBackendStoreConsReqPath: string
    tempOverrideQuotesPartyIdType?: fspiopAPI.Schemas.PartyIdType
    testOverrideConsentId?: string
    testShouldOverrideConsentId: boolean
    testConsentRequestToConsentMap: Record<string, string>
    testOverrideTransactionChallenge?: string
  }
  pm4mlEnabled: boolean
  validateInboundJws: boolean
  jwsSign: boolean
  jwsSigningKey: PathLike
  jwsVerificationKeysDirectory: PathLike | null
  peerJWSKeys: Record<string, string>
}

// Declare configuration schema, default values and bindings to environment variables
export const ConvictConfig = Convict<ServiceConfig>({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test', 'integration', 'e2e'],
    default: 'development',
    env: 'NODE_ENV'
  },
  inbound: {
    host: {
      doc: 'The InboundAPI Hostname/IP address to bind.',
      format: '*',
      default: '0.0.0.0',
      env: 'INBOUND_HOST'
    },
    port: {
      doc: 'The InboundAPI port to bind.',
      format: 'port',
      default: 3001,
      env: 'INBOUND_LISTEN_PORT'
    },
    pispTransactionMode: {
      doc: 'PISPTransactionModel to be used',
      format: 'Boolean',
      default: false,
      env: 'PISP_TRANSACTION_MODE'
    },
    tls: {
      mutualTLS: {
        enabled: {
          doc: 'If set true, will enabled mTls on the inbound server.',
          default: false,
          env: 'INBOUND_MUTUAL_TLS_ENABLED'
        }
      },
      creds: {
        ca: {
          default: '',
          env: 'IN_CA_CERT_PATH'
        },
        cert: {
          default: '',
          env: 'IN_SERVER_CERT_PATH'
        },
        key: {
          default: '',
          env: 'IN_SERVER_KEY_PATH'
        }
      }
    }
  },
  outbound: {
    host: {
      doc: 'The OutboundAPI Hostname/IP address to bind.',
      format: '*',
      default: '0.0.0.0',
      env: 'OUTBOUND_HOST'
    },
    port: {
      doc: 'The OutboundAPI port to bind.',
      format: 'port',
      default: 3002,
      env: 'OUTBOUND_LISTEN_PORT'
    },
    tls: {
      mutualTLS: {
        enabled: {
          doc: 'If set true, will enabled mTls on the outbound server.',
          default: false,
          env: 'OUTBOUND_MUTUAL_TLS_ENABLED'
        }
      },
      creds: {
        ca: {
          default: '',
          env: 'OUT_CA_CERT_PATH'
        },
        cert: {
          default: '',
          env: 'OUT_CLIENT_CERT_PATH'
        },
        key: {
          default: '',
          env: 'OUT_CLIENT_KEY_PATH'
        }
      }
    }
  },
  control: {
    mgmtAPIWsUrl: {
      doc: 'Management API websocket connection host.',
      format: '*',
      default: '127.0.0.1',
      env: 'CONTROL_MGMT_API_WS_URL'
    },
    mgmtAPIWsPort: {
      doc: 'Management API websocket connection port.',
      format: 'port',
      default: 4005,
      env: 'CONTROL_MGMT_API_WS_PORT'
    }
  },
  requestProcessingTimeoutSeconds: {
    doc: 'The timeout for waiting for a response to a request',
    env: 'REQUEST_PROCESSING_TIMEOUT_SECONDS',
    default: 30
  },
  wso2: {
    auth: {
      staticToken: {
        doc: 'The statically defined token',
        format: '*',
        env: 'WSO2_BEARER_TOKEN',
        default: ''
      },
      tokenEndpoint: {
        doc: 'The OAuth server endpoint',
        format: '*',
        env: 'OAUTH_TOKEN_ENDPOINT',
        default: ''
      },
      clientKey: {
        doc: 'The OAuth client KEY',
        format: '*',
        env: 'OAUTH_CLIENT_KEY',
        default: ''
      },
      clientSecret: {
        doc: 'The OAuth client SECRET',
        format: '*',
        env: 'OAUTH_CLIENT_SECRET',
        default: ''
      },
      refreshSeconds: {
        doc: 'The token refresh timeout',
        format: 'nat',
        env: 'OAUTH_REFRESH_SECONDS',
        default: 60
      }
    }
  },
  redis: {
    host: {
      doc: 'The Redis Hostname/IP address to connect.',
      format: '*',
      default: 'localhost',
      env: 'REDIS_HOST'
    },
    port: {
      doc: 'The Redis port to connect.',
      format: 'port',
      default: 6379,
      env: 'REDIS_LISTEN_PORT'
    },
    timeout: {
      doc: 'The Redis connection timeout',
      format: 'nat',
      default: 100,
      env: 'REDIS_TIMEOUT'
    }
  },
  inspect: {
    depth: {
      doc: 'Inspection depth',
      format: 'nat',
      env: 'INSPECT_DEPTH',
      default: 4
    },
    showHidden: {
      doc: 'Show hidden properties',
      format: 'Boolean',
      default: false
    },
    color: {
      doc: 'Show colors in output',
      format: 'Boolean',
      default: true
    }
  },
  shared: {
    peerEndpoint: {
      doc: 'Peer/Switch endpoint',
      format: '*',
      default: '0.0.0.0:4003',
      env: 'PEER_ENDPOINT'
    },
    alsEndpoint: {
      doc: 'ALS endpoint',
      format: '*',
      default: undefined, // '0.0.0.0:4002',
      env: 'ALS_ENDPOINT'
    },
    quotesEndpoint: {
      doc: 'Quotes endpoint',
      format: '*',
      default: undefined, // '0.0.0.0:3002',
      env: 'QUOTES_ENDPOINT'
    },
    transfersEndpoint: {
      doc: 'Peer/Switch endpoint',
      format: '*',
      default: undefined, // '0.0.0.0:3000',
      env: 'TRANSFERS_ENDPOINT'
    },
    bulkTransfersEndpoint: {
      doc: 'Bulk Transfers endpoint',
      format: '*',
      env: 'BULK_TRANSFERS_ENDPOINT',
      default: undefined
    },
    servicesEndpoint: {
      doc: 'Service provider request endpoint',
      format: '*',
      env: 'SERVICES_ENDPOINT',
      default: undefined
    },
    thirdpartyRequestsEndpoint: {
      doc: 'Thirdparty Requests endpoint',
      format: '*',
      env: 'THIRDPARTY_REQUESTS_ENDPOINT',
      default: undefined
    },
    transactionRequestEndpoint: {
      doc: 'Transaction Request endpoint',
      format: '*',
      env: 'TRANSACTION_REQUEST_ENDPOINT',
      default: undefined
    },
    authServiceParticipantId: {
      doc: 'Participant ID of an auth service',
      format: '*',
      default: 'central-auth',
      env: 'AUTH_SERVICE_PARTICIPANT_ID'
    },
    dfspId: {
      doc: 'Id of DFSP',
      format: '*',
      default: 'dfsp_a',
      env: 'DFSP_ID'
    },
    dfspBackendUri: {
      doc: "host address of DFSP's ",
      format: '*',
      default: 'localhost:9000',
      env: 'DFSP_BACKEND_URI'
    },
    dfspBackendHttpScheme: {
      doc: 'Http scheme ',
      format: ['http', 'https'],
      default: 'http',
      env: 'DFSP_BACKEND_HTTP_SCHEME'
    },
    dfspBackendVerifyAuthorizationPath: {
      doc: 'path use by DFSPBackendRequests.verifyAuthorization',
      format: '*',
      default: 'verify-authorization',
      env: 'DFSP_BACKEND_VERIFY_AUTHORIZATION_PATH'
    },
    dfspBackendVerifyConsentPath: {
      doc: 'path use by DFSPBackendRequests.verifyConsent',
      format: '*',
      default: 'verify-consent',
      env: 'DFSP_BACKEND_VERIFY_CONSENT_PATH'
    },
    dfspBackendGetUserAccountsPath: {
      doc: 'path use by DFSPBackendRequests.getUserAccounts',
      format: '*',
      default: 'accounts/{ID}',
      env: 'DFSP_BACKEND_GET_USER_ACCOUNTS_PATH'
    },
    dfspBackendValidateConsReqPath: {
      doc: 'path use by DFSPBackendRequests.validateConsentRequests',
      format: '*',
      default: 'validateConsentRequests',
      env: 'DFSP_BACKEND_VALIDATE_CONS_REQ_PATH'
    },
    dfspBackendSendOtpReqPath: {
      doc: 'path use by DFSPBackendRequests.sendOTP',
      format: '*',
      default: 'sendOTP',
      env: 'DFSP_BACKEND_SEND_OTP_REQ_PATH'
    },
    dfspBackendStoreConsReqPath: {
      doc: 'path use by DFSPBackendRequests.storeConsentRequests',
      format: '*',
      default: 'store/consentRequests/{ID}',
      env: 'DFSP_BACKEND_STORE_CONS_REQ_PATH'
    },
    dfspBackendValidateAuthTokenPath: {
      doc: 'uri to sdk-scheme-adapter validateAuthToken endpoint',
      format: '*',
      default: 'validateAuthToken',
      env: 'DFSP_BACKEND_VALIDATE_AUTH_TOKEN_PATH'
    },
    dfspBackendValidateThirdpartyTransactionRequest: {
      doc: 'path used by DFSPBackendRequests.validateThirdpartyTransactionRequest',
      format: '*',
      default: 'validate-thirdparty-transaction-request',
      env: 'DFSP_BACKEND_VALIDATE_THIRDPARTY_TRANSACTION_REQUEST'
    },
    dfspBackendStoreValidatedConsentForAccountIdPath: {
      doc: 'path use by DFSPBackendRequests.storeValidatedConsentForAccountId',
      format: '*',
      default: 'store/consent',
      env: 'DFSP_BACKEND_STORE_VALIDATED_CONSENT_FOR_ACCOUNT_ID_PATH'
    },
    dfspTransactionRequestAuthorizationTimeoutSeconds: {
      doc: 'Timeout for the DFSP waiting on the PISP response to POST /thirdpartyRequests/authorization',
      format: 'nat',
      default: 100,
      env: 'DFSP_TRANSACTION_REQUEST_AUTHORIZATION_TIMEOUT_SECONDS'
    },
    dfspTransactionRequestVerificationTimeoutSeconds: {
      doc: 'Timeout for the DFSP waiting on the Auth-Service response to POST /thirdpartyRequests/verifications',
      format: 'nat',
      default: 15,
      env: 'DFSP_TRANSACTION_REQUEST_VERIFICATION_TIMEOUT_SECONDS'
    },
    pispTransactionInitiateTimeoutInSeconds: {
      doc: 'Timeout for Transaction Initiate phase',
      format: 'nat',
      default: 30,
      env: 'PISP_TRANSACTION_INITIATE_TIMEOUT_IN_SECONDS'
    },
    pispTransactionApproveTimeoutInSeconds: {
      doc: 'Timeout for Transaction Approve phase',
      format: 'nat',
      default: 30,
      env: 'PISP_TRANSACTION_APPROVE_TIMEOUT_IN_SECOND'
    },
    sdkOutgoingUri: {
      doc: "host address of SDK scheme-adapter Outgoing service's ",
      format: '*',
      default: 'localhost:7002',
      env: 'SDK_OUTGOING_URI'
    },
    sdkOutgoingHttpScheme: {
      doc: 'Http scheme ',
      format: ['http', 'https'],
      default: 'http',
      env: 'SDK_OUTGOING_HTTP_SCHEME'
    },
    sdkOutgoingRequestQuotePath: {
      doc: 'path to sdk outgoing quote sync interface',
      format: '*',
      default: 'quotes',
      env: 'SDK_OUTGOING_REQUEST_QUOTE_PATH'
    },
    sdkOutgoingRequestAuthorizationPath: {
      doc: 'path to sdk outgoing authorization sync interface',
      format: '*',
      default: 'authorizations',
      env: 'SDK_OUTGOING_REQUEST_AUTHORIZATION_PATH'
    },
    sdkOutgoingRequestTransferPath: {
      doc: 'path to sdk outgoing transfer sync interface',
      format: '*',
      default: 'simpleTransfers',
      env: 'SDK_OUTGOING_REQUEST_TRANSFER_PATH'
    },
    sdkRequestToPayTransferUri: {
      doc: 'uri to sdk-scheme-adapter requestToPayTransfer endpoint',
      format: '*',
      default: 'localhost:9000/requestToPayTransfer',
      env: 'SDK_REQUEST_TO_PAY_TRANSFER_URI'
    },
    sdkOutgoingPartiesInformationPath: {
      doc: 'uri to sdk-scheme-adapter requestToPayTransfer endpoint',
      format: '*',
      default: 'localhost:7002/parties/{Type}/{ID}/{SubId}',
      env: 'SDK_OUTGOING_PARTIES_INFORMATION_PATH'
    },
    sdkNotifyAboutTransferUri: {
      doc: 'uri to sdk-scheme-adapter requestToPayTransfer endpoint',
      format: '*',
      default: 'localhost:9000/thirdpartyRequests/transactions/{ID}',
      env: 'SDK_NOTIFY_ABOUT_TRANSFER_URI'
    },
    tempOverrideQuotesPartyIdType: {
      doc: 'DEPRECATED - No longer in use. Implement the backend request validateThirdpartyTransactionRequestAndGetContext instead.',
      format: '*',
      env: 'TEMP_OVERRIDE_QUOTES_PARTY_ID_TYPE',
      default: undefined
    },
    testOverrideConsentId: {
      doc: `DEPRECTAED - use TEST_SHOULD_OVERRIDE_CONSENT_ID and TEST_CONSENT_REQUEST_TO_CONSENT_MAP instead.
If set, this will override the consentId generated by the adapter, this is purely for testing purposes, do NOT use this variable in production`,
      format: '*',
      env: 'TEST_OVERRIDE_CONSENT_ID',
      default: undefined
    },
    testShouldOverrideConsentId: {
      doc: `If true, will generate a deterministic consentId from the consentRequestId -> consentId
mapping in TEST_CONSENT_REQUEST_TO_CONSENT_MAP. If a consentId cannot be found for a consentRequestId,
it will fallback to default behaviour (random consentId)`,
      format: 'Boolean',
      default: false,
      env: 'TEST_SHOULD_OVERRIDE_CONSENT_ID'
    },
    testConsentRequestToConsentMap: {
      doc: 'A map of consentIds to use for a given consentRequestId. This allows automated tests to know in advance the consentId.',
      format: '*',
      default: {},
      env: 'TEST_CONSENT_REQUEST_TO_CONSENT_MAP'
    },
    testOverrideTransactionChallenge: {
      doc: 'If set to a non empty string, the derived challenge will be replaced with this value. This allows automated tests to use pre-signed transaction payloads.',
      format: '*',
      default: undefined,
      env: 'TEST_OVERRIDE_TRANSACTION_CHALLENGE'
    }
  },
  pm4mlEnabled: {
    doc: `If set true, this will run the thirdparty-sdk in PM4ML mode, booting up a web socket client
control.mgmtAPIWsUrl and control.mgmtAPIWsPort that can reconfigure mTLS and JWS related configurations.`,
    default: false,
    env: 'PM4ML_ENABLED'
  },
  validateInboundJws: {
    doc: 'If set true, this will enable a JWS validator on the inbound server to verify messages originated from a certain participant',
    format: 'Boolean',
    default: false,
    env: 'VALIDATE_INBOUND_JWS'
  },
  jwsSign: {
    doc: 'If set true, this will sign outgoing requests using `jwsSigningKey`',
    format: 'Boolean',
    default: false,
    env: 'JWS_SIGN'
  },
  jwsSigningKey: {
    doc: 'The path of a JWS signing key. The contents of the file are then loaded in as a `Buffer`',
    format: '*',
    default: '',
    env: 'JWS_SIGNING_KEY_PATH'
  },
  jwsVerificationKeysDirectory: {
    doc: 'The directory path of peer JWS keys. The contents of the file are then loaded in as a a list of `Buffer`s used to verify that messages originated from a peer.',
    format: '*',
    default: null,
    env: 'JWS_VERIFICATION_KEYS_DIRECTORY'
  },
  peerJWSKeys: {
    doc: `peerJWSKeys is a special config option specifically for Payment Manager for Mojaloop
that is populated by an management api. This map supersedes local keys that would be loaded in by jwsVerificationKeysDirectory.`,
    format: '*',
    default: {}
  }
})

// Load environment dependent configuration
const env = ConvictConfig.get('env')
ConvictConfig.loadFile(path.join(__dirname, `/../../config/${env}.json`))

// Perform configuration validation
ConvictConfig.validate({ allowed: 'strict' })

// Load file contents for keys and secrets
if (ConvictConfig.get('jwsSign')) {
  ConvictConfig.set('jwsSigningKey', getFileContent(ConvictConfig.get().jwsSigningKey))
}

if (ConvictConfig.get('inbound.tls.mutualTLS.enabled')) {
  ConvictConfig.set('inbound.tls.creds.ca', getFileListContent(<string>ConvictConfig.get('inbound').tls.creds.ca))
  ConvictConfig.set('inbound.tls.creds.cert', getFileContent(<string>ConvictConfig.get('inbound').tls.creds.cert))
  ConvictConfig.set('inbound.tls.creds.key', getFileContent(<string>ConvictConfig.get('inbound').tls.creds.key))
}

if (ConvictConfig.get('outbound.tls.mutualTLS.enabled')) {
  ConvictConfig.set('outbound.tls.creds.ca', getFileListContent(<string>ConvictConfig.get('outbound').tls.creds.ca))
  ConvictConfig.set('outbound.tls.creds.cert', getFileContent(<string>ConvictConfig.get('outbound').tls.creds.cert))
  ConvictConfig.set('outbound.tls.creds.key', getFileContent(<string>ConvictConfig.get('outbound').tls.creds.key))
}

// extract simplified config from Convict object
const config: ServiceConfig = {
  env: ConvictConfig.get('env'),
  inbound: ConvictConfig.get('inbound'),
  outbound: ConvictConfig.get('outbound'),
  control: ConvictConfig.get('control'),
  requestProcessingTimeoutSeconds: ConvictConfig.get('requestProcessingTimeoutSeconds'),
  wso2: ConvictConfig.get('wso2'),
  redis: ConvictConfig.get('redis'),
  inspect: ConvictConfig.get('inspect'),
  shared: ConvictConfig.get('shared'),
  pm4mlEnabled: ConvictConfig.get('pm4mlEnabled'),
  validateInboundJws: ConvictConfig.get('validateInboundJws'),
  jwsSign: ConvictConfig.get('jwsSign'),
  jwsSigningKey: ConvictConfig.get('jwsSigningKey'),
  jwsVerificationKeysDirectory: ConvictConfig.get('jwsVerificationKeysDirectory'),
  peerJWSKeys: ConvictConfig.get('peerJWSKeys')
}

export default config
