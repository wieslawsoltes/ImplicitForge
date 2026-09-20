import { escapeHTML, clamp } from '../../kernel/src/index.js';
import { NODE_TYPES } from '../../graph/src/index.js';
const paths = {
    cube: 'M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Zm0 0v9m-9-4.5 9 4.5 9-4.5M12 12v9',
    sphere: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
    graph: 'M5 6h5v5H5zM14 14h5v5h-5zM10 8h6v6M7 11v6h7',
    layers: 'm12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
    field: 'M3 7c4-9 7 9 11 0s7 0 7 0M3 12c4-9 7 9 11 0s7 0 7 0M3 17c4-9 7 9 11 0s7 0 7 0',
    transform: 'M3 12h18m-4-4 4 4-4 4M12 3v18m-4-4 4 4 4-4',
    boolean: 'M15 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm6 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 6 6',
    play: 'm8 5 11 7-11 7V5Z', undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12', redo: 'm16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
    save: 'M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7', folder: 'M3 6h7l2 3h9v11H3V6Z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
    chevron: 'm8 5 7 7-7 7', down: 'm6 9 6 6 6-6', check: 'm4 12 5 5L20 6', close: 'm6 6 12 12M6 18 18 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z', grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    thermometer: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Zm2-6v9', bolt: 'm14 2-9 12h6l-1 8 9-13h-6l1-7Z',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M8 15v6', code: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
    cpu: 'M6 6h12v12H6zM9 9h6v6H9zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    copy: 'M8 8h13v13H8zM16 8V3H3v13h5', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    chart: 'M3 3v18h18M7 16l4-6 4 3 6-9', section: 'M3 12h18M6 3h12v18H6z', menu: 'M4 6h16M4 12h16M4 18h16',
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    camera: 'M3 7h5l2-3h4l2 3h5v14H3V7Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', link: 'm9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-2 2',
    star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z', history: 'M3 12a9 9 0 1 0 2-6M3 3v5h5m4-2v6l4 2',
    book: 'M3 3h6c2 0 3 1 3 2 0-1 1-2 3-2h6v17h-6c-2 0-3 1-3 2 0-1-1-2-3-2H3V3Zm9 2v17',
    rotate: 'M3 10a9 9 0 1 1 2 8M3 4v6h6', maximize: 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6', more: 'M5 12h.01M12 12h.01M19 12h.01',
    arrow: 'M4 12h16m-6-6 6 6-6 6', sliders: 'M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-9h6'
};
export function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.cube}"/></svg>`; }
export function categoryIcon(category) { return { Primitives: 'cube', Operations: 'boolean', Transforms: 'transform', Lattices: 'grid', Fields: 'field', Import: 'upload' }[category] ?? 'cube'; }
export function button(label, iconName, { className = '', title = label, attrs = '' } = {}) { return `<button class="${className}" title="${escapeHTML(title)}" aria-label="${escapeHTML(label)}" ${attrs}>${iconName ? icon(iconName) : ''}${label ? `<span>${escapeHTML(label)}</span>` : ''}</button>`; }
export class ToastCenter {
    constructor(container) { this.container = container; }
    show(message, type = 'info', duration = 5000) { const el = document.createElement('div'); el.className = `toast ${type}`; el.setAttribute('role', type === 'error' ? 'alert' : 'status'); el.innerHTML = `${icon(type === 'error' ? 'bolt' : type === 'success' ? 'check' : 'cpu')}<span>${escapeHTML(message)}</span><button aria-label="Dismiss">${icon('close', 14)}</button>`; el.querySelector('button').onclick = () => el.remove(); this.container.append(el); setTimeout(() => el.remove(), duration); }
}
export class DialogHost {
    constructor(dialog) { this.dialog = dialog; this.restoreFocus = null; dialog.addEventListener('click', e => { if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            this.close();
    } }); dialog.addEventListener('close', () => this.restoreFocus?.focus?.()); }
    open(title, body, { wide = false, subtitle = '' } = {}) { this.restoreFocus = document.activeElement; this.dialog.className = wide ? 'wide' : ''; this.dialog.innerHTML = `<header class="dialog-header"><div><h2>${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><button class="icon-button" data-close aria-label="Close dialog">${icon('close')}</button></header><div class="dialog-body">${body}</div>`; this.dialog.querySelector('[data-close]').onclick = () => this.close(); if (!this.dialog.open)
        this.dialog.showModal(); return this.dialog; }
    close() { this.dialog.close(); }
    confirm(title, message, onConfirm) { const d = this.open(title, `<p class="dialog-copy">${escapeHTML(message)}</p><div class="dialog-actions"><button data-cancel>Cancel</button><button class="primary" data-confirm>Continue</button></div>`); d.querySelector('[data-cancel]').onclick = () => this.close(); d.querySelector('[data-confirm]').onclick = () => { this.close(); onConfirm(); }; }
}
/** Draggable, zoomable typed-DAG canvas. Connections are semantic port references, not paths. */
export class NodeGraph {
    constructor(container, { onSelect, onMove, onConnect, onPreview, onViewChange, onError } = {}) {
        Object.assign(this, { container, onSelect, onMove, onConnect, onPreview, onViewChange, onError });
        this.view = { x: 10, y: 10, zoom: .78 };
        this.nodes = [];
        this.selected = null;
        this.pendingSource = null;
        container.innerHTML = '<div class="graph-world"><svg class="graph-edges" aria-hidden="true"></svg><div class="graph-nodes"></div></div><div class="graph-empty">Add a block to begin your implicit model.</div>';
        this.world = container.querySelector('.graph-world');
        this.svg = container.querySelector('svg');
        this.host = container.querySelector('.graph-nodes');
        this.applyView();
        this.bindEvents();
    }
    update(doc, selected, diagnostics = []) {
        this.nodes = doc.nodes;
        this.root = doc.root;
        this.selected = selected;
        this.invalid = new Set(diagnostics.map(x => x.id));
        const positions = new Map(this.nodes.map(n => [n.id, n.position]));
        this.positions = positions;
        this.host.innerHTML = this.nodes.map(n => { const def = NODE_TYPES[n.type], category = def.category.toLowerCase(); return `<article class="graph-node ${category} ${n.id === selected ? 'selected' : ''} ${this.invalid.has(n.id) ? 'invalid' : ''}" style="left:${n.position.x}px;top:${n.position.y}px" data-node="${n.id}" tabindex="0"><div class="node-header" data-drag="${n.id}"><span class="node-glyph">${icon(categoryIcon(def.category), 15)}</span><span class="node-title">${escapeHTML(n.name)}</span>${n.id === doc.root ? '<span class="node-output-label">OUT</span>' : ''}<button class="port output ${def.output}" data-output="${n.id}" aria-label="Connect output of ${escapeHTML(n.name)}"></button></div><div class="node-type">${escapeHTML(def.label)} <span>${def.output === 'body' ? 'ƒ(x)' : 'scalar'}</span></div><div class="node-inputs">${Object.entries(def.inputs).map(([key, port]) => `<div class="node-input"><button class="port input ${port.type} ${n.inputs[key] ? 'connected' : ''}" data-input="${n.id}:${key}" aria-label="Connect ${escapeHTML(port.label)}"> </button><span>${escapeHTML(port.label)}</span>${n.inputs[key] ? '<i>linked</i>' : port.required ? '<i class="required">required</i>' : '<i>value</i>'}</div>`).join('')}</div></article>`; }).join('');
        this.container.querySelector('.graph-empty').hidden = doc.nodes.length > 0;
        this.drawEdges();
        this.applyView();
    }
    setSelection(id) { this.selected = id; for (const e of this.host.querySelectorAll('[data-node]'))
        e.classList.toggle('selected', e.dataset.node === id); }
    drawEdges() {
        const paths = [];
        for (const node of this.nodes) {
            const pos = this.positions.get(node.id);
            const keys = Object.keys(NODE_TYPES[node.type].inputs);
            for (const [port, source] of Object.entries(node.inputs)) {
                const p = this.positions.get(source);
                if (!p)
                    continue;
                const a = [p.x + 205, p.y + 23], b = [pos.x, pos.y + 73 + keys.indexOf(port) * 22], bend = Math.max(65, Math.abs(b[0] - a[0]) * .45);
                const type = NODE_TYPES[node.type].inputs[port]?.type ?? 'body';
                paths.push(`<path class="edge ${type}" d="M${a[0]} ${a[1]}C${a[0] + bend} ${a[1]},${b[0] - bend} ${b[1]},${b[0]} ${b[1]}"/>`);
            }
        }
        if (this.pendingSource) {
            const p = this.positions.get(this.pendingSource);
            if (p) {
                const a = [p.x + 205, p.y + 23], b = this.pendingPoint ?? [a[0] + 75, a[1]];
                paths.push(`<path class="edge pending" d="M${a[0]} ${a[1]}C${a[0] + 50} ${a[1]},${b[0] - 50} ${b[1]},${b[0]} ${b[1]}"/>`);
            }
        }
        this.svg.innerHTML = paths.join('');
    }
    applyView() { this.world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.zoom})`; this.container.style.backgroundPosition = `${this.view.x}px ${this.view.y}px`; this.container.style.backgroundSize = `${20 * this.view.zoom}px ${20 * this.view.zoom}px`; this.onViewChange?.(this.view); }
    fit() { if (!this.nodes.length)
        return; const lo = [Math.min(...this.nodes.map(n => n.position.x)), Math.min(...this.nodes.map(n => n.position.y))], hi = [Math.max(...this.nodes.map(n => n.position.x + 205)), Math.max(...this.nodes.map(n => n.position.y + 90 + Object.keys(NODE_TYPES[n.type].inputs).length * 22))], r = this.container.getBoundingClientRect(); this.view.zoom = clamp(Math.min((r.width - 50) / (hi[0] - lo[0]), (r.height - 40) / (hi[1] - lo[1])), .18, 1.2); this.view.x = (r.width - (hi[0] - lo[0]) * this.view.zoom) / 2 - lo[0] * this.view.zoom; this.view.y = (r.height - (hi[1] - lo[1]) * this.view.zoom) / 2 - lo[1] * this.view.zoom; this.applyView(); }
    focus(id) { const node = this.nodes.find(n => n.id === id); if (!node)
        return; this.view.zoom = .86; this.view.x = this.container.clientWidth * .58 - (node.position.x + 102) * this.view.zoom; this.view.y = Math.max(14, this.container.clientHeight * .5 - 58 * this.view.zoom) - node.position.y * this.view.zoom; this.applyView(); }
    worldPoint(e) { const r = this.container.getBoundingClientRect(); return { x: (e.clientX - r.left - this.view.x) / this.view.zoom, y: (e.clientY - r.top - this.view.y) / this.view.zoom }; }
    bindEvents() {
        const c = this.container;
        let drag = null, wireStart = null;
        c.addEventListener('pointerdown', e => {
            if (e.button !== 0 && e.button !== 1)
                return;
            const output = e.target.closest('[data-output]'), input = e.target.closest('[data-input]');
            if (output) {
                this.pendingSource = output.dataset.output;
                this.pendingPoint = null;
                wireStart = { x: e.clientX, y: e.clientY };
                this.drawEdges();
                e.preventDefault();
                return;
            }
            if (input) {
                if (this.pendingSource) {
                    const [target, port] = input.dataset.input.split(':');
                    try {
                        this.onConnect?.(target, port, this.pendingSource);
                    }
                    catch (err) {
                        this.onError?.(err);
                    }
                    this.pendingSource = null;
                    this.drawEdges();
                }
                e.preventDefault();
                return;
            }
            const node = e.target.closest('[data-node]');
            if (node) {
                this.onSelect?.(node.dataset.node);
                if (e.target.closest('[data-drag]')) {
                    const p = this.positions.get(node.dataset.node);
                    drag = { kind: 'node', id: node.dataset.node, startX: e.clientX, startY: e.clientY, x: p.x, y: p.y, element: node };
                }
            }
            else {
                this.pendingSource = null;
                this.drawEdges();
                drag = { kind: 'pan', startX: e.clientX, startY: e.clientY, x: this.view.x, y: this.view.y };
            }
            if (drag)
                c.setPointerCapture(e.pointerId);
        });
        c.addEventListener('pointermove', e => { if (this.pendingSource) {
            const p = this.worldPoint(e);
            this.pendingPoint = [p.x, p.y];
            this.drawEdges();
        } if (!drag)
            return; const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY; if (drag.kind === 'pan') {
            this.view.x = drag.x + dx;
            this.view.y = drag.y + dy;
            this.applyView();
        }
        else {
            const p = { x: drag.x + dx / this.view.zoom, y: drag.y + dy / this.view.zoom };
            this.positions.set(drag.id, p);
            drag.element.style.left = `${p.x}px`;
            drag.element.style.top = `${p.y}px`;
            this.drawEdges();
        } });
        c.addEventListener('pointerup', e => { if (wireStart && this.pendingSource) {
            const moved = Math.hypot(e.clientX - wireStart.x, e.clientY - wireStart.y) > 5;
            const input = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-input]');
            if (input) {
                const [target, port] = input.dataset.input.split(':');
                this.onConnect?.(target, port, this.pendingSource);
                this.pendingSource = null;
            }
            else if (moved)
                this.pendingSource = null;
            wireStart = null;
            this.drawEdges();
        } if (drag?.kind === 'node')
            this.onMove?.(drag.id, this.positions.get(drag.id)); drag = null; });
        c.addEventListener('pointercancel', () => { drag = null; this.pendingSource = null; this.drawEdges(); });
        c.addEventListener('dblclick', e => { const n = e.target.closest('[data-node]'); if (n)
            this.onPreview?.(n.dataset.node); });
        c.addEventListener('keydown', e => { if (e.key === 'Escape') {
            this.pendingSource = null;
            this.drawEdges();
        } if (e.key === 'Enter') {
            const n = e.target.closest('[data-node]');
            if (n)
                this.onSelect?.(n.dataset.node);
        } });
        c.addEventListener('wheel', e => { e.preventDefault(); const before = this.worldPoint(e), r = c.getBoundingClientRect(); this.view.zoom = clamp(this.view.zoom * Math.exp(-e.deltaY * .0015), .15, 1.8); this.view.x = e.clientX - r.left - before.x * this.view.zoom; this.view.y = e.clientY - r.top - before.y * this.view.zoom; this.applyView(); }, { passive: false });
    }
}
export function installSplitter(handle, { axis = 'y', onDelta } = {}) { let origin = null; handle.setAttribute('role', 'separator'); handle.tabIndex = 0; handle.setAttribute('aria-orientation', axis === 'y' ? 'horizontal' : 'vertical'); handle.addEventListener('pointerdown', e => { origin = axis === 'y' ? e.clientY : e.clientX; handle.setPointerCapture(e.pointerId); }); handle.addEventListener('pointermove', e => { if (origin === null)
    return; const v = axis === 'y' ? e.clientY : e.clientX; onDelta(v - origin); origin = v; }); const end = () => origin = null; handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end); handle.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    onDelta(['ArrowUp', 'ArrowLeft'].includes(e.key) ? -12 : 12);
} }); }
