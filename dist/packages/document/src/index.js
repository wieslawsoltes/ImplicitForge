import { Emitter, clone } from '../../kernel/src/index.js';
import { validateDocument } from '../../graph/src/index.js';
const immutableAssets = new WeakSet();
function freezeTree(value) {
    if (ArrayBuffer.isView(value))
        value = Array.from(value);
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value))
            value[key] = freezeTree(value[key]);
        Object.freeze(value);
    }
    return value;
}
function retainAsset(asset) { if (immutableAssets.has(asset))
    return asset; const frozen = freezeTree(clone(asset)); immutableAssets.add(frozen); return frozen; }
function draftDocument(doc) { return { ...clone({ ...doc, assets: {} }), assets: { ...(doc.assets ?? {}) } }; }
function commitAssets(doc) { for (const [id, asset] of Object.entries(doc.assets))
    doc.assets[id] = retainAsset(asset); return doc; }
function sameAssets(a, b) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]); }
/** Snapshot transactions; immutable volume assets are structurally shared across undo states.
 * Replace an asset object to edit it. Existing asset samples cannot be mutated in place.
 */
export class DocumentStore {
    constructor(doc, { historyLimit = 80 } = {}) { validateDocument(doc); this.value = commitAssets(draftDocument(doc)); this.history = []; this.future = []; this.historyLimit = historyLimit; this.events = new Emitter(); this.revision = 0; this.lastMerge = null; }
    transact(label, edit, { mergeKey = null } = {}) {
        const next = draftDocument(this.value);
        edit(next);
        validateDocument(next);
        if (sameAssets(next.assets, this.value.assets) && JSON.stringify({ ...next, assets: {} }) === JSON.stringify({ ...this.value, assets: {} }))
            return false;
        commitAssets(next);
        const now = Date.now();
        if (!mergeKey || this.lastMerge?.key !== mergeKey || now - this.lastMerge.time > 800) {
            this.history.push({ label, value: this.value });
            if (this.history.length > this.historyLimit)
                this.history.shift();
        }
        this.value = next;
        this.future.length = 0;
        this.lastMerge = mergeKey ? { key: mergeKey, time: now } : null;
        this.revision++;
        this.events.emit({ kind: 'edit', label, revision: this.revision });
        return true;
    }
    undo() { if (!this.history.length)
        return; const entry = this.history.pop(); this.future.push({ label: entry.label, value: this.value }); this.value = entry.value; this.lastMerge = null; this.revision++; this.events.emit({ kind: 'undo', label: entry.label, revision: this.revision }); }
    redo() { if (!this.future.length)
        return; const entry = this.future.pop(); this.history.push({ label: entry.label, value: this.value }); this.value = entry.value; this.lastMerge = null; this.revision++; this.events.emit({ kind: 'redo', label: entry.label, revision: this.revision }); }
    replace(doc) { validateDocument(doc); this.value = commitAssets(draftDocument(doc)); this.history = []; this.future = []; this.lastMerge = null; this.revision++; this.events.emit({ kind: 'replace', revision: this.revision }); }
    subscribe(f) { return this.events.subscribe(f); }
}
export function serializeProject(doc) { validateDocument(doc); return JSON.stringify(doc, (_, v) => v instanceof Float32Array ? Array.from(v) : v, 2); }
export function parseProject(text) { if (text.length > 100 * 1024 * 1024)
    throw new Error('Project exceeds the 100 MB input limit.'); return validateDocument(JSON.parse(text)); }
export class ProjectPersistence {
    constructor(name = 'implicitforge') { this.name = name; this.db = null; }
    async open() { if (!globalThis.indexedDB)
        return; this.db = await new Promise((resolve, reject) => { const r = indexedDB.open(this.name, 1); r.onupgradeneeded = () => r.result.createObjectStore('projects'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
    async save(doc) { if (!this.db)
        throw new Error('Browser storage unavailable. Use Save project to preserve your work.'); await new Promise((resolve, reject) => { const t = this.db.transaction('projects', 'readwrite'); t.objectStore('projects').put(clone(doc), 'autosave'); t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error ?? new Error('Storage write aborted')); }); }
    async load() { if (!this.db)
        return null; return new Promise((resolve, reject) => { const r = this.db.transaction('projects').objectStore('projects').get('autosave'); r.onsuccess = () => { try {
        resolve(r.result ? validateDocument(r.result) : null);
    }
    catch (e) {
        reject(e);
    } }; r.onerror = () => reject(r.error); }); }
}
