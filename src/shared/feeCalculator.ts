import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'

/**
 * @function feeForTransferAndPayeeReceiveAmount
 * @description The fee
 * @param transferAmount 
 * @param receiveAmount 
 * @returns 
 */
export function feeForTransferAndPayeeReceiveAmount(
  transferAmount: fspiopAPI.Schemas.Money,
  receiveAmount: fspiopAPI.Schemas.Money
): fspiopAPI.Schemas.Money {

  if (transferAmount.currency !== receiveAmount.currency) {
    throw new Error('Currency mismatch. Cannot calculate fees across currencies.')
  }

  // We expect the FSPIOP to have handled any really nasty input until now
  const taValue = Number(transferAmount.amount)
  const raValue = Number(receiveAmount.amount)
  if (isNaN(taValue) || isNaN(raValue)) {
    throw new Error('Invalid amount input. Expected valid number')
  }

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