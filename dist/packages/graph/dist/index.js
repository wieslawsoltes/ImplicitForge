// Standalone @forge package. Generated from workspace source; no external runtime dependencies.
const __entry=(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
const { uid, clone, validateDomain }=__require(1);
const num = (label, value, min, max, step = 0.1, unit = 'mm') => ({ label, value, min, max, step, unit });
const xyz = (label, value, unit = 'mm') => ({ label, value, vector: true, step: unit === '°' ? 1 : 0.5, unit });
const body = (label, required = true) => ({ label, type: 'body', required });
const scalar = (label) => ({ label, type: 'scalar', required: false });
const D = (label, category, description, params = {}, inputs = {}, output = 'body') => ({ label, category, description, params, inputs, output });
const NODE_TYPES = {
    box: D('Rounded box', 'Primitives', 'Exact rounded-box signed distance. Size includes the rounded boundary.', { size: xyz('Dimensions', [48, 38, 42]), radius: num('Corner radius', 3, 0, 100) }, {}),
    sphere: D('Sphere', 'Primitives', 'Sphere with an optionally field-driven radius.', { radius: num('Radius', 20, .1, 500) }, { radius: scalar('Radius field') }),
    cylinder: D('Cylinder', 'Primitives', 'Finite cylinder along the Z axis.', { radius: num('Radius', 18, .1, 500), height: num('Height', 44, .1, 1000) }),
    torus: D('Torus', 'Primitives', 'Ring about the Z axis.', { major: num('Major radius', 20, .1, 500), minor: num('Tube radius', 6, .1, 200) }),
    capsule: D('Capsule', 'Primitives', 'A capsule along Z, with a cylindrical centre segment.', { radius: num('Radius', 9, .1, 200), length: num('Segment length', 30, 0, 1000) }),
    ellipsoid: D('Ellipsoid', 'Primitives', 'Sign-correct first-order ellipsoid distance approximation.', { radii: xyz('Semi-axes', [24, 16, 30]) }),
    plane: D('Half-space', 'Primitives', 'Negative below the plane. Use an intersection to clip a solid.', { normal: xyz('Normal', [0, 0, 1], ''), offset: num('Offset', 0, -500, 500) }),
    union: D('Boolean union', 'Operations', 'Combine two implicit bodies.', {}, { a: body('Body A'), b: body('Body B') }),
    intersect: D('Intersection', 'Operations', 'Keep the overlapping volume.', {}, { a: body('Body A'), b: body('Body B') }),
    subtract: D('Subtract', 'Operations', 'Remove body B from body A.', {}, { a: body('Body A'), b: body('Tool B') }),
    smoothUnion: D('Smooth union', 'Operations', 'Polynomial blend between two implicit fields.', { radius: num('Blend radius', 4, .01, 100) }, { a: body('Body A'), b: body('Body B') }),
    offset: D('Offset body', 'Operations', 'Expand or contract the zero level set.', { distance: num('Offset', 1, -100, 100) }, { body: body('Body'), distance: scalar('Offset field') }),
    shell: D('Shell', 'Operations', 'Create a centred shell about a zero level set.', { thickness: num('Thickness', 1.2, .05, 50) }, { body: body('Body'), thickness: scalar('Thickness field') }),
    translate: D('Translate', 'Transforms', 'Translate a body without remeshing.', { offset: xyz('Translation', [0, 0, 0]) }, { body: body('Body') }),
    rotate: D('Rotate', 'Transforms', 'Euler rotation, applied X then Y then Z.', { angles: xyz('Rotation', [0, 0, 0], '°') }, { body: body('Body') }),
    scale: D('Uniform scale', 'Transforms', 'Positive uniform scale with distance compensation.', { factor: num('Scale', 1, .01, 100, .01, '×') }, { body: body('Body') }),
    twist: D('Twist', 'Transforms', 'Twist about Z. Degrees of rotation per millimetre.', { rate: num('Twist rate', 2, -20, 20, .1, '°/mm') }, { body: body('Body') }),
    repeat: D('Finite array', 'Transforms', 'Replicate a body on a finite XYZ cell grid.', { spacing: xyz('Cell spacing', [24, 24, 24]), count: xyz('Copies (odd counts)', [3, 3, 1], '') }, { body: body('Body') }),
    gyroid: D('Gyroid lattice', 'Lattices', 'Triply periodic gyroid sheet, clipped to an implicit design domain.', { cell: num('Cell size', 11, 1, 100), thickness: num('Wall isoband', .7, .05, 10) }, { domain: body('Design domain'), thickness: scalar('Thickness field') }),
    schwarz: D('Schwarz P lattice', 'Lattices', 'Periodic primitive minimal-surface approximation.', { cell: num('Cell size', 12, 1, 100), thickness: num('Wall isoband', .6, .05, 10) }, { domain: body('Design domain'), thickness: scalar('Thickness field') }),
    diamond: D('Diamond lattice', 'Lattices', 'Periodic diamond nodal-surface sheet.', { cell: num('Cell size', 13, 1, 100), thickness: num('Wall isoband', .6, .05, 10) }, { domain: body('Design domain'), thickness: scalar('Thickness field') }),
    neovius: D('Neovius lattice', 'Lattices', 'Connected periodic Neovius nodal-surface sheet.', { cell: num('Cell size', 13, 1, 100), thickness: num('Wall isoband', .5, .05, 10) }, { domain: body('Design domain'), thickness: scalar('Thickness field') }),
    cubic: D('Cubic beam lattice', 'Lattices', 'Three orthogonal beam families on a cubic unit cell.', { cell: num('Cell size', 10, 1, 100), radius: num('Beam radius', .9, .05, 20) }, { domain: body('Design domain'), radius: scalar('Radius field') }),
    octet: D('Octet beam lattice', 'Lattices', 'Face-diagonal struts within a periodic cubic cell.', { cell: num('Cell size', 12, 1, 100), radius: num('Beam radius', .8, .05, 20) }, { domain: body('Design domain'), radius: scalar('Radius field') }),
    constant: D('Constant field', 'Fields', 'Spatially constant scalar.', { value: num('Value', .8, -1000, 1000, .05, '') }, {}, 'scalar'),
    ramp: D('Linear ramp', 'Fields', 'Clamped spatial ramp. Direction sets the gradient axis.', { direction: xyz('Direction', [0, 0, 1], ''), start: num('Start coordinate', -24, -1000, 1000), end: num('End coordinate', 24, -1000, 1000), low: num('Start value', .35, -1000, 1000, .05, ''), high: num('End value', 1.2, -1000, 1000, .05, '') }, {}, 'scalar'),
    radial: D('Radial field', 'Fields', 'Radial ramp about a point.', { center: xyz('Centre', [0, 0, 0]), radius: num('Falloff radius', 28, .01, 1000), inner: num('Centre value', 1.4, -1000, 1000, .05, ''), outer: num('Outer value', .4, -1000, 1000, .05, '') }, {}, 'scalar'),
    sine: D('Wave field', 'Fields', 'Sinusoidal modulation along an arbitrary direction.', { direction: xyz('Direction', [0, 0, 1], ''), period: num('Period', 20, .1, 1000), base: num('Mean', .8, -1000, 1000, .05, ''), amplitude: num('Amplitude', .3, 0, 1000, .05, ''), phase: num('Phase', 0, -360, 360, 1, '°') }, {}, 'scalar'),
    noise: D('Procedural noise', 'Fields', 'Deterministic smooth trigonometric noise, not random state.', { scale: num('Wavelength', 18, .1, 1000), base: num('Mean', .8, -1000, 1000, .05, ''), amplitude: num('Amplitude', .3, 0, 1000, .05, ''), seed: num('Seed', 1, 0, 10000, 1, '') }, {}, 'scalar'),
    add: D('Add fields', 'Fields', 'Pointwise scalar addition.', {}, { a: { ...scalar('Field A'), required: true }, b: { ...scalar('Field B'), required: true } }, 'scalar'),
    multiply: D('Multiply fields', 'Fields', 'Pointwise scalar multiplication.', {}, { a: { ...scalar('Field A'), required: true }, b: { ...scalar('Field B'), required: true } }, 'scalar'),
    clamp: D('Clamp field', 'Fields', 'Clamp a scalar field to an interval.', { min: num('Minimum', 0, -1000, 1000, .05, ''), max: num('Maximum', 1, -1000, 1000, .05, '') }, { field: { ...scalar('Scalar field'), required: true } }, 'scalar'),
    volume: D('Imported mesh field', 'Import', 'Signed-distance grid generated from a closed triangle mesh. Accuracy depends on sampling resolution.', { asset: { label: 'Asset ID', value: '', hidden: true } }, {})
};
function createNode(type, overrides = {}) {
    const def = NODE_TYPES[type];
    if (!def)
        throw new Error(`Unknown block type: ${type}`);
    return { id: uid(), type, name: def.label, params: Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, clone(v.value)])), inputs: {}, position: { x: 0, y: 0 }, ...overrides, params: { ...Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, clone(v.value)])), ...clone(overrides.params ?? {}) } };
}
function topologicalOrder(doc, root = doc.root, strict = true) {
    const map = new Map(doc.nodes.map(n => [n.id, n]));
    const active = new Set(), done = new Set(), out = [];
    function visit(id) {
        if (done.has(id))
            return;
        if (active.has(id))
            throw new Error('Cyclic block dependency is not allowed.');
        const n = map.get(id);
        if (!n)
            throw new Error(`Missing block: ${id}`);
        const d = NODE_TYPES[n.type];
        if (!d)
            throw new Error(`Unsupported block type: ${n.type}`);
        active.add(id);
        for (const [key, port] of Object.entries(d.inputs)) {
            const src = n.inputs[key];
            if (!src) {
                if (strict && port.required)
                    throw new Error(`${n.name}: connect ${port.label}.`);
                continue;
            }
            const sn = map.get(src);
            if (!sn)
                throw new Error(`${n.name}: missing source block.`);
            if (NODE_TYPES[sn.type]?.output !== port.type)
                throw new Error(`${n.name}: ${port.label} requires ${port.type}.`);
            visit(src);
        }
        active.delete(id);
        done.add(id);
        out.push(n);
    }
    if (root)
        visit(root);
    else
        for (const n of doc.nodes)
            visit(n.id);
    return out;
}
const validatedImmutableAssets = new WeakSet();
function validateDocument(doc) {
    if (!doc || doc.format !== 'implicitforge' || doc.version !== 1)
        throw new Error('Not an ImplicitForge v1 project.');
    if (doc.units !== undefined && doc.units !== 'mm')
        throw new Error('This project format uses millimetres.');
    if (doc.material) {
        for (const key of ['density', 'E', 'conductivity'])
            if (doc.material[key] !== undefined && (!Number.isFinite(doc.material[key]) || doc.material[key] <= 0))
                throw new Error(`Invalid material ${key}.`);
        if (doc.material.nu !== undefined && (!Number.isFinite(doc.material.nu) || doc.material.nu <= -.99 || doc.material.nu >= .499))
            throw new Error('Invalid Poisson ratio.');
    }
    if (doc.view?.color && (!Array.isArray(doc.view.color) || doc.view.color.length !== 3 || doc.view.color.some(x => !Number.isFinite(x) || x < 0 || x > 1)))
        throw new Error('Invalid display color.');
    if (doc.view?.roughness !== undefined && (!Number.isFinite(doc.view.roughness) || doc.view.roughness < 0 || doc.view.roughness > 1))
        throw new Error('Invalid roughness.');
    validateDomain(doc.domain);
    if (!Array.isArray(doc.nodes) || doc.nodes.length > 256)
        throw new Error('Project must contain at most 256 blocks.');
    if (typeof doc.name !== 'string' || doc.name.length > 300)
        throw new Error('Invalid project name.');
    const ids = new Set();
    for (const n of doc.nodes) {
        if (typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id) || ids.has(n.id))
            throw new Error('Block IDs must be unique alphanumeric identifiers.');
        ids.add(n.id);
        const d = NODE_TYPES[n.type];
        if (!d)
            throw new Error(`Unsupported block ${n.type}`);
        if (typeof n.name !== 'string' || n.name.length > 300)
            throw new Error('Invalid block name.');
        if (!n.inputs || !n.params)
            throw new Error('Block inputs/parameters missing.');
        for (const [key, spec] of Object.entries(d.params)) {
            const v = n.params[key];
            if (spec.hidden) {
                if (typeof v !== 'string')
                    throw new Error('Asset identifier must be a string.');
                continue;
            }
            if (spec.vector) {
                if (!Array.isArray(v) || v.length !== 3 || v.some(x => !Number.isFinite(x) || Math.abs(x) > 1e6))
                    throw new Error(`${n.name}: invalid ${spec.label}.`);
            }
            else if (!Number.isFinite(v) || v < spec.min || v > spec.max)
                throw new Error(`${n.name}: ${spec.label} is outside [${spec.min}, ${spec.max}].`);
        }
        for (const k of Object.keys(n.inputs))
            if (!d.inputs[k])
                throw new Error(`Unknown input: ${k}`);
        if (['box', 'ellipsoid'].includes(n.type) && (n.params.size ?? n.params.radii).some(x => x <= 0))
            throw new Error(`${n.name}: dimensions must be positive.`);
        if (n.type === 'repeat' && (n.params.spacing.some(x => x <= 0) || n.params.count.some(x => x < 1 || x > 31 || x % 2 !== 1)))
            throw new Error('Array counts must be odd integers from 1 to 31, spacing positive.');
        if (['plane', 'ramp', 'sine'].includes(n.type) && Math.hypot(...(n.params.normal ?? n.params.direction)) < 1e-8)
            throw new Error(`${n.name}: direction cannot be zero.`);
        if (n.type === 'ramp' && n.params.end <= n.params.start)
            throw new Error('Ramp end must be greater than its start.');
        if (n.type === 'clamp' && n.params.max < n.params.min)
            throw new Error('Clamp maximum must be at least its minimum.');
        if (!n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y))
            throw new Error('Invalid graph position.');
    }
    if (doc.root && !ids.has(doc.root))
        throw new Error('Output block is missing.');
    if (doc.root && NODE_TYPES[doc.nodes.find(n => n.id === doc.root).type].output !== 'body')
        throw new Error('Output must be an implicit body.');
    for (const n of doc.nodes)
        topologicalOrder(doc, n.id, false);
    const assets = doc.assets ?? {};
    let total = 0;
    for (const [id, a] of Object.entries(assets)) {
        validateDomain(a);
        if (!Number.isInteger(a.n) || a.n < 4 || a.n > 128 || (!Array.isArray(a.data) && !(a.data instanceof Float32Array)) || a.data.length !== a.n ** 3)
            throw new Error(`Invalid volume asset: ${id}`);
        total += a.data.length;
        if (total > 8e6)
            throw new Error('Oversized volume assets.');
        if (!validatedImmutableAssets.has(a)) {
            if (a.data.some(v => !Number.isFinite(v)))
                throw new Error('Non-finite volume asset.');
            if (Object.isFrozen(a) && Object.isFrozen(a.data) && Object.isFrozen(a.min) && Object.isFrozen(a.max))
                validatedImmutableAssets.add(a);
        }
    }
    for (const n of doc.nodes)
        if (n.type === 'volume' && !assets[n.params.asset])
            throw new Error('Missing volume asset.');
    return doc;
}
function connect(doc, targetId, port, sourceId) {
    const target = doc.nodes.find(n => n.id === targetId);
    if (!target)
        throw new Error('Unknown target.');
    if (!NODE_TYPES[target.type].inputs[port])
        throw new Error(`Unknown input: ${port}`);
    const old = target.inputs[port];
    if (sourceId)
        target.inputs[port] = sourceId;
    else
        delete target.inputs[port];
    try {
        topologicalOrder(doc, targetId, false);
    }
    catch (e) {
        if (old)
            target.inputs[port] = old;
        else
            delete target.inputs[port];
        throw e;
    }
}
function downstream(doc, id) { const set = new Set([id]); let changed = true; while (changed) {
    changed = false;
    for (const n of doc.nodes)
        if (!set.has(n.id) && Object.values(n.inputs).some(x => set.has(x))) {
            set.add(n.id);
            changed = true;
        }
} return set; }
function autoLayout(doc) {
    const depths = new Map();
    for (const n of topologicalOrder(doc, null, false))
        depths.set(n.id, Math.max(-1, ...Object.values(n.inputs).map(id => depths.get(id) ?? 0)) + 1);
    const columns = new Map();
    for (const n of doc.nodes) {
        const d = depths.get(n.id) ?? 0;
        const row = columns.get(d) ?? 0;
        columns.set(d, row + 1);
        n.position = { x: d * 245 + 35, y: row * 130 + 35 };
    }
}
function graphDiagnostics(doc) { return doc.nodes.flatMap(n => { try {
    topologicalOrder(doc, n.id, true);
    return [];
}
catch (e) {
    return [{ id: n.id, message: e.message }];
} }); }

Object.assign(__exports,{NODE_TYPES:NODE_TYPES,createNode:createNode,topologicalOrder:topologicalOrder,validateDocument:validateDocument,connect:connect,downstream:downstream,autoLayout:autoLayout,graphDiagnostics:graphDiagnostics});
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
}};function __require(id){if(__cache[id])return __cache[id];const value={};__cache[id]=value;__modules[id](value,__require);return value;}return __require(0);})();
export const NODE_TYPES=__entry.NODE_TYPES;
export const autoLayout=__entry.autoLayout;
export const connect=__entry.connect;
export const createNode=__entry.createNode;
export const downstream=__entry.downstream;
export const graphDiagnostics=__entry.graphDiagnostics;
export const topologicalOrder=__entry.topologicalOrder;
export const validateDocument=__entry.validateDocument;
