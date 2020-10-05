# Docs


## Contents
<!-- todo -->

### PISP Transaction Sequence

The PISP Transaction Sequence breaks down the async Mojaloop calls into a series of synchronous calls:

![PISP Transaction Sequence](http://www.plantuml.com/plantuml/proxy?cache=no&src=https://raw.githubusercontent.com/mojaloop/thirdparty-scheme-adapter/feat/1728-dfsp-3p-state-machine-design/docs/sequence/PISPTransactionApi.puml)


### DFSP Transaction Sequence

![DFSP Transaction Sequence](http://www.plantuml.com/plantuml/proxy?cache=no&src=https://raw.githubusercontent.com/mojaloop/thirdparty-scheme-adapter/feat/1728-dfsp-3p-state-machine-design/docs/sequence/PISPTransactionApi.puml)

**Notes:**
1. In this example, the scheme adapter is responsible for contacting the auth-service, and not the dfsp backend itself. This will need to be configurable

[ todo:
  - should we make this 2 sync calls instead of 1? That way the dfsp gets a chance to abort for any other reason (e.g. source account has no funds)

]

### PISP Linking Sequence
**TODO**

### DFSP Linking Sequence
**TODO**




## Design Questions:

- **timeout design** - how do we handle timeouts gracefully?
  - between redis handlers and http handlers
  - any given redis handler must listen to 2 events:
    - http event (happy path)
    - timeout event 
