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

import { PubSub } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { ThirdpartyRequests, Errors } from '@mojaloop/sdk-standard-components';
import {
  v1_1 as fspiopAPI,
  thirdparty as tpAPI
} from '@mojaloop/api-snippets'
import inspect from '~/shared/inspect'
import { HTTPResponseError } from '~/shared/http-response-error'
import {
  DFSPConsentRequestsData,
  DFSPConsentRequestsStateMachine,
  DFSPConsentRequestsModelConfig
  //BackendValidateConsentRequestsResponse
} from '~/models/inbound/dfspConsentRequests.interface'
import { DFSPBackendRequests } from '~/shared/dfsp-backend-requests'

// DFSPConsentRequestsModel is the passive inbound handler for inbound
// POST /consentRequests requests and no response is generated from `model.run()`
export class DFSPConsentRequestsModel
  extends PersistentModel<DFSPConsentRequestsStateMachine, DFSPConsentRequestsData> {
  protected config: DFSPConsentRequestsModelConfig

  constructor (
    data: DFSPConsentRequestsData,
    config: DFSPConsentRequestsModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'validateRequest', from: 'start', to: 'RequestIsValid' },
        { name: 'storeReqAndSendOTP', from: 'RequestIsValid', to: 'success' }
      ],
      methods: {
        // specific transitions handlers methods
        onValidateRequest: () => this.onValidateRequest(),
        onStoreReqAndSendOTP: () => this.onStoreReqAndSendOTP()
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get pubSub (): PubSub {
    return this.config.pubSub
  }

  get dfspBackendRequests (): DFSPBackendRequests {
    return this.config.dfspBackendRequests
  }

  get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  async onValidateRequest (): Promise<void> {
    const { request, toParticipantId } = this.data

    try {
      const response = await this.dfspBackendRequests.validateConsentRequests(request)

      if (!response) {
        throw new Errors.MojaloopFSPIOPError(
          null as unknown as string,
          null as unknown as string,
          null as unknown as string,
          Errors.MojaloopApiErrorCodes.TP_FSP_CONSENT_SCOPES_ERROR
        )
      }

      if (!response.isValid) {
        throw new Errors.MojaloopFSPIOPError(
          null as unknown as string,
          null as unknown as string,
          null as unknown as string,
          Errors.MojaloopApiErrorCodes.TP_NO_SUPPORTED_SCOPE_ACTIONS
        )
      }

      this.data.response = response
      if (response.authChannels.includes('WEB')) {
        const webConsentRequestResponse: tpAPI.Schemas.ConsentRequestsIDPutResponseWeb = {
          scopes: request.scopes,
          callbackUri: request.callbackUri,
          authChannels: ['WEB'],
          authUri: response.authUri!,
          initiatorId: toParticipantId
        }
        await this.thirdpartyRequests.putConsentRequests(request.id, webConsentRequestResponse, toParticipantId)
      } else {
        const otpConsentRequestResponse: tpAPI.Schemas.ConsentRequestsIDPutResponseOTP = {
          scopes: request.scopes,
          callbackUri: request.callbackUri,
          authChannels: ['OTP'],
          initiatorId: toParticipantId
        }
        await this.thirdpartyRequests.putConsentRequests(request.id, otpConsentRequestResponse, toParticipantId)
      }

    } catch (error) {
      const mojaloopError = this.reformatError(error)

      this.logger.push({ error }).error('start -> RequestIsValid')
      this.logger.push({ mojaloopError }).info(`Sending error response to ${toParticipantId}`)

      await this.thirdpartyRequests.putConsentRequestsError(
        request.id,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )

      // throw error to stop state machine
      throw error
    }
  }

  async onStoreReqAndSendOTP (): Promise<void> {
    const { request, response } = this.data

    try {
      if (response?.authChannels.includes('WEB')) {
        await this.dfspBackendRequests.storeConsentRequests(request)
      } else {
        await this.dfspBackendRequests.sendOTP(request)
      }

    } catch (error) {
      this.logger.push({ error }).error('RequestIsValid -> success')
      // throw error to stop state machine
      throw error
    }
  }

  reformatError (err: Error): Errors.MojaloopApiErrorObject {
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

  /**
   * runs the workflow
   */
  async run (): Promise<void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          await this.saveToKVS()
          this.logger.info(
            `validateRequest requested for ${data.request.id},  currentState: ${data.currentState}`
          )
          await this.fsm.validateRequest()
          await this.saveToKVS()
          return this.run();

        case 'RequestIsValid':
          this.logger.info(
            `storeReqAndSendOTP requested for ${data.request.id},  currentState: ${data.currentState}`
          )
          await this.fsm.storeReqAndSendOTP()
          await this.saveToKVS()
          return this.run()

        default:
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running DFSPConsentRequestsModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a consentReqState property here!
        if (err.consentReqState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between consentReqState.lastError and err
        err.consentReqState = { ...this.data }
      }
      throw err
    }
  }
}

export async function existsInKVS (config: DFSPConsentRequestsModelConfig): Promise<boolean> {
  return config.kvs.exists(config.key)
}

export async function create (
  data: DFSPConsentRequestsData,
  config: DFSPConsentRequestsModelConfig
): Promise<DFSPConsentRequestsModel> {
  // create a new model
  const model = new DFSPConsentRequestsModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: DFSPConsentRequestsModelConfig
): Promise<DFSPConsentRequestsModel> {
  try {
    const data = await config.kvs.get<DFSPConsentRequestsData>(config.key)
    if (!data) {
      throw new Error(`No data found in KVS for: ${config.key}`)
    }
    config.logger.push({ data }).info('data loaded from KVS')
    return create(data, config)
  } catch (err) {
    config.logger.push({ err }).info(`Error loading data from KVS for key: ${config.key}`)
    throw err
  }
}

export default {
  DFSPConsentRequestsModel,
  existsInKVS,
  create,
  loadFromKVS
}
