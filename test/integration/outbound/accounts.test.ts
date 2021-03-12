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

 * Sridhar Voruganti <sridhar.voruganti@modusbox.com>
 --------------
 ******/

import axios from 'axios'

describe('GET /accounts/{ID}', (): void => {
  const scenariosURI = 'http://127.0.0.1:4006/accounts/username1234'
  const requestConfig = {
    headers: {
      'FSPIOP-Source': 'pisp',
      'FSPIOP-Destination': 'dfspA',
      Date: new Date().toUTCString()
    }
  }
  const expectedResp = {
    accounts: [
      {
        accountNickname: 'dfspa.user.nickname1',
        id: 'dfspa.username.1234',
        currency: 'ZAR'
      },
      {
        accountNickname: 'dfspa.user.nickname2',
        id: 'dfspa.username.5678',
        currency: 'USD'
      }
    ],
    currentState: 'COMPLETED'
  }

  it('PISP requests DFSP to return user accounts for linking', async (): Promise<void> => {
    // Act
    const response = await axios.get(scenariosURI, requestConfig)

    // Assert
    expect(response.status).toBe(200)
    expect(response.data).toEqual(expectedResp)

    // Assert state machine state
    expect(response.data.currentState).toEqual('COMPLETED')
  })
})
