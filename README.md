# Mojaloop Thirdparty Scheme Adapter
[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/thirdparty-scheme-adapter.svg?style=flat)](https://github.com/mojaloop/thirdparty-scheme-adapter/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/thirdparty-scheme-adapter.svg?style=flat)](https://github.com/mojaloop/thirdparty-scheme-adapter/releases)
[![CircleCI](https://circleci.com/gh/mojaloop/thirdparty-scheme-adapter.svg?style=svg)](https://circleci.com/gh/mojaloop/thirdparty-scheme-adapter)

> This package provides a Thirdparty (PISP) scheme adapter that interfaces between a Mojaloop API compliant switch and a Thirdparty backend platform that does not natively implement the Mojaloop API.

The API between the scheme adapter and the Thirdparty backend is synchronous HTTP while the interface between the scheme adapter and the switch is native Mojaloop API.

This package exemplifies the use of the Mojaloop SDK Standard Components for TLS, JWS and ILP and is should be use together with [mojaloop/sdk-scheme-adapter](https://github.com/mojaloop/sdk-scheme-adapter)


## Quick Start
> The steps shown below illustrate setting up the Mojaloop Thirdparty Scheme Adapter locally and how to run Inbound  and Outbound API services listening on `localhost`

1. Clone repo
   ```bash
   git clone git@github.com:mojaloop/thirdparty-api-adapter.git
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Start Inbound API server 
   ```bash
   npm run start:inbound
   ```
    then visit in your web browser http://localhost:4005/health
4. Start Outbound API server
   ```bash
   npm run start:outbound
   ```
    then visit in your web browser http://localhost:4006/health

## Inbound & Outbound API
> This package delivers implementation Inbound and Outbound API services which will be used by Thirdparty to integrate with `Mojaloop Switch`

### Inbound API
  `Inbound API` service is called by `Mojaloop Switch`.  
  Its responsibility is to forward calls to `Thirdparty Backend` or help to deliver synchronous response for calls initiated by `Thirdparty backend` on `Outbound API`

### Outbound API
  `Outbound API` service is used by `Thirdparty backend` to make a call to `Mojaloop Switch`  
  Its responsibility is to transform asynchronous Mojaloop API native interface's set of calls to a synchronous call.

# Contribution
Read the [contributing.md](./contributing.md) doc