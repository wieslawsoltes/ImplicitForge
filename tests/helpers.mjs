import { createNode } from '../packages/graph/src/index.js';
export const domain = { min: [-10, -10, -10], max: [10, 10, 10] };
export function document(nodes = [], root = nodes.at(-1)?.id ?? null, space = domain) { return { format: 'implicitforge', version: 1, name: 'Test notebook', units: 'mm', nodes, root, assets: {}, domain: structuredClone(space), material: { density: 2.7, E: 69000, nu: .3, conductivity: 167 }, view: { color: [.8, .4, .2], roughness: .3 } }; }
export const node = (type, params = {}, inputs = {}) => createNode(type, { params, inputs });
export function close(actual, expected, tolerance = 1e-6) { if (Math.abs(actual - expected) > tolerance)
    throw new Error(`Expected ${actual} ≈ ${expected}, tolerance ${tolerance}`); }
