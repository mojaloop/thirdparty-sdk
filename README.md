# Mojaloop Thirdparty SDK
[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/thirdparty-sdk.svg?style=flat)](https://github.com/mojaloop/thirdparty-sdk/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/thirdparty-sdk.svg?style=flat)](https://github.com/mojaloop/thirdparty-sdk/releases)
[![CircleCI](https://circleci.com/gh/mojaloop/thirdparty-sdk.svg?style=svg)](https://circleci.com/gh/mojaloop/thirdparty-sdk)

> This package provides a Thirdparty (PISP) SDK that interfaces between a Mojaloop API compliant switch and a Thirdparty backend platform that does not natively implement the Mojaloop API.

The API between the SDK and the Thirdparty backend is synchronous HTTP while the interface between the SDK and the switch is native Mojaloop Third Party API.

This package exemplifies the use of the Mojaloop SDK Standard Components for TLS, JWS and ILP and is should be use together with [mojaloop/sdk-scheme-adapter](https://github.com/mojaloop/sdk-scheme-adapter)


## Quick Start
> The steps shown below illustrate setting up the Mojaloop Thirdparty SDK locally and how to run Inbound  and Outbound API services listening on `localhost`

1. Clone repo
   ```bash
   git clone git@github.com:mojaloop/thirdparty-sdk.git
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Modify the hosts to setup local DNS for Redis
   ```bash
   127.0.0.1 redis
   ```
4. Start Redis container through docker-compose in a separate terminal window
   ```bash
   docker-compose up redis
   ```
5. Start Inbound API server
   ```bash
   npm run start:inbound
   ```
   then visit in your web browser http://localhost:4005/health

   In case to start the test environment
   ```bash
   NODE_ENV=test npm run start:inbound
   ```
6. Start Outbound API server
   ```bash
   npm run start:outbound
   ```
   then visit in your web browser http://localhost:4006/health

   In case to start the test environment
   ```bash
   NODE_ENV=test npm run start:outbound
   ```

## Inbound & Outbound API
> This package delivers implementation Inbound and Outbound API services which will be used by Thirdparty to integrate with `Mojaloop Switch`
  or used by a DFSP that wants to enabled Thirdparty functionality

  - TODO: Separate and rename servers, handlers and models to be broken up Thirdparty ones and DFSP ones.
  - TODO: Move models to `src/domain/stateMachine`
  - TODO: Add a openapi file detailing what the DFSP backend needs to implement.
         In some scenarios implementers will create a connector between the SDK and a DFSP's backend.
### When used by a Thirdparty
   Thirdparty's needs both the Outbound and Inbound service running.

#### Inbound API
   `Inbound API` service is called by `Mojaloop Switch`.
   Its responsibility is to forward calls to `Thirdparty Backend` or help to deliver synchronous response for calls initiated by `Thirdparty backend` on `Outbound API`

##### Deep Dive
   Inbound handlers handle receiving of requests coming from the Switch.
   These typically publish responses into redis for state machines to continue a flow.

   Inbound models handle the processing of Switch requests but they themselves
   can make requests to the accomplish a certain flow the initial inbound request initiates.
#### Outbound API
   `Outbound API` service is used by `Thirdparty backend` to make a call to `Mojaloop Switch`
   Its responsibility is to transform asynchronous Mojaloop API native interface's set of calls to a synchronous call.

##### Deep Dive
   Outbound handlers handle receiving of requests coming only from Thirdparty.
   These typically kick off a flow for example Thirdparty Linking or Thirdparty transaction.

   Outbound models handle the processing of Thirdparty requests but the models themselves
   can make requests to the accomplish a certain flow the initial outbound request initiates.

#### mTLS
   config.OUTBOUND.TLS and config.INBOUND.TLS when used by a Thirdparty will be
   certificates the Thirdparty registered and got signed with the Hub.

   config.OUTBOUND.TLS represents the certs needed by the `thirdparty-sdk` when making
   any requests to the switch. So even "inbound" models will be loaded with config.OUTBOUND.TLS

   The certs are loaded into `MojaloopRequests` and `ThirdpartyRequests` classes of `sdk-standard-components`
   and they handle the rest.

   config.INBOUND.TLS represents the certs needed by the `thirdparty-sdk` Hapi Inbound server.


### When used by a DFSP
   DFSPs need to have Inbound service running, DFSPs will need to implement
   a Backend API to handle backend requests from the `thirdparty-sdk` and configure
   the `thirdparty-sdk` to point to the DFSP's `sdk-scheme-adapter`.

   The `thirdparty-sdk` works in tandem with a`sdk-scheme-adapter` to complete transactions.

   Backend OpenAPI3 file coming soon.
#### Inbound API
   `Inbound API` service is called by `Mojaloop Switch`.
   Its responsibility is to forward calls to `DFSP Backend` or initiate flows thats provide Thirdparty's with relevant responses
   to accomplish Thirdparty scenarios like Linking or Transactions.

##### Deep Dive
   Inbound handlers handle receiving of requests coming from the Switch.
   These typically publish responses into redis for state machines to continue a flow.

   Inbound models handle the processing of Switch requests but they themselves
   can make requests to the accomplish a certain flow the initial inbound request initiates.
#### mTLS
   config.OUTBOUND.TLS and config.INBOUND.TLS when used by a DFSP will be
   certificates the DFSP registered and got signed with the Hub.

   config.OUTBOUND.TLS represents the certs needed by the `thirdparty-sdk` when making
   any requests to the switch. So even "inbound" models will be loaded with config.OUTBOUND.TLS
   The certs are loaded into `MojaloopRequests` and `ThirdpartyRequests` classes of `sdk-standard-components`
   and they handle the rest.

   config.INBOUND.TLS represents the certs needed by the `thirdparty-sdk` Hapi Inbound server.

## PM4ML (Payment Manager for Mojaloop)

## Integration Test
   To run integration tests, first start `docker-compose` in root folder

   ```bash
   docker-compose build && docker-compose up
   ```

   then start `docker-compose` inside `docker` folder in a separate window.
   ```bash
   cd docker
   docker-compose build && docker-compose up
   ```

   then start `docker-compose` inside `docker/contract` folder in a separate window.
   ```bash
   cd docker/contract
   docker-compose build && docker-compose up
   ```

   Finally run the following command to execute tests
   ```bash
   npm run test:integration
   ```

# Contribution
Read the [contributing.md](./contributing.md) doc
