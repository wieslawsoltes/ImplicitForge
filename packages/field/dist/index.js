// Standalone @forge package. Generated from workspace source; no external runtime dependencies.
const __entry=(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
const { clamp, lerp }=__require(1);
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
export const FIELD_WGSL=__entry.FIELD_WGSL;
export const gradient=__entry.gradient;
export const sampleVolume=__entry.sampleVolume;
export const sdBox=__entry.sdBox;
export const sdCylinder=__entry.sdCylinder;
export const sdEllipsoid=__entry.sdEllipsoid;
export const segmentDistance=__entry.segmentDistance;
export const smoothUnion=__entry.smoothUnion;
export const wgslToGLSL=__entry.wgslToGLSL;
