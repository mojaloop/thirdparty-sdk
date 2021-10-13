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

describe('GET /linking/accounts/{fspId}/{userId}', (): void => {
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
    const scenariosURI = 'http://127.0.0.1:4006/linking/accounts/dfspa/username1234'
    // Act
    const response = await axios.get(scenariosURI)
    // Assert
    expect(response.status).toBe(200)
    expect(response.data).toEqual(expectedResp)
  })

  it('PISP requests DFSP: Expect ID not found', async (): Promise<void> => {
    const scenariosURI = 'http://127.0.0.1:4006/linking/accounts/dfspa/test'
    const idNotFoundResp = {
      accounts: [],
      errorInformation: {
        errorCode: '3200',
        errorDescription: 'Generic ID not found'
      },
      currentState: 'COMPLETED'
    }

    await axios.get(scenariosURI)
      .catch(error => {
        // Assert
        expect(error.response.status).toBe(500)
        expect(error.response.data).toEqual(expect.objectContaining(idNotFoundResp))
      })
  })
})
