# @forge/render

ImplicitForge standalone **render** package · 0.1.0 · MIT

ImplicitRenderer uses WebGPU, then WebGL 2, then software rasterization. Provide a CSS-sized canvas, await init, setDomain, and await setProgram. Call invalidate after changing public display properties and destroy on teardown. OrbitCamera operates independently. CPU timing is not GPU execution timing.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/render` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`ImplicitRenderer`, `OrbitCamera`.
