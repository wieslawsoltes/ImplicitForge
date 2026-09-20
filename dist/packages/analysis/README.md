# @forge/analysis

ImplicitForge standalone **analysis** package · 0.1.0 · MIT

analyzeGrid integrates sampled occupancy. solveThermal is steady isotropic finite-volume conduction; solveElasticity is homogeneous linear Hex8 FEM; optimizeTopology is density-based single-case SIMP. Read NUMERICS.md for boundary conditions, units, residual definitions and model limits. These kernels are not certified engineering solvers.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/analysis` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`analyzeGrid`, `hexElement`, `optimizeTopology`, `solveElasticity`, `solveThermal`, `thermalDiagnostics`, `thermalSetup`.
