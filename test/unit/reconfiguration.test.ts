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
import path from 'path'
import { WebSocketServer } from 'ws'
import * as ControlAgent from '~/reconfiguration/controlAgent'
import index from '~/index'
import { Server } from '@hapi/hapi'
const setupAndStartSpy = jest.spyOn(index.server, 'setupAndStart')

describe('cli', () => {
  let wsServer: WebSocketServer
  const appConfig = Config
  const managementApiResponse = {
    inbound: {
      TLS: {
        creds: {
          ca: 'new_string',
          cert: 'new_string',
          key: 'new_string'
        }
      }
    },
    outbound: {
      TLS: {
        creds: {
          ca: 'new_string',
          cert: 'new_string',
          key: 'new_string'
        }
      }
    }
  }

  const expectedUpdatedAppConfig = {
    ...appConfig,
    INBOUND: {
      PORT: 4005,
      HOST: '0.0.0.0',
      PISP_TRANSACTION_MODE: true,
      TLS: {
        mutualTLS: {
          enabled: false
        },
        creds: {
          ca: 'new_string',
          cert: 'new_string',
          key: 'new_string'
        }
      }
    },
    outbound: {
      PORT: 4006,
      HOST: '0.0.0.0',
      TLS: {
        mutualTLS: {
          enabled: false
        },
        creds: {
          ca: 'new_string',
          cert: 'new_string',
          key: 'new_string'
        }
      }
    }
  }

  beforeEach(async (done): Promise<void> => {
    Config.PM4ML_ENABLED = true
    Config.CONTROL.MGMT_API_WS_URL = 'localhost'
    Config.CONTROL.MGMT_API_WS_PORT = 31000
    wsServer = new WebSocketServer({ port: Config.CONTROL.MGMT_API_WS_PORT })

    wsServer.on('connection', function connection(ws) {
      // A quick server solution that reuses ControlAgent functions
      ws.on('message', function message(data) {
        let msg
        try {
          msg = ControlAgent.deserialize(data)
        } catch (err) {
          ws.send(ControlAgent.build.ERROR.NOTIFY.JSON_PARSE_ERROR(null))
        }

        switch (msg.msg) {
          case ControlAgent.MESSAGE.CONFIGURATION:
            switch (msg.verb) {
              case ControlAgent.VERB.READ:
                ws.send(ControlAgent.build.CONFIGURATION.NOTIFY(managementApiResponse, msg.id))
                break
              default:
                ws.send(ControlAgent.build.ERROR.NOTIFY.UNSUPPORTED_VERB(msg.id))
                break
            }
            break
          default:
            ws.send(ControlAgent.build.ERROR.NOTIFY.UNSUPPORTED_MESSAGE(msg.id))
            break
        }
      }).on('close', async () => {
        done()
      })
    })

    setupAndStartSpy.mockResolvedValue({ Iam: 'mocked-server' } as unknown as Server)
    process.argv = ['jest', 'cli.ts', 'inbound']
    const cli = await import('~/cli')
    expect(cli).toBeDefined()
  })

  afterEach(async (): Promise<void> => {
    wsServer.close()
  })

  it('should use default port & host for inbound', async (): Promise<void> => {
    expect(index.server.setupAndStart).toHaveBeenCalledWith(
      {
        port: Config.INBOUND.PORT,
        host: Config.INBOUND.HOST,
        api: 'inbound',
        tls: expectedUpdatedAppConfig.INBOUND.TLS
      },
      path.resolve(__dirname, '../../src/interface/api-inbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Inbound
      }
    )
  })
})
