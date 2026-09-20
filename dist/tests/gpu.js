import { NODE_TYPES, createNode } from '../packages/graph/src/index.js';
import { compileDocument } from '../packages/compile/src/index.js';
import { GPUCompute } from '../packages/compute/src/index.js';
import { ImplicitRenderer } from '../packages/render/src/index.js';
import { sampleGrid } from '../packages/mesh/src/index.js';
import { solveThermal } from '../packages/analysis/src/index.js';
import { EXAMPLES } from '../app/examples.js';
const out = document.getElementById('report');
const log = text => out.textContent += text + '\n';
async function validateGPU() {
    const report = { device: null, tests: [], errors: [] };
    window.ImplicitForgeGPUReport = report;
    out.textContent = '';
    const gpu = await GPUCompute.create();
    if (!gpu) {
        report.skipped = true;
        log('SKIPPED: no WebGPU device. Use a secure origin and enable hardware acceleration.');
        return report;
    }
    report.device = { maxStorageBufferBindingSize: gpu.device.limits.maxStorageBufferBindingSize };
    gpu.device.addEventListener('uncapturederror', e => report.errors.push(e.error.message));
    const domain = { min: [-11.3, -10.7, -12.1], max: [12.7, 11.9, 10.3] };
    let renderer;
    try {
        for (const [type, def] of Object.entries(NODE_TYPES)) {
            const body = createNode('box'), field = createNode('constant'), target = createNode(type), doc = { format: 'implicitforge', version: 1, name: type, units: 'mm', nodes: [body, field, target], root: body.id, assets: {}, domain };
            for (const [key, port] of Object.entries(def.inputs))
                target.inputs[key] = port.type === 'body' ? body.id : field.id;
            if (type === 'volume') {
                target.params.asset = 'sample';
                doc.assets.sample = { n: 4, min: domain.min, max: domain.max, data: Array.from({ length: 64 }, (_, i) => Math.hypot(i % 4 - 1.5, Math.floor(i / 4) % 4 - 1.5, Math.floor(i / 16) - 1.5) - 1) };
            }
            const program = compileDocument(doc, target.id), grid = await gpu.sample(program, domain, 9);
            let maxError = 0, failed = 0;
            for (let z = 0; z < 9; z++)
                for (let y = 0; y < 9; y++)
                    for (let x = 0; x < 9; x++) {
                        const cpu = program.sample(...domain.min.map((v, i) => v + [x, y, z][i] * grid.step[i])), actual = grid.values[x + 9 * (y + 9 * z)], error = Math.abs(cpu - actual);
                        maxError = Math.max(maxError, error);
                        if (!Number.isFinite(actual) || error > 2e-4 * Math.max(1, Math.abs(cpu)))
                            failed++;
                    }
            report.tests.push({ name: `field/${type}`, passed: failed === 0, maxError, failedSamples: failed });
            log(`${failed ? 'FAIL' : 'PASS'} field/${type} · maximum error ${maxError.toExponential(3)}`);
        }
        const grid = await sampleGrid(() => -1, domain, 12), options = { hot: 120, cold: 20, ambient: 20, convection: 30, conductivity: 12, heatSource: 10000, tolerance: 1e-20, maxIterations: 64 };
        const cpu = await solveThermal(grid, options), parallel = await gpu.thermal(grid, options);
        let maxError = 0;
        for (let i = 0; i < cpu.values.length; i++)
            maxError = Math.max(maxError, Math.abs(cpu.values[i] - parallel.values[i]));
        report.tests.push({ name: 'thermal/64-Jacobi-iterations', passed: maxError < .002, maxError });
        log(`${maxError < .002 ? 'PASS' : 'FAIL'} thermal CPU/GPU · maximum error ${maxError} °C`);
        renderer = new ImplicitRenderer(document.querySelector('canvas'), { onError: e => report.errors.push(e.message) });
        await renderer.init();
        if (renderer.backend !== 'WebGPU')
            throw new Error('The renderer did not acquire a WebGPU device.');
        for (const example of EXAMPLES.filter(e => e.id !== 'blank')) {
            const doc = example.make();
            renderer.setDomain(doc.domain, { fit: true });
            await renderer.setProgram(compileDocument(doc));
            await renderer.snapshot();
            report.tests.push({ name: `renderer/${example.id}`, passed: true });
            log(`PASS renderer/${example.id} · pipeline compiled and submitted`);
        }
        await gpu.device.queue.onSubmittedWorkDone();
        await renderer.device.queue.onSubmittedWorkDone();
        log(`\n${report.tests.filter(t => t.passed).length}/${report.tests.length} tests passed. ${report.errors.length} uncaptured GPU errors.`);
        if (report.errors.length)
            log(report.errors.join('\n'));
        return report;
    }
    catch (error) {
        report.errors.push(error.message);
        log(`ERROR: ${error.stack ?? error.message}`);
        return report;
    }
    finally {
        gpu.destroy();
        renderer?.destroy();
    }
}
document.getElementById('run').onclick = async () => { const button = document.getElementById('run'); button.disabled = true; try {
    await validateGPU();
}
finally {
    button.disabled = false;
} };
window.validateImplicitForgeGPU = validateGPU;
