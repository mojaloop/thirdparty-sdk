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
        feeForTransferAndPayeeReceiveAmount(transferAmount, receiveAmount)
        throw new Error('Should not be executed')
      } catch (err: any) {  
        // Assert
        expect(err.message).toEqual('Currency mismatch. Cannot calculate fees across currencies.')
      }
    })

    it('throws if the transferAmount is smaller than the receive amount', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.00',
      }
      const receiveAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.01',
      }

      // Act
      try {
        feeForTransferAndPayeeReceiveAmount(transferAmount, receiveAmount)
        throw new Error('Should not be executed')
      } catch (err: any) {
        // Assert
        expect(err.message).toEqual('Expected transferAmount to be greater than receive amount')
      }
    })

    it('throws if the amount is invalid', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: 'ABC',
      }
      const receiveAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.11',
      }

      // Act
      try {
        feeForTransferAndPayeeReceiveAmount(transferAmount, receiveAmount)
        throw new Error('Should not be executed')
      } catch (err: any) {
        // Assert
        expect(err.message).toEqual('Invalid amount input. Expected valid number')
      }
    })

    it('calculates the fee to within .01', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.01',
      }
      const receiveAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.00',
      }

      // Act
      const result = feeForTransferAndPayeeReceiveAmount(transferAmount, receiveAmount)
      expect(result).toStrictEqual({
        currency: 'AUD',
        amount: '0.01'
      })
    })

    it.only('adds on additional decimal places', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '200',
      }
      const receiveAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '199',
      }

      // Act
      const result = feeForTransferAndPayeeReceiveAmount(transferAmount, receiveAmount)
      expect(result).toStrictEqual({
        currency: 'AUD',
        amount: '1.00'
      })
    })
  })
})