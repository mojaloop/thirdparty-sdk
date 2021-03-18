import { StateResponseToolkit } from '~/server/plugins/state'
import { Request, ResponseObject } from '@hapi/hapi'
import {
  OTPValidateData,
  OTPValidateModelConfig
} from '~/models/OTPValidate.interface'
import OTPValidateModel from '~/models/OTPValidate.model'
import { OutboundOTPValidateData } from '../../../models/OTPValidate.interface';
import {
  create
} from '~/models/a2s.model'

/**
 * Handles outbound PATCH /consentRequests/{ID} request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patch (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as OutboundOTPValidateData
  const consentRequestId: string = request.params.ID
  const args: object = {
    consentRequestId: consentRequestId,
    consentRequest: {
      authToken: payload.authToken
    },
    fspId: payload.toParticipantId,
    requests: h.getThirdpartyRequests()
  }

  // prepare config
  const data: OTPValidateData = {
    consentRequestId: consentRequestId,
    currentState: 'start'
  }

  const config: OTPValidateModelConfig = {
    key: consentRequestId,
    modelName: 'OTPValidate',
    throwIfInvalidArgs: OTPValidateModel.argsValidation,
    channelName: OTPValidateModel.notificationChannel,
    requestAction: OTPValidateModel.requestAction,
    kvs: h.getKVS(),
    logger: h.getLogger(),
    pubSub: h.getPubSub(),
    thirdpartyRequests: h.getThirdpartyRequests(),
    requestProcessingTimeoutSeconds: 3
  }

  const model = await create(data, config)

  const result = await model.run(args);
  console.log(result)
  // TODO: handle errors
  return h.response().code(200)
}

export default {
  patch
}
