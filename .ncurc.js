// ncu reject list. ncu 18.x (the last line that runs on this repo's Node 18.20.4) reads .ncurc.js ahead of
// .ncurc.json, so this file is the single source of truth. Each group carries the reason it is held and
// what unblocks it.
module.exports = {
  reject: [
    // its major must match the Node runtime major in .nvmrc (18); a higher major only weakens type checking; bump together with the runtime
    '@types/node',
    // 7.0.2 fails npm install with ERESOLVE against the ts lint parser peer range (<6.1.0) and its Go-built tsgo binaries add Go stdlib findings to the Grype scan (re-tested 2026-10-20)
    'typescript',
    // 10.x cannot be installed by npm ci - eslint-plugin-import 2.32.0 (latest) declares a peer range that stops at eslint 9 (re-tested 2026-10-20)
    'eslint',
    // 2.x needs Node 20+ (build:api fails with File is not defined on Node 18.20.4); held at the 1.34.x line (re-tested 2026-10-20)
    '@redocly/cli',
    // 24.x is a Yarn workspace package whose postinstall runs yarn husky install and fails under npm, and its API moved six majors away from the 18.x this service codes against (re-tested 2026-10-20)
    '@mojaloop/sdk-scheme-adapter',
    // sdk-standard-components 19, api-snippets 18, central-services-shared 19 and openapi-backend 5.21+ all require the ESM-only json-schema-ref-parser 16, which Node 18 cannot require() and ts-jest 29 cannot transform; they move together with the Node 20+ runtime bump (re-tested 2026-10-20)
    '@mojaloop/sdk-standard-components',
    '@mojaloop/api-snippets',
    '@mojaloop/central-services-shared',
    'openapi-backend',
    // 15.x is ESM-only and this CommonJS build on Node 18 cannot require it (re-tested 2026-10-20)
    'commander',
    // redis 4+ replaces the callback client with a promise-based one and generic RedisClient types; src/shared/redis-connection.ts and kvs.ts need a rewrite first (re-tested 2026-10-20)
    'redis',
    'redis-mock',
    '@types/redis',
    // jest 30 removes the toThrowError/toBeCalled* matcher aliases the suites use and needs NODE_OPTIONS=--experimental-vm-modules for the ESM tree; staged as its own migration together with the runtime bump (re-tested 2026-10-20)
    'jest',
    '@types/jest',
    'ts-jest',
    'jest-junit',
    // 19.x and later need Node 20+ (23.x uses util.styleText) and break npm run dep:check on the 18.20.4 runtime; held at the last 18.x line until the runtime bump (2026-10-22)
    'npm-check-updates'
  ]
}
