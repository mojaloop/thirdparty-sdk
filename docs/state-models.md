# Scheme Adapter Changes
> Note: this is an outdated document and will be removed shortly. 
> Refer to the sequence diagrams in [`./README.md`](./README.md) for a more updated list of the sequences



A design document to explain/discuss the changes required in the `sdk-scheme-adapter` to implement PISP functionality.

## Scheme Adapter Background

One of the purposes of the `thirdparty-scheme-adapter` is to abstract away the Mojaloop API's async nature to make integrations easier. In addition, we use the scheme adapter as part of the `mojaloop-simulator`, so in order to prove and test our solution, we need to add functionality to the `mojaloop-simulator`, and hence the `thirdparty-scheme-adapter`.

### State Machines

The `thirdparty-scheme-adapter` uses a series of state machines, implemented using the [javascript-state-machine](https://github.com/jakesgordon/javascript-state-machine) library. These state machines make it possible to handle complex async calls to a mojaloop hub, and expose them as a simpler, synchronous API to DFSPs and the `mojaloop-simulator` alike.

Below we propose a number of new state machines to be implemented as a part of the PISP functionality. Keep in mind the names are not set in stone, this is very much a first pass and will be expected to change.

## Current Implementation:

- [`authorizations.model.ts`](../src/models/outbound/authorizations.model.ts)
> DFSP calls `POST /authorizations`, and waits for `PUT /authorizations/{id}`
- [`thirdparty.authorizations.model.ts`](../src/models/outbound/thirdparty.authorizations.model.ts)
> DFSP calls `POST /thirdpartyRequests/transactions/${id}/authorizations`, and waits for `PUT /thirdpartyRequests/transactions/${id}/authorizations`

### Pending Migration:

- mojaloop/project#1705 - Migrating `POST /thirdpartyRequests/transactions` from sdk-scheme-adapter


#### PISPTransactionModel

**Purpose:**   
Models the PISP side of a PISP transaction, starting with a `GET /parties`, all the way to the `PUT /thirdpartyRequests/transaction/{ID}` callback.

**Model:**  
![](./out/sequence/PispTransactionModel/PispTransactionModel.png)

**States:**
- `start` - when the state machine is created
- `pendingPartyLookup` - immediately after creation, before calling `GET /parties/{type}/{ID}`
- `payeeResolved` - on a `PUT /parties/{type}/{ID}`
- `pendingAuthorization` - after `acceptParty()`, before calling `POST /thirdpartyRequests/transactions`
- `authorizationReceived` - on a `POST /authorization`
- `transactionSigned` - after signChallenge(), before calling `PUT /authorizations`
- `transactionSuccess` - on a `PUT /thirdpartyRequests/transactions/{ID}`
- `error` - on any error callback, or internal processing error

**Functions:**
- `resolvePayee()` - Calls `GET /parties/{type}/{ID}` to lookup the payee party of the transaction
- `executeThirdPartyTransaction()` - Calls `POST /thirdpartyRequests/transactions` to kick off the PISP Transaction
- `signChallenge()` - Calls `PUT /authorizations/{ID}` with the signed challenge from the user


#### DFSPTransactionModel

> Note, we already have 2 pieces of this model, in `thirdparty.authorizations.model.ts` and `authorizations.model.ts`, that can be combined and expanded upon.

**Purpose:** 
Models the DFSP side of a PISP transaction, initiated by receiving a `POST /thirdpartyRequests/transaction`

**Model:**  
![](./out/sequence/DFSPTransactionModel/DFSPTransactionModel.png)

**States:**
- `transactionRequestReceived` - on a `POST /thirdpartyRequests/transaction`
- `quoteReceived` - on a `PUT /quotes/{ID}`
- `authorizationReceived` - on a `PUT /authorizations/{ID}`, with a signed challenge
- `transactionSuccess` - on a `PUT /transfers/{ID}`
- `error` - on any error callback, or internal processing error

**Functions:**
- `getQuote()` - Calls `POST /quotes` to ask the payee for a quote for the given transaction
- `authorizeTransaction()` - Calls `POST /authorizations` to ask the PISP to ask their user to authorize the transaction with their FIDO credential
- `executeTransfer()` - Calls `POST /transfer` to execute the transfer

## Questions:

- How do we handle authorization retries in the above models? Maybe we can leave this for now.
