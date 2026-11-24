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
    // 24.x no longer publishes main/types, so the OutboundAPI type imports must move first.
    '@mojaloop/sdk-scheme-adapter',
    // This breaks internal tests.
    '@mojaloop/sdk-standard-components',

    // --- Held on the Node 26 move (2026-11-24); each needs its own upgrade PR ---
    // Its major must match the Node runtime major in .nvmrc (26); bump together with the runtime.
    '@types/node',
    // typescript 7 fails npm install with ERESOLVE: @typescript-eslint 8.74 declares a peer range of typescript <6.1.0.
    'typescript',
    // eslint 10 needs eslint-plugin-import support (its latest declares a peer range that stops at eslint 9);
    // the resolver and jest plugin majors move with it.
    'eslint',
    'eslint-import-resolver-typescript',
    'eslint-plugin-jest',
    // central-services-shared 19 still declares a central-services-logger 11.x.x peer and makes FSPIOPHeaderValidation
    // require Accept on POST/DELETE; move together with the other services once shared accepts logger 12.
    '@mojaloop/central-services-shared',
    // api-snippets 18 changes the generated API types this service compiles against; needs a code review pass.
    '@mojaloop/api-snippets',
    // jest 30 (with @types/jest 30 and jest-junit 17) is a test-runner upgrade; verify the suites separately.
    'jest',
    '@types/jest',
    'jest-junit',
    // @hapi/hapi 21.4.x types request.headers values as unknown, which breaks 31 header reads in src/handlers
    // (TS2322/TS2345); held at 21.3.12 until those reads are narrowed.
    '@hapi/hapi',
    // openapi-backend 5.21+ depends on @apidevtools/json-schema-ref-parser 16, which is ESM-only, so the jest
    // CommonJS loader fails 11 suites; 5.20.0 is the last release on 11.x. Also forced in overrides for the
    // copy nested in central-services-shared.
    'openapi-backend',
    // uuid 12+ ships ESM-only; check the jest CommonJS loader before moving.
    'uuid',
    // Tooling majors to evaluate one at a time in the follow-up upgrade PR.
    '@commitlint/cli',
    '@commitlint/config-conventional',
    '@redocly/cli',
    '@types/hapi__inert',
    'json-canonicalize',
    'lint-staged',
    'npm-check-updates',
    'release-please'
  ]
}
