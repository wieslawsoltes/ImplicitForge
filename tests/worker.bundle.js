(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
const { compileDocument, compileCPU }=__require(1);
const { sampleGrid, extractMesh, meshMetrics, meshToVolume }=__require(6);
const { analyzeGrid, solveThermal, solveElasticity, optimizeTopology }=__require(7);
const { GPUCompute }=__require(9);
const { parseSTL, parseOBJ }=__require(10);
const { validateDocument }=__require(2);
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

Object.assign(__exports,{});
},
1:(__exports,__require)=>{
const { topologicalOrder, NODE_TYPES }=__require(2);
const { sdBox, sdCylinder, sdEllipsoid, smoothUnion, sampleVolume, FIELD_WGSL, wgslToGLSL }=__require(4);
const { tpms, cubicLattice, octetLattice, LATTICE_WGSL }=__require(5);
const { clamp, lerp, TAU, clone }=__require(3);
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
2:(__exports,__require)=>{
const { uid, clone, validateDomain }=__require(3);
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
3:(__exports,__require)=>{
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
4:(__exports,__require)=>{
const { clamp, lerp }=__require(3);
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
5:(__exports,__require)=>{
const { TAU }=__require(3);
const { segmentDistance }=__require(4);
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
},
6:(__exports,__require)=>{
const { gridInfo, clamp, throwIfAborted, vec3 }=__require(3);
const pause = () => new Promise(r => setTimeout(r, 0));
/** Inclusive nodal sampling. x is the fastest-changing coordinate. */
async function sampleGrid(sample, domain, resolution, { signal, onProgress } = {}) {
    const g = gridInfo(domain, resolution), { n, count, min, step } = g;
    const values = new Float32Array(count);
    for (let z = 0; z < n; z++) {
        throwIfAborted(signal);
        const pz = min[2] + z * step[2];
        for (let y = 0; y < n; y++) {
            const py = min[1] + y * step[1];
            let i = n * (y + n * z);
            for (let x = 0; x < n; x++) {
                const v = sample(min[0] + x * step[0], py, pz);
                if (!Number.isFinite(v))
                    throw new Error(`Non-finite field value at grid index ${i}.`);
                values[i++] = v;
            }
        }
        if (z % 4 === 0) {
            onProgress?.(z / (n - 1));
            await pause();
        }
    }
    onProgress?.(1);
    return { ...g, values };
}
const TETS = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];
const EDGES = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
/** Consistent Freudenthal tetrahedra, shared-edge welding, outward-oriented indexed triangles. */
async function extractMesh(grid, { signal, onProgress, iso = 0, maxTriangles = 2500000 } = {}) {
    const { n, values, min, step } = grid, count = n ** 3;
    const positions = [], normals = [], indices = [], cache = new Map();
    const coords = id => { const x = id % n, y = Math.floor(id / n) % n, z = Math.floor(id / (n * n)); return [min[0] + x * step[0], min[1] + y * step[1], min[2] + z * step[2]]; };
    const normal = id => { const x = id % n, y = Math.floor(id / n) % n, z = Math.floor(id / n / n); return [(values[id + (x < n - 1 ? 1 : 0)] - values[id - (x > 0 ? 1 : 0)]) / ((x === 0 || x === n - 1 ? 1 : 2) * step[0]), (values[id + (y < n - 1 ? n : 0)] - values[id - (y > 0 ? n : 0)]) / ((y === 0 || y === n - 1 ? 1 : 2) * step[1]), (values[id + (z < n - 1 ? n * n : 0)] - values[id - (z > 0 ? n * n : 0)]) / ((z === 0 || z === n - 1 ? 1 : 2) * step[2])]; };
    const vertex = (ia, ib) => {
        const va = values[ia] - iso, vb = values[ib] - iso, t = clamp(va / (va - vb), 0, 1);
        const key = t < 1e-10 ? -(ia + 1) : t > 1 - 1e-10 ? -(ib + 1) : Math.min(ia, ib) * count + Math.max(ia, ib);
        if (cache.has(key))
            return cache.get(key);
        const a = coords(ia), b = coords(ib), na = normal(ia), nb = normal(ib), nn = vec3.normalize(na.map((v, k) => v + (nb[k] - v) * t)), id = positions.length / 3;
        positions.push(...a.map((v, k) => v + (b[k] - v) * t));
        normals.push(...nn);
        cache.set(key, id);
        return id;
    };
    const point = i => positions.slice(i * 3, i * 3 + 3);
    const triangle = (a, b, c, direction) => { if (a === b || b === c || c === a)
        return; const p = point(a), q = point(b), r = point(c), cross = vec3.cross(vec3.sub(q, p), vec3.sub(r, p)); if (vec3.dot(cross, cross) < 1e-20)
        return; if (vec3.dot(cross, direction) < 0)
        indices.push(a, c, b);
    else
        indices.push(a, b, c); };
    for (let z = 0; z < n - 1; z++) {
        throwIfAborted(signal);
        for (let y = 0; y < n - 1; y++)
            for (let x = 0; x < n - 1; x++) {
                const a = x + n * (y + n * z), cube = [a, a + 1, a + n + 1, a + n, a + n * n, a + n * n + 1, a + n * n + n + 1, a + n * n + n];
                let bits = 0;
                for (let k = 0; k < 8; k++)
                    if (values[cube[k]] < iso)
                        bits |= 1 << k;
                if (bits === 0 || bits === 255)
                    continue;
                for (const tet of TETS) {
                    const ids = tet.map(i => cube[i]), inside = ids.map(i => values[i] < iso), num = inside.filter(Boolean).length;
                    if (num === 0 || num === 4)
                        continue;
                    const polygon = [];
                    for (const [a, b] of EDGES)
                        if (inside[a] !== inside[b]) {
                            const v = vertex(ids[a], ids[b]);
                            if (!polygon.includes(v))
                                polygon.push(v);
                        }
                    if (polygon.length < 3)
                        continue;
                    const ci = [0, 0, 0], co = [0, 0, 0];
                    for (let k = 0; k < 4; k++) {
                        const p = coords(ids[k]);
                        const sum = inside[k] ? ci : co;
                        for (let c = 0; c < 3; c++)
                            sum[c] += p[c] / (inside[k] ? num : 4 - num);
                    }
                    const dir = vec3.sub(co, ci);
                    if (polygon.length === 4) {
                        const center = [0, 0, 0];
                        for (const i of polygon) {
                            const p = point(i);
                            for (let k = 0; k < 3; k++)
                                center[k] += p[k] * .25;
                        }
                        const u = vec3.normalize(vec3.sub(point(polygon[0]), center)), v = vec3.normalize(vec3.cross(dir, u));
                        polygon.sort((ia, ib) => { const a = vec3.sub(point(ia), center), b = vec3.sub(point(ib), center); return Math.atan2(vec3.dot(a, v), vec3.dot(a, u)) - Math.atan2(vec3.dot(b, v), vec3.dot(b, u)); });
                    }
                    triangle(polygon[0], polygon[1], polygon[2], dir);
                    if (polygon.length === 4)
                        triangle(polygon[0], polygon[2], polygon[3], dir);
                }
            }
        if (indices.length / 3 > maxTriangles)
            throw new Error(`Mesh exceeds ${maxTriangles.toLocaleString()} triangles. Reduce the export resolution.`);
        if (z % 2 === 0) {
            onProgress?.(z / (n - 2));
            await pause();
        }
    }
    onProgress?.(1);
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), resolution: n, domain: { min: grid.min, max: grid.max } };
}
function meshMetrics(mesh, { topology = true } = {}) {
    const { positions: p, indices: t } = mesh;
    let signedVolume = 0, area = 0;
    const edges = topology ? new Map() : null, centroid = [0, 0, 0];
    for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
        const vx = (by * cz - bz * cy), vy = (bz * cx - bx * cz), vz = (bx * cy - by * cx), v = (ax * vx + ay * vy + az * vz) / 6;
        signedVolume += v;
        for (let k = 0; k < 3; k++)
            centroid[k] += v * (p[a + k] + p[b + k] + p[c + k]) * .25;
        area += Math.hypot((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * .5;
        if (edges)
            for (const [u, v] of [[t[i], t[i + 1]], [t[i + 1], t[i + 2]], [t[i + 2], t[i]]]) {
                const key = Math.min(u, v) * (p.length / 3) + Math.max(u, v);
                edges.set(key, (edges.get(key) || 0) + 1);
            }
    }
    let boundaryEdges = 0, nonManifoldEdges = 0;
    if (edges)
        for (const n of edges.values()) {
            if (n === 1)
                boundaryEdges++;
            if (n > 2)
                nonManifoldEdges++;
        }
    return { vertices: p.length / 3, triangles: t.length / 3, volume: Math.abs(signedVolume), signedVolume, area, centroid: centroid.map(v => Math.abs(signedVolume) > 1e-12 ? v / signedVolume : 0), boundaryEdges, nonManifoldEdges, watertight: topology ? boundaryEdges === 0 && nonManifoldEdges === 0 && t.length > 0 : null };
}
/** Weld triangle soup, rejecting non-finite positions and degenerate triangles. */
function weldMesh(positions, indices = null, tolerance = 1e-5) {
    if (positions.length % 3)
        throw new Error('Mesh coordinates must be XYZ triples.');
    const map = new Map(), out = [], remap = new Uint32Array(positions.length / 3);
    for (let i = 0; i < positions.length; i += 3) {
        if (!Number.isFinite(positions[i]) || !Number.isFinite(positions[i + 1]) || !Number.isFinite(positions[i + 2]))
            throw new Error('Mesh has non-finite coordinates.');
        const key = `${Math.round(positions[i] / tolerance)},${Math.round(positions[i + 1] / tolerance)},${Math.round(positions[i + 2] / tolerance)}`;
        let id = map.get(key);
        if (id === undefined) {
            id = out.length / 3;
            map.set(key, id);
            out.push(positions[i], positions[i + 1], positions[i + 2]);
        }
        remap[i / 3] = id;
    }
    const src = indices ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    if (src.length % 3)
        throw new Error('Mesh index count is not a multiple of three.');
    const tris = [];
    for (let i = 0; i < src.length; i += 3) {
        if (src[i] >= remap.length || src[i + 1] >= remap.length || src[i + 2] >= remap.length)
            throw new Error('Mesh index is out of bounds.');
        const a = remap[src[i]], b = remap[src[i + 1]], c = remap[src[i + 2]];
        if (a !== b && b !== c && c !== a)
            tris.push(a, b, c);
    }
    return { positions: new Float32Array(out), indices: new Uint32Array(tris) };
}
function pointTriangleSq(p, a, b, c) {
    const ab = vec3.sub(b, a), ac = vec3.sub(c, a), ap = vec3.sub(p, a), d1 = vec3.dot(ab, ap), d2 = vec3.dot(ac, ap);
    if (d1 <= 0 && d2 <= 0)
        return vec3.dot(ap, ap);
    const bp = vec3.sub(p, b), d3 = vec3.dot(ab, bp), d4 = vec3.dot(ac, bp);
    if (d3 >= 0 && d4 <= d3)
        return vec3.dot(bp, bp);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3), q = vec3.sub(ap, vec3.mul(ab, v));
        return vec3.dot(q, q);
    }
    const cp = vec3.sub(p, c), d5 = vec3.dot(ab, cp), d6 = vec3.dot(ac, cp);
    if (d6 >= 0 && d5 <= d6)
        return vec3.dot(cp, cp);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6), q = vec3.sub(ap, vec3.mul(ac, w));
        return vec3.dot(q, q);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const q = vec3.sub(bp, vec3.mul(vec3.sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
        return vec3.dot(q, q);
    }
    const denom = va + vb + vc;
    if (Math.abs(denom) < 1e-24)
        return Math.min(vec3.dot(ap, ap), vec3.dot(bp, bp), vec3.dot(cp, cp));
    const v = vb / denom, w = vc / denom, q = vec3.sub(ap, vec3.add(vec3.mul(ab, v), vec3.mul(ac, w)));
    return vec3.dot(q, q);
}
function boxDistanceSq(p, lo, hi) { let d = 0; for (let k = 0; k < 3; k++) {
    const q = Math.max(lo[k] - p[k], 0, p[k] - hi[k]);
    d += q * q;
} return d; }
function rayBox(p, dir, lo, hi) { let tmin = 0, tmax = Infinity; for (let k = 0; k < 3; k++) {
    const a = (lo[k] - p[k]) / dir[k], b = (hi[k] - p[k]) / dir[k];
    tmin = Math.max(tmin, Math.min(a, b));
    tmax = Math.min(tmax, Math.max(a, b));
} return tmax >= tmin; }
function rayTriangle(p, dir, a, b, c) { const e1 = vec3.sub(b, a), e2 = vec3.sub(c, a), h = vec3.cross(dir, e2), det = vec3.dot(e1, h); if (Math.abs(det) < 1e-12)
    return false; const s = vec3.sub(p, a), u = vec3.dot(s, h) / det; if (u < 0 || u > 1)
    return false; const q = vec3.cross(s, e1), v = vec3.dot(dir, q) / det; if (v < 0 || u + v > 1)
    return false; return vec3.dot(e2, q) / det > 1e-9; }
/** Median-split BVH with nearest-triangle distance and parity classification. */
class MeshBVH {
    constructor(mesh) {
        this.mesh = mesh;
        const p = mesh.positions;
        this.triangles = [];
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v = [0, 1, 2].map(k => Array.from(p.slice(mesh.indices[i + k] * 3, mesh.indices[i + k] * 3 + 3)));
            this.triangles.push({ v, min: [0, 1, 2].map(k => Math.min(...v.map(a => a[k]))), max: [0, 1, 2].map(k => Math.max(...v.map(a => a[k]))) });
        }
        if (!this.triangles.length)
            throw new Error('Mesh has no valid triangles.');
        const build = ids => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const i of ids)
            for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], this.triangles[i].min[k]);
                hi[k] = Math.max(hi[k], this.triangles[i].max[k]);
            } if (ids.length <= 10)
            return { lo, hi, ids }; const lengths = hi.map((v, k) => v - lo[k]), axis = lengths.indexOf(Math.max(...lengths)); ids.sort((a, b) => (this.triangles[a].min[axis] + this.triangles[a].max[axis]) - (this.triangles[b].min[axis] + this.triangles[b].max[axis])); const mid = ids.length >> 1; return { lo, hi, left: build(ids.slice(0, mid)), right: build(ids.slice(mid)) }; };
        this.root = build(this.triangles.map((_, i) => i));
        this.bounds = { min: this.root.lo, max: this.root.hi };
    }
    distance(x, y, z) {
        const p = [x, y, z], dir = [1, .371390676354, .529117403], stack = [this.root];
        let best = Infinity, hits = 0;
        while (stack.length) {
            const n = stack.pop();
            if (boxDistanceSq(p, n.lo, n.hi) > best)
                continue;
            if (n.ids) {
                for (const i of n.ids)
                    best = Math.min(best, pointTriangleSq(p, ...this.triangles[i].v));
            }
            else {
                const dl = boxDistanceSq(p, n.left.lo, n.left.hi), dr = boxDistanceSq(p, n.right.lo, n.right.hi);
                if (dl < dr) {
                    stack.push(n.right, n.left);
                }
                else
                    stack.push(n.left, n.right);
            }
        }
        stack.push(this.root);
        while (stack.length) {
            const n = stack.pop();
            if (!rayBox(p, dir, n.lo, n.hi))
                continue;
            if (n.ids) {
                for (const i of n.ids)
                    if (rayTriangle(p, dir, ...this.triangles[i].v))
                        hits++;
            }
            else
                stack.push(n.left, n.right);
        }
        return Math.sqrt(best) * (hits % 2 ? -1 : 1);
    }
}
async function meshToVolume(mesh, resolution = 48, options = {}) {
    const welded = weldMesh(mesh.positions, mesh.indices), metrics = meshMetrics(welded);
    if (!metrics.watertight)
        throw new Error(`Solid import requires a closed manifold mesh (${metrics.boundaryEdges} boundary edges, ${metrics.nonManifoldEdges} non-manifold edges).`);
    const bvh = new MeshBVH(welded), size = Math.max(...bvh.bounds.max.map((v, i) => v - bvh.bounds.min[i])), pad = Math.max(size * .06, .1), domain = { min: bvh.bounds.min.map(v => v - pad), max: bvh.bounds.max.map(v => v + pad) };
    const grid = await sampleGrid((x, y, z) => bvh.distance(x, y, z), domain, resolution, options);
    return { n: grid.n, min: grid.min, max: grid.max, data: grid.values, sourceMetrics: metrics };
}

Object.assign(__exports,{sampleGrid:sampleGrid,extractMesh:extractMesh,meshMetrics:meshMetrics,weldMesh:weldMesh,MeshBVH:MeshBVH,meshToVolume:meshToVolume});
},
7:(__exports,__require)=>{
const { clamp, throwIfAborted }=__require(3);
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
__exports.solveElasticity=__require(8).solveElasticity;
__exports.optimizeTopology=__require(8).optimizeTopology;
__exports.hexElement=__require(8).hexElement;

Object.assign(__exports,{analyzeGrid:analyzeGrid,thermalSetup:thermalSetup,thermalDiagnostics:thermalDiagnostics,solveThermal:solveThermal});
},
8:(__exports,__require)=>{
const { clamp, throwIfAborted, validateDomain }=__require(3);
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
},
9:(__exports,__require)=>{
const { gridInfo, throwIfAborted }=__require(3);
const { thermalSetup, thermalDiagnostics }=__require(7);
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
10:(__exports,__require)=>{
const { vec3, escapeHTML }=__require(3);
function exportSTL(mesh) {
    const { positions: p, indices: t } = mesh, count = t.length / 3, buffer = new ArrayBuffer(84 + count * 50), v = new DataView(buffer);
    new Uint8Array(buffer).set(new TextEncoder().encode('ImplicitForge | indexed isosurface | millimetres'));
    v.setUint32(80, count, true);
    let offset = 84;
    for (let i = 0; i < t.length; i += 3) {
        const a = Array.from(p.slice(t[i] * 3, t[i] * 3 + 3)), b = Array.from(p.slice(t[i + 1] * 3, t[i + 1] * 3 + 3)), c = Array.from(p.slice(t[i + 2] * 3, t[i + 2] * 3 + 3)), normal = vec3.normalize(vec3.cross(vec3.sub(b, a), vec3.sub(c, a)));
        for (const f of [...normal, ...a, ...b, ...c]) {
            v.setFloat32(offset, f, true);
            offset += 4;
        }
        v.setUint16(offset, 0, true);
        offset += 2;
    }
    return buffer;
}
function exportOBJ(mesh) { const lines = ['# ImplicitForge | units: millimetres', 'o ImplicitBody']; for (let i = 0; i < mesh.positions.length; i += 3)
    lines.push(`v ${mesh.positions[i]} ${mesh.positions[i + 1]} ${mesh.positions[i + 2]}`); if (mesh.normals)
    for (let i = 0; i < mesh.normals.length; i += 3)
        lines.push(`vn ${mesh.normals[i]} ${mesh.normals[i + 1]} ${mesh.normals[i + 2]}`); for (let i = 0; i < mesh.indices.length; i += 3)
    lines.push(`f ${Array.from(mesh.indices.slice(i, i + 3), v => mesh.normals ? `${v + 1}//${v + 1}` : v + 1).join(' ')}`); return lines.join('\n'); }
function exportPLY(mesh) { const p = mesh.positions, t = mesh.indices; const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\ncomment ImplicitForge millimetres\nelement vertex ${p.length / 3}\nproperty float x\nproperty float y\nproperty float z\nelement face ${t.length / 3}\nproperty list uchar uint vertex_indices\nend_header\n`); const buffer = new ArrayBuffer(header.length + p.byteLength + (t.length / 3) * 13), bytes = new Uint8Array(buffer); bytes.set(header); const v = new DataView(buffer); let offset = header.length; for (const x of p) {
    v.setFloat32(offset, x, true);
    offset += 4;
} for (let i = 0; i < t.length; i += 3) {
    v.setUint8(offset++, 3);
    for (let k = 0; k < 3; k++) {
        v.setUint32(offset, t[i + k], true);
        offset += 4;
    }
} return buffer; }
function parseSTL(buffer) {
    if (buffer.byteLength > 80 * 1024 * 1024)
        throw new Error('STL import is limited to 80 MB.');
    const v = new DataView(buffer);
    let count = buffer.byteLength >= 84 ? v.getUint32(80, true) : 0;
    if (count > 0 && 84 + count * 50 === buffer.byteLength) {
        if (count > 500000)
            throw new Error('Import is limited to 500,000 triangles.');
        const positions = new Float32Array(count * 9);
        let j = 0;
        for (let i = 0; i < count; i++) {
            const o = 84 + i * 50 + 12;
            for (let k = 0; k < 9; k++)
                positions[j++] = v.getFloat32(o + k * 4, true);
        }
        return { positions };
    }
    const text = new TextDecoder().decode(buffer), matches = [...text.matchAll(/\bvertex\s+([+\-\d.eE]+)\s+([+\-\d.eE]+)\s+([+\-\d.eE]+)/g)];
    if (!matches.length || matches.length % 3)
        throw new Error('Invalid or empty STL file.');
    if (matches.length > 1500000)
        throw new Error('Import is limited to 500,000 triangles.');
    return { positions: Float32Array.from(matches.flatMap(m => [+m[1], +m[2], +m[3]])) };
}
function triangulateFace(face, p) {
    if (face.length === 3)
        return face;
    const points = face.map(i => p.slice(i * 3, i * 3 + 3)), normal = [0, 0, 0];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
        normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
        normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))), axes = [0, 1, 2].filter(i => i !== drop), q = points.map(v => axes.map(k => v[k]));
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let area = 0;
    for (let i = 0; i < q.length; i++)
        area += q[i][0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * q[i][1];
    const sign = Math.sign(area) || 1, remaining = face.map((_, i) => i), out = [];
    while (remaining.length > 3) {
        let found = false;
        for (let j = 0; j < remaining.length; j++) {
            const a = remaining[(j + remaining.length - 1) % remaining.length], b = remaining[j], c = remaining[(j + 1) % remaining.length];
            if (cross(q[a], q[b], q[c]) * sign < 1e-12)
                continue;
            const contains = remaining.some(k => k !== a && k !== b && k !== c && cross(q[a], q[b], q[k]) * sign >= -1e-10 && cross(q[b], q[c], q[k]) * sign >= -1e-10 && cross(q[c], q[a], q[k]) * sign >= -1e-10);
            if (contains)
                continue;
            out.push(face[a], face[b], face[c]);
            remaining.splice(j, 1);
            found = true;
            break;
        }
        if (!found)
            throw new Error('OBJ contains a degenerate, non-planar, or self-intersecting polygon.');
    }
    out.push(...remaining.map(i => face[i]));
    return out;
}
function parseOBJ(text) { if (text.length > 80 * 1024 * 1024)
    throw new Error('OBJ import is limited to 80 MB.'); const p = [], t = []; for (const line of text.split(/\r?\n/)) {
    const words = line.split('#')[0].trim().split(/\s+/);
    if (words[0] === 'v') {
        if (words.length < 4)
            throw new Error('Invalid OBJ vertex.');
        p.push(+words[1], +words[2], +words[3]);
    }
    else if (words[0] === 'f') {
        const face = words.slice(1).filter(x => !x.startsWith('#')).map(x => { const v = parseInt(x.split('/')[0], 10), i = v < 0 ? p.length / 3 + v : v - 1; if (!Number.isInteger(i) || i < 0 || i >= p.length / 3)
            throw new Error('OBJ face index is out of bounds.'); return i; });
        if (face.length < 3 || face.length > 1024)
            throw new Error('Invalid OBJ polygon.');
        t.push(...triangulateFace(face, p));
        if (t.length > 1500000)
            throw new Error('Import is limited to 500,000 triangles.');
    }
} if (!t.length)
    throw new Error('OBJ contains no faces.'); return { positions: new Float32Array(p), indices: new Uint32Array(t) }; }
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++)
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes)
    c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** Minimal ZIP/OPC writer: UTF-8 paths, uncompressed entries, no external dependencies. */
function zipStore(entries) {
    const encoder = new TextEncoder(), files = Object.entries(entries).map(([path, value]) => { const name = encoder.encode(path), data = typeof value === 'string' ? encoder.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value); return { name, data, crc: crc32(data) }; });
    let size = 22;
    for (const f of files)
        size += 30 + f.name.length + f.data.length + 46 + f.name.length;
    const out = new Uint8Array(size), v = new DataView(out.buffer);
    let offset = 0;
    const u16 = (o, n) => v.setUint16(o, n, true), u32 = (o, n) => v.setUint32(o, n, true);
    for (const f of files) {
        f.offset = offset;
        u32(offset, 0x04034b50);
        u16(offset + 4, 20);
        u16(offset + 6, 0x800);
        u32(offset + 14, f.crc);
        u32(offset + 18, f.data.length);
        u32(offset + 22, f.data.length);
        u16(offset + 26, f.name.length);
        out.set(f.name, offset + 30);
        out.set(f.data, offset + 30 + f.name.length);
        offset += 30 + f.name.length + f.data.length;
    }
    const central = offset;
    for (const f of files) {
        u32(offset, 0x02014b50);
        u16(offset + 4, 20);
        u16(offset + 6, 20);
        u16(offset + 8, 0x800);
        u32(offset + 16, f.crc);
        u32(offset + 20, f.data.length);
        u32(offset + 24, f.data.length);
        u16(offset + 28, f.name.length);
        u32(offset + 42, f.offset);
        out.set(f.name, offset + 46);
        offset += 46 + f.name.length;
    }
    u32(offset, 0x06054b50);
    u16(offset + 8, files.length);
    u16(offset + 10, files.length);
    u32(offset + 12, offset - central);
    u32(offset + 16, central);
    return out;
}
function export3MF(mesh, name = 'ImplicitForge body') {
    const p = mesh.positions, t = mesh.indices, vertices = [], triangles = [];
    for (let i = 0; i < p.length; i += 3)
        vertices.push(`<vertex x="${p[i]}" y="${p[i + 1]}" z="${p[i + 2]}"/>`);
    for (let i = 0; i < t.length; i += 3)
        triangles.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
    return zipStore({ '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>', '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>', '3D/3dmodel.model': `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${escapeHTML(name)}</metadata><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>` });
}
function sliceContours(sample, domain, z, resolution = 192) {
    const n = resolution, lo = domain.min, hi = domain.max, sx = (hi[0] - lo[0]) / (n - 1), sy = (hi[1] - lo[1]) / (n - 1), data = new Float32Array(n * n), segments = [];
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
            data[x + n * y] = sample(lo[0] + x * sx, lo[1] + y * sy, z);
    for (let y = 0; y < n - 1; y++)
        for (let x = 0; x < n - 1; x++) {
            const ids = [x + n * y, x + 1 + n * y, x + 1 + n * (y + 1), x + n * (y + 1)], points = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], v = ids.map(i => data[i]);
            let mask = 0;
            v.forEach((s, i) => { if (s < 0)
                mask |= 1 << i; });
            if (mask === 0 || mask === 15)
                continue;
            const intersections = [];
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                if ((v[i] < 0) !== (v[j] < 0)) {
                    const t = v[i] / (v[i] - v[j]);
                    intersections.push({ edge: i, p: [lo[0] + (points[i][0] + t * (points[j][0] - points[i][0])) * sx, lo[1] + (points[i][1] + t * (points[j][1] - points[i][1])) * sy] });
                }
            }
            if (intersections.length === 2)
                segments.push(intersections.map(v => v.p));
            else if (intersections.length === 4) {
                const inside = sample(lo[0] + (x + .5) * sx, lo[1] + (y + .5) * sy, z) < 0;
                const pairs = ((mask === 5 && inside) || (mask === 10 && !inside)) ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
                for (const [a, b] of pairs)
                    segments.push([intersections[a].p, intersections[b].p]);
            }
        }
    return segments;
}
function exportSliceSVG(sample, domain, z, resolution = 192) { const segments = sliceContours(sample, domain, z, resolution), width = domain.max[0] - domain.min[0], height = domain.max[1] - domain.min[1]; return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${domain.min[0]} ${-domain.max[1]} ${width} ${height}"><title>ImplicitForge section Z = ${z} mm</title><g fill="none" stroke="#111" stroke-width="0.12">${segments.map(([a, b]) => `<path d="M${a[0]} ${-a[1]}L${b[0]} ${-b[1]}"/>`).join('')}</g></svg>`; }

Object.assign(__exports,{exportSTL:exportSTL,exportOBJ:exportOBJ,exportPLY:exportPLY,parseSTL:parseSTL,parseOBJ:parseOBJ,crc32:crc32,zipStore:zipStore,export3MF:export3MF,sliceContours:sliceContours,exportSliceSVG:exportSliceSVG});
}};function __require(id){if(__cache[id])return __cache[id];const value={};__cache[id]=value;__modules[id](value,__require);return value;}return __require(0);})();