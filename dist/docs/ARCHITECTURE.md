# Architecture and implementation contracts

## Dependency direction

```text
app/main.js ── document + graph + ui + render + worker orchestration
                   │          │                 │
                   │          └── block schema  └── compute + field
                   └── graph + kernel

app/worker.js ── compile ── graph + field + lattice + kernel
              ├── compute ── analysis thermal setup + kernel
              ├── mesh ── field + kernel
              ├── analysis ── Hex8 / PCG / SIMP / thermal / occupancy
              └── io ── mesh interchange helpers
```

The root document is the authority. Renderer state, graph node DOM, inspector elements and worker payloads are projections of the model. Geometric meaning is never inferred from connector curves or rendered triangles.

## Document and transactions

A versioned JSON document contains a typed acyclic graph, one body output, millimetre domain, immutable sampled assets, display properties and material inputs. Blocks may temporarily lack required connections while being edited; compiler traversal requires complete reachable inputs. Full validation rejects unknown block types/ports, unsafe or duplicate IDs, invalid parameters, cycles, type violations, corrupt volume shapes and unsupported units.

`DocumentStore.transact(label, edit, {mergeKey})` clones graph/metadata, applies a draft edit, validates, then commits atomically. Exceptions leave the prior document intact. Undo/redo retain a bounded history; repeated slider edits with the same merge key coalesce within 800 ms.

Large volume arrays are structurally shared across snapshots. New assets are normalized to frozen ordinary arrays and frozen metadata; editing an asset requires replacing its object, not mutating samples. This avoids copying a multi-megabyte volume for each graph-position change. A WeakSet caches successfully validated frozen assets. Ordinary document metadata must still be changed through transactions; it is not globally immutable by enforcement.

The model invalidation key excludes node positions and names but includes topology, numeric parameters, root, domain and asset identities. Analysis is invalidated by relevant geometry/material changes. A generation/token check rejects stale asynchronous results. View clipping and camera motion do not mutate the graph or exported body.

## Compiler

The compiler resolves typed graph references in dependency order. Every block becomes a CPU closure and a named shader function. The closure compiler takes a parameter snapshot and does not use `eval`, `Function`, dynamic user code, or JavaScript source generation.

WGSL/GLSL numeric parameters live in a flattened float buffer. Function bodies refer to stable offsets rather than literal parameter values. Numeric edits can reuse render/compute pipelines; structural edits produce a different shader key. Cache and invalidation identities use full canonical strings, not collision-prone short hashes. Imported volumes are flattened into another buffer with grid metadata in the parameter buffer. A second scalar root can be compiled alongside the body for coloring.

The WGSL-to-GLSL routine translates this package's restricted internal helper syntax only. It is **not** a general WGSL frontend, validator, or translator. The output uses GLSL ES 3.00 and floating-point textures for sampled assets. GPU shader compilation errors are collected and shown, not swallowed.

Current bounds: 256 document nodes, 2,048 shader scalar parameters, validated volume grids up to 128³, a total asset-sample cap, and explicit grid/export caps. These are defensive release limits, not advertised GPU maxima.

## Rendering

The normal renderer draws a fullscreen triangle. Each fragment constructs an orbit-camera ray, intersects the explicit sampling box, and marches the compiled field. The implementation has conservative step damping, an upper step bound, sign-crossing refinement, finite-difference normals, material-inspired lighting, ambient-occlusion probes, ground grid, and field/result coloring. A Z-plane max operation produces a capped section.

The first backend is WebGPU. WebGL 2 uses matching generated GLSL helpers. If neither context is available, a CPU sampler creates an indexed surface and the software renderer uses a depth buffer and perspective-correct interpolation to rasterize triangles into Canvas 2D. It is an actual rendering backend, not a decorative loading state. Its quality levels sample at 44³, 76³ and 104³ nodes, so fine features depend on preview resolution.

Rendering is invalidation-driven, although a lightweight animation-frame loop tracks state. Camera animation and dragging invalidate the frame; interaction lowers raster resolution. Graph position changes do not rebuild implicit geometry. GPU pipelines have bounded caches; buffers, textures, workers and device resources have explicit cleanup.

The camera tracks canvas aspect ratio, including changes between desktop and portrait layouts. DOM focus uses prevent-scroll on viewport capture to avoid moving narrow workbenches horizontally.

## Compute and workers

`GPUCompute.sample` dispatches 4×4×4 WGSL workgroups to produce an x-fast Float32 scalar grid. Pipeline layout is explicit so unused storage bindings cannot disappear when a primitive has no imported asset. Host uniform packing matches WGSL vector alignment. Readback uses a MAP_READ staging buffer; resource destruction is in finally blocks.

Thermal compute uses 128-thread workgroups and two temperature buffers. Each dispatch is one Jacobi iteration; batches of up to 32 iterations are followed by readback and real diagnostics. FEM/SIMP are matrix-free CPU implementations and are not mislabeled as GPU kernels.

`WorkerClient` owns at most one active job. A new job cancels the old worker; completion messages are ID-checked; transfer lists avoid copying returned typed arrays again. Source deployment uses module workers. The portable edition embeds a classic worker in a Blob because module workers are not consistently available in opaque-origin embeds. Each worker has an independent document snapshot and isolated GPU-device lifecycle.

The app worker is the protocol adapter for evaluate, mesh, import, thermal, elasticity, topology and sweep. The reusable algorithms remain in their packages. The standalone compute library does not claim to bundle an application-specific worker URL.

## UI and styling

The notebook, typed graph and inspector share selection and document revision state. A node's schema defines its controls, units, optional scalar bindings and diagnostics. Wires are SVG paths derived from semantic references; their geometry has no modeling meaning.

The UI package owns graph widgets, native dialog management, notifications, original inline SVG icons, keyboard/pointer splitters and the CSS theme. The workbench consumes `packages/ui/src/styles.css` through its app stylesheet. Package consumers can load `@forge/ui/styles.css` or provide their own selectors/tokens. The included theme is global, not Shadow-DOM-isolated, and includes workbench layout rules; isolate or scope it when integrating into a larger host.

## Packaging

Source packages use relative imports for direct browser operation with no resolver. Every package's generated `dist/index.js` embeds its dependency closure and exposes native ESM exports. This yields independently copyable artifacts and no transitive installation requirement, at the cost of duplicated helper code when multiple standalone bundles are used together. The application source graph is bundled once in the portable build, so helpers there are deduplicated.

`scripts/bundle.mjs` is deliberately a small workspace bundler for the export/import forms used by this repository, not a general-purpose JavaScript bundler. There is no network dependency or hidden build service. The source edition needs no compilation; `build` is for distributable forms.

## Security and boundaries

There is no remote document upload, telemetry, arbitrary-code block, package download, or credential storage. Displayed document names are escaped. Input sizes, triangle counts, node counts, numeric ranges and asset shapes are checked. CPU/GPU jobs remain potentially resource-intensive within those caps; do not treat this as a hardened hostile-file sandbox.

The local server is a development utility, not an authentication or TLS server. A hosted deployment should apply its own CSP, allowing the portable edition's inline script/style and Blob worker only if that edition is intentionally hosted. Source deployment can use external script/style rules and same-origin workers instead.

Engineering readiness requires separate physical validation, application-specific material data, convergence studies and qualified review. None is inferred from a rendered picture or a successful software test.
