import { clamp, throwIfAborted } from '../../kernel/src/index.js';
/** Nodal trapezoid integration of the indicator field; intentionally reports its resolution. */
export function analyzeGrid(grid, density = 2.7) {
    if (!Number.isFinite(density) || density < 0)
        throw new Error('Density must be a nonnegative finite value.');
    const { n, values, min, step } = grid;
    let weight = 0, insideNodes = 0, boundary = false;
    const moment = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = x + n * (y + n * z);
                if (values[i] >= 0)
                    continue;
                insideNodes++;
                const p = [min[0] + x * step[0], min[1] + y * step[1], min[2] + z * step[2]], w = (x === 0 || x === n - 1 ? .5 : 1) * (y === 0 || y === n - 1 ? .5 : 1) * (z === 0 || z === n - 1 ? .5 : 1);
                weight += w;
                for (let k = 0; k < 3; k++) {
                    moment[k] += p[k] * w;
                    lo[k] = Math.min(lo[k], p[k]);
                    hi[k] = Math.max(hi[k], p[k]);
                }
                if (x === 0 || y === 0 || z === 0 || x === n - 1 || y === n - 1 || z === n - 1)
                    boundary = true;
            }
    const voxelVolume = step[0] * step[1] * step[2], volume = weight * voxelVolume, domainVolume = grid.max.reduce((v, x, i) => v * (x - grid.min[i]), 1);
    return { volume, mass: volume * density / 1000, density, relativeDensity: volume / domainVolume, insideNodes, samples: n ** 3, centroid: moment.map(v => weight ? v / weight : 0), occupiedBounds: insideNodes ? { min: lo, max: hi } : null, domainClipped: boundary, spacing: step, resolution: n, method: 'Trapezoidal occupancy integration' };
}
export function thermalSetup(grid, { hot = 120, cold = 20, ambient = 20, conductivity = 167, convection = 8, heatSource = 0, tolerance = .01, maxIterations = 1000 } = {}) {
    for (const [name, v] of Object.entries({ hot, cold, ambient, conductivity, convection, heatSource, tolerance, maxIterations }))
        if (!Number.isFinite(v))
            throw new Error(`${name} must be finite.`);
    if (conductivity <= 0 || convection < 0 || tolerance <= 0 || maxIterations < 1 || maxIterations > 20000)
        throw new Error('Invalid thermal parameters.');
    const { n, values, step } = grid;
    let minX = n, maxX = -1, occupied = 0;
    for (let i = 0; i < values.length; i++)
        if (values[i] < 0) {
            const x = i % n;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            occupied++;
        }
    if (maxX <= minX)
        throw new Error('The sampled body needs at least two occupied X planes. Increase resolution or change the domain.');
    const h = step.map(x => x * .001), area = [h[1] * h[2], h[0] * h[2], h[0] * h[1]], g = area.map((a, i) => conductivity * a / h[i]), conv = area.map(a => convection * a), source = heatSource * h[0] * h[1] * h[2], initial = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++)
        initial[i] = values[i] < 0 ? hot + (cold - hot) * clamp((i % n - minX) / (maxX - minX), 0, 1) : ambient;
    return { n, minX, maxX, occupied, g, conv, source, hot, cold, ambient, conductivity, convection, heatSource, tolerance, maxIterations: Math.floor(maxIterations), initial };
}
function thermalUpdate(i, x, y, z, t, grid, s) { if (grid.values[i] >= 0)
    return s.ambient; if (x === s.minX)
    return s.hot; if (x === s.maxX)
    return s.cold; const n = s.n, ids = [i - 1, i + 1, i - n, i + n, i - n * n, i + n * n], valid = [x > 0, x < n - 1, y > 0, y < n - 1, z > 0, z < n - 1]; let rhs = s.source, diag = 0; for (let k = 0; k < 6; k++) {
    const axis = k >> 1;
    if (valid[k] && grid.values[ids[k]] < 0) {
        rhs += s.g[axis] * t[ids[k]];
        diag += s.g[axis];
    }
    else {
        rhs += s.conv[axis] * s.ambient;
        diag += s.conv[axis];
    }
} return diag > 0 ? rhs / diag : t[i]; }
export function thermalDiagnostics(grid, s, temperature) {
    let residual = 0, min = Infinity, max = -Infinity, hotPower = 0, coldPower = 0, convectivePower = 0;
    const { n } = s;
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = x + n * (y + n * z);
                if (grid.values[i] >= 0)
                    continue;
                const t = temperature[i];
                min = Math.min(min, t);
                max = Math.max(max, t);
                residual = Math.max(residual, Math.abs(thermalUpdate(i, x, y, z, temperature, grid, s) - t));
                const ids = [i - 1, i + 1, i - n, i + n, i - n * n, i + n * n], valid = [x > 0, x < n - 1, y > 0, y < n - 1, z > 0, z < n - 1];
                for (let k = 0; k < 6; k++) {
                    const axis = k >> 1;
                    if (valid[k] && grid.values[ids[k]] < 0) {
                        const q = s.g[axis] * (t - temperature[ids[k]]);
                        if (x === s.minX)
                            hotPower += q;
                        if (x === s.maxX)
                            coldPower += q;
                    }
                    else {
                        const q = s.conv[axis] * (t - s.ambient);
                        convectivePower += q;
                        if (x === s.minX)
                            hotPower += q;
                        if (x === s.maxX)
                            coldPower += q;
                    }
                }
            }
    for (let i = 0; i < grid.values.length; i++) {
        if (grid.values[i] >= 0)
            continue;
        if (i % n === s.minX)
            hotPower -= s.source;
        if (i % n === s.maxX)
            coldPower -= s.source;
    }
    const generated = s.occupied * s.source;
    return { residual, minValue: min, maxValue: max, hotPower, coldPower, convectivePower, generatedPower: generated, energyImbalance: hotPower + coldPower + generated - convectivePower, converged: residual <= s.tolerance };
}
/** Steady-state finite-volume heat conduction on occupied voxels. No structural claims. */
export async function solveThermal(grid, options = {}, { signal, onProgress } = {}) {
    const s = thermalSetup(grid, options), { n } = s;
    let t = s.initial, next = new Float32Array(t.length), iterations = 0, diagnostics;
    for (let iter = 0; iter < s.maxIterations; iter++) {
        throwIfAborted(signal);
        for (let z = 0; z < n; z++)
            for (let y = 0; y < n; y++)
                for (let x = 0; x < n; x++) {
                    const i = x + n * (y + n * z);
                    next[i] = thermalUpdate(i, x, y, z, t, grid, s);
                }
        [t, next] = [next, t];
        iterations = iter + 1;
        if (iterations % 20 === 0 || iterations === s.maxIterations) {
            diagnostics = thermalDiagnostics(grid, s, t);
            onProgress?.({ fraction: iterations / s.maxIterations, iterations, residual: diagnostics.residual });
            if (diagnostics.converged)
                break;
            await new Promise(r => setTimeout(r, 0));
        }
    }
    diagnostics ??= thermalDiagnostics(grid, s, t);
    return { kind: 'thermal', values: t, n, min: grid.min, max: grid.max, step: grid.step, iterations, ...diagnostics, settings: options, backend: 'CPU finite volume', unit: '°C', label: 'Temperature' };
}
export { solveElasticity, optimizeTopology, hexElement } from './fem.js';
