# @forge/kernel

ImplicitForge standalone **kernel** package · 0.1.0 · MIT

Pure utilities are usable in Node or browsers. downloadFile requires a DOM. Vector functions use three-element arrays. gridInfo validates n in the supported grid range and uses inclusive endpoint samples.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/kernel` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`CancelledError`, `EPSILON`, `Emitter`, `TAU`, `assertFinite`, `clamp`, `clone`, `debounce`, `downloadFile`, `escapeHTML`, `formatNumber`, `gridInfo`, `hashString`, `lerp`, `throwIfAborted`, `uid`, `validateDomain`, `vec3`.
