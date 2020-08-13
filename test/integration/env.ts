import config from '~/shared/config'

const env = {
  config: config,
  inbound: {
    baseUri: `http://127.0.0.1:${config.INBOUND.PORT}`
  },
  outbound: {
    baseUri: `http://127.0.0.1:${config.OUTBOUND.PORT}`
  }
}

export default env
