# @forge/compute

ImplicitForge standalone **compute** package · 0.1.0 · MIT

GPUCompute.create returns null when no device is available. Call destroy when finished; it destroys its owned device. sample performs GPU scalar-grid evaluation; thermal performs GPU Jacobi iterations. WorkerClient requires a host-provided worker URL and protocol. Real GPU execution was not validated in the supplied test environment.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/compute` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`GPUCompute`, `WorkerClient`, `checkedModule`, `requestGPU`, `storageBuffer`.
