/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/

// It inherits from the Server class from the 'ws' websocket library for Node, which in turn
// inherits from EventEmitter. We exploit this to emit an event when a reconfigure message is sent
// to this server. Then, when this server's reconfigure method is called, it reconfigures itself
// and sends a message to all clients notifying them of the new application configuration.
//
// It expects new configuration to be supplied as an array of JSON patches.
import assert from 'assert/strict'
import { ServiceConfig } from '~/shared/config'
import ws from 'ws'
import jsonPatch from 'fast-json-patch'
import { generateSlug } from 'random-word-slugs'
import { Logger as SDKLogger } from '@mojaloop/sdk-standard-components'
import _ from 'lodash'

// TODO: This needs proper typing, for now inferred types are used.

/**************************************************************************
 * The message protocol messages, verbs, and errors
 *************************************************************************/
export const MESSAGE = {
  CONFIGURATION: 'CONFIGURATION',
  ERROR: 'ERROR'
}

export const VERB = {
  READ: 'READ',
  NOTIFY: 'NOTIFY',
  PATCH: 'PATCH'
}

export const ERROR = {
  UNSUPPORTED_MESSAGE: 'UNSUPPORTED_MESSAGE',
  UNSUPPORTED_VERB: 'UNSUPPORTED_VERB',
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR'
}

/**************************************************************************
 * Events emitted by the control client
 *************************************************************************/
export const EVENT = {
  RECONFIGURE: 'RECONFIGURE'
}

export const serialize = JSON.stringify
export const deserialize = (msg: { toString: () => string }) => {
  //reviver function
  return JSON.parse(msg.toString(), (_k, v) => {
    if (
      v !== null &&
      typeof v === 'object' &&
      'type' in v &&
      v.type === 'Buffer' &&
      'data' in v &&
      Array.isArray(v.data)
    ) {
      return Buffer.from(v.data)
    }
    return v
  })
}

const buildMsg = (verb: string, msg: string, data: any, id = generateSlug(4)) =>
  serialize({
    verb,
    msg,
    data,
    id
  })

const buildPatchConfiguration = (oldConf: any, newConf: any, id: any) => {
  const patches = jsonPatch.compare(oldConf, newConf)
  return buildMsg(VERB.PATCH, MESSAGE.CONFIGURATION, patches, id)
}

/**************************************************************************
 * build
 *
 * Public object exposing an API to build valid protocol messages.
 * It is not the only way to build valid messages within the protocol.
 *************************************************************************/
export const build = {
  CONFIGURATION: {
    PATCH: buildPatchConfiguration,
    READ: (id: any) => buildMsg(VERB.READ, MESSAGE.CONFIGURATION, {}, id),
    NOTIFY: (config: any, id: any) => buildMsg(VERB.NOTIFY, MESSAGE.CONFIGURATION, config, id)
  },
  ERROR: {
    NOTIFY: {
      UNSUPPORTED_MESSAGE: (id: any) => buildMsg(VERB.NOTIFY, MESSAGE.ERROR, ERROR.UNSUPPORTED_MESSAGE, id),
      UNSUPPORTED_VERB: (id: any) => buildMsg(VERB.NOTIFY, MESSAGE.ERROR, ERROR.UNSUPPORTED_VERB, id),
      JSON_PARSE_ERROR: (id: any) => buildMsg(VERB.NOTIFY, MESSAGE.ERROR, ERROR.JSON_PARSE_ERROR, id)
    }
  }
}

/**************************************************************************
 * Client
 *
 * The Control Client. Client for the websocket control API.
 * Used to hot-restart the SDK.
 *
 * logger    - Logger- see SDK logger used elsewhere
 * address   - address of control server
 * port      - port of control server
 *************************************************************************/
export class Client extends ws {
  /**
   * Consider this a private constructor.
   * `Client` instances outside of this class should be created via the `Create(...args)` static method.
   */
  protected logger: SDKLogger.Logger
  protected appConfig: ServiceConfig
  protected socket: any

  constructor(address = 'localhost', port: number, appConfig: ServiceConfig) {
    super(`ws://${address}:${port}`)
    this.logger = new SDKLogger.Logger()
    this.appConfig = appConfig
  }

  // Really only exposed so that a user can import only the client for convenience
  get Build() {
    return build
  }

  static Create(address: string, port: number, appConfig: ServiceConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client(address, port, appConfig)
      client.on('open', () => resolve(client))
      client.on('error', (err: any) => reject(err))
      client.on('message', client._handle)
    })
  }

  async send(msg: string) {
    const data = typeof msg === 'string' ? msg : serialize(msg)
    this.logger.push({ data }).log('Sending message')
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return new Promise((resolve) => super.send.call(this, data, resolve))
  }

  // Receive a single message
  async receive() {
    return new Promise((resolve) =>
      this.once('message', (data: any) => {
        const msg = deserialize(data)
        this.logger.push({ msg }).log('Received')
        resolve(msg)
      })
    )
  }

  // Close connection
  async stop() {
    this.logger.log('Control client shutting down...')
    this.close()
  }

  reconfigure({ logger = this.logger, port = 0, appConfig = this.appConfig }) {
    assert(port === this.socket.remotePort, 'Cannot reconfigure running port')
    return () => {
      this.logger = logger
      this.appConfig = appConfig
      this.logger.log('restarted')
    }
  }

  // Handle incoming message from the server.
  _handle(data: any) {
    // TODO: json-schema validation of received message- should be pretty straight-forward
    // and will allow better documentation of the API
    let msg
    try {
      msg = deserialize(data)
    } catch (err) {
      this.logger.push({ data }).log("Couldn't parse received message")
      this.send(build.ERROR.NOTIFY.JSON_PARSE_ERROR(null))
    }
    this.logger.push({ msg }).log('Handling received message')
    switch (msg.msg) {
      case MESSAGE.CONFIGURATION:
        switch (msg.verb) {
          case VERB.NOTIFY: {
            const dup = JSON.parse(JSON.stringify(this.appConfig)) // fast-json-patch explicitly mutates
            _.merge(dup, msg.data)
            this.logger.push({ oldConf: this.appConfig, newConf: dup }).log('Emitting new configuration')
            this.emit(EVENT.RECONFIGURE, dup)
            break
          }
          case VERB.PATCH: {
            const dup = JSON.parse(JSON.stringify(this.appConfig)) // fast-json-patch explicitly mutates
            jsonPatch.applyPatch(dup, msg.data)
            this.logger.push({ oldConf: this.appConfig, newConf: dup }).log('Emitting new configuration')
            this.emit(EVENT.RECONFIGURE, dup)
            break
          }
          default:
            this.send(build.ERROR.NOTIFY.UNSUPPORTED_VERB(msg.id))
            break
        }
        break
      default:
        this.send(build.ERROR.NOTIFY.UNSUPPORTED_MESSAGE(msg.id))
        break
    }
  }
}
