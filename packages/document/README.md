# @forge/document

ImplicitForge standalone **document** package · 0.1.0 · MIT

Transactions clone graph metadata while structurally sharing frozen sampled assets. Replace assets instead of mutating their arrays. Parse/serialize use the versioned ImplicitForge JSON schema. IndexedDB persistence is optional and browser-dependent.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/document` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`DocumentStore`, `ProjectPersistence`, `parseProject`, `serializeProject`.
