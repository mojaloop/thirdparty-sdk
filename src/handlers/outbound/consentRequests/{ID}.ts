import { StateResponseToolkit } from '~/server/plugins/state'
import { Request, ResponseObject } from '@hapi/hapi'
import {
  OTPValidateData
} from '~/models/OTPValidate.interface'
import { OutboundOTPValidateData } from '~/models/OTPValidate.interface';
import {
  create
} from '~/models/a2s.model'
import { OTPValidateModelArgs, OTPValidateModelConfig } from '~/models/OTPValidate.model';

/**
 * Handles outbound PATCH /consentRequests/{ID} request
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patch (_context: any, request: Request, h: StateResponseToolkit): Promise<ResponseObject> {
  const payload = request.payload as OutboundOTPValidateData
  const consentRequestId: string = request.params.ID
  const args: OTPValidateModelArgs = {
    consentRequestId: consentRequestId,
    consentRequest: {
      authToken: payload.authToken
    },
    fspId: payload.toParticipantId,
  }

  // prepare config
  const data: OTPValidateData = {
    consentRequestId: consentRequestId,
    currentState: 'start'
  }

  const config: OTPValidateModelConfig = new OTPValidateModelConfig(
    consentRequestId,
    h.getKVS(),
    h.getLogger(),
    h.getPubSub(),
    h.getThirdpartyRequests()
  )

  const model = await create(data, config)

  const result = await model.run(args)
  console.log(result)

  // TODO: handle errors
  return h.response().code(200)
}

export default {
  patch
}
