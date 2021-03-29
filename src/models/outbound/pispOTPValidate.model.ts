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
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components';
import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets';
import inspect from '~/shared/inspect'
import {
  PISPOTPValidateData,
  PISPOTPValidateStateMachine,
  PISPOTPValidateModelConfig
} from './pispOTPValidate.interface';
import { Message } from '../../shared/pub-sub';
import { OutboundOTPValidateConsentResponse, OutboundOTPValidateErrorResponse } from './pispOTPValidate.interface';

// note: may need to rename this model once this handles more of the account
//       linking flow. this model only covers steps in the authentication stage
//       of account linking and the name might not be suitable in the future
export class PISPOTPValidateModel
  extends PersistentModel<PISPOTPValidateStateMachine, PISPOTPValidateData> {
  protected config: PISPOTPValidateModelConfig

  constructor (
    data: PISPOTPValidateData,
    config: PISPOTPValidateModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'validateOTP', from: 'start', to: 'OTPIsValid' },
      ],
      methods: {
        // specific transitions handlers methods
        onValidateOTP: () => this.onValidateOTP(),
      }
    }
    super(data, config, spec)
    this.config = { ...config }
  }

  // getters
  get pubSub (): PubSub {
    return this.config.pubSub
  }

  get thirdpartyRequests (): ThirdpartyRequests {
    return this.config.thirdpartyRequests
  }

  static notificationChannel (consentRequestsRequestId: string): string {
    if (!consentRequestsRequestId) {
      throw new Error('PISPOTPValidateModel.notificationChannel: \'consentRequestsRequestId\' parameter is required')
    }
    // channel name
    return `PISPOTPValidate-${consentRequestsRequestId}`
  }

  async onValidateOTP (): Promise<void> {
    const { consentRequestsRequestId, authToken, toDFSPParticipantId } = this.data

    const channel = PISPOTPValidateModel.notificationChannel(
      consentRequestsRequestId
    )

    this.logger.push({ channel }).info('onValidateOTP - subscribe to channel')

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let subId = 0
      try {
        // this handler will be executed when POST /consents @ Inbound server
        subId = this.pubSub.subscribe(channel, async (channel: string, message: Message, sid: number) => {
          // first unsubscribe
          this.pubSub.unsubscribe(channel, sid)

          type PutResponseOrError = tpAPI.Schemas.ConsentsPostRequest & fspiopAPI.Schemas.ErrorInformationObject
          const putResponse = message as unknown as PutResponseOrError
          if (putResponse.errorInformation) {
            this.data.errorInformation = putResponse.errorInformation
          } else {
            this.data.consent = { ...message as unknown as tpAPI.Schemas.ConsentsPostRequest }
          }
          resolve()
        })

        const res = await this.thirdpartyRequests.patchConsentRequests(
          consentRequestsRequestId,
          { authToken: authToken }  as tpAPI.Schemas.ConsentRequestsIDPatchRequest,
          toDFSPParticipantId
        )
        this.logger.push({ res }).info('ThirdpartyRequests.patchConsentRequests request sent to peer')
      } catch (error) {
        this.logger.push(error).error('ThirdpartyRequests.patchConsentRequests request error')
        this.pubSub.unsubscribe(channel, subId)
        reject(error)
      }
    })
  }

  getResponse ():
  OutboundOTPValidateConsentResponse |
  OutboundOTPValidateErrorResponse |
  void {
    switch (this.data.currentState) {
      case 'OTPIsValid':
        return {
          consent: this.data.consent,
          currentState: this.data.currentState
        } as OutboundOTPValidateConsentResponse
      case 'errored':
        return {
          errorInformation: this.data.errorInformation,
          currentState: this.data.currentState
        } as OutboundOTPValidateErrorResponse
      default:
    }
  }

  // utility function to check if an error after a transistion which
  // pub/subs for a response that can return a mojaloop error
  async checkModelDataForErrorInformation(): Promise<void> {
    if (this.data.errorInformation) {
      await this.fsm.error()
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<
  OutboundOTPValidateConsentResponse |
  OutboundOTPValidateErrorResponse |
  void> {
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
          await this.checkModelDataForErrorInformation()
          return this.getResponse()

        default:
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running PISPOTPValidateModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a PISPOTPValidateState property here!
        if (err.PISPOTPValidateState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between PISPOTPValidateState.lastError and err
        err.PISPOTPValidateState = { ...this.data }
      }
      throw err
    }
  }
}

export async function existsInKVS (config: PISPOTPValidateModelConfig): Promise<boolean> {
  return config.kvs.exists(config.key)
}

export async function create (
  data: PISPOTPValidateData,
  config: PISPOTPValidateModelConfig
): Promise<PISPOTPValidateModel> {
  // create a new model
  const model = new PISPOTPValidateModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

// loads PersistentModel from KVS storage using given `config` and `spec`
export async function loadFromKVS (
  config: PISPOTPValidateModelConfig
): Promise<PISPOTPValidateModel> {
  try {
    const data = await config.kvs.get<PISPOTPValidateData>(config.key)
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
  PISPOTPValidateModel,
  existsInKVS,
  create,
  loadFromKVS
}
