import { topologicalOrder, NODE_TYPES } from '../../graph/src/index.js';
import { sdBox, sdCylinder, sdEllipsoid, smoothUnion, sampleVolume, FIELD_WGSL, wgslToGLSL } from '../../field/src/index.js';
import { tpms, cubicLattice, octetLattice, LATTICE_WGSL } from '../../lattice/src/index.js';
import { clamp, lerp, TAU, clone } from '../../kernel/src/index.js';
function normalized(v) { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }
export function compileCPU(doc, root = doc.root) {
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
export function compileDocument(doc, root = doc.root, colorRoot = null) {
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
