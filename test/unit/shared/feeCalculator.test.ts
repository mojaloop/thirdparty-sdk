import { v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
import { feeForTransferAndPayeeReceiveAmount, payeeReceiveAmountForQuoteAndFees } from '~/shared/feeCalculator'

describe('feeCalculator', () => {

  describe('payeeReceiveAmountForQuoteAndFees', () => {
    it('throws if the currency mismatches for payeeFSPFee', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: 'ABC',
      }
      const payeeFspFee: fspiopAPI.Schemas.Money = {
        currency: 'USD',
        amount: '1.00',
      }

      // Act
      try {
        payeeReceiveAmountForQuoteAndFees(transferAmount, payeeFspFee)
        throw new Error('should not be executed')
      } catch (err: any) {
        // Assert
        expect(err.message).toBe('Currency mismatch. Cannot calculate fees across currencies.')
      }
    })

    it('throws if the currency mismatches for payeeFspCommission', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: 'ABC',
      }
      const payeeFspFee: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '1.00',
      }
      const payeeFspCommission: fspiopAPI.Schemas.Money = {
        currency: 'USD',
        amount: '1.00',
      }

      // Act
      try {
        payeeReceiveAmountForQuoteAndFees(transferAmount, payeeFspFee, payeeFspCommission)
        throw new Error('should not be executed')
      } catch (err: any) {
        // Assert
        expect(err.message).toBe('Currency mismatch. Cannot calculate fees across currencies.')
      }
    })
    
    it('throws any of the values evaluates to NaN', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: 'ABC',
      }
      const payeeFspFee: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '1.00',
      }

      // Act
      try {
        payeeReceiveAmountForQuoteAndFees(transferAmount, payeeFspFee)
        throw new Error('should not be executed')
      } catch(err: any) {
        // Assert
        expect(err.message).toBe('Invalid amount input. Expected valid number')
      }
    })

    it('formats the output with no .00', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.00',
      }
      const payeeFspFee: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '1.00',
      }
      const payeeFspCommission: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '3.00',
      }

      // Act
      const result = payeeReceiveAmountForQuoteAndFees(
        transferAmount,
        payeeFspFee,
        payeeFspCommission
      )

      // Assert
      expect(result).toStrictEqual({
        currency: 'AUD',
        amount: '12'
      })
    })

    it('outputs a decimal number', () => {
      // Arrange
      const transferAmount: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '10.00',
      }
      const payeeFspFee: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '1.89',
      }
      const payeeFspCommission: fspiopAPI.Schemas.Money = {
        currency: 'AUD',
        amount: '3.00',
      }
      
      // Act
      const result = payeeReceiveAmountForQuoteAndFees(
        transferAmount, 
        payeeFspFee,
        payeeFspCommission
      )
      
      // Assert
      expect(result).toStrictEqual({
        currency: 'AUD',
        amount: '11.11'
      })
    })
  })

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
        expect(err.message).toEqual(
          'Expected transferAmount: 10 to be greater than receive amount: 10.01'
        )
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

    it('doesnt add unnecessay decimal places', () => {
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
        amount: '1'
      })
    })
  })
})