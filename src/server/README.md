# thirdparty-scheme-adapter/src/server
[@hapi](https://hapi.dev/) server setup


- [plugins](plugins/README.md) the module with plugins
- `create.ts` the server instance creation
- `extensions.ts` the server extensions
- `setupAndStart.ts` creates and registers plugins and extensions and finally starts the server
- `start.ts` to start the server to listening 

simplified usage:

```typescript
import { Server } from '@hapi/hapi'
import config from 'src/shared/config'
import Service from 'src/server'

const runningServer = await Service.setupAndStart(config) 
```