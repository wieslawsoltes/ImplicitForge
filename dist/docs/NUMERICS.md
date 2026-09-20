# Numerical methods, units and validity

These notes describe the code delivered in this repository. They are not a statement of certification or equivalence with a commercial solver.

## Coordinate and unit contract

Geometry is in **millimetres**. Mass density is g/cm³; volume is mm³; mass is `volume * density / 1000` grams. Elasticity uses N, mm and MPa (N/mm²). Thermal inputs use conductivity W/(m·K), convection W/(m²·K), volumetric generation W/m³ and temperatures in °C; the setup converts geometric lengths from mm to m.

Grid samples use `index = x + n * (y + n * z)`. A sampling grid has **n nodes** per axis, inclusive of both domain boundaries, with spacing `(max-min)/(n-1)`. FEM resolution instead specifies **n elements** along each dimension of the design-domain box. Thermal occupies nodal locations as finite-volume cells, so its represented boundary extent is a discretization model rather than an exact reconstruction of the source solid.

## Implicit representation

Bodies follow the negative-inside convention: `f(p) < 0` is solid and `f(p) = 0` is the surface. A scalar field is an arbitrary real function and may feed supported geometric inputs.

Sphere, rounded box, capped cylinder, capsule and regular torus use their closed-form distance expressions. Ellipsoid uses a sign-correct first-order distance approximation. Uniform scaling compensates the returned distance. Boolean union/intersection/difference use min/max combinations; smooth union uses a polynomial blend. Composition preserves the intended zero set, not necessarily exact Euclidean distance everywhere.

Offset is `f(p)-d`; a centered shell is `abs(f(p))-t/2`. These correspond to precise physical distances only to the extent that f is a valid distance field near its surface. A spatially varying radius, thickness or offset can alter gradient bounds and therefore sphere-tracing behavior. Twist pulls sample coordinates through an inverse Z rotation depending on Z; its result is not automatically a unit-Lipschitz signed distance.

The GPU marcher uses damping, a maximum step and sign-crossing refinement. This reduces misses but is **not a mathematical guarantee** for arbitrary highly oscillatory fields or severe warps. Inspect thin structures at multiple quality levels and mesh resolutions.

Finite array uses nearest-cell folding with a clamped odd copy count, rather than evaluating every copy. Its intended use is a centered prototype fitting its chosen cell; unusually extended or offset prototypes can violate that assumption and should be represented by explicit transformed unions.

## Lattice fields

Let `q = 2πp / cell`. The TPMS-style sheets use trigonometric nodal approximations, not numerically solved exact minimal surfaces.

```text
gyroid  = sin(qx) cos(qy) + sin(qy) cos(qz) + sin(qz) cos(qx)
schwarz = cos(qx) + cos(qy) + cos(qz)
diamond = sin(qx) sin(qy) sin(qz)
        + sin(qx) cos(qy) cos(qz)
        + cos(qx) sin(qy) cos(qz)
        + cos(qx) cos(qy) sin(qz)
neovius = 3[cos(qx)+cos(qy)+cos(qz)] + 4 cos(qx) cos(qy) cos(qz)
```

The sheet function is `abs(nodal)/(k*L) - t/2`, with k=2π/cell and normalization bounds L of √12, √3, 4, and 7√3 respectively. It is intersected with the design-domain body. **The wall isoband is not an exact uniform wall thickness**: dividing by a global field bound does not equal local distance to a curved nodal surface. Measure actual walls in the extracted geometry before manufacturing.

Cubic beams use orthogonal cell-axis families. Octet beams use periodic face-diagonal segments; each distance is a segment distance minus local radius. Unioning/cropping and varying radius also affect junction geometry. A block name does not imply homogenized material properties or a complete conformal unit-cell system.

Procedural noise is deterministic smooth trigonometric modulation. It is not a Perlin/simplex implementation, stochastic microstructure solver, or statistically calibrated random field.

## Sampling and meshing

`sampleGrid` evaluates the compiled body at each node and rejects non-finite samples. `extractMesh` divides every cube into six consistently oriented Freudenthal tetrahedra, intersects sign-changing edges, and welds shared edge endpoints. Exact zero-value nodes receive stable common indices; gradient estimates orient the surface and supply normals.

This is regular-grid **marching tetrahedra**, not adaptive dual contouring, exact B-rep tessellation, or a hidden third-party mesh engine. It produces indexed Float32 vertices and Uint32 triangles. Triangulation is globally consistent across cube faces. Surface detail cannot exceed what the samples resolve, and aliased thin walls can disappear, merge or become disconnected.

`meshMetrics` integrates signed triangle tetrahedra for enclosed volume and sums triangle areas. Edge incidence counts identify boundary edges and edges with more than two incident triangles. The `watertight` flag only describes those tests and nonempty geometry. It does not detect self-intersections, all degeneracies, inconsistent overlapping shells, minimum wall thickness, or printer/process compatibility.

Occupancy integration uses the sampled sign indicator and product trapezoidal endpoint weights. It is a grid estimate, not analytic body volume. The mesh volume uses the piecewise-linear extracted surface, so the two methods can disagree; both should converge under refinement for a resolved well-behaved solid.

Closed-mesh import builds a median-split triangle BVH. Magnitudes are nearest-point-on-triangle distances and signs use oblique-ray parity. Source meshes must be closed and well-conditioned. Coincident/intersecting shells, ambiguous parity, degeneracies and very thin regions are not automatically repaired. The resulting volume is padded and trilinearly sampled; outside it, positive exterior distance prevents unbounded continuation.

## Thermal conduction

The model is steady isotropic conduction with volumetric generation. Occupied samples become finite-volume cells. Opposite occupied X planes have prescribed hot/cold temperatures. Interior neighbor conductances are `k*A/h`. Missing/empty neighbors contribute `h_conv*A` to the diagonal and `h_conv*A*T_ambient` to the right side. Source power per cell is `Q*hx*hy*hz` after conversion to metres.

The iteration is Jacobi. CPU and GPU use two Float32 temperature arrays; host diagnostics use JavaScript arithmetic. GPU checks follow batches of up to 32 iterations, CPU checks follow its configured iteration intervals. Consequently, the two paths may stop at different iterations for the same tolerance; the GPU harness compares identical fixed iteration counts.

The reported residual is `max(abs(J(T)-T))`, in °C, over occupied cells. It is a fixed-point temperature update, **not a normalized linear-system residual or watt balance**. The report separately accumulates hot/cold boundary powers, surface convection and generation, including source terms in prescribed-temperature cells. Energy imbalance can remain materially nonzero after a loose temperature tolerance is met; tighten tolerances, check the iteration cap and perform resolution studies.

The model has no advection, fluid velocity, radiation, anisotropy, temperature-dependent materials, transient heat capacity, thermal contact resistance or arbitrary user-selected boundary patches. Disconnected unanchored insulated components are not a unique thermal problem. Do not treat a heat-exchanger geometry as a fluid/thermal-system prediction merely because a temperature overlay exists.

## Linear elasticity

The design domain is voxelized by element-center occupancy. Active cells use trilinear **8-node hexahedral elements**, each with 24 displacement DOFs. The element stiffness is integrated with full 2×2×2 Gauss quadrature:

```text
Ke = sum_gp [ B(gp)^T D(E,nu) B(gp) * detJ * weight ]
```

D is the isotropic small-strain elasticity matrix. All three displacement components are fixed at the minimum occupied X node plane. The entered total load vector is distributed over nodes on the maximum occupied X plane. These are convenience benchmark boundary conditions, not arbitrary point/face boundary selection.

The solve applies K element by element without storing a global sparse matrix. It uses preconditioned conjugate gradients, a Jacobi diagonal preconditioner, Float64 vectors, and final recomputation of the true residual. A maximum iteration count is not reported as success unless the measured convergence condition is met. Floating disconnected node components are detected relative to the fixed support.

Displacement, compliance `F^T u`, strain energy and von Mises stress are returned. Stress is evaluated from element strains and averaged for display; those averages are not error estimators. Voxel stair steps and coarse grids affect bending and stress concentrations. The implementation is not nonlinear, contact, plasticity, buckling, fracture, fatigue, dynamics, higher-order, or certified material analysis.

## SIMP topology optimization

Each active design element receives density rho. Its stiffness multiplier is approximately `Emin + (1-Emin)*rho^p`. A real elasticity solve computes compliance and sensitivities. Spatial sensitivity filtering uses the selected neighborhood radius in element units. An optimality-criteria update applies a move limit of 0.16 and bisection on the volume multiplier. Previous displacements warm-start the next PCG solve. Failed linear convergence aborts instead of silently producing a claimed optimum.

The target volume fraction applies to the active design-element density sum. It is not guaranteed to equal the final thresholded solid's geometric volume. The output implicit body is reconstructed from a density threshold of 0.5 and clipped to the original design envelope. Thresholding and interpolation may disconnect load paths, remove support/load regions or change wall thickness; inspect and re-analyze the resulting body.

The requested optimization iteration count limits work, not proof of convergence to a global optimum. The result's `converged` field refers to the last elasticity solve. This is single-load-case compliance minimization, not general stress, frequency, buckling, multi-material or manufacturing-constrained optimization.

## Practical resolution procedure

Start with a solid benchmark. Refine at least two or three times while holding physical inputs fixed; compare volume, displacement, energy and boundary selection. Thin features require several samples/elements across their width; a pretty shaded surface does not establish that this condition holds. Inspect open/non-manifold edges and geometry clipping before using exported meshes. Replace illustrative material presets with application-specific data and validate independently before safety-critical or manufacturing decisions.
