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

 - Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/

import { PubSub } from '~/shared/pub-sub'
import { PersistentModel } from '~/models/persistent.model'
import { StateMachineConfig } from 'javascript-state-machine'
import { ThirdpartyRequests } from '@mojaloop/sdk-standard-components';
import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets';
import inspect from '~/shared/inspect'
import {
  PISPConsentRequestsData,
  PISPConsentRequestsStateMachine,
  PISPConsentRequestsModelConfig
} from '~/models/outbound/pispConsentRequests.interface';
import { Message } from '~/shared/pub-sub';
import deferredJob from '~/shared/deferred-job';
import * as OutboundAPI from '~/interface/outbound/api_interfaces'

export class PISPConsentRequestsModel
  extends PersistentModel<PISPConsentRequestsStateMachine, PISPConsentRequestsData> {
  protected config: PISPConsentRequestsModelConfig

  constructor (
    data: PISPConsentRequestsData,
    config: PISPConsentRequestsModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'validateRequest', from: 'start', to: 'RequestIsValid' }
      ],
      methods: {
        // specific transitions handlers methods
        onValidateRequest: () => this.onValidateRequest(),
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

  static notificationChannel (consentRequestId: string): string {
    if (!consentRequestId) {
      throw new Error('PISPConsentRequestsModel.notificationChannel: \'consentRequestId\' parameter is required')
    }
    // channel name
    return `PISPConsentRequests_${consentRequestId}`
  }

  async onValidateRequest (): Promise<void> {
    const { request } = this.data
    const channel = PISPConsentRequestsModel.notificationChannel(request.id)
    this.logger.push({ channel }).info('onValidateRequest - subscribe to channel')

    return deferredJob(this.pubSub, channel)
      .init(async (channel) => {
        const res = await this.thirdpartyRequests.postConsentRequests(
          request,
          request.toParticipantId
        )

        this.logger.push({ res, channel })
          .log('ThirdpartyRequests.postConsentRequests call sent to peer, listening on response')
      })
      .job(async (message: Message): Promise<void> => {
        try {
          type PutResponse =
            tpAPI.Schemas.ConsentRequestsIDPutResponseWeb |
            tpAPI.Schemas.ConsentRequestsIDPutResponseWebAuth |
            tpAPI.Schemas.ConsentRequestsIDPutResponseOTP |
            tpAPI.Schemas.ConsentRequestsIDPutResponseOTPAuth
          type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
          const putResponse = message as unknown as PutResponseOrError
          if (putResponse.errorInformation) {
            this.data.errorInformation = putResponse.errorInformation
          } else {
            this.data.consentRequests = { ...message as unknown as PutResponse }
          }

        } catch (error) {
          this.logger.push(error).error('ThirdpartyRequests.postConsentRequests request error')
          return Promise.reject(error)
        }
      })
      .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  getResponse (): OutboundAPI.Schemas.ConsentRequestsResponse | void {
    switch (this.data.currentState) {
      case 'RequestIsValid':
        return {
          consentRequests: this.data.consentRequests,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.ConsentRequestsResponse
      case 'errored':
        return {
          errorInformation: this.data.errorInformation,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.ConsentRequestsResponse
      default:
    }
  }

  // utility function to check if an error after a transistion which
  // pub/subs for a response that can return a mojaloop error
  async checkModelDataForErrorInformation (): Promise<void> {
    if (this.data.errorInformation) {
      await this.fsm.error(this.data.errorInformation)
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<OutboundAPI.Schemas.ConsentRequestsResponse | void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          await this.saveToKVS()
          this.logger.info(
            `validateRequest for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.validateRequest()
          await this.saveToKVS()
          await this.checkModelDataForErrorInformation()
          return this.getResponse()

        default:
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running PISPConsentRequestsModel : ${inspect(err)}`)

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

export async function create (
  data: PISPConsentRequestsData,
  config: PISPConsentRequestsModelConfig
): Promise<PISPConsentRequestsModel> {
  // create a new model
  const model = new PISPConsentRequestsModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

export default {
  PISPConsentRequestsModel,
  create,
}
