# Block catalogue

33 built-in block types. Parameter defaults, ranges, units and port requirements are executable in `packages/graph/src/index.js`. Body functions are negative inside; scalar functions carry arbitrary scalar values.

## Rounded box — `box`

Primitives · output **body**

Exact rounded-box signed distance. Size includes the rounded boundary.

Parameters: `size` = `[48,38,42]` mm; `radius` = `3` mm.

Inputs: none.

## Sphere — `sphere`

Primitives · output **body**

Sphere with an optionally field-driven radius.

Parameters: `radius` = `20` mm.

Inputs: `radius`: scalar, optional.

## Cylinder — `cylinder`

Primitives · output **body**

Finite cylinder along the Z axis.

Parameters: `radius` = `18` mm; `height` = `44` mm.

Inputs: none.

## Torus — `torus`

Primitives · output **body**

Ring about the Z axis.

Parameters: `major` = `20` mm; `minor` = `6` mm.

Inputs: none.

## Capsule — `capsule`

Primitives · output **body**

A capsule along Z, with a cylindrical centre segment.

Parameters: `radius` = `9` mm; `length` = `30` mm.

Inputs: none.

## Ellipsoid — `ellipsoid`

Primitives · output **body**

Sign-correct first-order ellipsoid distance approximation.

Parameters: `radii` = `[24,16,30]` mm.

Inputs: none.

## Half-space — `plane`

Primitives · output **body**

Negative below the plane. Use an intersection to clip a solid.

Parameters: `normal` = `[0,0,1]`; `offset` = `0` mm.

Inputs: none.

## Boolean union — `union`

Operations · output **body**

Combine two implicit bodies.

Parameters: none.

Inputs: `a`: body, required; `b`: body, required.

## Intersection — `intersect`

Operations · output **body**

Keep the overlapping volume.

Parameters: none.

Inputs: `a`: body, required; `b`: body, required.

## Subtract — `subtract`

Operations · output **body**

Remove body B from body A.

Parameters: none.

Inputs: `a`: body, required; `b`: body, required.

## Smooth union — `smoothUnion`

Operations · output **body**

Polynomial blend between two implicit fields.

Parameters: `radius` = `4` mm.

Inputs: `a`: body, required; `b`: body, required.

## Offset body — `offset`

Operations · output **body**

Expand or contract the zero level set.

Parameters: `distance` = `1` mm.

Inputs: `body`: body, required; `distance`: scalar, optional.

## Shell — `shell`

Operations · output **body**

Create a centred shell about a zero level set.

Parameters: `thickness` = `1.2` mm.

Inputs: `body`: body, required; `thickness`: scalar, optional.

## Translate — `translate`

Transforms · output **body**

Translate a body without remeshing.

Parameters: `offset` = `[0,0,0]` mm.

Inputs: `body`: body, required.

## Rotate — `rotate`

Transforms · output **body**

Euler rotation, applied X then Y then Z.

Parameters: `angles` = `[0,0,0]` °.

Inputs: `body`: body, required.

## Uniform scale — `scale`

Transforms · output **body**

Positive uniform scale with distance compensation.

Parameters: `factor` = `1` ×.

Inputs: `body`: body, required.

## Twist — `twist`

Transforms · output **body**

Twist about Z. Degrees of rotation per millimetre.

Parameters: `rate` = `2` °/mm.

Inputs: `body`: body, required.

## Finite array — `repeat`

Transforms · output **body**

Replicate a body on a finite XYZ cell grid.

Parameters: `spacing` = `[24,24,24]` mm; `count` = `[3,3,1]`.

Inputs: `body`: body, required.

## Gyroid lattice — `gyroid`

Lattices · output **body**

Triply periodic gyroid sheet, clipped to an implicit design domain.

Parameters: `cell` = `11` mm; `thickness` = `0.7` mm.

Inputs: `domain`: body, required; `thickness`: scalar, optional.

## Schwarz P lattice — `schwarz`

Lattices · output **body**

Periodic primitive minimal-surface approximation.

Parameters: `cell` = `12` mm; `thickness` = `0.6` mm.

Inputs: `domain`: body, required; `thickness`: scalar, optional.

## Diamond lattice — `diamond`

Lattices · output **body**

Periodic diamond nodal-surface sheet.

Parameters: `cell` = `13` mm; `thickness` = `0.6` mm.

Inputs: `domain`: body, required; `thickness`: scalar, optional.

## Neovius lattice — `neovius`

Lattices · output **body**

Connected periodic Neovius nodal-surface sheet.

Parameters: `cell` = `13` mm; `thickness` = `0.5` mm.

Inputs: `domain`: body, required; `thickness`: scalar, optional.

## Cubic beam lattice — `cubic`

Lattices · output **body**

Three orthogonal beam families on a cubic unit cell.

Parameters: `cell` = `10` mm; `radius` = `0.9` mm.

Inputs: `domain`: body, required; `radius`: scalar, optional.

## Octet beam lattice — `octet`

Lattices · output **body**

Face-diagonal struts within a periodic cubic cell.

Parameters: `cell` = `12` mm; `radius` = `0.8` mm.

Inputs: `domain`: body, required; `radius`: scalar, optional.

## Constant field — `constant`

Fields · output **scalar**

Spatially constant scalar.

Parameters: `value` = `0.8`.

Inputs: none.

## Linear ramp — `ramp`

Fields · output **scalar**

Clamped spatial ramp. Direction sets the gradient axis.

Parameters: `direction` = `[0,0,1]`; `start` = `-24` mm; `end` = `24` mm; `low` = `0.35`; `high` = `1.2`.

Inputs: none.

## Radial field — `radial`

Fields · output **scalar**

Radial ramp about a point.

Parameters: `center` = `[0,0,0]` mm; `radius` = `28` mm; `inner` = `1.4`; `outer` = `0.4`.

Inputs: none.

## Wave field — `sine`

Fields · output **scalar**

Sinusoidal modulation along an arbitrary direction.

Parameters: `direction` = `[0,0,1]`; `period` = `20` mm; `base` = `0.8`; `amplitude` = `0.3`; `phase` = `0` °.

Inputs: none.

## Procedural noise — `noise`

Fields · output **scalar**

Deterministic smooth trigonometric noise, not random state.

Parameters: `scale` = `18` mm; `base` = `0.8`; `amplitude` = `0.3`; `seed` = `1`.

Inputs: none.

## Add fields — `add`

Fields · output **scalar**

Pointwise scalar addition.

Parameters: none.

Inputs: `a`: scalar, required; `b`: scalar, required.

## Multiply fields — `multiply`

Fields · output **scalar**

Pointwise scalar multiplication.

Parameters: none.

Inputs: `a`: scalar, required; `b`: scalar, required.

## Clamp field — `clamp`

Fields · output **scalar**

Clamp a scalar field to an interval.

Parameters: `min` = `0`; `max` = `1`.

Inputs: `field`: scalar, required.

## Imported mesh field — `volume`

Import · output **body**

Signed-distance grid generated from a closed triangle mesh. Accuracy depends on sampling resolution.

Parameters: `asset` = `""`.

Inputs: none.

