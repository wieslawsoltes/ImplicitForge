import { gridInfo, clamp, throwIfAborted, vec3 } from '../../kernel/src/index.js';
const pause = () => new Promise(r => setTimeout(r, 0));
/** Inclusive nodal sampling. x is the fastest-changing coordinate. */
export async function sampleGrid(sample, domain, resolution, { signal, onProgress } = {}) {
    const g = gridInfo(domain, resolution), { n, count, min, step } = g;
    const values = new Float32Array(count);
    for (let z = 0; z < n; z++) {
        throwIfAborted(signal);
        const pz = min[2] + z * step[2];
        for (let y = 0; y < n; y++) {
            const py = min[1] + y * step[1];
            let i = n * (y + n * z);
            for (let x = 0; x < n; x++) {
                const v = sample(min[0] + x * step[0], py, pz);
                if (!Number.isFinite(v))
                    throw new Error(`Non-finite field value at grid index ${i}.`);
                values[i++] = v;
            }
        }
        if (z % 4 === 0) {
            onProgress?.(z / (n - 1));
            await pause();
        }
    }
    onProgress?.(1);
    return { ...g, values };
}
const TETS = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];
const EDGES = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
/** Consistent Freudenthal tetrahedra, shared-edge welding, outward-oriented indexed triangles. */
export async function extractMesh(grid, { signal, onProgress, iso = 0, maxTriangles = 2500000 } = {}) {
    const { n, values, min, step } = grid, count = n ** 3;
    const positions = [], normals = [], indices = [], cache = new Map();
    const coords = id => { const x = id % n, y = Math.floor(id / n) % n, z = Math.floor(id / (n * n)); return [min[0] + x * step[0], min[1] + y * step[1], min[2] + z * step[2]]; };
    const normal = id => { const x = id % n, y = Math.floor(id / n) % n, z = Math.floor(id / n / n); return [(values[id + (x < n - 1 ? 1 : 0)] - values[id - (x > 0 ? 1 : 0)]) / ((x === 0 || x === n - 1 ? 1 : 2) * step[0]), (values[id + (y < n - 1 ? n : 0)] - values[id - (y > 0 ? n : 0)]) / ((y === 0 || y === n - 1 ? 1 : 2) * step[1]), (values[id + (z < n - 1 ? n * n : 0)] - values[id - (z > 0 ? n * n : 0)]) / ((z === 0 || z === n - 1 ? 1 : 2) * step[2])]; };
    const vertex = (ia, ib) => {
        const va = values[ia] - iso, vb = values[ib] - iso, t = clamp(va / (va - vb), 0, 1);
        const key = t < 1e-10 ? -(ia + 1) : t > 1 - 1e-10 ? -(ib + 1) : Math.min(ia, ib) * count + Math.max(ia, ib);
        if (cache.has(key))
            return cache.get(key);
        const a = coords(ia), b = coords(ib), na = normal(ia), nb = normal(ib), nn = vec3.normalize(na.map((v, k) => v + (nb[k] - v) * t)), id = positions.length / 3;
        positions.push(...a.map((v, k) => v + (b[k] - v) * t));
        normals.push(...nn);
        cache.set(key, id);
        return id;
    };
    const point = i => positions.slice(i * 3, i * 3 + 3);
    const triangle = (a, b, c, direction) => { if (a === b || b === c || c === a)
        return; const p = point(a), q = point(b), r = point(c), cross = vec3.cross(vec3.sub(q, p), vec3.sub(r, p)); if (vec3.dot(cross, cross) < 1e-20)
        return; if (vec3.dot(cross, direction) < 0)
        indices.push(a, c, b);
    else
        indices.push(a, b, c); };
    for (let z = 0; z < n - 1; z++) {
        throwIfAborted(signal);
        for (let y = 0; y < n - 1; y++)
            for (let x = 0; x < n - 1; x++) {
                const a = x + n * (y + n * z), cube = [a, a + 1, a + n + 1, a + n, a + n * n, a + n * n + 1, a + n * n + n + 1, a + n * n + n];
                let bits = 0;
                for (let k = 0; k < 8; k++)
                    if (values[cube[k]] < iso)
                        bits |= 1 << k;
                if (bits === 0 || bits === 255)
                    continue;
                for (const tet of TETS) {
                    const ids = tet.map(i => cube[i]), inside = ids.map(i => values[i] < iso), num = inside.filter(Boolean).length;
                    if (num === 0 || num === 4)
                        continue;
                    const polygon = [];
                    for (const [a, b] of EDGES)
                        if (inside[a] !== inside[b]) {
                            const v = vertex(ids[a], ids[b]);
                            if (!polygon.includes(v))
                                polygon.push(v);
                        }
                    if (polygon.length < 3)
                        continue;
                    const ci = [0, 0, 0], co = [0, 0, 0];
                    for (let k = 0; k < 4; k++) {
                        const p = coords(ids[k]);
                        const sum = inside[k] ? ci : co;
                        for (let c = 0; c < 3; c++)
                            sum[c] += p[c] / (inside[k] ? num : 4 - num);
                    }
                    const dir = vec3.sub(co, ci);
                    if (polygon.length === 4) {
                        const center = [0, 0, 0];
                        for (const i of polygon) {
                            const p = point(i);
                            for (let k = 0; k < 3; k++)
                                center[k] += p[k] * .25;
                        }
                        const u = vec3.normalize(vec3.sub(point(polygon[0]), center)), v = vec3.normalize(vec3.cross(dir, u));
                        polygon.sort((ia, ib) => { const a = vec3.sub(point(ia), center), b = vec3.sub(point(ib), center); return Math.atan2(vec3.dot(a, v), vec3.dot(a, u)) - Math.atan2(vec3.dot(b, v), vec3.dot(b, u)); });
                    }
                    triangle(polygon[0], polygon[1], polygon[2], dir);
                    if (polygon.length === 4)
                        triangle(polygon[0], polygon[2], polygon[3], dir);
                }
            }
        if (indices.length / 3 > maxTriangles)
            throw new Error(`Mesh exceeds ${maxTriangles.toLocaleString()} triangles. Reduce the export resolution.`);
        if (z % 2 === 0) {
            onProgress?.(z / (n - 2));
            await pause();
        }
    }
    onProgress?.(1);
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), resolution: n, domain: { min: grid.min, max: grid.max } };
}
export function meshMetrics(mesh, { topology = true } = {}) {
    const { positions: p, indices: t } = mesh;
    let signedVolume = 0, area = 0;
    const edges = topology ? new Map() : null, centroid = [0, 0, 0];
    for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
        const vx = (by * cz - bz * cy), vy = (bz * cx - bx * cz), vz = (bx * cy - by * cx), v = (ax * vx + ay * vy + az * vz) / 6;
        signedVolume += v;
        for (let k = 0; k < 3; k++)
            centroid[k] += v * (p[a + k] + p[b + k] + p[c + k]) * .25;
        area += Math.hypot((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * .5;
        if (edges)
            for (const [u, v] of [[t[i], t[i + 1]], [t[i + 1], t[i + 2]], [t[i + 2], t[i]]]) {
                const key = Math.min(u, v) * (p.length / 3) + Math.max(u, v);
                edges.set(key, (edges.get(key) || 0) + 1);
            }
    }
    let boundaryEdges = 0, nonManifoldEdges = 0;
    if (edges)
        for (const n of edges.values()) {
            if (n === 1)
                boundaryEdges++;
            if (n > 2)
                nonManifoldEdges++;
        }
    return { vertices: p.length / 3, triangles: t.length / 3, volume: Math.abs(signedVolume), signedVolume, area, centroid: centroid.map(v => Math.abs(signedVolume) > 1e-12 ? v / signedVolume : 0), boundaryEdges, nonManifoldEdges, watertight: topology ? boundaryEdges === 0 && nonManifoldEdges === 0 && t.length > 0 : null };
}
/** Weld triangle soup, rejecting non-finite positions and degenerate triangles. */
export function weldMesh(positions, indices = null, tolerance = 1e-5) {
    if (positions.length % 3)
        throw new Error('Mesh coordinates must be XYZ triples.');
    const map = new Map(), out = [], remap = new Uint32Array(positions.length / 3);
    for (let i = 0; i < positions.length; i += 3) {
        if (!Number.isFinite(positions[i]) || !Number.isFinite(positions[i + 1]) || !Number.isFinite(positions[i + 2]))
            throw new Error('Mesh has non-finite coordinates.');
        const key = `${Math.round(positions[i] / tolerance)},${Math.round(positions[i + 1] / tolerance)},${Math.round(positions[i + 2] / tolerance)}`;
        let id = map.get(key);
        if (id === undefined) {
            id = out.length / 3;
            map.set(key, id);
            out.push(positions[i], positions[i + 1], positions[i + 2]);
        }
        remap[i / 3] = id;
    }
    const src = indices ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    if (src.length % 3)
        throw new Error('Mesh index count is not a multiple of three.');
    const tris = [];
    for (let i = 0; i < src.length; i += 3) {
        if (src[i] >= remap.length || src[i + 1] >= remap.length || src[i + 2] >= remap.length)
            throw new Error('Mesh index is out of bounds.');
        const a = remap[src[i]], b = remap[src[i + 1]], c = remap[src[i + 2]];
        if (a !== b && b !== c && c !== a)
            tris.push(a, b, c);
    }
    return { positions: new Float32Array(out), indices: new Uint32Array(tris) };
}
function pointTriangleSq(p, a, b, c) {
    const ab = vec3.sub(b, a), ac = vec3.sub(c, a), ap = vec3.sub(p, a), d1 = vec3.dot(ab, ap), d2 = vec3.dot(ac, ap);
    if (d1 <= 0 && d2 <= 0)
        return vec3.dot(ap, ap);
    const bp = vec3.sub(p, b), d3 = vec3.dot(ab, bp), d4 = vec3.dot(ac, bp);
    if (d3 >= 0 && d4 <= d3)
        return vec3.dot(bp, bp);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3), q = vec3.sub(ap, vec3.mul(ab, v));
        return vec3.dot(q, q);
    }
    const cp = vec3.sub(p, c), d5 = vec3.dot(ab, cp), d6 = vec3.dot(ac, cp);
    if (d6 >= 0 && d5 <= d6)
        return vec3.dot(cp, cp);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6), q = vec3.sub(ap, vec3.mul(ac, w));
        return vec3.dot(q, q);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const q = vec3.sub(bp, vec3.mul(vec3.sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
        return vec3.dot(q, q);
    }
    const denom = va + vb + vc;
    if (Math.abs(denom) < 1e-24)
        return Math.min(vec3.dot(ap, ap), vec3.dot(bp, bp), vec3.dot(cp, cp));
    const v = vb / denom, w = vc / denom, q = vec3.sub(ap, vec3.add(vec3.mul(ab, v), vec3.mul(ac, w)));
    return vec3.dot(q, q);
}
function boxDistanceSq(p, lo, hi) { let d = 0; for (let k = 0; k < 3; k++) {
    const q = Math.max(lo[k] - p[k], 0, p[k] - hi[k]);
    d += q * q;
} return d; }
function rayBox(p, dir, lo, hi) { let tmin = 0, tmax = Infinity; for (let k = 0; k < 3; k++) {
    const a = (lo[k] - p[k]) / dir[k], b = (hi[k] - p[k]) / dir[k];
    tmin = Math.max(tmin, Math.min(a, b));
    tmax = Math.min(tmax, Math.max(a, b));
} return tmax >= tmin; }
function rayTriangle(p, dir, a, b, c) { const e1 = vec3.sub(b, a), e2 = vec3.sub(c, a), h = vec3.cross(dir, e2), det = vec3.dot(e1, h); if (Math.abs(det) < 1e-12)
    return false; const s = vec3.sub(p, a), u = vec3.dot(s, h) / det; if (u < 0 || u > 1)
    return false; const q = vec3.cross(s, e1), v = vec3.dot(dir, q) / det; if (v < 0 || u + v > 1)
    return false; return vec3.dot(e2, q) / det > 1e-9; }
/** Median-split BVH with nearest-triangle distance and parity classification. */
export class MeshBVH {
    constructor(mesh) {
        this.mesh = mesh;
        const p = mesh.positions;
        this.triangles = [];
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v = [0, 1, 2].map(k => Array.from(p.slice(mesh.indices[i + k] * 3, mesh.indices[i + k] * 3 + 3)));
            this.triangles.push({ v, min: [0, 1, 2].map(k => Math.min(...v.map(a => a[k]))), max: [0, 1, 2].map(k => Math.max(...v.map(a => a[k]))) });
        }
        if (!this.triangles.length)
            throw new Error('Mesh has no valid triangles.');
        const build = ids => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const i of ids)
            for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], this.triangles[i].min[k]);
                hi[k] = Math.max(hi[k], this.triangles[i].max[k]);
            } if (ids.length <= 10)
            return { lo, hi, ids }; const lengths = hi.map((v, k) => v - lo[k]), axis = lengths.indexOf(Math.max(...lengths)); ids.sort((a, b) => (this.triangles[a].min[axis] + this.triangles[a].max[axis]) - (this.triangles[b].min[axis] + this.triangles[b].max[axis])); const mid = ids.length >> 1; return { lo, hi, left: build(ids.slice(0, mid)), right: build(ids.slice(mid)) }; };
        this.root = build(this.triangles.map((_, i) => i));
        this.bounds = { min: this.root.lo, max: this.root.hi };
    }
    distance(x, y, z) {
        const p = [x, y, z], dir = [1, .371390676354, .529117403], stack = [this.root];
        let best = Infinity, hits = 0;
        while (stack.length) {
            const n = stack.pop();
            if (boxDistanceSq(p, n.lo, n.hi) > best)
                continue;
            if (n.ids) {
                for (const i of n.ids)
                    best = Math.min(best, pointTriangleSq(p, ...this.triangles[i].v));
            }
            else {
                const dl = boxDistanceSq(p, n.left.lo, n.left.hi), dr = boxDistanceSq(p, n.right.lo, n.right.hi);
                if (dl < dr) {
                    stack.push(n.right, n.left);
                }
                else
                    stack.push(n.left, n.right);
            }
        }
        stack.push(this.root);
        while (stack.length) {
            const n = stack.pop();
            if (!rayBox(p, dir, n.lo, n.hi))
                continue;
            if (n.ids) {
                for (const i of n.ids)
                    if (rayTriangle(p, dir, ...this.triangles[i].v))
                        hits++;
            }
            else
                stack.push(n.left, n.right);
        }
        return Math.sqrt(best) * (hits % 2 ? -1 : 1);
    }
}
export async function meshToVolume(mesh, resolution = 48, options = {}) {
    const welded = weldMesh(mesh.positions, mesh.indices), metrics = meshMetrics(welded);
    if (!metrics.watertight)
        throw new Error(`Solid import requires a closed manifold mesh (${metrics.boundaryEdges} boundary edges, ${metrics.nonManifoldEdges} non-manifold edges).`);
    const bvh = new MeshBVH(welded), size = Math.max(...bvh.bounds.max.map((v, i) => v - bvh.bounds.min[i])), pad = Math.max(size * .06, .1), domain = { min: bvh.bounds.min.map(v => v - pad), max: bvh.bounds.max.map(v => v + pad) };
    const grid = await sampleGrid((x, y, z) => bvh.distance(x, y, z), domain, resolution, options);
    return { n: grid.n, min: grid.min, max: grid.max, data: grid.values, sourceMetrics: metrics };
}
