// Standalone @forge package. Generated from workspace source; no external runtime dependencies.
const __entry=(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
const { topologicalOrder, NODE_TYPES }=__require(1);
const { sdBox, sdCylinder, sdEllipsoid, smoothUnion, sampleVolume, FIELD_WGSL, wgslToGLSL }=__require(3);
const { tpms, cubicLattice, octetLattice, LATTICE_WGSL }=__require(4);
const { clamp, lerp, TAU, clone }=__require(2);
function normalized(v) { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }
function compileCPU(doc, root = doc.root) {
    const order = topologicalOrder(doc, root, true), fns = new Map();
    for (const n of order) {
        const p = clone(n.params), type = n.type, inputs = { ...n.inputs }, g = key => fns.get(inputs[key]), c = g('body'), a = g('a'), b = g('b'), d = g('domain'), value = (key, x, y, z) => g(key) ? g(key)(x, y, z) : p[key];
        let f;
        switch (n.type) {
            case 'box': {
                const [x, y, z] = p.size.map(v => v * .5);
                f = (u, v, w) => sdBox(u, v, w, x, y, z, p.radius);
                break;
            }
            case 'sphere':
                f = (x, y, z) => Math.hypot(x, y, z) - Math.max(.001, value('radius', x, y, z));
                break;
            case 'cylinder':
                f = (x, y, z) => sdCylinder(x, y, z, p.radius, p.height * .5);
                break;
            case 'torus':
                f = (x, y, z) => Math.hypot(Math.hypot(x, y) - p.major, z) - p.minor;
                break;
            case 'capsule':
                f = (x, y, z) => Math.hypot(x, y, z - clamp(z, -p.length * .5, p.length * .5)) - p.radius;
                break;
            case 'ellipsoid':
                f = (x, y, z) => sdEllipsoid(x, y, z, ...p.radii);
                break;
            case 'plane': {
                const v = normalized(p.normal);
                f = (x, y, z) => x * v[0] + y * v[1] + z * v[2] - p.offset;
                break;
            }
            case 'union':
                f = (x, y, z) => Math.min(a(x, y, z), b(x, y, z));
                break;
            case 'intersect':
                f = (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
                break;
            case 'subtract':
                f = (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
                break;
            case 'smoothUnion':
                f = (x, y, z) => smoothUnion(a(x, y, z), b(x, y, z), p.radius);
                break;
            case 'offset':
                f = (x, y, z) => c(x, y, z) - value('distance', x, y, z);
                break;
            case 'shell':
                f = (x, y, z) => Math.abs(c(x, y, z)) - Math.max(.001, value('thickness', x, y, z)) * .5;
                break;
            case 'translate': {
                const [u, v, w] = p.offset;
                f = (x, y, z) => c(x - u, y - v, z - w);
                break;
            }
            case 'rotate': {
                const [ax, ay, az] = p.angles.map(v => -v * Math.PI / 180), cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
                f = (x, y, z) => { const x1 = cz * x - sz * y, y1 = sz * x + cz * y, x2 = cy * x1 + sy * z, z2 = -sy * x1 + cy * z; return c(x2, cx * y1 - sx * z2, sx * y1 + cx * z2); };
                break;
            }
            case 'scale':
                f = (x, y, z) => c(x / p.factor, y / p.factor, z / p.factor) * p.factor;
                break;
            case 'twist': {
                const k = -p.rate * Math.PI / 180;
                f = (x, y, z) => { const a = k * z; return c(Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y, z); };
                break;
            }
            case 'repeat': {
                const s = p.spacing, h = p.count.map(v => (v - 1) / 2);
                f = (x, y, z) => c(x - s[0] * clamp(Math.floor(x / s[0] + .5), -h[0], h[0]), y - s[1] * clamp(Math.floor(y / s[1] + .5), -h[1], h[1]), z - s[2] * clamp(Math.floor(z / s[2] + .5), -h[2], h[2]));
                break;
            }
            case 'gyroid':
            case 'schwarz':
            case 'diamond':
            case 'neovius':
                f = (x, y, z) => Math.max(d(x, y, z), tpms(type, x, y, z, p.cell, value('thickness', x, y, z)));
                break;
            case 'cubic':
            case 'octet': {
                const fn = n.type === 'cubic' ? cubicLattice : octetLattice;
                f = (x, y, z) => Math.max(d(x, y, z), fn(x, y, z, p.cell, value('radius', x, y, z)));
                break;
            }
            case 'constant':
                f = () => p.value;
                break;
            case 'ramp': {
                const v = normalized(p.direction);
                f = (x, y, z) => lerp(p.low, p.high, clamp((x * v[0] + y * v[1] + z * v[2] - p.start) / (p.end - p.start), 0, 1));
                break;
            }
            case 'radial':
                f = (x, y, z) => lerp(p.inner, p.outer, clamp(Math.hypot(x - p.center[0], y - p.center[1], z - p.center[2]) / p.radius, 0, 1));
                break;
            case 'sine': {
                const v = normalized(p.direction);
                f = (x, y, z) => p.base + p.amplitude * Math.sin((x * v[0] + y * v[1] + z * v[2]) * TAU / p.period + p.phase * Math.PI / 180);
                break;
            }
            case 'noise':
                f = (x, y, z) => p.base + p.amplitude * Math.sin(x / p.scale * TAU + p.seed) * Math.sin(y / p.scale * TAU + p.seed * 1.7) * Math.sin(z / p.scale * TAU + p.seed * 2.3);
                break;
            case 'add':
                f = (x, y, z) => a(x, y, z) + b(x, y, z);
                break;
            case 'multiply':
                f = (x, y, z) => a(x, y, z) * b(x, y, z);
                break;
            case 'clamp': {
                const s = g('field');
                f = (x, y, z) => clamp(s(x, y, z), p.min, p.max);
                break;
            }
            case 'volume': {
                const original = doc.assets[p.asset], v = original ? { ...original, min: [...original.min], max: [...original.max], data: Object.isFrozen(original.data) ? original.data : new Float32Array(original.data) } : null;
                if (!v)
                    throw new Error(`Missing asset ${p.asset}`);
                f = (x, y, z) => { const val = sampleVolume(v.data, v.n, v.min, v.max, x, y, z), dist = Math.hypot(x - clamp(x, v.min[0], v.max[0]), y - clamp(y, v.min[1], v.max[1]), z - clamp(z, v.min[2], v.max[2])); return dist > 0 ? dist + Math.max(val, 0) : val; };
                break;
            }
            default: throw new Error(`No CPU kernel for ${n.type}`);
        }
        fns.set(n.id, f);
    }
    return fns.get(root) ?? (() => 1e5);
}
/** Lower a typed graph into CPU closures and parameter-buffer-driven shader functions. No eval. */
function compileDocument(doc, root = doc.root, colorRoot = null) {
    const order = topologicalOrder(doc, root, true);
    if (colorRoot) {
        for (const n of topologicalOrder(doc, colorRoot, true))
            if (!order.some(x => x.id === n.id))
                order.push(n);
    }
    const values = [], assets = [], names = new Map(order.map((n, i) => [n.id, `block${i}`]));
    let functions = '';
    for (const n of order) {
        const indices = {};
        for (const [key, spec] of Object.entries(NODE_TYPES[n.type].params)) {
            if (spec.hidden)
                continue;
            indices[key] = values.length;
            const v = n.params[key];
            values.push(...(Array.isArray(v) ? v : [v]));
        }
        const s = k => `P[${indices[k]}]`, v = k => `vec3f(P[${indices[k]}],P[${indices[k] + 1}],P[${indices[k] + 2}])`, call = (key, pos = 'p') => `${names.get(n.inputs[key])}(${pos})`, input = k => n.inputs[k] ? call(k) : s(k);
        let e, pre = '';
        switch (n.type) {
            case 'box':
                e = `sdBox(p,${v('size')}*0.5,${s('radius')})`;
                break;
            case 'sphere':
                e = `length(p)-max(0.001,${input('radius')})`;
                break;
            case 'cylinder':
                e = `sdCylinder(p,${s('radius')},${s('height')}*0.5)`;
                break;
            case 'torus':
                e = `length(vec2f(length(p.xy)-${s('major')},p.z))-${s('minor')}`;
                break;
            case 'capsule':
                e = `length(vec3f(p.xy,p.z-clamp(p.z,-${s('length')}*0.5,${s('length')}*0.5)))-${s('radius')}`;
                break;
            case 'ellipsoid':
                e = `sdEllipsoid(p,${v('radii')})`;
                break;
            case 'plane':
                e = `dot(p,normalize(${v('normal')}))-${s('offset')}`;
                break;
            case 'union':
                e = `min(${call('a')},${call('b')})`;
                break;
            case 'intersect':
                e = `max(${call('a')},${call('b')})`;
                break;
            case 'subtract':
                e = `max(${call('a')},-${call('b')})`;
                break;
            case 'smoothUnion':
                e = `smin(${call('a')},${call('b')},${s('radius')})`;
                break;
            case 'offset':
                e = `${call('body')}-${input('distance')}`;
                break;
            case 'shell':
                e = `abs(${call('body')})-max(0.001,${input('thickness')})*0.5`;
                break;
            case 'translate':
                e = call('body', `p-${v('offset')}`);
                break;
            case 'rotate': {
                const i = indices.angles;
                e = call('body', `rotX(rotY(rotZ(p,-P[${i + 2}]*0.01745329252),-P[${i + 1}]*0.01745329252),-P[${i}]*0.01745329252)`);
                break;
            }
            case 'scale':
                e = `${call('body', `p/${s('factor')}`)}*${s('factor')}`;
                break;
            case 'twist':
                e = call('body', `rotZ(p,-p.z*${s('rate')}*0.01745329252)`);
                break;
            case 'repeat':
                pre = `let spacing:vec3f=${v('spacing')};let halfCount:vec3f=(${v('count')}-vec3f(1.0))*0.5;`;
                e = call('body', 'p-spacing*clamp(floor(p/spacing+vec3f(0.5)),-halfCount,halfCount)');
                break;
            case 'gyroid':
            case 'schwarz':
            case 'diamond':
            case 'neovius':
                e = `max(${call('domain')},${n.type}(p,${s('cell')},${input('thickness')}))`;
                break;
            case 'cubic':
            case 'octet':
                e = `max(${call('domain')},${n.type}(p,${s('cell')},${input('radius')}))`;
                break;
            case 'constant':
                e = s('value');
                break;
            case 'ramp':
                e = `mix(${s('low')},${s('high')},clamp((dot(p,normalize(${v('direction')}))-${s('start')})/(${s('end')}-${s('start')}),0.0,1.0))`;
                break;
            case 'radial':
                e = `mix(${s('inner')},${s('outer')},clamp(length(p-${v('center')})/${s('radius')},0.0,1.0))`;
                break;
            case 'sine':
                e = `${s('base')}+${s('amplitude')}*sin(dot(p,normalize(${v('direction')}))*6.28318530718/${s('period')}+${s('phase')}*0.01745329252)`;
                break;
            case 'noise':
                pre = `let q:vec3f=p*6.28318530718/${s('scale')}+vec3f(${s('seed')},${s('seed')}*1.7,${s('seed')}*2.3);`;
                e = `${s('base')}+${s('amplitude')}*sin(q.x)*sin(q.y)*sin(q.z)`;
                break;
            case 'add':
                e = `${call('a')}+${call('b')}`;
                break;
            case 'multiply':
                e = `${call('a')}*${call('b')}`;
                break;
            case 'clamp':
                e = `clamp(${call('field')},${s('min')},${s('max')})`;
                break;
            case 'volume': {
                const asset = doc.assets[n.params.asset];
                if (!asset)
                    throw new Error('Missing imported volume.');
                const i = values.length, offset = assets.length;
                for (const x of asset.data)
                    assets.push(x);
                values.push(offset, asset.n, ...asset.min, ...asset.max);
                e = `volumeAt(p,i32(P[${i}]),i32(P[${i + 1}]),vec3f(P[${i + 2}],P[${i + 3}],P[${i + 4}]),vec3f(P[${i + 5}],P[${i + 6}],P[${i + 7}]))`;
                break;
            }
            default: throw new Error(`No shader kernel for ${n.type}`);
        }
        functions += `fn ${names.get(n.id)}(p:vec3f)->f32 {${pre}return ${e};}\n`;
    }
    if (values.length > 2048)
        throw new Error('This graph exceeds the 2,048-parameter shader limit.');
    functions += `fn scene(p:vec3f)->f32 {return ${root ? `${names.get(root)}(p)` : '100000.0'};}\n`;
    functions += `fn colorField(p:vec3f)->f32 {return ${colorRoot ? `${names.get(colorRoot)}(p)` : '0.5+0.012*p.z'};}\n`;
    const common = FIELD_WGSL + LATTICE_WGSL + functions;
    const wgsl = `@group(0) @binding(1) var<storage,read> P:array<f32>;\n@group(0) @binding(2) var<storage,read> A:array<f32>;\nfn assetAt(i:i32)->f32{return A[i];}\n` + common;
    const glsl = `uniform float P[2048];\nuniform sampler2D uAssets;\nfloat assetAt(int i){return texelFetch(uAssets,ivec2(i%1024,i/1024),0).r;}\n` + wgslToGLSL(common);
    return { sample: compileCPU(doc, root), colorSample: colorRoot ? compileCPU(doc, colorRoot) : ((x, y, z) => 0.5 + 0.012 * z), wgsl, glsl, parameters: new Float32Array(values.length ? values : [0]), assets: new Float32Array(assets.length ? assets : [0]), key: common, root, nodeCount: order.length, parameterCount: values.length };
}

Object.assign(__exports,{compileCPU:compileCPU,compileDocument:compileDocument});
},
1:(__exports,__require)=>{
const { uid, clone, validateDomain }=__require(2);
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
2:(__exports,__require)=>{
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
3:(__exports,__require)=>{
const { clamp, lerp }=__require(2);
function sdBox(x, y, z, bx, by, bz, r = 0) { r = Math.min(r, bx, by, bz); const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }
function sdCylinder(x, y, z, r, h) { const a = Math.hypot(x, y) - r, b = Math.abs(z) - h; return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)); }
function sdEllipsoid(x, y, z, a, b, c) { const k0 = Math.hypot(x / a, y / b, z / c), k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c)); return k1 < 1e-12 ? -Math.min(a, b, c) : k0 * (k0 - 1) / k1; }
function smoothUnion(a, b, k) { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); }
function segmentDistance(x, y, z, ax, ay, az, bx, by, bz) { const vx = bx - ax, vy = by - ay, vz = bz - az; const h = clamp(((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / (vx * vx + vy * vy + vz * vz || 1), 0, 1); return Math.hypot(x - ax - h * vx, y - ay - h * vy, z - az - h * vz); }
function sampleVolume(data, n, min, max, x, y, z) {
    const xx = clamp((x - min[0]) / (max[0] - min[0]) * (n - 1), 0, n - 1), yy = clamp((y - min[1]) / (max[1] - min[1]) * (n - 1), 0, n - 1), zz = clamp((z - min[2]) / (max[2] - min[2]) * (n - 1), 0, n - 1);
    const i = Math.min(n - 2, Math.floor(xx)), j = Math.min(n - 2, Math.floor(yy)), k = Math.min(n - 2, Math.floor(zz)), a = xx - i, b = yy - j, c = zz - k;
    const at = (dx, dy, dz) => data[i + dx + n * (j + dy + n * (k + dz))];
    return lerp(lerp(lerp(at(0, 0, 0), at(1, 0, 0), a), lerp(at(0, 1, 0), at(1, 1, 0), a), b), lerp(lerp(at(0, 0, 1), at(1, 0, 1), a), lerp(at(0, 1, 1), at(1, 1, 1), a), b), c);
}
function gradient(sample, x, y, z, e = .02) { const dx = sample(x + e, y, z) - sample(x - e, y, z), dy = sample(x, y + e, z) - sample(x, y - e, z), dz = sample(x, y, z + e) - sample(x, y, z - e), l = Math.hypot(dx, dy, dz) || 1; return [dx / l, dy / l, dz / l]; }
/** The same primitive definitions used by both the GPU renderer and compute kernels. */
const FIELD_WGSL = `
fn sdBox(p:vec3f,b:vec3f,r0:f32)->f32 {
 let r:f32=min(r0,min(b.x,min(b.y,b.z))); let q:vec3f=abs(p)-(b-vec3f(r));
 return length(max(q,vec3f(0.0)))+min(max(q.x,max(q.y,q.z)),0.0)-r;
}
fn sdCylinder(p:vec3f,r:f32,h:f32)->f32 {
 let d:vec2f=vec2f(length(p.xy)-r,abs(p.z)-h);return min(max(d.x,d.y),0.0)+length(max(d,vec2f(0.0)));
}
fn sdEllipsoid(p:vec3f,r:vec3f)->f32 {
 let k0:f32=length(p/r);let k1:f32=length(p/(r*r));if(k1<0.0000001){return -min(r.x,min(r.y,r.z));}return k0*(k0-1.0)/k1;
}
fn smin(a:f32,b:f32,k:f32)->f32 {let h:f32=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
fn rotX(p:vec3f,a:f32)->vec3f {let c:f32=cos(a);let s:f32=sin(a);return vec3f(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
fn rotY(p:vec3f,a:f32)->vec3f {let c:f32=cos(a);let s:f32=sin(a);return vec3f(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
fn rotZ(p:vec3f,a:f32)->vec3f {let c:f32=cos(a);let s:f32=sin(a);return vec3f(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
fn sdSegment(p:vec3f,a:vec3f,b:vec3f)->f32 {let v:vec3f=b-a;let t:f32=clamp(dot(p-a,v)/max(dot(v,v),0.0000001),0.0,1.0);return length(p-a-v*t);}
fn volumeAt(p:vec3f,base:i32,n:i32,lo:vec3f,hi:vec3f)->f32 {
 let q:vec3f=clamp((p-lo)/(hi-lo)*f32(n-1),vec3f(0.0),vec3f(f32(n-1)));
 let c:vec3i=min(vec3i(floor(q)),vec3i(n-2));let f:vec3f=q-vec3f(c);
 let i:i32=base+c.x+n*(c.y+n*c.z);
 let a:f32=mix(mix(assetAt(i),assetAt(i+1),f.x),mix(assetAt(i+n),assetAt(i+n+1),f.x),f.y);
 let b:f32=mix(mix(assetAt(i+n*n),assetAt(i+n*n+1),f.x),mix(assetAt(i+n*n+n),assetAt(i+n*n+n+1),f.x),f.y);
 let v:f32=mix(a,b,f.z);let d:f32=length(p-clamp(p,lo,hi));if(d>0.0){return d+max(v,0.0);}return v;
}
`;
/** Restricted, internal WGSL-to-GLSL conversion. Not a general purpose shader transpiler. */
function wgslToGLSL(source) {
    const type = t => t.trim().replaceAll('vec3f', 'vec3').replaceAll('vec2f', 'vec2').replaceAll('vec4f', 'vec4').replaceAll('vec3i', 'ivec3').replaceAll('vec2i', 'ivec2').replaceAll('f32', 'float').replaceAll('i32', 'int').replaceAll('u32', 'uint');
    return source.replace(/fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+)\s*\{/g, (_, name, args, result) => `${type(result)} ${name}(${args.split(',').filter(Boolean).map(arg => { const [n, t] = arg.split(':'); return `${type(t)} ${n.trim()}`; }).join(',')}){`)
        .replace(/\b(?:let|var)\s+(\w+)\s*:\s*(\w+)\s*=/g, (_, name, t) => `${type(t)} ${name}=`)
        .replace(/\b(vec[234]f|vec[23]i|f32|i32|u32)\b/g, t => type(t));
}

Object.assign(__exports,{sdBox:sdBox,sdCylinder:sdCylinder,sdEllipsoid:sdEllipsoid,smoothUnion:smoothUnion,segmentDistance:segmentDistance,sampleVolume:sampleVolume,gradient:gradient,FIELD_WGSL:FIELD_WGSL,wgslToGLSL:wgslToGLSL});
},
4:(__exports,__require)=>{
const { TAU }=__require(2);
const { segmentDistance }=__require(3);
/** Lipschitz-normalized nodal functions. Wall isobands are not exact TPMS offsets. */
function tpms(type, x, y, z, cell, thickness) {
    const k = TAU / cell;
    x *= k;
    y *= k;
    z *= k;
    const sx = Math.sin(x), sy = Math.sin(y), sz = Math.sin(z), cx = Math.cos(x), cy = Math.cos(y), cz = Math.cos(z);
    let f, L;
    if (type === 'gyroid') {
        f = sx * cy + sy * cz + sz * cx;
        L = Math.sqrt(12);
    }
    else if (type === 'schwarz') {
        f = cx + cy + cz;
        L = Math.sqrt(3);
    }
    else if (type === 'diamond') {
        f = sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
        L = 4;
    }
    else {
        f = 3 * (cx + cy + cz) + 4 * cx * cy * cz;
        L = 7 * Math.sqrt(3);
    }
    return Math.abs(f) / (k * L) - Math.max(.001, thickness) * .5;
}
function cubicLattice(x, y, z, cell, r) { x -= cell * Math.round(x / cell); y -= cell * Math.round(y / cell); z -= cell * Math.round(z / cell); return Math.min(Math.hypot(x, y), Math.hypot(y, z), Math.hypot(z, x)) - Math.max(.001, r); }
function octetLattice(x, y, z, cell, r) {
    x -= cell * Math.round(x / cell);
    y -= cell * Math.round(y / cell);
    z -= cell * Math.round(z / cell);
    const h = cell * .5;
    return Math.min(segmentDistance(x, y, z, -h, -h, 0, h, h, 0), segmentDistance(x, y, z, -h, h, 0, h, -h, 0), segmentDistance(x, y, z, -h, 0, -h, h, 0, h), segmentDistance(x, y, z, -h, 0, h, h, 0, -h), segmentDistance(x, y, z, 0, -h, -h, 0, h, h), segmentDistance(x, y, z, 0, -h, h, 0, h, -h)) - Math.max(.001, r);
}
const LATTICE_WGSL = `
fn gyroid(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let q:vec3f=p*k;let s:vec3f=sin(q);let c:vec3f=cos(q);return abs(s.x*c.y+s.y*c.z+s.z*c.x)/(k*3.46410161514)-max(t,0.001)*0.5;}
fn schwarz(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let c:vec3f=cos(p*k);return abs(c.x+c.y+c.z)/(k*1.73205080757)-max(t,0.001)*0.5;}
fn diamond(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let s:vec3f=sin(p*k);let c:vec3f=cos(p*k);return abs(s.x*s.y*s.z+s.x*c.y*c.z+c.x*s.y*c.z+c.x*c.y*s.z)/(k*4.0)-max(t,0.001)*0.5;}
fn neovius(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let c:vec3f=cos(p*k);return abs(3.0*(c.x+c.y+c.z)+4.0*c.x*c.y*c.z)/(k*12.124355653)-max(t,0.001)*0.5;}
fn cubic(p:vec3f,cell:f32,r:f32)->f32 {let q:vec3f=p-cell*floor(p/cell+vec3f(0.5));return min(length(q.xy),min(length(q.yz),length(q.xz)))-max(r,0.001);}
fn octet(p:vec3f,cell:f32,r:f32)->f32 {
 let q:vec3f=p-cell*floor(p/cell+vec3f(0.5));let h:f32=cell*0.5;
 let a:f32=min(sdSegment(q,vec3f(-h,-h,0.0),vec3f(h,h,0.0)),sdSegment(q,vec3f(-h,h,0.0),vec3f(h,-h,0.0)));
 let b:f32=min(sdSegment(q,vec3f(-h,0.0,-h),vec3f(h,0.0,h)),sdSegment(q,vec3f(-h,0.0,h),vec3f(h,0.0,-h)));
 let c:f32=min(sdSegment(q,vec3f(0.0,-h,-h),vec3f(0.0,h,h)),sdSegment(q,vec3f(0.0,-h,h),vec3f(0.0,h,-h)));
 return min(a,min(b,c))-max(r,0.001);
}
`;

Object.assign(__exports,{tpms:tpms,cubicLattice:cubicLattice,octetLattice:octetLattice,LATTICE_WGSL:LATTICE_WGSL});
}};function __require(id){if(__cache[id])return __cache[id];const value={};__cache[id]=value;__modules[id](value,__require);return value;}return __require(0);})();
export const compileCPU=__entry.compileCPU;
export const compileDocument=__entry.compileDocument;
