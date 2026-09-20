import { gridInfo, throwIfAborted } from '../../kernel/src/index.js';
import { thermalSetup, thermalDiagnostics } from '../../analysis/src/index.js';
export async function requestGPU() { if (!globalThis.navigator?.gpu)
    return null; const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); if (!adapter)
    return null; const device = await adapter.requestDevice(); return { adapter, device, info: adapter.info ?? {} }; }
export function storageBuffer(device, data, label = 'field buffer', extraUsage = 0) { if (data.byteLength > device.limits.maxStorageBufferBindingSize)
    throw new Error(`${label} exceeds this device's storage-buffer limit.`); const b = device.createBuffer({ label, size: Math.max(4, (data.byteLength + 3) & ~3), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extraUsage }); device.queue.writeBuffer(b, 0, data); return b; }
export async function checkedModule(device, code, label) { const module = device.createShaderModule({ code, label }); const info = await module.getCompilationInfo(); const errors = info.messages.filter(x => x.type === 'error'); if (errors.length)
    throw new Error(errors.map(x => `${label}:${x.lineNum}:${x.linePos}: ${x.message}`).join('\n')); return module; }
export class GPUCompute {
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
export class WorkerClient {
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
