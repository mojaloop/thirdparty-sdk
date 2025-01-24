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
 --------------
 ******/

import Config from '~/shared/config'
import Handlers from '~/handlers'
import { Server as HapiServer } from '@hapi/hapi'
import index from '~/index'
import path from 'path'
import { describe, it, expect, jest } from '@jest/globals'

const setupAndStartSpy = jest.spyOn(index.server, 'setupAndStart')
setupAndStartSpy.mockImplementationOnce(() => {
  return Promise.resolve({ Iam: 'mocked-server', stop: jest.fn() } as unknown as HapiServer)
})
setupAndStartSpy.mockImplementationOnce(() => {
  return Promise.resolve({ Iam: 'mocked-server', stop: jest.fn() } as unknown as HapiServer)
})
describe('cli', (): void => {
  it('should use default port & host', async (): Promise<void> => {
    process.argv = ['jest', 'cli.ts', 'all']
    const cli = await import('~/cli')
    expect(cli).toBeDefined()
    // Give some time for servers to setup
    await new Promise((wait) => setTimeout(wait, 1000))
    expect(setupAndStartSpy).toHaveBeenNthCalledWith(
      1,
      {
        port: Config.inbound.port,
        host: Config.inbound.host,
        api: 'inbound',
        tls: Config.inbound.tls,
        serviceConfig: Config
      },
      path.resolve(__dirname, '../../src/interface/api-inbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Inbound
      }
    )
    expect(setupAndStartSpy).toHaveBeenNthCalledWith(
      2,
      {
        port: Config.outbound.port,
        host: Config.outbound.host,
        api: 'outbound',
        tls: Config.outbound.tls,
        serviceConfig: Config
      },
      path.resolve(__dirname, '../../src/interface/api-outbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Outbound
      }
    )
  })
})
