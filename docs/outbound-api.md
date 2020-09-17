# Outbound API

Outbound API is the api that the thirdparty-scheme-adapter exposes to a DFSP/PISP. Is is a synchronous abstraction over the FSPIOP-API and Thirdparty-API

## Questions

- Should we also have a model for plain old party lookup? PISPs will need this for linking, and 

## Outbound PISP

1. `POST /thirdpartyTransfer`

Initiates a 3rd party transfer request. Starts with a party lookup.

```
POST /thirdpartyRequestToPay
[todo: details]
```

response:

```
[ todo: party lookup info]
```


2. `PUT /thirdpartyTransfer/{id}`

```
PUT /thirdpartyTransfer/{id}

{
  state: 'ACCEPTED_PARTY'
}
```

response:

```
[ todo: authorization info]
```

3. `PUT /thirdpartyTransfer/{id}`

```
PUT /thirdpartyTransfer/{id}

{
  state: 'ACCEPTED_PARTY'
}
```

response:

```
[ todo: transfer]
```

## Outbound DFSP


TODO: what should this be called? 

DFSP calls this when they recieve an inbound `POST /thirdpartyRequests/transactions/{id}`
- TODO: does this call actually get to the DFSP? I guess it has to... but will it just pass through?
- TODO: the quote needs to happen first... but that's in a different API... damn

1. `POST /thirdpartyAuthorization`


- Scheme adapter first needs to get the quote from the PayeeDFSP, and pass that through in the body

- scheme adapter calls `POST /authorizations`, listens for `PUT /authorizations/{id}`


2. `PUT /thirdpartyAuthorization/{id}`

```
PUT /thirdpartyAuthorization/{id}

{
  state: 'CHECK_AUTHORIZATION'
}
```

- scheme-adapter then calls `POST /thirdpartyRequests/transactions/{id}/authorizations`, listens for `PUT /thirdpartyRequests/transactions/{id}/authorizations`


DFSP then initiates transfer

[todo: the interplay between scheme adapters seems a little tricky here...]






