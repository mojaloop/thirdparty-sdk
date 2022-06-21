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

 * Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/

import Config from '~/shared/config'
import Handlers from '~/handlers'
import path from 'path'
import { WebSocketServer } from 'ws'
import * as ControlAgent from '~/reconfiguration/controlAgent'
import index from '~/index'
import { Server as HapiServer } from '@hapi/hapi'
import { Server } from '~/api'

const setupAndStartSpy = jest.spyOn(index.server, 'setupAndStart')

describe('cli', () => {
  let wsServer: WebSocketServer
  let server: Server
  Config.pm4mlEnabled = true
  Config.control.mgmtAPIWsUrl = 'localhost'
  Config.control.mgmtAPIWsPort = 31000
  const appConfig = Config
  const managementApiResponse = {
    inbound: {
      tls: {
        creds: {
          ca: 'new_string',
          cert: 'new_string',
          key: 'new_string'
        }
      }
    },
    outbound: {
      tls: {
        creds: {
          ca: 'new_string',
          cert: 'new_string',
          key: 'new_string'
        }
      }
    },
    validateInboundJws: true,
    jwsSign: true,
    jwsSigningKey: 'new_string',
    jwsVerificationKeysDirectory: 'new_string'
  }

  const expectedUpdatedAppConfig = {
    ...appConfig,
    inbound: {
      port: 4005,
      host: '0.0.0.0',
      pispTransactionMode: true,
      tls: {
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
      port: 4006,
      host: '0.0.0.0',
      tls: {
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
    validateInboundJws: true,
    jwsSign: true,
    jwsSigningKey: 'new_string',
    jwsVerificationKeysDirectory: 'new_string'
  }

  beforeEach(async (): Promise<void> => {
    wsServer = new WebSocketServer({ port: Config.control.mgmtAPIWsPort })

    wsServer.on('connection', function connection(ws) {
      // Quick mock server solution that reuses ControlAgent functions to format messages
      // that mocks `mojaloop-payment-manager-management-api` ws server
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
      })
    })

    setupAndStartSpy.mockImplementation(() =>
      Promise.resolve({ Iam: 'mocked-server', stop: jest.fn() } as unknown as HapiServer)
    )
    server = await Server.create(Config)
  })

  afterEach(async (): Promise<void> => {
    jest.clearAllMocks()
    wsServer.close()
    await server.stop()
  })

  it('should retrieve updated configuration from management api on start', async (): Promise<void> => {
    expect(index.server.setupAndStart).toHaveBeenNthCalledWith(
      1,
      {
        port: Config.inbound.port,
        host: Config.inbound.host,
        api: 'inbound',
        tls: expectedUpdatedAppConfig.inbound.tls,
        serviceConfig: expect.objectContaining({
          pm4mlEnabled: expectedUpdatedAppConfig.pm4mlEnabled,
          validateInboundJws: expectedUpdatedAppConfig.validateInboundJws,
          jwsSign: expectedUpdatedAppConfig.jwsSign,
          jwsSigningKey: expectedUpdatedAppConfig.jwsSigningKey,
          jwsVerificationKeysDirectory: expectedUpdatedAppConfig.jwsVerificationKeysDirectory
        })
      },
      path.resolve(__dirname, '../../src/interface/api-inbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Inbound
      }
    )
    expect(index.server.setupAndStart).toHaveBeenNthCalledWith(
      2,
      {
        port: Config.outbound.port,
        host: Config.outbound.host,
        api: 'outbound',
        tls: expectedUpdatedAppConfig.outbound.tls,
        serviceConfig: expect.objectContaining({
          pm4mlEnabled: expectedUpdatedAppConfig.pm4mlEnabled,
          validateInboundJws: expectedUpdatedAppConfig.validateInboundJws,
          jwsSign: expectedUpdatedAppConfig.jwsSign,
          jwsSigningKey: expectedUpdatedAppConfig.jwsSigningKey,
          jwsVerificationKeysDirectory: expectedUpdatedAppConfig.jwsVerificationKeysDirectory
        })
      },
      path.resolve(__dirname, '../../src/interface/api-outbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Outbound
      }
    )
  })

  it('should restart servers with updated configuration on configuration ws message', async (): Promise<void> => {
    // Send a message to the client of updated configuration after its running
    wsServer.clients.forEach(function each(client) {
      client.send(ControlAgent.build.CONFIGURATION.NOTIFY(managementApiResponse, ''))
    })
    // We wait for the servers to get restarted
    await new Promise((wait) => setTimeout(wait, 1000))

    expect(index.server.setupAndStart).toHaveBeenNthCalledWith(
      1,
      {
        port: Config.inbound.port,
        host: Config.inbound.host,
        api: 'inbound',
        tls: expectedUpdatedAppConfig.inbound.tls,
        serviceConfig: expect.objectContaining({
          pm4mlEnabled: expectedUpdatedAppConfig.pm4mlEnabled,
          validateInboundJws: expectedUpdatedAppConfig.validateInboundJws,
          jwsSign: expectedUpdatedAppConfig.jwsSign,
          jwsSigningKey: expectedUpdatedAppConfig.jwsSigningKey,
          jwsVerificationKeysDirectory: expectedUpdatedAppConfig.jwsVerificationKeysDirectory
        })
      },
      path.resolve(__dirname, '../../src/interface/api-inbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Inbound
      }
    )
    expect(index.server.setupAndStart).toHaveBeenNthCalledWith(
      2,
      {
        port: Config.outbound.port,
        host: Config.outbound.host,
        api: 'outbound',
        tls: expectedUpdatedAppConfig.outbound.tls,
        serviceConfig: expect.objectContaining({
          pm4mlEnabled: expectedUpdatedAppConfig.pm4mlEnabled,
          validateInboundJws: expectedUpdatedAppConfig.validateInboundJws,
          jwsSign: expectedUpdatedAppConfig.jwsSign,
          jwsSigningKey: expectedUpdatedAppConfig.jwsSigningKey,
          jwsVerificationKeysDirectory: expectedUpdatedAppConfig.jwsVerificationKeysDirectory
        })
      },
      path.resolve(__dirname, '../../src/interface/api-outbound.yaml'),
      {
        ...Handlers.Shared,
        ...Handlers.Outbound
      }
    )
  })
})
