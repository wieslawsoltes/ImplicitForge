# Verification report — ImplicitForge 0.1.0

## Executed checks

| Check | Result |
|---|---|
| JavaScript syntax | 29 source/test/build JavaScript files passed `node --check` |
| Node regression tests | **96 passed, 0 failed, 0 skipped** |
| Portable-browser end-to-end regression | **21 passed**, 29.24 seconds in this run |
| Browser uncaught exceptions | **0** |
| Browser console errors | **0** |
| Standalone package isolation | All 12 bundles imported after being copied outside the workspace |
| Installable package artifacts | 12 local npm `.tgz` packages generated; no registry publication |
| WebGPU execution | **Not exercised** — no exposed GPU API in the test page |
| WebGL 2 execution | **Not exercised** — no usable context in the test page |
| Observed browser renderer | **CPU raster**, actual sampled geometry and depth-buffered rasterization |

Environment: Node.js 22.16.0; Chromium 144.0.7559.96 on Debian; Python Playwright. The browser test loads the self-contained HTML with `page.set_content`, performs no network navigation, and runs real classic Blob workers. This is a controlled software-rendered regression, not a GPU benchmark, multi-browser certification, physical mobile-device test, or production engineering validation.

The latest raw evidence is in [unit-tests.tap](unit-tests.tap), [browser-tests.json](browser-tests.json), [browser-tests.log](browser-tests.log), and [package-artifacts.json](package-artifacts.json). Screenshots were captured from the actual application during that run.

## Numerical and model checks

The Node suite covers primitive signs/distances, transforms, booleans, field-driven bindings, periodic lattices, every block's finite evaluation and generated shader source, and example compilation. It checks typed ports/cycle rejection, invalid inputs, transactional rollback, slider coalescing, undo/redo, project round-trips, immutable CPU parameter snapshots, structural asset sharing, and standalone package loading.

Mesh and I/O tests cover analytic-sphere approximations, closed outward indexed surfaces, nodal zero crossings, cancellation/NaN rejection, STL/OBJ round-trips, concave/negative-index OBJ faces, PLY layout, ZIP CRC/3MF parts, BVH distances, open-mesh rejection, and SVG circle sections.

Numerical tests exercise Hex8 stiffness symmetry and rigid translations; a cantilever benchmark and inverse-modulus scaling; disconnected-domain diagnostics; failed convergence; actual SIMP density/volume updates; and thermal linear profiles, source/convection, and energy balance. They are executable regression examples, not an exhaustive numerical-verification campaign.

## Browser workflow assertions

| # | Workflow | Result |
|---|---|---|
| 1 | Portable startup, real surface rendering and worker evaluation | Passed |
| 2 | Parameter editing, undo and redo through UI | Passed |
| 3 | Block duplication and reversible document transaction | Passed |
| 4 | Add a primitive, set output and compile the edited field | Passed |
| 5 | Independent worker volume calculation for new output | Passed |
| 6 | Graph pointer dragging commits node coordinates | Passed |
| 7 | Section plane changes visualization without mutating the model | Passed |
| 8 | Save project produces parseable full graph JSON | Passed |
| 9 | Real binary STL export ignores display clipping and closes correctly | Passed |
| 10 | Scalar field workspace and coloring | Passed |
| 11 | Hex8 FEM worker solve and stress visualization | Passed |
| 12 | Thermal worker solve and convergence reporting | Passed |
| 13 | Parameter sweep changes measured volume without changing the document | Passed |
| 14 | SIMP optimization runs through UI | Passed |
| 15 | Optimized density is converted to a new editable implicit-volume block | Passed |
| 16 | Cancellation rejects stale worker result commits | Passed |
| 17 | Project file reopen restores the modeled body | Passed |
| 18 | STL import, BVH signed distance and reconstructed implicit body | Passed |
| 19 | Light/dark theme and narrow viewport layout | Passed |
| 20 | Command palette keyboard execution and guide dialog | Passed |
| 21 | No uncaught exceptions or console errors during regression run | Passed |

Selected observed outputs:

- A radius-15 mm sphere exported through the UI at 64³ samples produced **22,320 triangles**, a closed edge-incidence mesh, and volume **14,101.11 mm³**. The analytic sphere is approximately 14,137.17 mm³; this is a discretization check, not exact-volume equivalence.
- The browser cantilever run used **125 Hex8 elements** and reached relative residual **6.8718e-8**, with maximum displacement **0.00377214 mm** for that particular coarse voxel model and its configured load/material. It is not the same problem as every beam benchmark in the unit suite.
- A three-value corner-radius sweep returned decreasing volumes without changing the editor's graph.
- Four SIMP iterations targeted density fraction 0.4 and returned approximately **0.39999983** before thresholding. The applied implicit result was separately created and could be saved/reopened.
- The browser thermal solve reported a temperature fixed-point residual of approximately **0.00081088 °C** and an energy imbalance of approximately **-1.28183 W**. The temperature convergence condition does not imply that the watt imbalance is acceptable; both are visible. Tighten tolerances and perform an energy/resolution study for an engineering calculation.

## Reproduce

```sh
npm run build
npm run check
npm test
```

For the browser regression, install Python Playwright in your environment and point `CHROMIUM` at an existing Chromium executable:

```sh
python -m pip install playwright
CHROMIUM=/path/to/chromium python tests/browser_smoke.py
```

The default executable path is `/usr/bin/chromium`. The script writes screenshots and raw reports into `docs/` and temporary downloaded artifacts into `tests/artifacts/`.

## Hardware-specific GPU harness

```sh
npm start
# Open http://localhost:4173/tests/gpu.html and choose Run validation.
```

On an actual WebGPU-capable secure origin, the harness evaluates each of the **33 block types** on CPU and GPU over a 9³ test grid (including bound scalar inputs and volume assets), compares 64 matching thermal Jacobi iterations, and compiles/submits the seven example render pipelines. It checks finite values and a mixed relative/absolute field tolerance of `2e-4 * max(1, abs(cpu))`, plus a thermal difference below 0.002 °C. These tolerances are test thresholds, not universal model-error bounds.

The report is available as `window.ImplicitForgeGPUReport`. Missing GPU access explicitly produces **SKIPPED**. No results from that hardware harness are claimed here. The app can also be opened with `?renderer=webgl` to exercise its WebGL 2 path on a suitable browser; that path is not part of the observed run.

## Remaining validation boundaries

Real WebGPU/WebGL drivers, device loss under load, multiple browsers, large hostile input files, high-resolution memory limits, physical touch devices and assistive technology require separate testing. Numerical refinement, material qualification, manufactured wall measurements, self-intersection checks and application-specific mechanical/thermal validation are not replaced by these software tests. Native nTop/B-rep interoperability and enterprise features absent from this release are not implicitly covered.
