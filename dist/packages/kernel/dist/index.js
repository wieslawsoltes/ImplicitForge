// Standalone @forge package. Generated from workspace source; no external runtime dependencies.
const __entry=(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
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
export const CancelledError=__entry.CancelledError;
export const EPSILON=__entry.EPSILON;
export const Emitter=__entry.Emitter;
export const TAU=__entry.TAU;
export const assertFinite=__entry.assertFinite;
export const clamp=__entry.clamp;
export const clone=__entry.clone;
export const debounce=__entry.debounce;
export const downloadFile=__entry.downloadFile;
export const escapeHTML=__entry.escapeHTML;
export const formatNumber=__entry.formatNumber;
export const gridInfo=__entry.gridInfo;
export const hashString=__entry.hashString;
export const lerp=__entry.lerp;
export const throwIfAborted=__entry.throwIfAborted;
export const uid=__entry.uid;
export const validateDomain=__entry.validateDomain;
export const vec3=__entry.vec3;
