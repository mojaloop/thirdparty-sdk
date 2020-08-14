# Contributing

We strive for stability and security.  
Pull Requests and contributions in general are welcome as long as  
they don't compromise those goals and follow the [Mojaloop Contributors Guide](https://docs.mojaloop.io/documentation/contributors-guide/)

## Code style
Coding style is `standard` described through the EditorConfig [.editorconfig](./.editorconfig) file  
and enforced by ESLint through the [.eslintrc.js](./.eslintrc.js) file. 

```bash
npm run lint
```
to validate source code format

## Code release
```bash
npm run release
```
before pushing changes to remote repository. The [CHANGELOG.md](CHANGELOG.md) file will be generated.

## Code Audit
There are two `npm script` commands dedicated to code audit:


`audit:check` is used to check vulnerability in code dependencies
```bash
npm run audit:check
```
This command is run as guard in CI/CD pipeline to ensure our code is not vulnerable.


`audit:resolve` should be used to resolve audit problems.  
Generated `audit-resolve.json` file should be committed,  
elsewhere CI/CD pipeline will stop with error in case of any audit problems.
```bash
npm run audit:resolve
```

## Pre-commit hook
> Pull Requests with broken code will not be accepted to merge.

Pre-commit hook is used to reject untested and unlinted code.  
Before every commit we run `npm test` and we lint all staged files.  
If any file is bad formatted or any unit test is broken the commit is rejected.

In case you need commit broken code use `no-verify` flag
```bash
git commit -m '<your commit message>' --no-verify
```

## Pre-push hook
Pre-push hook is used to reject untested code.  
It also enforce to have fresh and actual dependencies.  
Before every push we run `npm test` and `npm run updates:check`  
In case you need push broken code use `no-verify` flag

## Always fresh code dependencies
There is a need to have always fresh code dependencies.  
It is realized by [npm-check-updates](https://github.com/raineorshine/npm-check-updates).  
```bash
npm run updates:check
```
In case of outdated dependencies run
```bash
npm run updates:update
```
It will update `package.json`, install all dependencies and regenerate `package-lock.json`.  
All tests should be run successfully after updating the dependencies.  
Both package files should be then committed. 

## Testing
> All testing scripts are invoked via `npm run test<type>` defined in [package.json](./package.json)

The tests implementations are located in [test](./test) folder.  
[Jest](http://jestjs.io/) is used to run all types of tests.  
Jest configuration: [jest.config.js](./jest.config.js)

### Default tests
```bash
npm test
```
by default all `Unit tests` are executed

### Unit tests
```bash
npm run test:unit
```
Unit tests implementation is located in [test/unit](./test/unit) folder

### BDD tests
```bash
npm run test:bdd
```
BDD tests are specified using `Gherkin` language and are located in [test/features](./test/features) folder,  
whereas their mappings to `Jest` tests are located in [test/step-definitions](./test/step-definitions)

### Integration tests
> To run locally integration tests there is a need to build and start containers  
> with both API services with their dependencies services: (Redis as a cache & PUB/SUB notification engine). 

**Open two terminals.**  
In first:
```bash
docker-compose build
docker-compose up
```
and wait a moment until all dockerized services are up 

In second terminal
```bash
npm run test:integration
```

# Dockerized services
> `Inbound` and `Outbound API` services are dockerized.  
> To build and run use `npm run docker*` scripts defined in [package.json](./package.json)

## Inbound API
```bash
npm run docker:build:inbound
npm run docker:start:inbound
```
`Inboound API` Dockerfile: [docker/Docker.Inbound](./docker/Docker.Inbound)

## Outbound API
```bash
npm run docker:build:outbound
npm run docker:run:outbound
```
`Outboound API` Dockerfile: [docker/Docker.Outbound](./docker/Docker.Outbound)

## Docker-compose
To build and run all services
```bash
docker-compose build
docker-compose up
```
docker-compose specification: [docker-compose.yaml](./docker-compose.yaml)

# Configuration and run environments of services
> Configuration is managed by [Convict](https://github.com/mozilla/node-convict)

Services can be run in three environments: `development`, `test`, `production`.  
Selection of run environment can be done by setting `NODE_ENV` environment variable.  
Dedicated to environments configuration files are located in [config/](./config) folder. 

## Configuration file schema

Actual schema is defined in [src/shared/config.ts](./src/shared/config.ts)
```Javascript
{
  ENV: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  INBOUND: {
    HOST: {
      doc: 'The InboundAPI Hostname/IP address to bind.',
      format: '*',
      default: '0.0.0.0',
      env: 'INBOUND_HOST'
    },
    PORT: {
      doc: 'The InboundAPI port to bind.',
      format: 'port',
      default: 3001,
      env: 'INBOUND_PORT'
    }
  },
  OUTBOUND: {
    HOST: {
      doc: 'The OutboundAPI Hostname/IP address to bind.',
      format: '*',
      default: '0.0.0.0',
      env: 'OUTBOUND_HOST'
    },
    PORT: {
      doc: 'The OutboundAPI port to bind.',
      format: 'port',
      default: 3002,
      env: 'OUTBOUND_PORT'
    }
  },
  INSPECT: {
    DEPTH: {
      doc: 'Inspection depth',
      format: 'nat',
      env: 'INSPECT_DEPTH',
      default: 4
    },
    SHOW_HIDDEN: {
      doc: 'Show hidden properties',
      format: 'Boolean',
      default: false
    },
    COLOR: {
      doc: 'Show colors in output',
      format: 'Boolean',
      default: true
    }
  }
}
```

## CI/CD
[![CircleCI](https://circleci.com/gh/mojaloop/thirdparty-scheme-adapter.svg?style=svg)](https://circleci.com/gh/mojaloop/thirdparty-scheme-adapter)

CircleCI pipeline: [https://app.circleci.com/pipelines/github/mojaloop/thirdparty-scheme-adapter](https://app.circleci.com/pipelines/github/mojaloop/thirdparty-scheme-adapter)


