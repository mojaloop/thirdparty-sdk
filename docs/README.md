# Docs


## Contents

- [state-models](./state-models.md) - The internal states for the scenarios modelled by the scheme adapter
- [outbound-api](./outbound-api.md) - The API design for the external interface 

**Can we rename outbound and inbound api to _external_ and _internal_ api respectively?**

- Where external is for communication between the DFSP and the adapter
- And internal is for communication between the adapter and the adapter

## Sequence Diagrams
[DFSP Transaction Model](./DFSPTransactionModelSeq.md)  
How a DFSP experiences a PISP transaction

[PISP Transaction Model](./PISPTransactionModelSeq.md)  
How a PISP experiences a transaction

[PISP Transaction API](./PISPTransactionAPISeq.md)  
Example PISP Transaction

## TODO:

- timeout design - how do we handle timeouts gracefully?
  - between redis handlers and http handlers
  - any given redis handler must listen to 2 events:
    - http event (happy path)
    - timeout event 


Story breakdown

- outbound-pisp design
- build out model for all states
- breakdown into 3 phases
  - implement one by one
