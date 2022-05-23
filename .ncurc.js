module.exports = {
  reject: [
    // husky >4 involves a full config migration with no current and apparent benefit.
    // So we are just sticking to husky@4.x.x for the time being.
    'husky',
    // Caution advised in upgrading redis-mock past 0.52.0. Investigation needed.
    'redis-mock',
    // Upgrading redis >3 the the next major version has a lot of breaking changes.
    'redis',
    '@types/redis',
    // jest/ts-jest >26 introduces a lot of breaking changes to current tests.
    'jest',
    'ts-jest'
  ]
}
