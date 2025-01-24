import * as ControlAgent from '~/reconfiguration/controlAgent'
import defaultConfig from '~/shared/config'
import { WebSocketServer } from 'ws'
import { generateSlug } from 'random-word-slugs'
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { Logger as SDKLogger } from '@mojaloop/sdk-standard-components'

// default SDKLogger instance
export const logger = new SDKLogger.Logger()
export function createLogger(params?: SDKLogger.LoggerConstructorParams): SDKLogger.Logger {
  return new SDKLogger.Logger(params)
}

describe('ControlAgent', () => {
  it('exposes a valid message API', () => {
    expect(Object.keys(ControlAgent.build).sort()).toEqual(Object.keys(ControlAgent.MESSAGE).sort())
    Object.entries(ControlAgent.build).forEach(([_messageType, builders]) => {
      expect(Object.keys(ControlAgent.VERB)).toEqual(expect.arrayContaining(Object.keys(builders)))
    })
    expect(Object.keys(ControlAgent.build.ERROR.NOTIFY).sort()).toEqual(Object.keys(ControlAgent.ERROR).sort())
  })

  describe('API', () => {
    let client: ControlAgent.Client
    let wsServer: WebSocketServer

    const appConfig = defaultConfig
    const changedConfig = { ...appConfig, some: 'thing' }

    beforeEach(async () => {
      wsServer = new WebSocketServer({ port: 8080 })
      wsServer.on('connection', function connection(ws) {
        // Quick mock server solution that reuses ControlAgent functions to format messages
        // that mocks `mojaloop-payment-manager-management-api` ws server
        ws.on('message', function message(data) {
          let msg
          try {
            msg = ControlAgent.deserialize(data)
          } catch (err) {
            logger.error(err)
            ws.send(ControlAgent.build.ERROR.NOTIFY.JSON_PARSE_ERROR(null))
          }

          switch (msg.msg) {
            case ControlAgent.MESSAGE.CONFIGURATION:
              switch (msg.verb) {
                case ControlAgent.VERB.READ:
                  ws.send(ControlAgent.build.CONFIGURATION.NOTIFY(changedConfig, msg.id))
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

      client = (await ControlAgent.Client.Create('localhost', 8080, defaultConfig)) as ControlAgent.Client
    })

    afterEach(async () => {
      await client.stop()
      wsServer.close()
    })

    it('receives config when requested', async () => {
      await client.send(ControlAgent.build.CONFIGURATION.READ(null))
      const response: any = await client.receive()
      expect(response).toEqual({
        ...JSON.parse(ControlAgent.build.CONFIGURATION.NOTIFY(changedConfig, response.id))
      })
    })

    it('emits new config when received', async () => {
      const newConfigEvent = new Promise((resolve) => client.on(ControlAgent.EVENT.RECONFIGURE, resolve))
      const updateConfMsg = ControlAgent.build.CONFIGURATION.PATCH({}, changedConfig, generateSlug(4))
      Promise.all(
        [...wsServer.clients.values()].map((socket) => new Promise((resolve) => socket.send(updateConfMsg, resolve)))
      )
      const newConfEventData = await newConfigEvent
      expect(newConfEventData).toEqual(changedConfig)
    })
  })
})
