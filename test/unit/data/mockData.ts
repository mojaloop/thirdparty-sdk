import { thirdparty as tpAPI, v1_1 as fspiopAPI } from '@mojaloop/api-snippets'
import { BackendValidateConsentRequestsResponse } from '~/shared/dfsp-backend-requests'
import * as OutboundAPI from '~/interface/outbound/api_interfaces'

export const postThirdpartyRequestsTransactionRequest = {
  headers: {
    'fspiop-source': 'pispA',
    'fspiop-destination': 'dfspA'
  },
  params: {},
  payload: {
    transactionRequestId: '7d34f91d-d078-4077-8263-2c047876fcf6',
    sourceAccountId: 'Dfsps.alice.1234',
    consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
    payee: {
      partyIdInfo: {
        partyIdType: 'MSISDN',
        partyIdentifier: '+44 1234 5678',
        fspId: 'dfspb'
      }
    },
    payer: {
      partyIdType: 'MSISDN',
      partyIdentifier: '+44 8765 4321',
      fspId: 'disca'
    },
    amountType: 'SEND',
    amount: {
      amount: '100',
      currency: 'USD'
    },
    transactionType: {
      scenario: 'TRANSFER',
      initiator: 'PAYER',
      initiatorType: 'CONSUMER'
    },
    expiration: '2020-07-15T22:17:28.985-01:00'
  } as tpAPI.Schemas.ThirdpartyRequestsTransactionsPostRequest
}

export const postQuotesRequest = {
  headers: {
    'fspiop-source': 'dfspA',
    'fspiop-destination': 'dfspB'
  },
  params: {},
  payload: {
    quoteId: '1e8beca7-2f72-4d3b-b775-fc1a6470e1de',
    transactionId: 'c1e7bfc3-f5f5-45d3-a255-6bb3c9e22869',
    note: '',
    transactionRequestId: '7d34f91d-d078-4077-8263-2c047876fcf6',
    payee: {
      partyIdInfo: {
        partyIdType: 'MSISDN',
        partyIdentifier: '+44 1234 5678',
        fspId: 'dfspb'
      }
    },
    payer: {
      personalInfo: {
        complexName: {
          firstName: 'Alice',
          lastName: 'K'
        }
      },
      partyIdInfo: {
        partyIdType: 'MSISDN',
        partyIdentifier: '+44 8765 4321',
        fspId: 'dfspa'
      }
    },
    amountType: 'SEND',
    amount: {
      amount: '100',
      currency: 'USD'
    },
    transactionType: {
      scenario: 'TRANSFER',
      initiator: 'PAYER',
      initiatorType: 'CONSUMER'
    }
  } as tpAPI.Schemas.QuotesIDPostRequest
}
export const accountsRequest = {
  headers: {
    'fspiop-source': 'pispA',
    'fspiop-destination': 'dfspA',
    accept: 'application/json'
  },
  params: {
    ID: 'username1234'
  },
  payload: {
    accounts: [
      {
        accountNickname: 'dfspa.user.nickname1',
        address: 'dfspa.username.1234',
        currency: 'ZAR'
      },
      {
        accountNickname: 'dfspa.user.nickname2',
        address: 'dfspa.username.5678',
        currency: 'USD'
      }
    ]
  } as tpAPI.Schemas.AccountsIDPutResponse
}

export const accountsRequestError = {
  headers: {
    'fspiop-source': 'pispA',
    'fspiop-destination': 'dfspA'
  },
  params: {
    ID: 'test'
  },
  payload: {
    errorInformation: {
      errorCode: '3200',
      errorDescription: 'Generic ID not found'
    }
  } as fspiopAPI.Schemas.ErrorInformationObject
}
export const backendAuthenticateAuthTokenRequest = {
  headers: {},
  params: {},
  payload: {
    consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
    authToken: '123456'
  }
}
export const backendAuthenticateAuthTokenResponseValid = {
  headers: {},
  params: {},
  payload: {
    isValid: true
  }
}
export const backendAuthenticateAuthTokenResponseInvalid = {
  headers: {},
  params: {},
  payload: {
    isValid: false
  }
}
export const inboundConsentsPostRequest = {
  headers: {},
  params: {},
  payload: {
    consentId: '8e34f91d-d078-4077-8263-2c047876fcf6',
    consentRequestId: 'bbce3ce8-c247-4153-aab1-f89768c93b18',
    status: 'ISSUED',
    scopes: [
      {
        address: 'some-id',
        actions: [
          'ACCOUNTS_GET_BALANCE',
          'ACCOUNTS_TRANSFER'
        ]
      }
    ]
  } as tpAPI.Schemas.ConsentsPostRequestPISP
}
export const consentRequestsPost = {
  headers: {},
  params: {},
  payload: {
    consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
    userId: 'dfspa.username',
    scopes: [
      {
        address: 'dfspa.username.1234',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      },
      {
        address: 'dfspa.username.5678',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      }
    ],
    authChannels: [
      'WEB',
      'OTP'
    ],
    callbackUri: 'pisp-app://callback.com'
  } as tpAPI.Schemas.ConsentRequestsPostRequest,
  response: {
    isValid: true,
    data: {
      authChannels: [
        'WEB'
      ],
      authUri: 'dfspa.com/authorize?consentRequestId=456'
    }
  } as BackendValidateConsentRequestsResponse,
  responseOTP: {
    isValid: true,
    data: {
      authChannels: [
        'OTP'
      ]
    }
  } as BackendValidateConsentRequestsResponse,
  responseError: {
    isValid: false,
    data: {},
    errorInformation: {
      errorCode: '7204',
      errorDescription: 'FSP does not support any requested scope actions'
    }
  } as BackendValidateConsentRequestsResponse,
  responseErrorAuthChannel: {
    data: {
      authChannels: [
        'TEST'
      ]
    }
  },
  otpRequest: {
    consentRequestId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
    username: 'TBD',
    message: 'TBD'
  },
  otpResponse: {
    otp: '98765'
  }
}
export const consentRequestsPut = {
  headers: {},
  params: {
    ID: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  },
  payload: {
    scopes: [
      {
        address: 'dfspa.username.1234',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      },
      {
        address: 'dfspa.username.5678',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      }
    ],
    callbackUri: 'pisp-app://callback.com',
    authUri: 'dfspa.com/authorize?consentRequestId=456',
    authChannels: [
      'WEB'
    ]
  } as tpAPI.Schemas.ConsentRequestsIDPutResponseWeb
}
export const consentRequestsPutOTP = {
  headers: {},
  params: {
    ID: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  },
  payload: {
    scopes: [
      {
        address: 'dfspa.username.1234',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      },
      {
        address: 'dfspa.username.5678',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      }
    ],
    callbackUri: 'pisp-app://callback.com',
    authChannels: [
      'OTP'
    ]
  } as tpAPI.Schemas.ConsentRequestsIDPutResponseOTP
}
export const consentRequestsPutError = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'dfspA'
  },
  params: {
    ID: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  },
  payload: {
    errorInformation: {
      errorCode: '7204',
      errorDescription: 'FSP does not support any requested scope actions'
    }
  } as fspiopAPI.Schemas.ErrorInformationObject
}
export const getServicesByServiceTypeRequest = {
  headers: {
    'fspiop-source': 'pispA',
    'fspiop-destination': 'switch'
  },
  params: {
    ServiceType: 'THIRD_PARTY_DFSP'
  },
  payload: {}
}
export const putServicesByServiceTypeRequest = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'pispA'
  },
  params: {
    ServiceType: 'THIRD_PARTY_DFSP'
  },
  payload: {
    providers: [
      'dfspA',
      'dfspB'
    ]
  } as tpAPI.Schemas.ServicesServiceTypePutResponse
}
export const putServicesByServiceTypeRequestError = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'pispA'
  },
  params: {
    ServiceType: 'THIRD_PARTY_DFSP'
  },
  payload: {
    errorInformation: {
      errorCode: '7201',
      errorDescription: 'No thirdparty enabled FSP found',
      extensionList: {
        extension: [
          {
            key: 'test',
            value: 'test'
          }
        ]
      }
    }
  } as fspiopAPI.Schemas.ErrorInformationObject
}
export const linkingRequestConsentPostRequest = {
  headers: {},
  params: {},
  payload: {
    consentRequestId: 'bbce3ce8-c247-4153-aab1-f89768c93b18',
    toParticipantId: 'dfspA',
    accounts: [
      { accountNickname: 'XXXXXXnt', address: 'dfspa.username.1234', currency: 'ZAR' },
      { accountNickname: 'SpeXXXXXXXXnt', address: 'dfspa.username.5678', currency: 'USD' }
    ],
    actions: ['ACCOUNTS_GET_BALANCE', 'ACCOUNTS_TRANSFER'],
    userId: 'username1234',
    callbackUri: 'pisp-app://callback.com'
  } as OutboundAPI.Schemas.LinkingRequestConsentPostRequest
}
export const consentRequestsIDPatchRequest = {
  headers: {},
  params: {
    ID: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  },
  payload: {
    authToken: '123456'
  } as tpAPI.Schemas.ConsentRequestsIDPatchRequest
}
export const linkingRequestConsentIDAuthenticatePatchRequest = {
  headers: {},
  params: {
    ID: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  },
  payload: {
    authToken: '123456'
  } as OutboundAPI.Schemas.LinkingRequestConsentIDAuthenticateRequest
}
export const linkingRequestConsentIDPassCredentialPostRequest = {
  headers: {},
  params: {
    ID: 'b51ec534-ee48-4575-b6a9-ead2955b8069'
  },
  payload: {
    credential: {
      payload: {
        id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
        rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
        response: {
          clientDataJSON: 'clientDataJSON-must-not-have-fewer-than-121-characters Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
          attestationObject: 'attestationObject-must-not-have-fewer-than-306-characters Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
        },
        type: 'public-key'
      }
    }
  } as OutboundAPI.Schemas.LinkingRequestConsentIDPassCredentialRequest
}

export const inboundConsentsVerifiedPatchRequest = {
  headers: {},
  params: {
    ID: '8e34f91d-d078-4077-8263-2c047876fcf6'
  },
  payload: {
    credential: {
      status: 'VERIFIED'
    }
  } as tpAPI.Schemas.ConsentsIDPatchResponseVerified
}
export const putConsentsIdRequestError = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'pispA'
  },
  params: {
    ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  },
  payload: {
    errorInformation: {
      errorCode: '7212',
      errorDescription: 'Signed challenge does not match derived challenge',
      extensionList: {
        extension: [
          {
            key: 'test',
            value: 'test'
          }
        ]
      }
    }
  } as fspiopAPI.Schemas.ErrorInformationObject
}
export const inboundPutConsentsIdRequestSignedCredential = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'dfspA'
  },
  params: {
    ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  },
  payload: {
    scopes: [
      {
        address: 'dfspa.username.1234',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      },
      {
        address: 'dfspa.username.5678',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      }
    ],
    credential: {
      credentialType: 'FIDO',
      status: 'PENDING',
      fidoPayload: {
        id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
        rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
        response: {
          clientDataJSON: 'clientDataJSON-must-not-have-fewer-than-121-characters Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
          attestationObject: 'attestationObject-must-not-have-fewer-than-306-characters Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
        },
        type: 'public-key'
      }
    }
  } as tpAPI.Schemas.ConsentsIDPutResponseSigned
}
export const inboundPutConsentsIdRequestVerifiedCredential = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'dfspA'
  },
  params: {
    ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  },
  payload: {
    status: 'ISSUED',
    scopes: [
      {
        address: 'dfspa.username.1234',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      },
      {
        address: 'dfspa.username.5678',
        actions: [
          'ACCOUNTS_TRANSFER',
          'ACCOUNTS_GET_BALANCE'
        ]
      }
    ],
    credential: {
      credentialType: 'FIDO',
      status: 'VERIFIED',
      fidoPayload: {
        id: 'credential id: identifier of pair of keys, base64 encoded, min length 59',
        rawId: 'raw credential id: identifier of pair of keys, base64 encoded, min length 59',
        response: {
          clientDataJSON: 'clientDataJSON-must-not-have-fewer-than-121-characters Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
          attestationObject: 'attestationObject-must-not-have-fewer-than-306-characters Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
        },
        type: 'public-key'
      }
    }
  } as tpAPI.Schemas.ConsentsIDPutResponseVerified
}
export const inboundPutParticipantsTypeIdRequest = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'pispA'
  },
  params: {
    ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  },
  payload: {
    fspId: 'central-auth'
  } as tpAPI.Schemas.ParticipantsTypeIDPutResponse
}
export const inboundPutParticipantsTypeIdRequestError = {
  headers: {
    'fspiop-source': 'switch',
    'fspiop-destination': 'pispA'
  },
  params: {
    ID: '520f9165-7be6-4a40-9fc8-b30fcf4f62ab'
  },
  payload: {
    errorInformation: {
      errorCode: '3200',
      errorDescription: 'Generic ID not found',
      extensionList: {
        extension: [
          {
            key: 'test',
            value: 'test'
          }
        ]
      }
    }
  } as fspiopAPI.Schemas.ErrorInformationObject
}
