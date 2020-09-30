import { logger } from '~/shared/logger'
import { StateResponseToolkit } from '~/server/plugins/state'
import {
    PISPTransactionModel
} from '~/models/pispTransaction.model'
import { PISPTransactionPhase } from '~/models/pispTransaction.interface'
import { ThirdpartyTransactionStatus } from '~/models/pispTransaction.interface'
import PartiesByTypeAndId from '~/handlers/inbound/parties/{Type}/{ID}'
import PartiesErrorByTypeAndID from '~/handlers/inbound/parties/{Type}/{ID}/error'
import PartiesByTypeIdAndSubId from '~/handlers/inbound/parties/{Type}/{ID}/{SubId}'
import PartiesErrorByTypeIdAndSubId from '~/handlers/inbound/parties/{Type}/{ID}/{SubId}/error'
import NotifyThirdpartyTransactionRequests from '~/handlers/inbound/thirdpartyRequests/transactions/{ID}'
import NotifyErrorThirdpartyTransactionRequests from '~/handlers/inbound/thirdpartyRequests/transactions/{ID}/error'
import { TParty } from '@mojaloop/sdk-standard-components'
import { Request } from '@hapi/hapi'

describe('Inbound PISP transaction handlers', (): void => {
    const pubSubMock = {
        publish: jest.fn()
    }
    const toolkit = {
        getLogger: jest.fn(() => logger),
        getPubSub: jest.fn(() => pubSubMock),
        getBackendRequests: jest.fn(),
        getMojaloopRequests: jest.fn(),
        response: jest.fn(() => ({
            code: jest.fn((code: number) => ({
                statusCode: code
            }))
        }))
    }
    const partyResponse: TParty = {
        partyIdInfo: {
            partyIdType: "MSISDN",
            partyIdentifier: "9876543211",
            fspId: "pispA"
        },
        merchantClassificationCode: "4321",
        name: "Justin Trudeau",
        personalInfo: {
            complexName: {
                firstName: "Justin",
                middleName: "Pierre",
                lastName: "Trudeau"
            },
            dateOfBirth: "1980-01-01"
        }
    }
    const approveResponse: ThirdpartyTransactionStatus = {
        transactionId: "x42ec534-ae48-6575-g6a9-tad2955b8065",
        transactionRequestState: "ACCEPTED"
    }
    const errorResponse = {
        errorInformation: {
            errorCode: 5100,
            errorDescription: "This is an error description.",
            extensionList: {
                extension: [
                    {
                        key: "sample error key",
                        value: "sample error value"
                    }
                ]
            }
        }
    }
    it('PUT /parties/{Type}/{ID}', async (): Promise<void> => {
        const request = {
            method: 'PUT',
            url: '/parties/{Type}/{ID}',
            headers: {
                'Content-Type': 'application/json',
                'fspiop-source': 'sourceDfspId'
            },
            params: {
                'Type': 'MSISDN',
                'ID': '9876543211'
            },
            payload: partyResponse
        }
        const result = await PartiesByTypeAndId.put(
            {},
            request as unknown as Request,
            toolkit as unknown as StateResponseToolkit
        )
        expect(result.statusCode).toBe(200)

        const channel = PISPTransactionModel.partyNotificationChannel(
            PISPTransactionPhase.lookup,
            request.params.Type,
            request.params.ID)

        expect(pubSubMock.publish).toBeCalledWith(channel, partyResponse)
    })
    it('PUT /parties/{Type}/{ID}/error', async (): Promise<void> => {
        const request = {
            method: 'PUT',
            url: '/parties/{Type}/{ID}/error',
            headers: {
                'Content-Type': 'application/json',
                'fspiop-source': 'sourceDfspId'
            },
            params: {
                'Type': 'MSISDN',
                'ID': '9876543211'
            },
            payload: errorResponse
        }
        const result = await PartiesErrorByTypeAndID.put(
            {},
            request as unknown as Request,
            toolkit as unknown as StateResponseToolkit
        )
        expect(result.statusCode).toBe(200)

        const channel = PISPTransactionModel.partyNotificationChannel(
            PISPTransactionPhase.lookup,
            request.params.Type,
            request.params.ID)

        expect(pubSubMock.publish).toBeCalledWith(channel, errorResponse)
    })
    it('PUT /parties/{Type}/{ID}/{SubId}', async (): Promise<void> => {
        const request = {
            method: 'PUT',
            url: '/parties/{Type}/{ID}/{SubId}',
            headers: {
                'Content-Type': 'application/json',
                'fspiop-source': 'sourceDfspId'
            },
            params: {
                'Type': 'PERSONAL_ID',
                'ID': '16135551234',
                'SubId': 'DRIVING_LICENSE'
            },
            payload: partyResponse
        }
        const result = await PartiesByTypeIdAndSubId.put(
            {},
            request as unknown as Request,
            toolkit as unknown as StateResponseToolkit
        )
        expect(result.statusCode).toBe(200)

        const channel = PISPTransactionModel.partyNotificationChannel(
            PISPTransactionPhase.lookup,
            request.params.Type,
            request.params.ID,
            request.params.SubId)

        expect(pubSubMock.publish).toBeCalledWith(channel, partyResponse)
    })
    it('PUT /parties/{Type}/{ID}/{SubId}/error', async (): Promise<void> => {
        const request = {
            method: 'PUT',
            url: '/parties/{Type}/{ID}/{SubId}/error',
            headers: {
                'Content-Type': 'application/json',
                'fspiop-source': 'sourceDfspId'
            },
            params: {
                'Type': 'PERSONAL_ID',
                'ID': '16135551234',
                'SubId': 'DRIVING_LICENSE'
            },
            payload: errorResponse
        }
        const result = await PartiesErrorByTypeIdAndSubId.put(
            {},
            request as unknown as Request,
            toolkit as unknown as StateResponseToolkit
        )
        expect(result.statusCode).toBe(200)

        const channel = PISPTransactionModel.partyNotificationChannel(
            PISPTransactionPhase.lookup,
            request.params.Type,
            request.params.ID,
            request.params.SubId)

        expect(pubSubMock.publish).toBeCalledWith(channel, errorResponse)
    })
    it('PATCH /thirdpartyRequests/transactions/{ID}', async (): Promise<void> => {
        const request = {
            method: 'PATCH',
            url: '/thirdpartyRequests/transactions/{ID}',
            headers: {
                'Content-Type': 'application/json',
                'fspiop-source': 'sourceDfspId'
            },
            params: {
                'ID': 'x42ec534-ae48-6575-g6a9-tad2955b8065'
            },
            payload: approveResponse
        }
        const result = await NotifyThirdpartyTransactionRequests.patch(
            {},
            request as unknown as Request,
            toolkit as unknown as StateResponseToolkit
        )
        expect(result.statusCode).toBe(200)

        const channel = PISPTransactionModel.notificationChannel(
            PISPTransactionPhase.approval,
            request.params.ID)

        expect(pubSubMock.publish).toBeCalledWith(channel, approveResponse)
    })
    it('PUT /thirdpartyRequests/transactions/{ID}/error', async (): Promise<void> => {
        const request = {
            method: 'PUT',
            url: '/thirdpartyRequests/transactions/{ID}/error',
            headers: {
                'Content-Type': 'application/json',
                'fspiop-source': 'sourceDfspId'
            },
            params: {
                'ID': 'x42ec534-ae48-6575-g6a9-tad2955b8065'
            },
            payload: errorResponse
        }
        const result = await NotifyErrorThirdpartyTransactionRequests.put(
            {},
            request as unknown as Request,
            toolkit as unknown as StateResponseToolkit
        )
        expect(result.statusCode).toBe(200)

        const channel = PISPTransactionModel.notificationChannel(
            PISPTransactionPhase.approval,
            request.params.ID)

        expect(pubSubMock.publish).toBeCalledWith(channel, errorResponse)
    })
})