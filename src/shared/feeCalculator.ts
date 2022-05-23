import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'

export function payeeReceiveAmountForQuoteAndFees(
  transferAmount: fspiopAPI.Schemas.Money,
  payeeFspFee?: fspiopAPI.Schemas.Money,
  payeeFspCommission?: fspiopAPI.Schemas.Money
): fspiopAPI.Schemas.Money {
  if (!payeeFspFee && !payeeFspCommission) {
    // no fees or commission, payee will recieve the transfer amount
    return transferAmount
  }

  const taValue = Number(transferAmount.amount)

  let feeAmount = 0
  let commissionAmount = 0
  if (payeeFspFee) {
    feeAmount = Number(payeeFspFee.amount)
    if (payeeFspFee.currency !== transferAmount.currency) {
      throw new Error('Currency mismatch. Cannot calculate fees across currencies.')
    }
  }

  if (payeeFspCommission) {
    commissionAmount = Number(payeeFspCommission.amount)
    if (payeeFspCommission.currency !== transferAmount.currency) {
      throw new Error('Currency mismatch. Cannot calculate fees across currencies.')
    }
  }

  console.log('taValue', taValue)

  if (isNaN(taValue) || isNaN(feeAmount) || isNaN(commissionAmount)) {
    throw new Error('Invalid amount input. Expected valid number')
  }

  // 5.1.4.1 - Calculating Payee Receive Amount
  // Payee Receive Amount = Transfer Amount - Payee FSP Fee + Payee FSP Commission
  // ref: https://docs.mojaloop.io/mojaloop-specification/documents/API%20Definition%20v1.0.html#5141-payee-receive-amount-relation-to-transfer-amount
  const receiveAmount = taValue - feeAmount + commissionAmount
  // 3P API doesn't allow for trailing zeroes for integer amounts
  const receiveAmountStr = receiveAmount.toFixed(2).replace('.00', '')
  return {
    amount: receiveAmountStr,
    currency: transferAmount.currency
  }
}

/**
 * @function feeForTransferAndPayeeReceiveAmount
 * @description Calculate the total fee for the transfer and payee receive amount
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
    throw new Error(`Expected transferAmount: ${taValue} to be greater than receive amount: ${raValue}`)
  }

  // 3P API doesn't allow for trailing zeroes for integer amounts
  const feeAmountStr = feeValue.toFixed(2).replace('.00', '')
  return {
    amount: feeAmountStr,
    currency: transferAmount.currency
  }
}
