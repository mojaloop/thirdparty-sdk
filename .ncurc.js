module.exports = {
  reject: [
    // Caution advised in upgrading redis-mock past 0.52.0. Investigation needed.
    'redis-mock',
    // Upgrading past redis@3 to the next major version introduces a lot of breaking changes.
    'redis',
    '@types/redis',
    // Upgrading past commander@7 introduces a lot of breaking changes.
    'commander',
    // Need a major refactor to upgrade to the next major version of this package.
    '@mojaloop/sdk-scheme-adapter',
    // This breaks internal tests.
    '@mojaloop/sdk-standard-components'
  ]
}
