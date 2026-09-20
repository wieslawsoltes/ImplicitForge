# Library API and document schema

All library entry points are native ESM. The generated package bundles have no imports outside their own file. Source entry points intentionally use sibling relative imports inside the workspace. No npm publication is implied by the local package names.

## Complete headless modeling example

Run this as an ES module from the repository root, or adapt the relative paths after copying the independent bundles:

```js
import { writeFile } from 'node:fs/promises';
import { createNode, validateDocument } from './packages/graph/dist/index.js';
import { compileDocument } from './packages/compile/dist/index.js';
import { sampleGrid, extractMesh, meshMetrics } from './packages/mesh/dist/index.js';
import { exportSTL } from './packages/io/dist/index.js';

const envelope = createNode('box', {
  name: 'Envelope', params: { size: [32, 32, 32], radius: 2 }
});
const grading = createNode('ramp', {
  name: 'Wall grading',
  params: { direction: [0, 0, 1], start: -16, end: 16, low: 0.5, high: 1.0 }
});
const lattice = createNode('gyroid', {
  name: 'Graded gyroid', params: { cell: 10 },
  inputs: { domain: envelope.id, thickness: grading.id }
});
const doc = validateDocument({
  format: 'implicitforge', version: 1, name: 'Headless lattice', units: 'mm',
  nodes: [envelope, grading, lattice], root: lattice.id, assets: {},
  domain: { min: [-20, -20, -20], max: [20, 20, 20] },
  material: { name: 'Example', density: 2.7, E: 69000, nu: 0.3, conductivity: 167 },
  view: { color: [0.9, 0.4, 0.2], roughness: 0.3 }
});
const program = compileDocument(doc);
const controller = new AbortController();
const grid = await sampleGrid(program.sample, doc.domain, 96, {
  signal: controller.signal,
  onProgress: fraction => console.log('Sampling', Math.round(fraction * 100))
});
const mesh = await extractMesh(grid, { signal: controller.signal });
console.log(meshMetrics(mesh));
await writeFile('graded-gyroid.stl', new Uint8Array(exportSTL(mesh)));
```

## GPU sampling

```js
import { GPUCompute } from './packages/compute/dist/index.js';
const gpu = await GPUCompute.create();
if (gpu) {
  try {
    const grid = await gpu.sample(program, doc.domain, 96);
    console.log(grid.backend, grid.values.length);
  } finally {
    gpu.destroy();
  }
} else {
  console.log('No WebGPU device; use sampleGrid for CPU evaluation.');
}
```

No implicit global GPU device is retained by the package. A `GPUCompute` instance constructed with a supplied device owns and destroys that device when `destroy()` is called. Do not share ownership accidentally.

## Document shape

```js
{
  format: 'implicitforge', version: 1, name: 'My model', units: 'mm',
  nodes: [{
    id: 'stable_id', type: 'sphere', name: 'Sphere',
    params: { radius: 20 }, inputs: {}, position: { x: 0, y: 0 }
  }],
  root: 'stable_id',
  assets: {},
  domain: { min: [-25, -25, -25], max: [25, 25, 25] },
  material: { density: 2.7, E: 69000, nu: 0.3, conductivity: 167 },
  view: { color: [0.9, 0.4, 0.2], roughness: 0.3 }
}
```

Use `createNode` for schema defaults and IDs; partial parameter overrides are merged with defaults. A saved volume asset is `{ n, min, max, data, sourceMetrics? }`; `data` is an x-fast array of n³ signed samples. An imported block is `createNode('volume', {params:{asset:'asset-id'}})` and refers to `doc.assets['asset-id']`.

Only a body can be the document's output root. Scalar blocks can be passed explicitly to `compileCPU(doc, scalarId)` or as `compileDocument(doc, bodyId, scalarId)`'s coloring root. `topologicalOrder(doc, null)` visits the whole document. Editor-valid incomplete blocks may still fail strict compiler traversal when they become reachable.

## Common data contracts

```text
Sample = (x:number, y:number, z:number) => number
Domain = { min:[number,number,number], max:[number,number,number] }
Grid   = { n, count, min, max, step, values:Float32Array, backend? }
Mesh   = { positions:Float32Array, indices:Uint32Array, normals?:Float32Array }
Hooks  = { signal?:AbortSignal, onProgress?:Function }
```

Progress contracts are operation-specific: sampling/meshing use a fraction; analysis methods report objects containing residual/iterations/fraction as applicable. Workers wrap those in a stage/fraction message.

## Document operations

```js
import { DocumentStore, serializeProject, parseProject } from './packages/document/dist/index.js';
const store = new DocumentStore(doc, { historyLimit: 80 });
const unsubscribe = store.subscribe(change => console.log(change.kind, change.revision));
store.transact('Cell size', draft => {
  draft.nodes.find(n => n.id === lattice.id).params.cell = 12;
}, { mergeKey: `${lattice.id}:cell` });
store.undo();
store.redo();
const restored = parseProject(serializeProject(store.value));
unsubscribe();
```

Mutate only a transaction draft. Assets are frozen and shared: replace an asset with a fresh object to change its samples. `replace(document)` resets history. Persistence `open/save/load` is asynchronous and depends on IndexedDB availability.

## Numerical calls

```js
import { analyzeGrid, solveThermal, solveElasticity, optimizeTopology }
  from './packages/analysis/dist/index.js';

const mass = analyzeGrid(grid, 2.7); // density g/cm³
const temperature = await solveThermal(grid, {
  hot: 120, cold: 20, ambient: 20, conductivity: 167,
  convection: 8, heatSource: 0, tolerance: 0.001, maxIterations: 5000
});
const elastic = await solveElasticity(program.sample, doc.domain, {
  resolution: 10, E: 69000, nu: 0.3, load: [0, 0, -100],
  tolerance: 1e-7, maxIterations: 1000
});
const topology = await optimizeTopology(program.sample, doc.domain, {
  resolution: 8, volumeFraction: 0.4, iterations: 15,
  E: 69000, nu: 0.3, load: [0, 0, -100], penalty: 3, filterRadius: 1.5
});
```

These calls require a sufficiently resolved valid domain. Inspect result diagnostics rather than assuming success. Boundary conditions, units and convergence meanings are specified in NUMERICS.md. Thermal returns sampled temperature with min/max domain vectors, separate minValue/maxValue values, residual, energy balance and iteration metadata. Elasticity returns displacement/stress diagnostics and a sampled display field. Topology returns density/history and a reconstructed volume candidate.

## Renderer integration

```js
import { ImplicitRenderer } from './packages/render/dist/index.js';
const renderer = new ImplicitRenderer(document.querySelector('canvas'), {
  onError: error => console.error(error),
  onStatus: status => console.log(status.backend, status.cpuMs)
});
await renderer.init();
renderer.setDomain(doc.domain, { fit: true });
await renderer.setProgram(program);
renderer.clip = true;
renderer.clipZ = 0;
renderer.invalidate();
const png = await renderer.snapshot();
// On host teardown:
renderer.destroy();
```

Size the canvas using CSS. `onStatus.cpuMs` measures host-side draw work, not GPU execution time or an authoritative frame-rate benchmark. Numeric parameter edits should supply a newly compiled program; do not mutate a compiled closure's source document and expect it to update. The renderer does not own the document.

## UI integration

Load the optional `@forge/ui/styles.css` export or `packages/ui/dist/styles.css`. The theme is global and includes workbench layout; it can be replaced or scoped by the host. The package provides `NodeGraph(container, callbacks)`, `DialogHost(dialog)`, `ToastCenter(container)`, `installSplitter`, and icon/button helpers. NodeGraph emits edit intentions through callbacks; the host performs validated document transactions and calls `update`.

`DialogHost.open(title, bodyHtml, options)` and `button(..., {attrs})` accept trusted application markup. Document text must be passed through `escapeHTML` before interpolating it into those markup arguments. These APIs are not arbitrary-untrusted-HTML sanitizers.

## Packing libraries

```sh
npm run build
npm pack ./packages/mesh --pack-destination /tmp
# In a different project:
npm install /tmp/forge-mesh-0.1.0.tgz
```

Import `@forge/mesh` after local installation. Published entry points are standalone bundles. Cross-package contracts are plain objects/typed arrays, not identity-sensitive classes. Multiple independently bundled packages may each contain their own utility class definitions; use error names and data contracts, not cross-bundle `instanceof`, for shared semantics.
