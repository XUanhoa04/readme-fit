# small-library

Turn configuration records into stable cache keys for Node >=20 applications.

## Installation

```bash
npm install small-library
```

## Example

```js
import { cacheKey } from 'small-library';

cacheKey({ region: 'eu', active: true });
```

## License

MIT
