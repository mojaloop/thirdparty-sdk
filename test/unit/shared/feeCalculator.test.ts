import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
import { feeForTransferAndPayeeReceiveAmount } from '~/shared/feeCalculator'

describe('feeCalculator', () => {
  describe('feeForTransferAndPayeeReceiveAmount', () => {

    it('throws if the currencies do not match', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'USD',
        amount: '10.00',
      }
      const receiveAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.00',
      }
      
      // Act
      try {
        const result = feeForTransferAndPayeeReceiveAmount(transferAmount, receiveAmount)
        throw new Error('Should not be executed')
      } catch (err) {  
        
      }
      
      // Assert
    })


    it.todo('throws if the transferAmount is smaller than the receive amount')
    it.todo('throws if the amount is invalid')
    it.todo('calculates the fee')

  })
})