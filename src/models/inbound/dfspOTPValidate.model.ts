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
  DFSPOTPValidateData,
  DFSPOTPValidateStateMachine,
  DFSPOTPValidateModelConfig,
  BackendValidateOTPResponse,
} from './dfspOTPValidate.interface';
import { DFSPBackendRequests } from '../../shared/dfsp-backend-requests';
import { uuid } from 'uuidv4'

// DFSPOTPValidateModel is the passive inbound handler for inbound
// PATCH /consentRequests/{ID} requests and no response is generated from
// `model.run()`
export class DFSPOTPValidateModel
  extends PersistentModel<DFSPOTPValidateStateMachine, DFSPOTPValidateData> {
  protected config: DFSPOTPValidateModelConfig

  constructor (
    data: DFSPOTPValidateData,
    config: DFSPOTPValidateModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'validateOTP', from: 'start', to: 'OTPIsValid' },
        { name: 'requestScopes', from: 'OTPIsValid', to: 'scopesReceived' },
        { name: 'registerConsent', from: 'scopesReceived', to: 'consentSent' },
      ],
      methods: {
        // specific transitions handlers methods
        onValidateOTP: () => this.onValidateOTP(),
        onRequestScopes: () => this.onRequestScopes(),
        onRegisterConsent: () => this.onRegisterConsent()
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

  // this is only used in the registerConsent step since that is the only transition
  // that uses a pub/sub call.
  static notificationChannel (consentRequestId: string): string {
    if (!consentRequestId) {
      throw new Error('DFSPOTPValidateModel.notificationChannel: \'consentId\' parameter is required')
    }
    // channel name
    return `dfspOTPValidate_${consentRequestId}`
  }

  async onValidateOTP (): Promise<void> {
    const { consentRequestsRequestId, authToken, toParticipantId } = this.data

    try {
      const isValidOTP = await this.dfspBackendRequests.validateOTPSecret(
        consentRequestsRequestId,
        authToken
      ) as BackendValidateOTPResponse

      if (!isValidOTP) {
        throw new Error('No response returned')
      }

      if (!isValidOTP.isValid) {
        throw new Error('Invalid OTP')
      }
    } catch (error) {
      const mojaloopError = this.reformatError(error)

      this.logger.push({ error }).error('start -> OTPIsValid')
      this.logger.push({ mojaloopError }).info(`Sending error response to ${toParticipantId}`)

      // note: this is an error code scenario that will need to be addressed.
      //       something along the lines 6xxx "OTP failed validation"
      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestsRequestId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )
      // throw error to stop state machine
      throw error
    }
  }

  async onRequestScopes(): Promise<void> {
    const { consentRequestsRequestId, toParticipantId } = this.data

    try {
      const scopesGranted = await this.dfspBackendRequests.getScopes(consentRequestsRequestId)

      if (!scopesGranted || scopesGranted.scopes.length < 1) {
        throw new Error('InvalidAuthToken')
      }

      this.data.scopes = scopesGranted
    } catch (error) {
      const mojaloopError = this.reformatError(error)

      this.logger.push({ error }).error('OTPIsValid -> scopesReceived')
      this.logger.push({ mojaloopError }).info(`Sending error response to ${toParticipantId}`)

      // note: this is an error code scenario that will need to be addressed.
      //       something along the lines 6xxx "No scopes granted"
      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestsRequestId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )
      // throw error to stop state machine
      throw error
    }
  }

  async onRegisterConsent (): Promise<void> {
    const { consentRequestsRequestId, toParticipantId, scopes } = this.data

    const postConsentRequestsPayload: tpAPI.Schemas.ConsentsPostRequest = {
      consentId: uuid(),
      consentRequestId: consentRequestsRequestId,
      scopes: scopes?.scopes || []
    }

    try {
      await this.thirdpartyRequests.postConsents(
        postConsentRequestsPayload,
        toParticipantId
      )
    } catch (error) {
      const mojaloopError = this.reformatError(error)

      this.logger.push({ error }).error('scopesReceived -> consentSent')
      this.logger.push(error).error('ThirdpartyRequests.postConsents request error')

      // note: if the POST /consents fails at the DFSP we report that back to the pisp
      await this.thirdpartyRequests.putConsentRequestsError(
        consentRequestsRequestId,
        mojaloopError as unknown as fspiopAPI.Schemas.ErrorInformationObject,
        toParticipantId
      )
      // throw error to stop state machine
      throw error
    }

    // todo: implement inbound PUT /consents/{ID}/error handler
    //       and listen subscribe for switch errors so that they can be forwarded
    //       back to the dfsp
    /*
    const channel = DFSPOTPValidateModel.notificationChannel(
      consentRequestsRequestId
    )
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      // let subId = 0
      try {
        // this handler will be executed when PUT /consents/{ID}/error @ Inbound server
        // this case should happen when something went wrong at the switch
        // but we need to also report a switch failure back to the PISP.
        subId = this.pubSub.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // first unsubscribe
          this.pubSub.unsubscribe(channel, sid)

          this.data.consentsStatus = { ...message as unknown as tpAPI.Schemas.ErrorInformation }
          resolve()
        })

        this.logger.push({ res }).info('ThirdpartyRequests.postConsents request sent to peer')

        resolve()
      } catch (error) {
      }
    })
    */

  }

  reformatError (err: Error): Errors.MojaloopApiErrorObject {
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
            `validateOTP requested for ${data.consentRequestsRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.validateOTP()
          await this.saveToKVS()
          return this.run()

        case 'OTPIsValid':
          this.logger.info(
            `requestScopes requested for ${data.consentRequestsRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.requestScopes()
          await this.saveToKVS()
          return this.run()

        case 'scopesReceived':
          this.logger.info(
            `registerConsent requested for ${data.consentRequestsRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.registerConsent()
          await this.saveToKVS()
          // workflow is finished
          return

        default:
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running DFSPOTPValidateModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a DFSPOTPValidateState property here!
        if (err.DFSPOTPValidateState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between DFSPOTPValidateState.lastError and err
        err.DFSPOTPValidateState = { ...this.data }
      }
      throw err
    }
  }
}

export async function existsInKVS (config: DFSPOTPValidateModelConfig): Promise<boolean> {
  return config.kvs.exists(config.key)
}

export async function create (
  data: DFSPOTPValidateData,
  config: DFSPOTPValidateModelConfig
): Promise<DFSPOTPValidateModel> {
  // create a new model
  const model = new DFSPOTPValidateModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: DFSPOTPValidateModelConfig
): Promise<DFSPOTPValidateModel> {
  try {
    const data = await config.kvs.get<DFSPOTPValidateData>(config.key)
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
  DFSPOTPValidateModel,
  existsInKVS,
  create,
  loadFromKVS
}
