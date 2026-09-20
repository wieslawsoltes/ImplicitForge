import { compileDocument, compileCPU } from '../packages/compile/src/index.js';
import { sampleGrid, extractMesh, meshMetrics, meshToVolume } from '../packages/mesh/src/index.js';
import { analyzeGrid, solveThermal, solveElasticity, optimizeTopology } from '../packages/analysis/src/index.js';
import { GPUCompute } from '../packages/compute/src/index.js';
import { parseSTL, parseOBJ } from '../packages/io/src/index.js';
import { validateDocument } from '../packages/graph/src/index.js';
self.onmessage = async (event) => {
    const { id, type, payload } = event.data;
    let gpu = null;
    const progress = (stage, fraction, details = {}) => postMessage({ id, progress: { stage, fraction, ...details } });
    try {
        let result;
        const doc = payload.doc;
        if (doc)
            validateDocument(doc);
        if (type === 'import') {
            const mesh = payload.extension === 'stl' ? parseSTL(payload.buffer) : parseOBJ(new TextDecoder().decode(payload.buffer));
            result = await meshToVolume(mesh, payload.resolution ?? 40, { onProgress: f => progress('Implicitizing mesh', f) });
        }
        else if (type === 'elasticity') {
            progress('Building Hex8 finite elements', 0);
            result = await solveElasticity(compileCPU(doc), doc.domain, payload.options, { onProgress: p => progress('Solving linear elasticity', Math.min(.95, p.iterations / (payload.options.maxIterations ?? 700)), p) });
        }
        else if (type === 'topology') {
            progress('Building topology problem', 0);
            result = await optimizeTopology(compileCPU(doc), doc.domain, payload.options, { onProgress: p => progress('Optimizing compliance', p.fraction, p) });
        }
        else if (type === 'sweep') {
            result = [];
            const { nodeId, parameter, min, max, steps, resolution } = payload;
            const node = doc.nodes.find(n => n.id === nodeId);
            if (!node)
                throw new Error('Sweep block no longer exists.');
            for (let i = 0; i < steps; i++) {
                const value = min + (max - min) * i / (steps - 1);
                node.params[parameter] = value;
                validateDocument(doc);
                const grid = await sampleGrid(compileCPU(doc), doc.domain, resolution);
                result.push({ value, ...analyzeGrid(grid, doc.material?.density ?? 2.7) });
                progress('Evaluating design sweep', (i + 1) / steps, { value });
            }
        }
        else {
            const program = compileDocument(doc);
            const n = payload.resolution ?? 64;
            if (payload.preferGPU !== false) {
                try {
                    gpu = await GPUCompute.create();
                }
                catch {
                    gpu = null;
                }
            }
            progress('Sampling implicit field', 0);
            let grid;
            if (gpu) {
                try {
                    grid = await gpu.sample(program, doc.domain, n, { onProgress: f => progress('WebGPU field sampling', f * .5) });
                }
                catch (error) {
                    progress('GPU sampling unavailable; using CPU', 0, { notice: error.message });
                    gpu.destroy();
                    gpu = null;
                }
            }
            grid ??= await sampleGrid(program.sample, doc.domain, n, { onProgress: f => progress('CPU field sampling', f * .5) });
            grid.backend ??= 'CPU worker';
            if (type === 'evaluate') {
                result = { metrics: analyzeGrid(grid, doc.material?.density ?? 2.7), backend: grid.backend };
            }
            else if (type === 'mesh') {
                progress('Extracting welded isosurface', .5);
                const mesh = await extractMesh(grid, { onProgress: f => progress('Extracting welded isosurface', .5 + f * .47) });
                result = { mesh, metrics: meshMetrics(mesh), gridMetrics: analyzeGrid(grid, doc.material?.density ?? 2.7), backend: grid.backend };
            }
            else if (type === 'thermal') {
                const hooks = { onProgress: p => progress('Solving heat conduction', .5 + p.fraction * .5, p) };
                result = gpu ? await gpu.thermal(grid, payload.options, hooks) : await solveThermal(grid, payload.options, hooks);
            }
            else
                throw new Error(`Unknown worker operation: ${type}`);
        }
        const transfers = [];
        const seen = new Set();
        function collect(o) { if (!o || typeof o !== 'object')
            return; if (ArrayBuffer.isView(o)) {
            if (!seen.has(o.buffer)) {
                seen.add(o.buffer);
                transfers.push(o.buffer);
            }
            return;
        } if (o instanceof ArrayBuffer) {
            if (!seen.has(o)) {
                seen.add(o);
                transfers.push(o);
            }
            return;
        } for (const v of Object.values(o))
            collect(v); }
        collect(result);
        postMessage({ id, result }, transfers);
    }
    catch (e) {
        postMessage({ id, error: e?.message ?? String(e) });
    }
    finally {
        gpu?.destroy();
    }
};
