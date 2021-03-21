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
import { OutboundOTPValidateResponse } from '../../../../models/OTPValidate.interface';

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

  const result = (await model.run(args)) as unknown as OutboundOTPValidateResponse
  const statusCode = (result == undefined || result.errorInformation) ? 500 : 200

  return h.response(result).code(statusCode)
}

export default {
  patch
}
