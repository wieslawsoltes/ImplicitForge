import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleGrid, extractMesh, meshMetrics, weldMesh, MeshBVH, meshToVolume } from '../packages/mesh/src/index.js';
import { analyzeGrid } from '../packages/analysis/src/index.js';
import { exportSTL, parseSTL, exportOBJ, parseOBJ, exportPLY, export3MF, zipStore, crc32, sliceContours, exportSliceSVG } from '../packages/io/src/index.js';
import { domain, close } from './helpers.mjs';
const sphere = (x, y, z) => Math.hypot(x, y, z) - 8;
const grid = await sampleGrid(sphere, domain, 33);
const mesh = await extractMesh(grid);
const metrics = meshMetrics(mesh);
test('Welded marching tetrahedra yield a closed outward-oriented sphere', () => { assert.ok(metrics.watertight); assert.ok(metrics.signedVolume > 0); assert.equal(metrics.boundaryEdges, 0); assert.equal(metrics.nonManifoldEdges, 0); close(metrics.volume, 4 * Math.PI * 8 ** 3 / 3, 25); close(metrics.area, 4 * Math.PI * 8 ** 2, 8); for (const v of metrics.centroid)
    close(v, 0, 1e-5); });
test('Occupancy volume and physical mass approximate analytic sphere', () => { const m = analyzeGrid(grid, 2.7); close(m.volume, 4 * Math.PI * 8 ** 3 / 3, 35); close(m.mass, m.volume * .0027, 1e-9); assert.equal(m.domainClipped, false); assert.throws(() => analyzeGrid(grid, -2)); });
test('Cancellation aborts sampling and meshing', async () => { const controller = new AbortController(); controller.abort(); await assert.rejects(sampleGrid(sphere, domain, 33, { signal: controller.signal }), { name: 'AbortError' }); await assert.rejects(extractMesh(grid, { signal: controller.signal }), { name: 'AbortError' }); });
test('Nonfinite samplers are rejected', async () => { await assert.rejects(sampleGrid(() => NaN, domain, 4), /finite/); });
test('Binary STL roundtrip preserves triangle count and volume', () => { const bytes = exportSTL(mesh), round = weldMesh(parseSTL(bytes).positions); assert.equal(bytes.byteLength, 84 + 50 * metrics.triangles); const m = meshMetrics(round); assert.equal(m.triangles, metrics.triangles); assert.ok(m.watertight); close(m.volume, metrics.volume, .001); });
test('OBJ roundtrip preserves indexed topology', () => { const obj = exportOBJ(mesh), parsed = parseOBJ(obj), m = meshMetrics(parsed); assert.equal(m.triangles, metrics.triangles); assert.ok(m.watertight); close(m.volume, metrics.volume, 1e-3); });
test('OBJ negative indices, inline comments and concave triangulation', () => { const text = 'v 0 0 0\nv 2 0 0\nv 2 2 0\nv 1 1 0\nv 0 2 0\nf -5 -4 -3 -2 -1 # concave polygon\n'; const p = parseOBJ(text); assert.equal(p.indices.length, 9); close(meshMetrics(p).area, 3); });
test('PLY header and binary payload agree', () => { const bytes = exportPLY(mesh); const text = new TextDecoder().decode(bytes.slice(0, 400)); assert.match(text, /format binary_little_endian 1.0/); assert.ok(text.includes(`element vertex ${metrics.vertices}`)); assert.ok(text.includes(`element face ${metrics.triangles}`)); });
test('ZIP CRC and 3MF OPC entries', () => { close(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 0); const bytes = export3MF(mesh, 'Sphere'), v = new DataView(bytes.buffer ?? bytes, bytes.byteOffset ?? 0); assert.equal(v.getUint32(0, true), 0x04034b50); const text = new TextDecoder().decode(bytes); for (const name of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'unit="millimeter"'])
    assert.ok(text.includes(name)); });
test('BVH signed distance is sign correct and matches the sphere', () => { const bvh = new MeshBVH(mesh); close(bvh.distance(0, 0, 0), -8, .04); close(bvh.distance(10, 0, 0), 2, .01); assert.ok(bvh.distance(1.1, 1.7, 2.9) < 0); });
test('Closed mesh implicitization produces a usable padded grid', async () => { const v = await meshToVolume(mesh, 12); assert.equal(v.data.length, 12 ** 3); assert.ok(v.min[0] < -8); assert.ok(v.data.some(x => x < 0)); });
test('Open meshes are refused as solid imports', async () => { await assert.rejects(meshToVolume({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }, 8), /closed manifold/); });
test('SVG section contours follow the analytic sphere circle', () => { const lines = sliceContours(sphere, domain, 0, 81); assert.ok(lines.length > 100); for (const line of lines)
    for (const p of line)
        close(Math.hypot(...p), 8, .02); const svg = exportSliceSVG(sphere, domain, 0, 81); assert.match(svg, /width="20mm"/); assert.match(svg, /<path/); });
