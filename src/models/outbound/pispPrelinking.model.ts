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
  PISPPrelinkingData,
  PISPPrelinkingStateMachine,
  PISPPrelinkingModelConfig
} from './pispPrelinking.interface';
import { Message } from '~/shared/pub-sub';
import deferredJob from '~/shared/deferred-job';
import * as OutboundAPI from '~/interface/outbound/api_interfaces'

export class PISPPrelinkingModel
  extends PersistentModel<PISPPrelinkingStateMachine, PISPPrelinkingData> {
  protected config: PISPPrelinkingModelConfig

  constructor (
    data: PISPPrelinkingData,
    config: PISPPrelinkingModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'getProviders', from: 'start', to: 'providersLookupSuccess' },
      ],
      methods: {
        // specific transitions handlers methods
        onGetProviders: () => this.onGetProviders(),
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

  static notificationChannel (serviceType: string): string {
    return `PISPPrelinking-${serviceType}`
  }

  async onGetProviders (): Promise<void> {
    const { serviceType } = this.data

    const channel = PISPPrelinkingModel.notificationChannel(
      serviceType
    )

    this.logger.push({ channel }).info('onGetProviders - subscribe to channel')

    return deferredJob(this.pubSub, channel)
    .init(async (channel) => {
      const res = await this.thirdpartyRequests.getServices(
        serviceType
      )

      this.logger.push({ res, channel })
        .log('ThirdpartyRequests.getServices request call sent to peer, listening on response')
    })
    .job(async (message: Message): Promise<void> => {
      try {
        type PutResponseOrError = tpAPI.Schemas.ServicesServiceTypePutResponse & fspiopAPI.Schemas.ErrorInformationObject
        const putResponse = message as unknown as PutResponseOrError
        if (putResponse.errorInformation) {
          this.data.errorInformation = putResponse.errorInformation
        } else {
          const response = message as unknown as tpAPI.Schemas.ServicesServiceTypePutResponse
          this.data.providers = response.providers
        }

      } catch (error) {
        this.logger.push(error).error('ThirdpartyRequests.getServices request error')
        return Promise.reject(error)
      }
    })
    .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  getResponse ():
  OutboundAPI.Schemas.LinkingProvidersResponse |
  void {
    switch (this.data.currentState) {
      case 'providersLookupSuccess':
        return {
          providers: this.data.providers,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingProvidersResponse
      case 'errored':
        return {
          errorInformation: this.data.errorInformation,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingProvidersResponse
      default:
    }
  }

  // utility function to check if an error after a transition which
  // pub/subs for a response that can return a mojaloop error
  async checkModelDataForErrorInformation(): Promise<void> {
    if (this.data.errorInformation) {
      await this.fsm.error(this.data.errorInformation)
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<
  OutboundAPI.Schemas.LinkingProvidersResponse |
  void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          this.logger.info(
            `getProviders requested for ${data.serviceType},  currentState: ${data.currentState}`
          )

          await this.fsm.getProviders()
          await this.checkModelDataForErrorInformation()
          return this.getResponse()

        default:
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running PISPPrelinkingModel : ${inspect(err)}`)

      // as this function is recursive, we don't want to error the state machine multiple times
      if (data.currentState !== 'errored') {
        // err should not have a PISPPrelinkingState property here!
        if (err.PISPPrelinkingState) {
          this.logger.info('State machine is broken')
        }
        // transition to errored state
        await this.fsm.error(err)

        // avoid circular ref between PISPPrelinkingState.lastError and err
        err.PISPPrelinkingState = { ...this.data }
      }
      throw err
    }
  }
}

export async function create (
  data: PISPPrelinkingData,
  config: PISPPrelinkingModelConfig
): Promise<PISPPrelinkingModel> {
  // create a new model
  const model = new PISPPrelinkingModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}


export default {
  PISPPrelinkingModel,
  create,
}
