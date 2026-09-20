# @forge/lattice

ImplicitForge standalone **lattice** package · 0.1.0 · MIT

TPMS wall parameters define normalized nodal isobands, not exact physical thickness. tpms(type,x,y,z,cell,thickness) accepts gyroid, schwarz, diamond or neovius. cubicLattice and octetLattice accept x,y,z,cell,radius. See NUMERICS.md before manufacturing.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/lattice` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`LATTICE_WGSL`, `cubicLattice`, `octetLattice`, `tpms`.
