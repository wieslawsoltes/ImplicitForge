import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleGrid } from '../packages/mesh/src/index.js';
import { hexElement, solveElasticity, optimizeTopology, solveThermal } from '../packages/analysis/src/index.js';
import { close } from './helpers.mjs';
const domain = { min: [0, 0, 0], max: [30, 10, 10] };
test('Hex8 element stiffness is symmetric and translations have zero energy', () => { const { K } = hexElement([2, 3, 4], 69000, .3); let max = 0; for (let i = 0; i < 24; i++)
    for (let j = 0; j < 24; j++)
        max = Math.max(max, Math.abs(K[i * 24 + j] - K[j * 24 + i])); assert.ok(max < 1e-10); for (let axis = 0; axis < 3; axis++) {
    let energy = 0;
    for (let i = axis; i < 24; i += 3)
        for (let j = axis; j < 24; j += 3)
            energy += K[i * 24 + j];
    close(energy, 0, 1e-8);
} });
test('Hex8 validates material and shape', () => { for (const [h, E, nu] of [[[1, 1, 1], -1, .3], [[1, 1, 1], 100, NaN], [[1, 1, 0], 100, .3], [[1, 1, 1], 100, .5]])
    assert.throws(() => hexElement(h, E, nu)); });
test('Steady conduction reproduces a linear insulated-bar solution', async () => { const g = await sampleGrid(() => -1, domain, 10), r = await solveThermal(g, { hot: 100, cold: 0, ambient: 0, convection: 0, tolerance: 1e-5, maxIterations: 200 }); assert.ok(r.converged); assert.ok(r.residual < 1e-5); close(r.energyImbalance, 0, 1e-4); for (let x = 0; x < 10; x++)
    close(r.values[x + 10 * (5 + 10 * 5)], 100 * (1 - x / 9), 1e-4); });
test('Thermal convection with a source converges and balances power', async () => { const d = { min: [0, 0, 0], max: [10, 10, 10] }, g = await sampleGrid(() => -1, d, 7); const r = await solveThermal(g, { hot: 100, cold: 20, ambient: 20, conductivity: 12, convection: 30, heatSource: 1e6, tolerance: 1e-5, maxIterations: 3000 }); assert.ok(r.converged); assert.ok(Math.abs(r.energyImbalance) < .001); close(r.minValue, 20); close(r.maxValue, 100); });
test('Linear cantilever FEM converges and agrees with a beam estimate', async () => { const r = await solveElasticity(() => -1, domain, { resolution: 5, E: 69000, nu: .3, load: [0, 0, -100] }); assert.ok(r.converged); assert.ok(r.relativeResidual < 5e-7); assert.equal(r.elements, 125); close(r.maxDisplacement, 100 * 30 ** 3 / (3 * 69000 * (10 * 10 ** 3 / 12)), .004); close(r.strainEnergy, r.compliance * .5); assert.ok(r.maxStress > 0); });
test('Elastic displacement scales inversely with Young modulus', async () => { const opts = { resolution: 4, E: 69000, nu: .3, load: [0, 0, -100] }, a = await solveElasticity(() => -1, domain, opts), b = await solveElasticity(() => -1, domain, { ...opts, E: 138000 }); close(a.maxDisplacement, b.maxDisplacement * 2, 1e-8); });
test('Disconnected floating components are diagnosed before solving', async () => { const sample = x => x < 10 || x > 20 ? -1 : 1; await assert.rejects(solveElasticity(sample, domain, { resolution: 6 }), /do not reach/); });
test('Nonconvergence is reported rather than replaced with fabricated results', async () => { const r = await solveElasticity(() => -1, domain, { resolution: 5, maxIterations: 1 }); assert.equal(r.converged, false); assert.ok(r.relativeResidual > 1e-5); });
test('SIMP runs real stiffness solves, enforces volume and changes density', async () => { const r = await optimizeTopology(() => -1, domain, { resolution: 4, volumeFraction: .4, iterations: 4 }); assert.equal(r.iterations, 4); close(r.volumeFraction, .4, 1e-4); assert.ok(r.densities.some(v => v > .55)); assert.ok(r.densities.some(v => v < .25)); assert.ok(r.history.at(-1).compliance < r.history[0].compliance); assert.ok(r.history.every(v => v.linearResidual < 1e-4)); assert.equal(r.asset.data.length, r.asset.n ** 3); assert.ok(r.asset.data.every(Number.isFinite)); });
