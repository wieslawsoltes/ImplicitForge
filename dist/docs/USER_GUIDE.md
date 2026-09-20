# Workbench guide

## First model

The initial notebook opens a heat exchanger. Drag the viewport to orbit, Shift-drag or right-drag to pan, and use the wheel to zoom. Two pointers pan and pinch. Double-click the viewport or press **F** to fit. The X/Y/Z/ISO controls select standard views; the cube control switches projection.

Select **Graded gyroid core** in the notebook. Change Cell size. The body changes because the field is re-evaluated, not because a mesh asset is swapped. Its wall input is connected to **Axial wall gradient**: edit that ramp to change the local wall isoband. A linked parameter's numeric fallback is not the active input while its field connection exists.

Select a block to edit its parameters and input bindings. **Preview** displays an intermediate body without changing the project output. **Set as output** changes the actual output used for evaluation and export. The output badge in the notebook identifies the committed body.

## Construct a graph

Use **Add block** or B. A new operator may be incomplete until its required inputs are connected. Choose sources from the inspector or connect an output to an input in the graph. Body and scalar ports are distinct; cycles and incompatible types are rejected without corrupting the document.

Drag graph headers to reposition blocks. Pan the background and zoom the graph; use Auto layout or Fit to reorganize. Double-click a block to preview. Duplicate copies the selected block and its existing input references; it is not a deep copy of an entire upstream subgraph. Deleting a block removes its referencing input links; affected blocks remain visible with diagnostics so they can be repaired.

Transforms operate on implicit coordinates. For a cylinder along a different axis, connect it through Rotate. Boolean subtract uses Body A as the retained body and Tool B as the material removed. Offset and centered shell parameters are physical distances only when their input behaves as a distance field; see the numerical guide for composed fields.

## Fields and display

The Fields workspace visualizes scalar inputs over the selected body. Use the shading selector for material, normals, scalar fields, or numerical results. Field coloring is a display operation. It does not alter the body's material density or force a field into an unrelated geometric parameter.

Toggle Section with C and adjust its Z coordinate. The preview is capped. Export ignores this display-only clipping; use a half-space intersection/subtraction for a permanent geometric cut.

Quality controls sampled software preview resolution or GPU ray-march work. The backend shown in the status bar is authoritative. A software preview is generated from a sampled surface and will not show arbitrarily fine walls.

## Evaluation and mesh export

Evaluate estimates volume, mass, occupancy and centroid from a nodal grid. The sampling domain is explicit in the left footer. Keep the full body inside it with positive exterior padding; a body touching a boundary can be clipped. Fine walls must span multiple samples, and you should compare results as resolution increases.

Export chooses STL, OBJ, PLY or 3MF and a resolution. It generates a new welded mesh from the committed output, reports surface/volume and edge-incidence statistics, and downloads the file. A label of watertight means the checked edge counts are closed and manifold, not that the mesh is free of self-intersections or ready for a particular printer.

Use the snapshot button to save a PNG. SVG sections are geometric line segments in millimetres, not a machining toolpath. Design-study results can be saved as CSV.

## Import and persistence

Open `.iforge`/JSON to replace the notebook. Save project writes complete graph, material/display settings and volume assets; use saved files for backups. Undo history is session state, not part of the saved document. IndexedDB autosave is best-effort and depends on the browser origin, quota and privacy policy. The UI reports when file saving is necessary.

STL/OBJ import creates a sampled implicit-volume block using nearest-triangle distances and a parity-based inside test. Closed, well-conditioned triangle meshes are expected. The workflow checks welded edge incidence and rejects open meshes; it is not a general mesh-repair service. Imported dimensions are interpreted in millimetres. Increasing the import grid resolves more detail but does not recover features lost from the source mesh.

## Analysis

Open the Cantilever benchmark from the project menu and choose Analysis.

**Elasticity:** set voxel resolution, Young's modulus, Poisson ratio, force and iteration settings. The model fixes all degrees of freedom on the minimum occupied X face and distributes the entered total force over the maximum occupied X face. The material is homogeneous, isotropic and linearly elastic. The solver exposes displacement, von Mises stress, relative residual and convergence; changing resolution changes both geometry and its discrete boundary selections. A disconnected or under-resolved lattice may not be a valid structural domain.

**Thermal:** hot/cold temperatures apply to the minimum/maximum occupied X planes. Exposed faces exchange heat with the specified ambient through the convection coefficient. There is optional volumetric heat generation and constant isotropic conductivity. Temperature tolerance is the maximum Jacobi fixed-point update in °C, not an energy-balance tolerance. Check both residual and the reported energy imbalance. Tighten tolerance and increase the iteration cap to assess convergence.

**Topology:** choose volume fraction, penalization, filter and iterations. The solver runs density-based SIMP compliance minimization with real repeated elasticity solves. Applying a result adds a sampled body derived from the thresholded density. That threshold changes the continuous density model; inspect connectivity and repeat elasticity and mesh checks on the applied result. Completing the requested iteration count is not proof of an optimization optimum.

**Parameter sweep:** select a numeric parameter and range. A worker evaluates each design without changing the editor's document. The results expose volume and mass as functions of that parameter; a sweep is not an automatic multi-objective optimizer.

Cancel terminates the active worker. Results from canceled or superseded geometry are not committed.

## Keyboard reference

| Action | Shortcut |
|---|---|
| Save / open | Ctrl or Cmd + S / O |
| Command palette | Ctrl or Cmd + K |
| Undo / redo | Ctrl or Cmd + Z / Shift+Z; Ctrl+Y also works |
| Duplicate selected block | Ctrl or Cmd + D |
| Add block / fit / section / graph | B / F / C / G |
| Delete selected block | Delete or Backspace, outside editors |
| Guide | ? |

The desktop notebook, viewport, graph and inspector are resizable/navigation-oriented panels. On narrow screens the notebook and inspector become drawers. Touch handling and responsive layout are implemented; representative physical-device and assistive-technology certification is not claimed.
