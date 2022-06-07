import config from '~/shared/config'

const env = {
  config: config,
  inbound: {
    baseUri: `http://localhost:${config.inbound.port}`
  },
  outbound: {
    baseUri: `http://localhost:${config.outbound.port}`
  }
}

export default env
