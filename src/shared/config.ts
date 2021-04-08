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
 --------------
 ******/

// https://github.com/mozilla/node-convict
import Convict from 'convict'
import PACKAGE from '../../package.json'
import fs, { PathLike } from 'fs'
import path from 'path'
import { BaseRequestTLSConfig } from '@mojaloop/sdk-standard-components'

export { PACKAGE }

export function getFileContent (path: PathLike): Buffer {
  if (!fs.existsSync(path)) {
    throw new Error('File doesn\'t exist')
  }
  return fs.readFileSync(path)
}

function getFileListContent (pathList: string): Array<Buffer> {
  return pathList.split(',').map((path) => getFileContent(path))
}

export interface OutConfig {
  HOST: string
  PORT: number
}

export interface InConfig extends OutConfig{
  PISP_TRANSACTION_MODE: boolean
}

// interface to represent service configuration
export interface ServiceConfig {
  ENV: string
  INBOUND: InConfig
  OUTBOUND: OutConfig
  REQUEST_PROCESSING_TIMEOUT_SECONDS: number
  WSO2_AUTH: {
    staticToken: string
    tokenEndpoint: string
    clientKey: string
    clientSecret: string
    refreshSeconds: number
  }
  REDIS: {
    HOST: string
    PORT: number
    TIMEOUT: number
  }
  INSPECT: {
    DEPTH: number
    SHOW_HIDDEN: boolean
    COLOR: boolean
  }
  SHARED: {
    PEER_ENDPOINT: string
    ALS_ENDPOINT?: string
    QUOTES_ENDPOINT?: string
    TRANSFERS_ENDPOINT?: string
    BULK_TRANSFERS_ENDPOINT?: string
    THIRDPARTY_REQUESTS_ENDPOINT?: string
    TRANSACTION_REQUEST_ENDPOINT?: string
    DFSP_ID: string
    DFSP_BACKEND_URI: string
    DFSP_BACKEND_HTTP_SCHEME: string
    DFSP_BACKEND_VERIFY_AUTHORIZATION_PATH: string
    DFSP_BACKEND_VERIFY_CONSENT_PATH: string
    DFSP_BACKEND_VALIDATE_THIRDPARTY_TRANSACTION_REQUEST: string
    DFSP_BACKEND_GET_USER_ACCOUNTS_PATH: string
    PISP_BACKEND_URI: string
    PISP_BACKEND_HTTP_SCHEME: string
    PISP_BACKEND_SIGN_AUTHORIZATION_PATH: string
    PISP_TRANSACTION_INITIATE_TIMEOUT_IN_SECONDS: number
    PISP_TRANSACTION_APPROVE_TIMEOUT_IN_SECONDS: number
    SDK_OUTGOING_URI: string
    SDK_OUTGOING_HTTP_SCHEME: string
    SDK_REQUEST_TO_PAY_TRANSFER_URI: string
    SDK_PARTIES_INFORMATION_URI: string
    SDK_NOTIFY_ABOUT_TRANSFER_URI: string
    DFSP_BACKEND_VALIDATE_OTP_PATH: string
    DFSP_BACKEND_GET_SCOPES_PATH: string
    JWS_SIGN: boolean
    JWS_SIGNING_KEY: PathLike | Buffer
    TLS: BaseRequestTLSConfig
  }
}

// Declare configuration schema, default values and bindings to environment variables
export const ConvictConfig = Convict<ServiceConfig>({
  ENV: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test', 'integration', 'e2e'],
    default: 'development',
    env: 'NODE_ENV'
  },
  INBOUND: {
    HOST: {
      doc: 'The InboundAPI Hostname/IP address to bind.',
      format: '*',
      default: '0.0.0.0',
      env: 'INBOUND_HOST'
    },
    PORT: {
      doc: 'The InboundAPI port to bind.',
      format: 'port',
      default: 3001,
      env: 'INBOUND_PORT'
    },
    PISP_TRANSACTION_MODE: {
      doc: 'PISPTransactionModel to be used',
      format: 'Boolean',
      default: false,
      env: 'PISP_TRANSACTION_MODE'
    }
  },
  OUTBOUND: {
    HOST: {
      doc: 'The OutboundAPI Hostname/IP address to bind.',
      format: '*',
      default: '0.0.0.0',
      env: 'OUTBOUND_HOST'
    },
    PORT: {
      doc: 'The OutboundAPI port to bind.',
      format: 'port',
      default: 3002,
      env: 'OUTBOUND_PORT'
    }
  },
  REQUEST_PROCESSING_TIMEOUT_SECONDS: {
    doc: 'The timeout for waiting for a response to a request',
    env: 'REQUEST_PROCESSING_TIMEOUT_SECONDS',
    default: 30
  },
  WSO2_AUTH: {
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
  },
  REDIS: {
    HOST: {
      doc: 'The Redis Hostname/IP address to connect.',
      format: '*',
      default: 'localhost',
      env: 'REDIS_HOST'
    },
    PORT: {
      doc: 'The Redis port to connect.',
      format: 'port',
      default: 6379,
      env: 'REDIS_PORT'
    },
    TIMEOUT: {
      doc: 'The Redis connection timeout',
      format: 'nat',
      default: 100,
      env: 'REDIS_TIMEOUT'
    }
  },
  INSPECT: {
    DEPTH: {
      doc: 'Inspection depth',
      format: 'nat',
      env: 'INSPECT_DEPTH',
      default: 4
    },
    SHOW_HIDDEN: {
      doc: 'Show hidden properties',
      format: 'Boolean',
      default: false
    },
    COLOR: {
      doc: 'Show colors in output',
      format: 'Boolean',
      default: true
    }
  },
  SHARED: {
    PEER_ENDPOINT: {
      doc: 'Peer/Switch endpoint',
      format: '*',
      default: '0.0.0.0:4003',
      env: 'PEER_ENDPOINT'
    },
    ALS_ENDPOINT: {
      doc: 'ALS endpoint',
      format: '*',
      default: undefined, // '0.0.0.0:4002',
      env: 'ALS_ENDPOINT'
    },
    QUOTES_ENDPOINT: {
      doc: 'Quotes endpoint',
      format: '*',
      default: undefined, // '0.0.0.0:3002',
      env: 'QUOTES_ENDPOINT'
    },
    TRANSFERS_ENDPOINT: {
      doc: 'Peer/Switch endpoint',
      format: '*',
      default: undefined, // '0.0.0.0:3000',
      env: 'TRANSFERS_ENDPOINT'
    },
    BULK_TRANSFERS_ENDPOINT: {
      doc: 'Bulk Transfers endpoint',
      format: '*',
      env: 'BULK_TRANSFERS_ENDPOINT',
      default: undefined
    },
    THIRDPARTY_REQUESTS_ENDPOINT: {
      doc: 'Thirdparty Requests endpoint',
      format: '*',
      env: 'THIRDPARTY_REQUESTS_ENDPOINT',
      default: undefined
    },
    TRANSACTION_REQUEST_ENDPOINT: {
      doc: 'Transaction Request endpoint',
      format: '*',
      env: 'TRANSACTION_REQUEST_ENDPOINT',
      default: undefined
    },
    DFSP_ID: {
      doc: 'Id of DFSP',
      format: '*',
      default: 'dfsp_a'
    },
    DFSP_BACKEND_URI: {
      doc: 'host address of DFSP\'s ',
      format: '*',
      default: 'localhost:9000'
    },
    DFSP_BACKEND_HTTP_SCHEME: {
      doc: 'Http scheme ',
      format: ['http', 'https'],
      default: 'http'
    },
    DFSP_BACKEND_VERIFY_AUTHORIZATION_PATH: {
      doc: 'path use by DFSPBackendRequests.verifyAuthorization',
      format: '*',
      default: 'verify-authorization'
    },
    DFSP_BACKEND_VERIFY_CONSENT_PATH: {
      doc: 'path use by DFSPBackendRequests.verifyConsent',
      format: '*',
      default: 'verify-consent'
    },
    DFSP_BACKEND_GET_USER_ACCOUNTS_PATH: {
      doc: 'path use by DFSPBackendRequests.getUserAccounts',
      format: '*',
      default: 'accounts/{ID}'
    },
    DFSP_BACKEND_VALIDATE_OTP_PATH: {
      doc: 'uri to sdk-scheme-adapter validateOTP endpoint',
      format: '*',
      default: 'validateOTP'
    },
    DFSP_BACKEND_GET_SCOPES_PATH: {
      doc: 'uri to sdk-scheme-adapter getScopes endpoint',
      format: '*',
      default: 'scopes/{ID}'
    },
    DFSP_BACKEND_VALIDATE_THIRDPARTY_TRANSACTION_REQUEST: {
      doc: 'path used by DFSPBackendRequests.validateThirdpartyTransactionRequest',
      format: '*',
      default: 'validate-thirdparty-transaction-request'
    },
    PISP_BACKEND_URI: {
      doc: 'host address of DFSP\'s ',
      format: '*',
      default: 'localhost:9000'
    },
    PISP_BACKEND_SIGN_AUTHORIZATION_PATH: {
      doc: 'path use by PISPBackendRequests.signAuthorization',
      format: '*',
      default: 'signchallenge'
    },
    PISP_BACKEND_HTTP_SCHEME: {
      doc: 'Http scheme ',
      format: ['http', 'https'],
      default: 'http'
    },
    PISP_TRANSACTION_INITIATE_TIMEOUT_IN_SECONDS: {
      doc: 'Timeout for Transaction Initiate phase',
      format: 'nat',
      default: 3
    },
    PISP_TRANSACTION_APPROVE_TIMEOUT_IN_SECONDS: {
      doc: 'Timeout for Transaction Approve phase',
      format: 'nat',
      default: 3
    },
    SDK_OUTGOING_URI: {
      doc: 'host address of SDK scheme-adapter Outgoing service\'s ',
      format: '*',
      default: 'localhost:7002'
    },
    SDK_OUTGOING_HTTP_SCHEME: {
      doc: 'Http scheme ',
      format: ['http', 'https'],
      default: 'http'
    },
    SDK_REQUEST_TO_PAY_TRANSFER_URI: {
      doc: 'uri to sdk-scheme-adapter requestToPayTransfer endpoint',
      format: '*',
      default: 'localhost:9000/requestToPayTransfer'
    },
    SDK_PARTIES_INFORMATION_URI: {
      doc: 'uri to sdk-scheme-adapter requestToPayTransfer endpoint',
      format: '*',
      default: 'localhost:7002/parties/{Type}/{ID}/{SubId}'
    },
    SDK_NOTIFY_ABOUT_TRANSFER_URI: {
      doc: 'uri to sdk-scheme-adapter requestToPayTransfer endpoint',
      format: '*',
      default: 'localhost:9000/thridpartyRequests/transactions/{ID}'
    },
    JWS_SIGN: false,
    JWS_SIGNING_KEY: '',
    // Todo: Investigate proper key setup
    TLS: {
      mutualTLS: {
        enabled: false
      },
      creds: {
        ca: '',
        cert: '',
        key: ''
      }
    }
  }
})

// Load environment dependent configuration
const env = ConvictConfig.get('ENV')
ConvictConfig.loadFile(path.join(__dirname, `/../../config/${env}.json`))

// Perform configuration validation
ConvictConfig.validate({ allowed: 'strict' })

// Load file contents for keys and secrets
ConvictConfig.set('SHARED.JWS_SIGNING_KEY', getFileContent(ConvictConfig.get('SHARED').JWS_SIGNING_KEY))

// Note: Have not seen these be comma separated value strings. mimicking sdk-scheme-adapter for now
ConvictConfig.set(
  'SHARED.TLS.creds.ca',
  getFileListContent(<string> ConvictConfig.get('SHARED').TLS.creds.ca)
)
ConvictConfig.set(
  'SHARED.TLS.creds.cert',
  getFileListContent(<string> ConvictConfig.get('SHARED').TLS.creds.cert)
)
ConvictConfig.set(
  'SHARED.TLS.creds.key',
  getFileListContent(<string> ConvictConfig.get('SHARED').TLS.creds.key)
)

// extract simplified config from Convict object
const config: ServiceConfig = {
  ENV: ConvictConfig.get('ENV'),
  INBOUND: ConvictConfig.get('INBOUND'),
  OUTBOUND: ConvictConfig.get('OUTBOUND'),
  REQUEST_PROCESSING_TIMEOUT_SECONDS: ConvictConfig.get('REQUEST_PROCESSING_TIMEOUT_SECONDS'),
  WSO2_AUTH: ConvictConfig.get('WSO2_AUTH'),
  REDIS: ConvictConfig.get('REDIS'),
  INSPECT: ConvictConfig.get('INSPECT'),
  SHARED: ConvictConfig.get('SHARED')
}

export default config
