import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'


export function feeForTransferAndPayeeReceiveAmount(
  transferAmount: fspiopAPI.Schemas.Money,
  receiveAmount: fspiopAPI.Schemas.Money
): fspiopAPI.Schemas.Money {

  if (transferAmount.currency !== receiveAmount.currency) {
    throw new Error('Currency mismatch. Cannot calculate fees across currencies.')
  }
  const taValue = parseFloat(transferAmount.amount)
  const raValue = parseFloat(receiveAmount.amount)

  const feeValue = taValue - raValue
  if (feeValue < 0) {
    throw new Error('Expected transferAmount to be greater than receive amount')
  }
  const feeAmountStr = feeValue.toFixed(2)
  return {
    amount: feeAmountStr,
    currency: transferAmount.currency
  }
}