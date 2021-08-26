import config from '~/shared/config'

const env = {
  config: config,
  inbound: {
    baseUri: `http://localhost:${config.INBOUND.PORT}`
  },
  outbound: {
    baseUri: `http://localhost:${config.OUTBOUND.PORT}`
  }
}

export default env
