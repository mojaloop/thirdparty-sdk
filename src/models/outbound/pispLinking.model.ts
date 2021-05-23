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
  PISPLinkingData,
  PISPLinkingStateMachine,
  PISPLinkingModelConfig
} from '~/models/outbound/pispLinking.interface';
import { Message } from '~/shared/pub-sub';
import deferredJob from '~/shared/deferred-job';
import * as OutboundAPI from '~/interface/outbound/api_interfaces'

export class PISPLinkingModel
  extends PersistentModel<PISPLinkingStateMachine, PISPLinkingData> {
  protected config: PISPLinkingModelConfig

  constructor (
    data: PISPLinkingData,
    config: PISPLinkingModelConfig
  ) {
    const spec: StateMachineConfig = {
      init: 'start',
      transitions: [
        { name: 'requestConsent', from: 'start', to: 'channelResponseReceived' },
        { name: 'changeToOTPAuthentication', from: 'channelResponseReceived', to: 'OTPAuthenticationChannelResponseRecieved' },
        { name: 'changeToWebAuthentication', from: 'channelResponseReceived', to: 'WebAuthenticationChannelResponseRecieved' }
      ],
      methods: {
        // specific transitions handlers methods
        onRequestConsent: () => this.onRequestConsent(),
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
      throw new Error('PISPLinkingModel.notificationChannel: \'consentRequestId\' parameter is required')
    }
    // channel name
    return `PISPLinking_${consentRequestId}`
  }

  linkingRequestConsentPostRequestToConsentRequestsPostRequest(): tpAPI.Schemas.ConsentRequestsPostRequest {
    const { linkingRequestConsentPostRequest, consentRequestId } = this.data

    const scopes: tpAPI.Schemas.Scope[] = []
    for (const account of linkingRequestConsentPostRequest.accounts as unknown as tpAPI.Schemas.Account[]) {
      scopes.push({
        accountId: account.id!,
        actions: ['accounts.getBalance', 'accounts.transfer']
      })
    }

    const postConsentRequest: tpAPI.Schemas.ConsentRequestsPostRequest = {
      consentRequestId,
      scopes,
      userId: linkingRequestConsentPostRequest.userId,
      authChannels: ["OTP", "WEB"],
      callbackUri: linkingRequestConsentPostRequest.callbackUri
    }
    return postConsentRequest
  }

  async onRequestConsent (): Promise<void> {
    const { linkingRequestConsentPostRequest, consentRequestId } = this.data
    const channel = PISPLinkingModel.notificationChannel(consentRequestId)
    this.logger.push({ channel }).info('onRequestConsent - subscribe to channel')

    const postConsentRequest = this.linkingRequestConsentPostRequestToConsentRequestsPostRequest()

    return deferredJob(this.pubSub, channel)
      .init(async (channel) => {
        const res = await this.thirdpartyRequests.postConsentRequests(
          postConsentRequest,
          linkingRequestConsentPostRequest.toParticipantId
        )

        this.logger.push({ res, channel })
          .log('ThirdpartyRequests.postConsentRequests call sent to peer, listening on response')
      })
      .job(async (message: Message): Promise<void> => {
        try {
          type PutResponse =
            tpAPI.Schemas.ConsentRequestsIDPutResponseWeb |
            tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
          type PutResponseOrError = PutResponse & fspiopAPI.Schemas.ErrorInformationObject
          const putResponse = message as unknown as PutResponseOrError

          if (putResponse.errorInformation) {
            this.data.errorInformation = putResponse.errorInformation
          } else {
            this.data.linkingRequestConsentInboundChannelResponse = { ...message as unknown as PutResponse }
          }
        } catch (error) {
          this.logger.push(error).error('ThirdpartyRequests.postConsentRequests request error')
          return Promise.reject(error)
        }
      })
      .wait(this.config.requestProcessingTimeoutSeconds * 1000)
  }

  getResponse (): OutboundAPI.Schemas.LinkingRequestConsentResponse | void {
    switch (this.data.currentState) {
      case 'OTPAuthenticationChannelResponseRecieved':
        return {
          channelResponse: this.data.linkingRequestConsentInboundChannelResponse,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentResponse
      case 'WebAuthenticationChannelResponseRecieved':
        return {
          channelResponse: this.data.linkingRequestConsentInboundChannelResponse,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentResponse
      case 'errored':
        return {
          errorInformation: this.data.errorInformation,
          currentState: this.data.currentState
        } as OutboundAPI.Schemas.LinkingRequestConsentResponse
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

  async checkModelDataChannelResponse (): Promise<void> {
    if (!this.data.linkingRequestConsentInboundChannelResponse) {
      return
    }

    if (this.data.linkingRequestConsentInboundChannelResponse.authChannels[0] == "WEB") {
      await this.fsm.changeToWebAuthentication()
    } else if (this.data.linkingRequestConsentInboundChannelResponse.authChannels[0] == "OTP"){
      await this.fsm.changeToOTPAuthentication()
    } else {
      await this.fsm.error()
    }
  }

  /**
   * runs the workflow
   */
  async run (): Promise<OutboundAPI.Schemas.LinkingRequestConsentResponse | void> {
    const data = this.data
    try {
      // run transitions based on incoming state
      switch (data.currentState) {
        case 'start':
          await this.saveToKVS()
          this.logger.info(
            `validateRequest for ${data.consentRequestId},  currentState: ${data.currentState}`
          )
          await this.fsm.requestConsent()
          await this.checkModelDataForErrorInformation()
          await this.checkModelDataChannelResponse()
          await this.saveToKVS()
          return this.getResponse()

        default:
          this.logger.info('State machine in errored state')
          return
      }
    } catch (err) {
      this.logger.info(`Error running PISPLinkingModel : ${inspect(err)}`)

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
  data: PISPLinkingData,
  config: PISPLinkingModelConfig
): Promise<PISPLinkingModel> {
  // create a new model
  const model = new PISPLinkingModel(data, config)

  // enforce to finish any transition to state specified by data.currentState or spec.init
  await model.fsm.state
  return model
}

export default {
  PISPLinkingModel,
  create,
}
