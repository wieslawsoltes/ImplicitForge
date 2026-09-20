import { clamp, throwIfAborted, validateDomain } from '../../kernel/src/index.js';
const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const OFFSETS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const sleep = () => new Promise(r => setTimeout(r, 0));
function constitutive(E, nu) { const D = new Float64Array(36), lambda = E * nu / ((1 + nu) * (1 - 2 * nu)), mu = E / (2 * (1 + nu)); for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
        D[i * 6 + j] = lambda + (i === j ? 2 * mu : 0); for (let i = 3; i < 6; i++)
    D[i * 6 + i] = mu; return D; }
function strainMatrix(h, xi, eta, zeta) { const B = new Float64Array(6 * 24); for (let i = 0; i < 8; i++) {
    const [a, b, c] = CORNERS[i], dx = a * (1 + b * eta) * (1 + c * zeta) / (4 * h[0]), dy = b * (1 + a * xi) * (1 + c * zeta) / (4 * h[1]), dz = c * (1 + a * xi) * (1 + b * eta) / (4 * h[2]), j = i * 3;
    B[j] = dx;
    B[24 + j + 1] = dy;
    B[48 + j + 2] = dz;
    B[72 + j] = dy;
    B[72 + j + 1] = dx;
    B[96 + j + 1] = dz;
    B[96 + j + 2] = dy;
    B[120 + j] = dz;
    B[120 + j + 2] = dx;
} return B; }
/** Fully integrated trilinear 8-node hexahedron. Units: mm, N, MPa. */
export function hexElement(h, E = 1, nu = .3) {
    if (!Array.isArray(h) || h.length !== 3 || !Number.isFinite(nu) || h.some(x => !Number.isFinite(x) || x <= 0) || !Number.isFinite(E) || E <= 0 || nu <= -.99 || nu >= .499)
        throw new Error('Invalid elasticity material or element dimensions.');
    const D = constitutive(E, nu), K = new Float64Array(576), a = 1 / Math.sqrt(3), det = h[0] * h[1] * h[2] / 8;
    for (const x of [-a, a])
        for (const y of [-a, a])
            for (const z of [-a, a]) {
                const B = strainMatrix(h, x, y, z), DB = new Float64Array(144);
                for (let i = 0; i < 6; i++)
                    for (let j = 0; j < 24; j++)
                        for (let k = 0; k < 6; k++)
                            DB[i * 24 + j] += D[i * 6 + k] * B[k * 24 + j];
                for (let i = 0; i < 24; i++)
                    for (let j = 0; j < 24; j++) {
                        let v = 0;
                        for (let k = 0; k < 6; k++)
                            v += B[k * 24 + i] * DB[k * 24 + j];
                        K[i * 24 + j] += v * det;
                    }
            }
    return { K, B: strainMatrix(h, 0, 0, 0), D };
}
function makeProblem(sample, domain, n, { E = 69000, nu = .33, load = [0, 0, -100] } = {}) {
    validateDomain(domain);
    if (!Number.isFinite(E) || E <= 0 || !Number.isFinite(nu) || nu <= -.99 || nu >= .499)
        throw new Error('Invalid elastic material.');
    if (!Number.isInteger(n) || n < 4 || n > 24)
        throw new Error('Elasticity resolution must be 4–24 elements per axis.');
    if (!Array.isArray(load) || load.length !== 3 || load.some(x => !Number.isFinite(x)) || Math.hypot(...load) === 0)
        throw new Error('Load must be a nonzero finite XYZ vector.');
    const h = domain.max.map((v, i) => (v - domain.min[i]) / n), N = n + 1, globalCount = N ** 3, nodeMap = new Int32Array(globalCount).fill(-1), nodes = [], elements = [], elementLookup = new Int32Array(n ** 3).fill(-1);
    let minX = N, maxX = -1;
    const getNode = (x, y, z) => { const gid = x + N * (y + N * z); if (nodeMap[gid] === -1) {
        nodeMap[gid] = nodes.length;
        nodes.push({ x, y, z, gid });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
    } return nodeMap[gid]; };
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                if (sample(domain.min[0] + (x + .5) * h[0], domain.min[1] + (y + .5) * h[1], domain.min[2] + (z + .5) * h[2]) >= 0)
                    continue;
                const cn = OFFSETS.map(([dx, dy, dz]) => getNode(x + dx, y + dy, z + dz)), dofs = new Uint32Array(24);
                cn.forEach((v, i) => dofs.set([3 * v, 3 * v + 1, 3 * v + 2], i * 3));
                elementLookup[x + n * (y + n * z)] = elements.length;
                elements.push({ x, y, z, nodes: cn, dofs });
            }
    if (elements.length < 2 || maxX <= minX)
        throw new Error('No usable finite-element solid at this resolution.');
    const parent = Int32Array.from({ length: nodes.length }, (_, i) => i), find = i => { while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
    } return i; };
    for (const e of elements) {
        const root = find(e.nodes[0]);
        for (const i of e.nodes)
            parent[find(i)] = root;
    }
    const anchored = new Set(nodes.flatMap((v, i) => v.x === minX ? [find(i)] : []));
    const floating = new Set(nodes.map((_, i) => find(i)).filter(root => !anchored.has(root)));
    if (floating.size)
        throw new Error(`${floating.size} sampled component(s) do not reach the fixed X face. Refine the voxel grid or use a connected solid design domain.`);
    const ndof = nodes.length * 3, fixed = new Uint8Array(ndof), F = new Float64Array(ndof), loaded = nodes.filter(v => v.x === maxX).length;
    nodes.forEach((v, i) => { if (v.x === minX)
        fixed.fill(1, i * 3, i * 3 + 3); if (v.x === maxX)
        for (let k = 0; k < 3; k++)
            F[i * 3 + k] = load[k] / loaded; });
    const element = hexElement(h, 1, nu);
    return { n, N, h, domain, E, nu, load, nodes, elements, elementLookup, nodeMap, ndof, fixed, F, unitK: element.K, B: element.B, D: constitutive(E, nu), minX, maxX };
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++)
    s += a[i] * b[i]; return s; };
async function solvePCG(problem, scale, { tolerance = 1e-7, maxIterations = 700, signal, onProgress, initial = null } = {}) {
    if (!Number.isFinite(tolerance) || tolerance <= 0 || !Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 20000)
        throw new Error('Invalid PCG settings.');
    const { ndof, elements, unitK: K, fixed, F } = problem, u = initial ? new Float64Array(initial) : new Float64Array(ndof), diag = new Float64Array(ndof), local = new Float64Array(24);
    for (let ei = 0; ei < elements.length; ei++) {
        const e = elements[ei], s = scale[ei];
        for (let a = 0; a < 24; a++)
            diag[e.dofs[a]] += K[a * 24 + a] * s;
    }
    for (let i = 0; i < ndof; i++)
        if (fixed[i]) {
            diag[i] = 1;
            u[i] = 0;
        }
    const multiply = (x, out) => { out.fill(0); for (let ei = 0; ei < elements.length; ei++) {
        const ids = elements[ei].dofs, s = scale[ei];
        for (let j = 0; j < 24; j++)
            local[j] = x[ids[j]];
        for (let i = 0; i < 24; i++) {
            if (fixed[ids[i]])
                continue;
            let v = 0;
            const row = i * 24;
            for (let j = 0; j < 24; j++)
                v += K[row + j] * local[j];
            out[ids[i]] += v * s;
        }
    } for (let i = 0; i < ndof; i++)
        if (fixed[i])
            out[i] = x[i]; };
    const r = new Float64Array(ndof), z = new Float64Array(ndof), p = new Float64Array(ndof), Ap = new Float64Array(ndof);
    multiply(u, Ap);
    for (let i = 0; i < ndof; i++) {
        r[i] = F[i] - Ap[i];
        z[i] = r[i] / Math.max(diag[i], 1e-20);
        p[i] = z[i];
    }
    const normF = Math.sqrt(dot(F, F)) || 1;
    let rz = dot(r, z), relativeResidual = Math.sqrt(dot(r, r)) / normF, iterations = 0;
    while (iterations < maxIterations && relativeResidual > tolerance) {
        throwIfAborted(signal);
        multiply(p, Ap);
        const den = dot(p, Ap);
        if (!Number.isFinite(den) || den <= 1e-30)
            break;
        const alpha = rz / den;
        for (let i = 0; i < ndof; i++) {
            u[i] += alpha * p[i];
            r[i] -= alpha * Ap[i];
            z[i] = r[i] / Math.max(diag[i], 1e-20);
        }
        const next = dot(r, z), beta = next / rz;
        for (let i = 0; i < ndof; i++)
            p[i] = z[i] + beta * p[i];
        rz = next;
        iterations++;
        relativeResidual = Math.sqrt(dot(r, r)) / normF;
        if (iterations % 12 === 0) {
            onProgress?.({ iterations, relativeResidual });
            await sleep();
        }
    }
    // Recompute the true residual; recurrent CG residuals can drift in ill-conditioned systems.
    multiply(u, Ap);
    for (let i = 0; i < ndof; i++)
        r[i] = F[i] - Ap[i];
    relativeResidual = Math.sqrt(dot(r, r)) / normF;
    return { u, iterations, relativeResidual, converged: relativeResidual <= tolerance };
}
function elementEnergy(problem, e, u) { const ids = e.dofs, K = problem.unitK; let energy = 0; for (let i = 0; i < 24; i++) {
    let row = 0;
    for (let j = 0; j < 24; j++)
        row += K[i * 24 + j] * u[ids[j]];
    energy += u[ids[i]] * row;
} return energy; }
export async function solveElasticity(sample, domain, { resolution = 12, E = 69000, nu = .33, load = [0, 0, -100], tolerance = 1e-7, maxIterations = 700 } = {}, hooks = {}) {
    const problem = makeProblem(sample, domain, resolution, { E, nu, load }), scale = new Float64Array(problem.elements.length).fill(E), solution = await solvePCG(problem, scale, { ...hooks, tolerance, maxIterations });
    const { N, nodes, elements, B, D } = problem, values = new Float32Array(N ** 3), counts = new Uint16Array(N ** 3), displacements = new Float32Array(N ** 3 * 3);
    let maxDisplacement = 0, maxStress = 0;
    for (let i = 0; i < nodes.length; i++) {
        const ux = solution.u[i * 3], uy = solution.u[i * 3 + 1], uz = solution.u[i * 3 + 2];
        maxDisplacement = Math.max(maxDisplacement, Math.hypot(ux, uy, uz));
        displacements.set([ux, uy, uz], nodes[i].gid * 3);
    }
    for (const e of elements) {
        const strain = new Float64Array(6), stress = new Float64Array(6);
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 24; j++)
                strain[i] += B[i * 24 + j] * solution.u[e.dofs[j]];
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 6; j++)
                stress[i] += D[i * 6 + j] * strain[j];
        const [x, y, z, xy, yz, zx] = stress, vm = Math.sqrt(.5 * ((x - y) ** 2 + (y - z) ** 2 + (z - x) ** 2) + 3 * (xy * xy + yz * yz + zx * zx));
        maxStress = Math.max(maxStress, vm);
        for (const ni of e.nodes) {
            const gid = nodes[ni].gid;
            values[gid] += vm;
            counts[gid]++;
        }
    }
    for (let i = 0; i < values.length; i++)
        if (counts[i])
            values[i] /= counts[i];
    const compliance = dot(problem.F, solution.u);
    return { kind: 'elasticity', values, n: N, min: domain.min, max: domain.max, step: problem.h, minValue: 0, maxValue: maxStress, iterations: solution.iterations, relativeResidual: solution.relativeResidual, converged: solution.converged, maxDisplacement, maxStress, compliance, strainEnergy: .5 * compliance, elements: elements.length, degreesOfFreedom: problem.ndof, displacements, backend: 'CPU matrix-free Hex8 FEM', unit: 'MPa', label: 'von Mises stress', settings: { resolution, E, nu, load, tolerance, maxIterations }, fixedX: domain.min[0] + problem.minX * problem.h[0], loadedX: domain.min[0] + problem.maxX * problem.h[0] };
}
/** SIMP compliance minimization; sensitivity filtering and optimality-criteria volume update. */
export async function optimizeTopology(sample, domain, { resolution = 10, volumeFraction = .4, iterations = 15, E = 69000, nu = .33, load = [0, 0, -100], penalty = 3, filterRadius = 1.5 } = {}, { signal, onProgress } = {}) {
    if (![volumeFraction, iterations, penalty, filterRadius].every(Number.isFinite) || !Number.isInteger(iterations) || penalty < 1 || filterRadius <= 0 || filterRadius > 5)
        throw new Error('Invalid topology settings.');
    if (volumeFraction < .1 || volumeFraction > .9 || iterations < 1 || iterations > 80 || resolution > 18)
        throw new Error('Topology settings out of bounds.');
    const p = makeProblem(sample, domain, resolution, { E, nu, load }), m = p.elements.length, rho = new Float64Array(m).fill(volumeFraction), history = [], Emin = 1e-5, neighbors = [];
    let u = null;
    const R = Math.ceil(filterRadius);
    for (const e of p.elements) {
        const list = [];
        let weight = 0;
        for (let dz = -R; dz <= R; dz++)
            for (let dy = -R; dy <= R; dy++)
                for (let dx = -R; dx <= R; dx++) {
                    const x = e.x + dx, y = e.y + dy, z = e.z + dz, w = filterRadius - Math.hypot(dx, dy, dz);
                    if (w <= 0 || x < 0 || y < 0 || z < 0 || x >= p.n || y >= p.n || z >= p.n)
                        continue;
                    const j = p.elementLookup[x + p.n * (y + p.n * z)];
                    if (j >= 0) {
                        list.push([j, w]);
                        weight += w;
                    }
                }
        neighbors.push({ list, weight });
    }
    let lastConverged = true;
    for (let iter = 0; iter < iterations; iter++) {
        throwIfAborted(signal);
        const scale = Float64Array.from(rho, r => E * (Emin + (1 - Emin) * r ** penalty));
        const solution = await solvePCG(p, scale, { signal, initial: u, tolerance: 2e-5, maxIterations: 900 });
        u = solution.u;
        lastConverged = solution.converged;
        if (!solution.converged)
            throw new Error(`Topology iteration ${iter + 1}: elasticity solve did not converge (relative residual ${solution.relativeResidual.toExponential(2)}).`);
        const sensitivity = Float64Array.from(p.elements, (e, i) => -E * (1 - Emin) * penalty * rho[i] ** (penalty - 1) * elementEnergy(p, e, u)), filtered = new Float64Array(m);
        for (let i = 0; i < m; i++) {
            let sum = 0;
            for (const [j, w] of neighbors[i].list)
                sum += w * rho[j] * sensitivity[j];
            filtered[i] = sum / (Math.max(.001, rho[i]) * neighbors[i].weight);
        }
        const candidate = new Float64Array(m);
        let low = 0, high = Math.max(...filtered.map(x => -x)) * 1e4 + 1;
        for (let k = 0; k < 70; k++) {
            const lambda = .5 * (low + high);
            let sum = 0;
            for (let i = 0; i < m; i++) {
                candidate[i] = clamp(rho[i] * Math.sqrt(Math.max(0, -filtered[i] / lambda)), Math.max(.001, rho[i] - .16), Math.min(1, rho[i] + .16));
                sum += candidate[i];
            }
            if (sum > volumeFraction * m)
                low = lambda;
            else
                high = lambda;
            if ((high - low) / (high + low + 1e-20) < 1e-5)
                break;
        }
        let change = 0, mean = 0;
        for (let i = 0; i < m; i++) {
            change = Math.max(change, Math.abs(candidate[i] - rho[i]));
            mean += rho[i];
        }
        const record = { iteration: iter + 1, compliance: dot(p.F, u), volumeFraction: mean / m, nextVolumeFraction: candidate.reduce((a, b) => a + b, 0) / m, change, linearIterations: solution.iterations, linearResidual: solution.relativeResidual };
        history.push(record);
        rho.set(candidate);
        onProgress?.({ ...record, fraction: (iter + 1) / iterations });
        await sleep();
        if (iter >= 9 && change < .015)
            break;
    }
    // Export the thresholded nodal density as a padded implicit volume, retaining the design envelope.
    const N = p.N, nodeDensity = new Float64Array(N ** 3), counts = new Uint16Array(N ** 3);
    p.elements.forEach((e, i) => { for (const ni of e.nodes) {
        const gid = p.nodes[ni].gid;
        nodeDensity[gid] += rho[i];
        counts[gid]++;
    } });
    for (let i = 0; i < nodeDensity.length; i++)
        if (counts[i])
            nodeDensity[i] /= counts[i];
    const n = N + 2, min = domain.min.map((v, i) => v - p.h[i]), max = domain.max.map((v, i) => v + p.h[i]), h = Math.min(...p.h), data = new Float32Array(n ** 3).fill(h);
    for (let z = 0; z < N; z++)
        for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
                const gid = x + N * (y + N * z), pos = [domain.min[0] + x * p.h[0], domain.min[1] + y * p.h[1], domain.min[2] + z * p.h[2]];
                data[(x + 1) + n * ((y + 1) + n * (z + 1))] = Math.max((.5 - nodeDensity[gid]) * h, sample(...pos));
            }
    return { asset: { n, min, max, data }, densities: new Float32Array(rho), history, converged: lastConverged, iterations: history.length, volumeFraction: rho.reduce((a, b) => a + b, 0) / m, settings: { resolution, volumeFraction, iterations, E, nu, load, penalty, filterRadius }, note: 'The 0.5-density threshold changes volume and may disconnect features. Re-mesh and validate the thresholded body independently.' };
}
