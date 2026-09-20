# @forge/mesh

ImplicitForge standalone **mesh** package · 0.1.0 · MIT

sampleGrid and extractMesh are asynchronous and accept cancellation/progress hooks. extractMesh returns welded indexed marching-tetrahedra geometry. meshMetrics checks edge incidence, not self-intersection or manufacturing viability. MeshBVH and meshToVolume expect well-conditioned closed surfaces.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/mesh` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`MeshBVH`, `extractMesh`, `meshMetrics`, `meshToVolume`, `sampleGrid`, `weldMesh`.
