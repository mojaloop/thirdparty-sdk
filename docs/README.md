# Docs


## Contents

### [PISP Transaction Sequence]

The PISP Transaction Sequence breaks down the async Mojaloop calls into a series of synchronous calls:

![PISP Transaction Sequence](http://www.plantuml.com/plantuml/proxy?cache=no&src=https://raw.githubusercontent.com/mojaloop/thirdparty-scheme-adapter/feat/1728-dfsp-3p-state-machine-design/docs/sequence/PISPTransactionApi.puml)




### [DFSP Transaction Sequence]

### [PISP Linking Sequence]
**TODO**
### [DFSP Linking Sequence]
**TODO**




## Design Questions:

- **timeout design** - how do we handle timeouts gracefully?
  - between redis handlers and http handlers
  - any given redis handler must listen to 2 events:
    - http event (happy path)
    - timeout event 
