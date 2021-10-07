/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License")
 and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Paweł Marzec <pawel.marzec@modusbox.com>
 * Hernani Batista <hernani.batista@modusbox.com>
 --------------
 ******/

import axios from 'axios'

describe('POST /authorizations', (): void => {
  const scenariosURI = `http://127.0.0.1:4056/authorizations`
  const options = {
    toParticipantId: 'pisp',
    authenticationType: 'U2F',
    retriesLeft: '1',
    amount: {
      currency: 'USD',
      amount: '100'
    },
    transactionId: 'c87e9f61-e0d1-4a1c-a992-002718daf402',
    transactionRequestId: 'aca279be-60c6-42ff-aab5-901d61b5e35c',
    quote: {
      transferAmount: {
        currency: 'USD',
        amount: '105'
      },
      expiration: '2020-07-15T09:48:54.961Z',
      ilpPacket: 'ilp-packet-value',
      condition: 'condition-000000000-111111111-222222222-abc'
    }
  }

  it('DFSP asks via SDK the PISP to deliver Authorization from User', async (): Promise<void> => {
    // Act
    const response = await axios.post(scenariosURI, options)

    // Assert
    expect(response.status).toBe(200)
    expect(response.data.responseType).toEqual('ENTERED')

    // Assert authenticationInfo
    const authInfo = response.data.authenticationInfo
    const authValue = authInfo.authenticationValue
    expect(authInfo.authentication).toEqual(options.authenticationType)
    expect(authValue.pinValue).toBeDefined()
    expect(authValue.counter).toEqual(options.retriesLeft)

    // Assert state machine state
    expect(response.data.currentState).toEqual('COMPLETED')
  })
})
