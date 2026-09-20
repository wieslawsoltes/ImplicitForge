// Standalone @forge package. Generated from workspace source; no external runtime dependencies.
const __entry=(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
const { gridInfo, throwIfAborted }=__require(1);
const { thermalSetup, thermalDiagnostics }=__require(2);
async function requestGPU() { if (!globalThis.navigator?.gpu)
    return null; const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); if (!adapter)
    return null; const device = await adapter.requestDevice(); return { adapter, device, info: adapter.info ?? {} }; }
function storageBuffer(device, data, label = 'field buffer', extraUsage = 0) { if (data.byteLength > device.limits.maxStorageBufferBindingSize)
    throw new Error(`${label} exceeds this device's storage-buffer limit.`); const b = device.createBuffer({ label, size: Math.max(4, (data.byteLength + 3) & ~3), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extraUsage }); device.queue.writeBuffer(b, 0, data); return b; }
async function checkedModule(device, code, label) { const module = device.createShaderModule({ code, label }); const info = await module.getCompilationInfo(); const errors = info.messages.filter(x => x.type === 'error'); if (errors.length)
    throw new Error(errors.map(x => `${label}:${x.lineNum}:${x.linePos}: ${x.message}`).join('\n')); return module; }
class GPUCompute {
    constructor(device) { this.device = device; this.cache = new Map(); this.destroyed = false; }
    static async create() { const gpu = await requestGPU(); return gpu ? new GPUCompute(gpu.device) : null; }
    async sample(program, domain, resolution, { signal, onProgress } = {}) {
        throwIfAborted(signal);
        const d = this.device, g = gridInfo(domain, resolution), bytes = g.count * 4, resources = [];
        if (bytes > d.limits.maxStorageBufferBindingSize)
            throw new Error('Requested grid exceeds GPU storage limits.');
        const track = b => (resources.push(b), b);
        let pipeline = this.cache.get(program.key);
        if (!pipeline) {
            const code = program.wgsl + `\nstruct Grid {lo:vec4f, hi:vec4f, size:vec4u}; @group(0) @binding(0) var<uniform> grid:Grid; @group(0) @binding(3) var<storage,read_write> samples:array<f32>;
 @compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) id:vec3u){let n=grid.size.x;if(any(id>=vec3u(n))){return;}let p=mix(grid.lo.xyz,grid.hi.xyz,vec3f(id)/f32(n-1u));samples[id.x+n*(id.y+n*id.z)]=scene(p);}`;
            const module = await checkedModule(d, code, 'Implicit field sampling');
            const bindLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
            pipeline = await d.createComputePipelineAsync({ label: 'Implicit field sampling', layout: d.createPipelineLayout({ bindGroupLayouts: [bindLayout] }), compute: { module, entryPoint: 'main' } });
            this.cache.set(program.key, pipeline);
            if (this.cache.size > 12)
                this.cache.delete(this.cache.keys().next().value);
        }
        try {
            const raw = new ArrayBuffer(48), f = new Float32Array(raw), u = new Uint32Array(raw);
            f.set(g.min, 0);
            f.set(g.max, 4);
            u.set([g.n, g.n, g.n, g.count], 8);
            const uniform = track(d.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
            d.queue.writeBuffer(uniform, 0, raw);
            const p = track(storageBuffer(d, program.parameters, 'Graph parameters')), a = track(storageBuffer(d, program.assets, 'Imported fields'));
            const output = track(d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })), read = track(d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
            const group = d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: p } }, { binding: 2, resource: { buffer: a } }, { binding: 3, resource: { buffer: output } }] });
            const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, group);
            const c = Math.ceil(g.n / 4);
            pass.dispatchWorkgroups(c, c, c);
            pass.end();
            encoder.copyBufferToBuffer(output, 0, read, 0, bytes);
            d.queue.submit([encoder.finish()]);
            onProgress?.(.5);
            await read.mapAsync(GPUMapMode.READ);
            throwIfAborted(signal);
            const values = new Float32Array(read.getMappedRange().slice(0));
            read.unmap();
            onProgress?.(1);
            return { ...g, values, backend: 'WebGPU compute' };
        }
        finally {
            for (const b of resources)
                b.destroy();
        }
    }
    async thermal(grid, options = {}, { signal, onProgress } = {}) {
        const s = thermalSetup(grid, options), d = this.device, count = grid.n ** 3, bytes = count * 4, resources = [];
        const track = b => (resources.push(b), b);
        const code = `struct Settings {dim:vec4u,g:vec4f,conv:vec4f,bc:vec4f};
 @group(0) @binding(0) var<storage,read> S:array<f32>;@group(0) @binding(1) var<storage,read> X:array<f32>;@group(0) @binding(2) var<storage,read_write> Y:array<f32>;@group(0) @binding(3) var<uniform> u:Settings;
 @compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3u){let i=gid.x;let n=u.dim.x;if(i>=n*n*n){return;}let x=i%n;let y=(i/n)%n;let z=i/(n*n);if(S[i]>=0.0){Y[i]=u.conv.w;return;}if(x==u.dim.y){Y[i]=u.bc.x;return;}if(x==u.dim.z){Y[i]=u.bc.y;return;}
 var rhs=u.bc.z;var diag=0.0;let ids=array<i32,6>(i32(i)-1,i32(i)+1,i32(i)-i32(n),i32(i)+i32(n),i32(i)-i32(n*n),i32(i)+i32(n*n));let valid=array<bool,6>(x>0u,x<n-1u,y>0u,y<n-1u,z>0u,z<n-1u);
 for(var k=0u;k<6u;k++){let axis=k/2u;if(valid[k]){if(S[ids[k]]<0.0){rhs+=u.g[axis]*X[ids[k]];diag+=u.g[axis];continue;}}rhs+=u.conv[axis]*u.conv.w;diag+=u.conv[axis];}Y[i]=X[i];if(diag>0.0){Y[i]=rhs/diag;}}
 `;
        const module = await checkedModule(d, code, 'Finite-volume heat conduction'), pipeline = await d.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
        try {
            const solid = track(storageBuffer(d, grid.values, 'Solid occupancy')), a = track(storageBuffer(d, s.initial, 'Temperature A', GPUBufferUsage.COPY_SRC)), b = track(storageBuffer(d, s.initial, 'Temperature B', GPUBufferUsage.COPY_SRC));
            const raw = new ArrayBuffer(64), f = new Float32Array(raw), u = new Uint32Array(raw);
            u.set([s.n, s.minX, s.maxX, 0]);
            f.set([...s.g, 0], 4);
            f.set([...s.conv, s.ambient], 8);
            f.set([s.hot, s.cold, s.source, 0], 12);
            const uniform = track(d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
            d.queue.writeBuffer(uniform, 0, raw);
            const read = track(d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
            const groups = [[a, b], [b, a]].map(([x, y]) => d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: solid } }, { binding: 1, resource: { buffer: x } }, { binding: 2, resource: { buffer: y } }, { binding: 3, resource: { buffer: uniform } }] }));
            let iterations = 0, current = 0, values = s.initial, stats;
            while (iterations < s.maxIterations) {
                throwIfAborted(signal);
                const batch = Math.min(32, s.maxIterations - iterations), encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
                pass.setPipeline(pipeline);
                for (let k = 0; k < batch; k++) {
                    pass.setBindGroup(0, groups[current]);
                    pass.dispatchWorkgroups(Math.ceil(count / 128));
                    current = 1 - current;
                }
                pass.end();
                encoder.copyBufferToBuffer(current === 0 ? a : b, 0, read, 0, bytes);
                d.queue.submit([encoder.finish()]);
                await read.mapAsync(GPUMapMode.READ);
                values = new Float32Array(read.getMappedRange().slice(0));
                read.unmap();
                iterations += batch;
                stats = thermalDiagnostics(grid, s, values);
                onProgress?.({ fraction: iterations / s.maxIterations, iterations, residual: stats.residual });
                if (stats.converged)
                    break;
            }
            return { kind: 'thermal', values, n: grid.n, min: grid.min, max: grid.max, step: grid.step, iterations, ...stats, settings: options, backend: 'WebGPU finite volume', unit: '°C', label: 'Temperature' };
        }
        finally {
            for (const b of resources)
                b.destroy();
        }
    }
    destroy() { this.destroyed = true; this.cache.clear(); this.device.destroy(); }
}
/** One cancellable worker job at a time; termination also prevents stale result commits. */
class WorkerClient {
    constructor(url, { type = 'module' } = {}) { this.url = url; this.workerType = type; this.worker = null; this.counter = 0; this.pending = null; }
    run(type, payload, onProgress) { this.cancel(); const id = ++this.counter; return new Promise((resolve, reject) => { const worker = new Worker(this.url, { type: this.workerType }); this.worker = worker; this.pending = { id, reject }; worker.onmessage = e => { const m = e.data; if (m.id !== id)
        return; if (m.progress !== undefined) {
        onProgress?.(m.progress);
        return;
    } this.pending = null; this.worker = null; worker.terminate(); if (m.error)
        reject(new Error(m.error));
    else
        resolve(m.result); }; worker.onerror = e => { this.pending = null; this.worker = null; worker.terminate(); reject(new Error(e.message || 'Worker failed.')); }; worker.postMessage({ id, type, payload }); }); }
    cancel() { if (this.worker) {
        this.worker.terminate();
        this.worker = null;
    } if (this.pending) {
        const e = new Error('Operation cancelled');
        e.name = 'AbortError';
        this.pending.reject(e);
        this.pending = null;
    } }
}

Object.assign(__exports,{requestGPU:requestGPU,storageBuffer:storageBuffer,checkedModule:checkedModule,GPUCompute:GPUCompute,WorkerClient:WorkerClient});
},
1:(__exports,__require)=>{
/** Numeric and application primitives. Distances are millimetres; angles are degrees. */
const EPSILON = 1e-8;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const vec3 = {
    add: (a, b) => a.map((v, i) => v + b[i]), sub: (a, b) => a.map((v, i) => v - b[i]),
    mul: (a, s) => a.map(v => v * s), dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    length: a => Math.hypot(...a), normalize: a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }
};
function uid(prefix = 'n') { return `${prefix}_${globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14)}`; }
function clone(value) { return structuredClone(value); }
function assertFinite(value, name = 'value') { if (!Number.isFinite(value))
    throw new TypeError(`${name} must be finite`); return value; }
function hashString(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0).toString(16); }
function validateDomain(d) {
    if (!d || !Array.isArray(d.min) || !Array.isArray(d.max) || d.min.length !== 3 || d.max.length !== 3)
        throw new Error('Domain requires min/max XYZ coordinates.');
    for (let i = 0; i < 3; i++)
        if (!Number.isFinite(d.min[i]) || !Number.isFinite(d.max[i]) || d.max[i] <= d.min[i] || d.max[i] - d.min[i] > 1e6)
            throw new Error('Domain extent must be positive, finite, and at most 1,000,000 mm.');
    return d;
}
function gridInfo(domain, resolution) {
    validateDomain(domain);
    const n = Number(resolution);
    if (!Number.isInteger(n) || n < 4 || n > 192)
        throw new RangeError('Grid resolution must be an integer in [4, 192].');
    return { n, count: n * n * n, min: [...domain.min], max: [...domain.max], step: domain.max.map((x, i) => (x - domain.min[i]) / (n - 1)) };
}
class Emitter {
    #listeners = new Set();
    subscribe(f) { this.#listeners.add(f); return () => this.#listeners.delete(f); }
    emit(value) { for (const f of [...this.#listeners])
        f(value); }
    clear() { this.#listeners.clear(); }
}
class CancelledError extends Error {
    constructor() { super('Operation cancelled'); this.name = 'AbortError'; }
}
function throwIfAborted(signal) { if (signal?.aborted)
    throw new CancelledError(); }
function formatNumber(n, digits = 2) { return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'; }
function downloadFile(data, filename, mime = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function debounce(fn, ms = 100) { let t; const f = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; f.cancel = () => clearTimeout(t); return f; }

Object.assign(__exports,{EPSILON:EPSILON,TAU:TAU,clamp:clamp,lerp:lerp,vec3:vec3,uid:uid,clone:clone,assertFinite:assertFinite,hashString:hashString,validateDomain:validateDomain,gridInfo:gridInfo,Emitter:Emitter,CancelledError:CancelledError,throwIfAborted:throwIfAborted,formatNumber:formatNumber,downloadFile:downloadFile,escapeHTML:escapeHTML,debounce:debounce});
},
2:(__exports,__require)=>{
const { clamp, throwIfAborted }=__require(1);
/** Nodal trapezoid integration of the indicator field; intentionally reports its resolution. */
function analyzeGrid(grid, density = 2.7) {
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
function thermalSetup(grid, { hot = 120, cold = 20, ambient = 20, conductivity = 167, convection = 8, heatSource = 0, tolerance = .01, maxIterations = 1000 } = {}) {
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
function thermalDiagnostics(grid, s, temperature) {
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
async function solveThermal(grid, options = {}, { signal, onProgress } = {}) {
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
__exports.solveElasticity=__require(3).solveElasticity;
__exports.optimizeTopology=__require(3).optimizeTopology;
__exports.hexElement=__require(3).hexElement;

Object.assign(__exports,{analyzeGrid:analyzeGrid,thermalSetup:thermalSetup,thermalDiagnostics:thermalDiagnostics,solveThermal:solveThermal});
},
3:(__exports,__require)=>{
const { clamp, throwIfAborted, validateDomain }=__require(1);
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
function hexElement(h, E = 1, nu = .3) {
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
async function solveElasticity(sample, domain, { resolution = 12, E = 69000, nu = .33, load = [0, 0, -100], tolerance = 1e-7, maxIterations = 700 } = {}, hooks = {}) {
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
async function optimizeTopology(sample, domain, { resolution = 10, volumeFraction = .4, iterations = 15, E = 69000, nu = .33, load = [0, 0, -100], penalty = 3, filterRadius = 1.5 } = {}, { signal, onProgress } = {}) {
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

Object.assign(__exports,{hexElement:hexElement,solveElasticity:solveElasticity,optimizeTopology:optimizeTopology});
}};function __require(id){if(__cache[id])return __cache[id];const value={};__cache[id]=value;__modules[id](value,__require);return value;}return __require(0);})();
export const GPUCompute=__entry.GPUCompute;
export const WorkerClient=__entry.WorkerClient;
export const checkedModule=__entry.checkedModule;
export const requestGPU=__entry.requestGPU;
export const storageBuffer=__entry.storageBuffer;
