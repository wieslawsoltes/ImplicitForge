# @forge/ui

ImplicitForge standalone **ui** package · 0.1.0 · MIT

NodeGraph emits selection/move/connect intentions for the host to commit. DialogHost and ToastCenter wrap DOM elements; installSplitter wires pointer and keyboard resizing. Load styles.css for the optional global theme, which includes workbench layout rules. Trusted markup arguments must not receive unescaped document text.

## Consume independently

```js
import * as forge from './dist/index.js';
console.log(Object.keys(forge));
```

`dist/index.js` is a self-contained ESM bundle. It has no runtime import from sibling packages and no external dependencies. Copy it into another project or run `npm pack ./packages/ui` from the workspace root. The source entry is intended for workspace development and imports sibling source by relative path. The package has not been published to a registry by this delivery.

See the root `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/NUMERICS.md` for shared object contracts, ownership rules and worked examples.

## Exports

`DialogHost`, `NodeGraph`, `ToastCenter`, `button`, `categoryIcon`, `icon`, `installSplitter`.
