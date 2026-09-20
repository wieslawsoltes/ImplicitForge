# @forge/compile

ImplicitForge standalone **compile** package · 0.1.0 · MIT

compileCPU(doc,root) produces immutable-parameter closures. compileDocument(doc,root,colorRoot) produces CPU samplers, WGSL, GLSL, flattened parameter/asset arrays and a structure key. No eval or arbitrary user code. Import volumes require valid assets.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/compile` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`compileCPU`, `compileDocument`.
