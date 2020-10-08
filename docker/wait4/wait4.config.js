module.exports = {
  // format version sem-ver
  // `v{major}.${minor}.${patch}`
  wait4: 'v0.1.0',

  // How many times should we retry waiting for a service?
  retries: 10,

  // How many ms to wait before retrying a service connection?
  waitMs: 2500,

  // services definitions
  services: [
    {
      name: 'cicd-integration-tests',

      // list of services to wait for
      wait4: [
        {
          description: 'Inbound API',
          uri: 'localhost:4005',
          method: 'ncat'
        },
        {
          description: 'Outbound API',
          uri: 'localhost:4006',
          method: 'ncat'
        },
        {
          description: 'Redis Cache',
          uri: 'localhost:6379',
          method: 'ncat'
        }
      ]
    },
    {
      name: 'inbound-thirdparty-scheme-adapter',

      // list of services to wait for
      wait4: [
        {
          description: 'Redis Cache',
          uri: 'redis:6379',
          method: 'ncat'
        }
      ]
    },
    {
      name: 'outbound-thirdparty-scheme-adapter',

      // list of services to wait for
      wait4: [
        {
          description: 'Redis Cache',
          uri: 'redis:6379',
          method: 'ncat'
        }
      ]
    }
  ]
}
