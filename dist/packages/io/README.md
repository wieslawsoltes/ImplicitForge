# @forge/io

ImplicitForge standalone **io** package · 0.1.0 · MIT

Exporters return ArrayBuffer or string values without automatically downloading files. STL, PLY and 3MF return binary buffers; OBJ and SVG return text. STL/OBJ import parses geometry; use meshToVolume separately for implicit conversion. Dimensions are interpreted as millimetres.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/io` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`crc32`, `export3MF`, `exportOBJ`, `exportPLY`, `exportSTL`, `exportSliceSVG`, `parseOBJ`, `parseSTL`, `sliceContours`, `zipStore`.
