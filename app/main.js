import { icon, categoryIcon, ToastCenter, DialogHost, NodeGraph, installSplitter } from '../packages/ui/src/index.js';
import { DocumentStore, ProjectPersistence, serializeProject, parseProject } from '../packages/document/src/index.js';
import { NODE_TYPES, createNode, connect, downstream, autoLayout, graphDiagnostics, topologicalOrder } from '../packages/graph/src/index.js';
import { compileDocument, compileCPU } from '../packages/compile/src/index.js';
import { ImplicitRenderer } from '../packages/render/src/index.js';
import { WorkerClient } from '../packages/compute/src/index.js';
import { exportSTL, exportOBJ, exportPLY, export3MF, exportSliceSVG } from '../packages/io/src/index.js';
import { escapeHTML as esc, clamp, uid, clone, formatNumber as fmt, downloadFile, debounce, hashString } from '../packages/kernel/src/index.js';
import { EXAMPLES } from './examples.js';
const MATERIALS = { aluminium: { name: 'Aluminium 6061', density: 2.7, E: 69000, nu: .33, conductivity: 167 }, titanium: { name: 'Titanium Ti-6Al-4V', density: 4.43, E: 114000, nu: .34, conductivity: 6.7 }, steel: { name: 'Steel (generic)', density: 7.85, E: 200000, nu: .3, conductivity: 45 }, nylon: { name: 'PA12 (generic)', density: 1.01, E: 1700, nu: .38, conductivity: .25 } };
const B = (action, label, glyph, extra = '', cls = '') => `<button class="${cls}" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${glyph ? icon(glyph) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
const IB = (action, label, glyph, extra = '', cls = '') => `<button class="icon-button ${cls}" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(glyph, 16)}</button>`;
const root = document.getElementById('app');
(async function bootstrap() {
    const persistence = new ProjectPersistence();
    let initial = EXAMPLES[0].make(), storageReady = false, restored = false;
    try {
        await persistence.open();
        const saved = await persistence.load();
        storageReady = !!persistence.db;
        if (saved) {
            initial = saved;
            restored = true;
        }
    }
    catch {
        storageReady = false;
    }
    const store = new DocumentStore(initial), toast = new ToastCenter(document.getElementById('toasts')), dialogs = new DialogHost(document.getElementById('dialog'));
    const state = { selected: initial.nodes.find(n => NODE_TYPES[n.type].category === 'Lattices')?.id ?? initial.root, workspace: 'design', inspectorTab: 'parameters', notebookMode: 'all', filter: '', preview: null, colorRoot: null, metrics: null, meshResult: null, analysis: null, sweep: null, topology: null, program: null, geometryKey: '', editing: false, graphCollapsed: innerWidth < 650, graphHeight: innerWidth < 650 ? 215 : 258, busy: false, jobToken: 0, modelToken: 0, analysisMode: 'metrics', lastError: null, settings: { metrics: { resolution: 72 }, thermal: { resolution: 40, hot: 120, cold: 20, ambient: 20, conductivity: initial.material?.conductivity ?? 167, convection: 8, heatSource: 0, maxIterations: 1500, tolerance: .01 }, elasticity: { resolution: 12, E: initial.material?.E ?? 69000, nu: initial.material?.nu ?? .33, force: -100, tolerance: 1e-7, maxIterations: 700 }, topology: { resolution: 10, volumeFraction: .4, iterations: 15, E: initial.material?.E ?? 69000, nu: initial.material?.nu ?? .33, force: -100 }, sweep: { min: 7, max: 16, steps: 6, resolution: 32 } } };
    root.innerHTML = `<div class="workbench">
 <header class="topbar"><div class="brand"><svg class="brand-mark" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m18 2 14 8v16l-14 8-14-8V10L18 2Zm0 0v32M4 10l14 8 14-8M4 26l14-8 14 8"/><path d="m11 6 14 8v16M11 30V14l14-8" opacity=".45"/></svg><div><div class="brand-name">Implicit<strong>Forge</strong></div><small>COMPUTATIONAL ENGINEERING</small></div></div>
 <nav class="workspace-tabs" aria-label="Workspace">${B('workspace', 'Design', 'cube', 'data-tab="design"', 'active')}${B('workspace', 'Fields', 'field', 'data-tab="fields"')}${B('workspace', 'Analysis', 'chart', 'data-tab="analysis"')}</nav>
 <button class="command-search" data-action="commands" title="Command palette (Ctrl/⌘ K)">${icon('search', 14)}<span>Search commands & blocks</span><kbd>⌘ K</kbd></button>
 <div class="top-actions">${IB('help', 'Help & keyboard shortcuts', 'help', '', 'hide-mobile')}${B('save', 'Save project', 'save', '', 'subtle')}${B('export', 'Export', 'download', '', 'primary')}</div></header>
 <div class="projectbar">${IB('notebook-toggle', 'Toggle notebook', 'menu', '', 'mobile-menu')}<button class="project-trigger" data-action="examples" title="Projects and examples">${icon('folder', 17)}<span id="project-name" class="project-path"></span>${icon('down', 12)}</button><div class="divider"></div>${IB('undo', 'Undo (Ctrl/⌘ Z)', 'undo')}${IB('redo', 'Redo (Ctrl/⌘ Shift Z)', 'redo')}<div class="divider"></div>${B('library', 'Add block', 'plus', '', 'tool')}${B('open', 'Import', 'upload', '', 'tool hide-mobile')}<div class="spacer"></div><span class="live-indicator"><i class="dot"></i> LIVE FIELD</span>${B('evaluate', 'Evaluate', 'play', '', 'tool')}${IB('section', 'Section plane (C)', 'section')}${IB('properties', 'Toggle properties', 'sliders', '', 'mobile-menu')}${IB('snapshot', 'Save viewport image', 'camera', '', 'hide-mobile')}</div>
 <main class="workspace"><aside class="sidebar"><div class="panel-heading">${icon('book', 14)}<span class="caption">Notebook</span><span class="count" id="block-count"></span>${IB('library', 'Add a block', 'plus')}</div><div class="notebook-top"><label class="notebook-search">${icon('search', 13)}<input id="notebook-search" aria-label="Filter notebook" placeholder="Filter notebook…"></label><div class="notebook-switch">${B('notebook-mode', 'All blocks', '', 'data-mode="all"', 'active')}${B('notebook-mode', 'Variables', '', 'data-mode="fields"')}${B('notebook-mode', 'Output', '', 'data-mode="output"')}</div></div><div class="notebook-list" id="notebook-list" role="listbox" aria-label="Modeling blocks"></div><div class="sidebar-bottom"><div class="caption">Build volume <span class="mono" style="float:right;color:var(--accent)">mm</span></div><div id="domain-summary" class="domain-card"></div>${B('domain', 'Edit sampling domain', 'cube', '', 'domain-button')}</div></aside>
 <section class="center"><div class="viewport"><canvas id="viewport" tabindex="0" aria-label="Interactive implicit model. Drag to orbit, shift-drag to pan, scroll to zoom."></canvas><div class="view-top"><div class="view-ident"><div class="caption"><i class="dot"></i><span id="view-eyebrow">IMPLICIT BODY / LIVE PREVIEW</span></div><h1 id="view-title">Heat exchanger</h1><p id="view-subtitle">Millimetres · continuous field representation</p></div><div class="view-controls"><select data-setting="view-mode" aria-label="Viewport shading"><option value="0">Material</option><option value="1">Scalar field</option><option value="2">Surface normals</option><option value="3" disabled>Analysis result</option></select><select data-setting="quality" aria-label="Rendering quality"><option value="0">Draft</option><option value="1" selected>Balanced</option><option value="2">Precise</option></select>${IB('grid', 'Toggle ground grid', 'grid', '', 'hide-mobile')}${IB('fit', 'Fit model (F)', 'fit')}</div></div><div id="quality-badge" class="quality-badge" hidden></div><div class="view-error" id="view-error" hidden></div>
 <div id="field-legend" class="field-legend" hidden><div class="caption" id="legend-title">Scalar field</div><div class="legend-gradient"></div><div class="legend-labels"><span id="legend-min">0</span><span id="legend-max">1</span></div></div><div id="section-control" class="section-control" hidden><label class="row" for="section-z">SECTION · Z<output id="section-output">0 mm</output></label><input id="section-z" type="range" min="-34" max="34" value="0" step=".1">${B('slice', 'Export section SVG', 'download', '', 'subtle full')}</div>
 <div id="viewport-empty" class="viewport-empty" hidden><div class="empty-cube">${icon('cube', 60)}</div><h2>A field of possibilities.</h2><p>Add a primitive or open an example to get started.</p>${B('library', 'Add your first block', 'plus', '', 'primary')}</div>
 <div class="view-bottom"><div><div class="camera-widget">${B('orient', 'X', '', 'data-axis="right"')}${B('orient', 'Y', '', 'data-axis="front"')}${B('orient', 'Z', '', 'data-axis="top"')}${B('orient', 'ISO', '', 'data-axis="iso"', 'iso-button')}${IB('projection', 'Toggle orthographic projection', 'cube')}</div><div class="view-help">ORBIT · drag &nbsp; PAN · ⇧ drag &nbsp; ZOOM · scroll</div></div><div class="view-metrics"><div class="metric-tile"><div class="label">Volume</div><div class="value" id="metric-volume">— <small>cm³</small></div></div><div class="metric-tile"><div class="label">Mass</div><div class="value" id="metric-mass">— <small>g</small></div></div><div class="metric-tile"><div class="label">Blocks</div><div class="value" id="metric-nodes">14</div></div></div></div></div>
 <div class="graph-splitter" id="graph-splitter" aria-label="Resize graph panel"></div><section class="graph-panel ${state.graphCollapsed ? 'collapsed' : ''}" id="graph-panel"><div class="graph-toolbar">${icon('graph', 14)}<span class="caption">Design graph</span><span class="badge" id="graph-count"></span><div class="spacer"></div>${B('graph-layout', 'Auto layout', 'graph', '', 'tiny-button')}${IB('graph-focus', 'Frame selected block', 'search')}${IB('graph-fit', 'Fit entire graph', 'fit')}${IB('graph-toggle', 'Collapse or expand graph', 'down')}</div><div class="graph-canvas" id="graph-canvas" aria-label="Interactive typed node graph"></div><div class="graph-footer"><span>Drag output to input to connect · double-click to preview</span><span id="graph-zoom">86%</span></div></section>
 <div id="job-bar" class="job-bar" hidden><div class="row"><strong id="job-title">Evaluating field…</strong>${B('cancel', 'Cancel', '', '')}</div><div class="progress-track"><div class="progress-fill" id="job-progress"></div></div><div class="job-details" id="job-details"></div></div></section>
 <aside class="inspector"><div class="inspector-tabs">${B('inspector-tab', 'Parameters', '', 'data-tab="parameters"', 'active')}${B('inspector-tab', 'Analysis', '', 'data-tab="analysis"')}</div><div class="inspector-content" id="inspector-content"></div></aside></main>
 <footer class="statusbar"><span class="engine"><i id="engine-dot" class="dot amber"></i><span id="engine-status">Starting renderer</span></span><span class="separator"></span><span id="graph-status">Compiling field graph</span><span id="submit-status" class="mono hide-mobile"></span><div class="status-right"><span id="autosave-status">${storageReady ? 'Autosave ready' : 'Save to file'}</span><span class="unit-pill">mm</span>${IB('theme', 'Toggle light/dark theme', 'sun')}<span class="version-tag hide-mobile">v0.1</span></div></footer></div>`;
    const $ = selector => root.querySelector(selector), $$ = selector => [...root.querySelectorAll(selector)], workbench = $('.workbench');
    const workerURL = globalThis.__IMPLICITFORGE_WORKER_URL__ ?? new URL('./worker.js', import.meta.url), worker = new WorkerClient(workerURL, { type: globalThis.__IMPLICITFORGE_WORKER_TYPE__ ?? 'module' });
    const report = (error) => { if (error?.name === 'AbortError')
        return; console.error(error); toast.show(error?.message ?? String(error), 'error', 9000); };
    const renderer = new ImplicitRenderer($('#viewport'), { onStatus: info => { if (info.backend) {
            $('#engine-status').textContent = info.backend === 'CPU raster' ? 'CPU raster · worker compute' : `${info.backend} · implicit renderer`;
            $('#engine-dot').classList.toggle('amber', info.backend === 'CPU raster');
            $('#submit-status').textContent = info.cpuMs === undefined ? '' : ` · ${fmt(info.cpuMs, 1)} ms ${info.backend === 'CPU raster' ? 'raster' : 'submit'}`;
        } }, onError: report });
    const graph = new NodeGraph($('#graph-canvas'), { onSelect: selectNode, onMove: (id, position) => edit('Move block', d => d.nodes.find(n => n.id === id).position = position), onConnect: (target, port, source) => edit('Connect blocks', d => connect(d, target, port, source)), onPreview: previewNode, onViewChange: view => $('#graph-zoom').textContent = `${Math.round(view.zoom * 100)}%`, onError: report });
    installSplitter($('#graph-splitter'), { onDelta: delta => { state.graphHeight = clamp(state.graphHeight - delta, 115, Math.max(160, innerHeight * .64)); document.documentElement.style.setProperty('--graph-height', `${state.graphHeight}px`); if (state.graphCollapsed) {
            state.graphCollapsed = false;
            $('#graph-panel').classList.remove('collapsed');
        } } });
    const saveLocal = debounce(async () => { if (!storageReady)
        return; try {
        await persistence.save(store.value);
        $('#autosave-status').textContent = 'All changes saved locally';
    }
    catch (e) {
        $('#autosave-status').textContent = 'Autosave failed · save to file';
        toast.show(e.message, 'error');
    } }, 550);
    const rebuild = debounce(() => refreshModel().catch(report), 90);
    const assetKeys = new WeakMap();
    let nextAssetKey = 1;
    function modelKey(doc) { return JSON.stringify({ root: doc.root, domain: doc.domain, nodes: doc.nodes.map(({ id, type, params, inputs }) => ({ id, type, params, inputs })), assets: Object.entries(doc.assets ?? {}).map(([k, v]) => { if (!assetKeys.has(v))
            assetKeys.set(v, nextAssetKey++); return [k, assetKeys.get(v), v.n, v.min, v.max]; }) }); }
    function edit(label, fn, options) { try {
        return store.transact(label, fn, options);
    }
    catch (e) {
        report(e);
        return false;
    } }
    function clearAnalysis() { state.analysis = null; state.meshResult = null; state.sweep = null; state.topology = null; renderer.setAnalysis(null); if (renderer.mode === 3) {
        renderer.mode = 0;
        const s = $('[data-setting=view-mode]');
        s.value = '0';
    } const analysisOption = $('[data-setting=view-mode] option[value="3"]'); analysisOption.disabled = true; renderLegend(); }
    store.subscribe(event => {
        const key = modelKey(store.value), changed = key !== state.geometryKey || event.kind === 'replace';
        if (changed) {
            state.geometryKey = key;
            state.preview = null;
            if (state.busy)
                cancelJob();
            state.metrics = null;
            clearAnalysis();
            rebuild();
        }
        if (!store.value.nodes.some(n => n.id === state.selected))
            state.selected = store.value.root ?? store.value.nodes[0]?.id ?? null;
        renderProject();
        renderNotebook();
        graph.update(store.value, state.selected, graphDiagnostics(store.value));
        if (!state.editing)
            renderInspector();
        renderMetrics();
        if (storageReady)
            $('#autosave-status').textContent = 'Saving locally…';
        saveLocal();
    });
    function renderProject() {
        const d = store.value;
        const display = d.nodes.find(n => n.id === (state.preview ?? d.root));
        if (display)
            $('#view-title').textContent = display.name;
        $('#project-name').textContent = d.name;
        document.title = `${d.name} — ImplicitForge`;
        $('#block-count').textContent = `${d.nodes.length} BLOCKS`;
        $('#graph-count').textContent = `${d.nodes.length} blocks · ${d.nodes.reduce((sum, n) => sum + Object.values(n.inputs).filter(Boolean).length, 0)} links`;
        $('#metric-nodes').textContent = d.nodes.length;
        const size = d.domain.max.map((v, i) => fmt(v - d.domain.min[i], 1));
        $('#domain-summary').innerHTML = `<div><strong>${size.join(' × ')}</strong><br><small>Numerical sampling envelope</small></div>${icon('cube', 23)}`;
        $('[data-action=undo]').disabled = !store.history.length;
        $('[data-action=redo]').disabled = !store.future.length;
        const z = $('#section-z');
        z.min = d.domain.min[2];
        z.max = d.domain.max[2];
        renderer.clipZ = clamp(renderer.clipZ, +z.min, +z.max);
        z.value = renderer.clipZ;
        $('#section-output').textContent = `${fmt(renderer.clipZ, 1)} mm`;
    }
    function renderNotebook() {
        const diagnostics = new Set(graphDiagnostics(store.value).map(d => d.id));
        let nodes = store.value.nodes;
        if (state.notebookMode === 'fields')
            nodes = nodes.filter(n => NODE_TYPES[n.type].output === 'scalar');
        if (state.notebookMode === 'output') {
            try {
                const ids = new Set(topologicalOrder(store.value).map(n => n.id));
                nodes = nodes.filter(n => ids.has(n.id));
            }
            catch {
                nodes = nodes.filter(n => n.id === store.value.root);
            }
        }
        if (state.filter)
            nodes = nodes.filter(n => `${n.name} ${NODE_TYPES[n.type].label}`.toLowerCase().includes(state.filter.toLowerCase()));
        $('#notebook-list').innerHTML = nodes.length ? nodes.map(n => { const def = NODE_TYPES[n.type], index = store.value.nodes.indexOf(n) + 1; return `<div class="notebook-row ${n.id === state.selected ? 'selected' : ''} ${diagnostics.has(n.id) ? 'invalid' : ''}" data-node="${n.id}" data-category="${def.category}" role="option" tabindex="0" aria-selected="${n.id === state.selected}" title="${esc(n.name)}"><span class="notebook-glyph">${icon(categoryIcon(def.category), 17)}</span><div class="notebook-label"><strong>${esc(n.name)}</strong><small>${esc(def.label)}</small></div>${n.id === store.value.root ? '<span class="output-marker">OUT</span>' : `<span class="notebook-index">${String(index).padStart(2, '0')}</span>`}</div>`; }).join('') : '<div class="notebook-empty">No matching blocks.<br>Add a block to extend your notebook.</div>';
        $$('[data-action=notebook-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.notebookMode));
    }
    function selectNode(id) {
        state.selected = id;
        const n = store.value.nodes.find(n => n.id === id);
        if (!n)
            return;
        if (NODE_TYPES[n.type].output === 'scalar')
            state.colorRoot = id;
        else if (n.inputs.thickness || n.inputs.radius)
            state.colorRoot = n.inputs.thickness ?? n.inputs.radius;
        renderNotebook();
        graph.setSelection(id);
        renderInspector();
        if (renderer.mode === 1)
            refreshModel().catch(report);
    }
    function previewNode(id) { const n = store.value.nodes.find(n => n.id === id); if (!n)
        return; if (NODE_TYPES[n.type].output === 'scalar') {
        state.colorRoot = id;
        renderer.mode = 1;
        $('[data-setting=view-mode]').value = '1';
    }
    else
        state.preview = state.preview === id ? null : id; refreshModel().catch(report); renderInspector(); renderMetrics(); }
    function scalarRoot() { if (state.colorRoot && store.value.nodes.some(n => n.id === state.colorRoot && NODE_TYPES[n.type].output === 'scalar'))
        return state.colorRoot; return store.value.nodes.find(n => NODE_TYPES[n.type].output === 'scalar')?.id ?? null; }
    async function refreshModel({ fit = false } = {}) {
        const token = ++state.modelToken, doc = store.value, rootId = state.preview ?? doc.root;
        const field = scalarRoot();
        $('#graph-status').textContent = 'Compiling field graph…';
        try {
            const program = compileDocument(doc, rootId, field);
            state.program = program;
            renderer.setDomain(doc.domain, { fit });
            renderer.material = [...(doc.view?.color ?? [.91, .4, .2]), doc.view?.roughness ?? .32];
            const values = [];
            if (field) {
                const fn = compileCPU(doc, field);
                for (let z = 0; z < 7; z++)
                    for (let y = 0; y < 7; y++)
                        for (let x = 0; x < 7; x++)
                            values.push(fn(...doc.domain.min.map((v, i) => v + (doc.domain.max[i] - v) * [x, y, z][i] / 6)));
            }
            renderer.fieldRange = values.length ? [Math.min(...values), Math.max(...values)] : [0, 1];
            if (renderer.fieldRange[1] - renderer.fieldRange[0] < 1e-7)
                renderer.fieldRange[1] = renderer.fieldRange[0] + 1;
            await renderer.setProgram(program);
            if (token !== state.modelToken)
                return;
            const current = doc.nodes.find(n => n.id === rootId);
            $('#view-title').textContent = current?.name ?? 'Untitled implicit model';
            $('#view-eyebrow').textContent = state.preview ? 'SELECTED BLOCK / ISOLATED PREVIEW' : 'IMPLICIT BODY / LIVE PREVIEW';
            $('#view-subtitle').textContent = state.preview ? 'Preview only · double-click block to return to output' : 'Millimetres · continuous field representation';
            $('#view-error').hidden = true;
            state.lastError = null;
            $('#viewport-empty').hidden = !!doc.root;
            const inactive = graphDiagnostics(doc).length;
            $('#graph-status').textContent = `${program.nodeCount} compiled blocks${inactive ? ` · ${inactive} incomplete` : ' · graph valid'}`;
            $('#quality-badge').hidden = renderer.backend !== 'CPU raster';
            $('#quality-badge').textContent = 'SOFTWARE PREVIEW · SAMPLED SURFACE';
            renderLegend();
        }
        catch (e) {
            if (e.name === 'AbortError')
                return;
            state.lastError = e.message;
            $('#graph-status').textContent = 'Output requires attention';
            $('#view-error').hidden = false;
            $('#view-error').textContent = `${e.message} The viewport retains the last valid model.`;
        }
    }
    function renderMetrics() { const m = state.preview ? null : state.metrics; $('#metric-volume').innerHTML = `${m ? fmt(m.volume / 1000, 2) : '—'} <small>cm³</small>`; $('#metric-mass').innerHTML = `${m ? fmt(m.mass, 2) : '—'} <small>g</small>`; $('.view-metrics').title = m ? `Occupancy integration at ${m.resolution}³ nodes, spacing ${m.spacing.map(x => fmt(x, 2)).join(' × ')} mm. Approximate, resolution-dependent.` : 'Evaluate the output body to calculate approximate volume and mass.'; }
    function renderLegend() { const mode = renderer.mode, field = store.value.nodes.find(n => n.id === scalarRoot()), analysis = state.analysis; $('#field-legend').hidden = !(mode === 1 || (mode === 3 && analysis)); $('#legend-title').textContent = mode === 3 ? `${analysis?.label ?? 'Analysis'} · ${analysis?.unit ?? ''}` : field?.name ?? 'Height field'; const range = mode === 3 ? [analysis?.minValue ?? 0, analysis?.maxValue ?? 1] : renderer.fieldRange; $('#legend-min').textContent = fmt(range[0], 2); $('#legend-max').textContent = fmt(range[1], 2); }
    function numberControl(label, key, value, { min = -1000, max = 1000, step = .1, unit = '', prefix = 'setting' } = {}) { return `<div class="control"><label for="${prefix}-${key}">${esc(label)}<span class="unit">${esc(unit)}</span></label><input id="${prefix}-${key}" data-${prefix}="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></div>`; }
    function parameterControl(n, key, spec) {
        if (spec.hidden)
            return '';
        const value = n.params[key], driven = n.inputs[key] && NODE_TYPES[n.type].inputs[key]?.type === 'scalar';
        const label = `<label>${esc(spec.label)}${driven ? '<span class="driven-note">↗ FIELD-DRIVEN</span>' : `<span class="unit">${esc(spec.unit ?? '')}</span>`}</label>`;
        if (spec.vector)
            return `<div class="control">${label}<div class="vector-control">${value.map((v, i) => `<label class="vector-value"><span>${['X', 'Y', 'Z'][i]}</span><input aria-label="${esc(spec.label)} ${['X', 'Y', 'Z'][i]}" type="number" data-param="${key}" data-index="${i}" value="${v}" step="${spec.step ?? .1}"></label>`).join('')}</div></div>`;
        const max = key === 'cell' ? 50 : key === 'thickness' || key === 'radius' && NODE_TYPES[n.type].category === 'Lattices' ? 5 : spec.max;
        return `<div class="control">${label}<div class="number-and-slider"><input type="range" aria-label="${esc(spec.label)} slider" data-param="${key}" value="${value}" min="${spec.min}" max="${Math.max(max, value)}" step="${spec.step}" ${driven ? 'disabled' : ''}><input type="number" aria-label="${esc(spec.label)}" data-param="${key}" value="${value}" min="${spec.min}" max="${spec.max}" step="${spec.step}" ${driven ? 'disabled' : ''}></div></div>`;
    }
    function materialHTML() { const material = store.value.material ?? MATERIALS.aluminium; const selected = Object.entries(MATERIALS).find(([, m]) => m.name === material.name)?.[0] ?? 'aluminium'; const color = store.value.view?.color ?? [.91, .4, .2], hex = '#' + color.map(x => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); return `<div class="inspector-section"><div class="caption">Display & material</div><div class="material-row"><select id="material-select" aria-label="Engineering material">${Object.entries(MATERIALS).map(([k, m]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><input id="material-color" aria-label="Body display color" type="color" value="${hex}"></div><dl class="property-list"><dt>Density</dt><dd>${fmt(material.density, 3)} g/cm³</dd><dt>Young’s modulus</dt><dd>${fmt(material.E / 1000, 1)} GPa</dd></dl><p class="control-note">Illustrative material defaults. Replace analysis inputs with your material’s qualified properties.</p></div>`; }
    function renderInspector() {
        const content = $('#inspector-content');
        $$('[data-action=inspector-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.inspectorTab));
        if (state.inspectorTab === 'analysis') {
            renderAnalysis();
            return;
        }
        const n = store.value.nodes.find(n => n.id === state.selected);
        if (!n) {
            content.innerHTML = `<div class="analysis-lead"><h3>Start with an implicit body.</h3><p>Choose a primitive, connect a lattice, and drive its parameters with scalar fields.</p></div>${B('library', 'Add a block', 'plus', '', 'primary full')}${materialHTML()}`;
            return;
        }
        const def = NODE_TYPES[n.type], excluded = downstream(store.value, n.id);
        let ports = '';
        for (const [key, port] of Object.entries(def.inputs)) {
            const candidates = store.value.nodes.filter(other => !excluded.has(other.id) && NODE_TYPES[other.type].output === port.type);
            ports += `<div class="control"><label>${esc(port.label)}<span class="unit">${port.required ? 'required' : port.type === 'scalar' ? 'optional field' : 'optional'}</span></label><div class="input-link"><i class="port-dot ${port.type} ${n.inputs[key] ? 'connected' : ''}"></i><select class="full" aria-label="${esc(port.label)} connection" data-connect="${key}"><option value="">${port.required ? 'Select a block…' : 'Use numeric value'}</option>${candidates.map(c => `<option value="${c.id}" ${n.inputs[key] === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>`;
        }
        const parameters = Object.entries(def.params).map(([key, spec]) => parameterControl(n, key, spec)).join('');
        content.innerHTML = `<div class="inspector-identity"><div class="identity-row"><span class="identity-glyph">${icon(categoryIcon(def.category), 19)}</span><div style="min-width:0;flex:1"><input class="inspector-title" aria-label="Block name" id="block-name" value="${esc(n.name)}"><div class="identity-subtitle">${esc(def.label)} · ${def.category}</div></div></div><div class="identity-actions"><span class="badge ${def.output}">${def.output === 'body' ? 'IMPLICIT BODY' : 'SCALAR FIELD'}</span>${B('preview', 'Preview', 'eye', '', 'subtle')}${IB('duplicate', 'Duplicate block (Ctrl/⌘ D)', 'copy')}</div></div>
  ${parameters ? `<div class="inspector-section"><div class="caption">Parameters <span class="mono">${def.output === 'body' ? 'mm' : 'ƒ(x,y,z)'}</span></div>${parameters}</div>` : ''}
  ${ports ? `<div class="inspector-section"><div class="caption">Inputs & field bindings</div>${ports}</div>` : ''}
  ${def.output === 'scalar' ? `<div class="inspector-section"><div class="caption">Field section · through domain centre</div><svg id="field-curve" class="field-curve" viewBox="0 0 240 65" preserveAspectRatio="none"></svg>${B('shade-field', 'Visualize field on output', 'field', '', 'subtle full')}</div>` : ''}
  <p class="inspector-description">${esc(def.description)}</p>${['gyroid', 'schwarz', 'diamond', 'neovius'].includes(n.type) ? '<div class="inline-warning">Wall isobands use normalized nodal fields. Their values are not a guarantee of physical wall thickness. Resolve and measure thin features before manufacturing.</div>' : ''}
  ${n.type === 'volume' ? `<dl class="property-list"><dt>Sampled volume</dt><dd>${store.value.assets[n.params.asset]?.n}³ nodes</dd><dt>Representation</dt><dd>Trilinear implicit field</dd></dl>` : ''}
  ${materialHTML()}<div class="parameter-footer">${def.output === 'body' ? B('output', n.id === store.value.root ? 'Output body' : 'Set as output', 'check', '', n.id === store.value.root ? 'active' : '') : ''}${B('source', 'Kernel source', 'code', '', 'subtle')}${IB('delete', 'Delete block', 'trash')}</div>`;
        if (def.output === 'scalar') {
            try {
                const sample = compileCPU(store.value, n.id), domain = store.value.domain, mid = domain.min.map((v, i) => (v + domain.max[i]) * .5), points = Array.from({ length: 50 }, (_, i) => sample(mid[0], mid[1], domain.min[2] + (domain.max[2] - domain.min[2]) * i / 49));
                const low = Math.min(...points), high = Math.max(...points), range = high - low || 1;
                $('#field-curve').innerHTML = `<path d="M0 53H240M0 31H240M0 9H240" stroke="var(--border)" stroke-width=".6"/><path d="${points.map((v, i) => `${i ? 'L' : 'M'}${i * 240 / 49},${53 - (v - low) / range * 42}`).join(' ')}" fill="none" stroke="var(--field)" stroke-width="1.8"/>`;
            }
            catch { /* An unbound field is shown by the notebook diagnostics. */ }
        }
    }
    function resultProperties(entries) { return `<dl class="property-list">${entries.map(([name, value, css = '']) => `<dt>${esc(name)}</dt><dd class="${css}">${esc(value)}</dd>`).join('')}</dl>`; }
    function renderAnalysis() {
        const mode = state.analysisMode, opts = state.settings[mode];
        let form = '', results = '';
        if (mode === 'metrics') {
            form = numberControl('Sampling resolution', 'resolution', opts.resolution, { min: 16, max: 192, step: 8, unit: 'nodes / axis' }) + '<p class="control-note">Volume integrates sampled occupancy. Mesh inspection additionally checks edge incidence, enclosed volume and surface area.</p>' + B('run-analysis', 'Evaluate volume & mass', 'play', '', 'primary full') + B('inspect-mesh', 'Inspect export mesh', 'grid', '', 'subtle full');
            if (state.metrics) {
                const m = state.metrics;
                results = `<h3>Output measurements</h3>${resultProperties([['Volume', `${fmt(m.volume / 1000, 3)} cm³`], ['Mass', `${fmt(m.mass, 3)} g`], ['Domain fill', `${fmt(m.relativeDensity * 100, 1)}%`], ['Samples', `${m.resolution}³`], ['Voxel spacing', `${fmt(Math.max(...m.spacing), 3)} mm`], ['Domain clipped', m.domainClipped ? 'Yes — enlarge domain' : 'No', m.domainClipped ? 'bad' : 'good']])}`;
            }
            if (state.meshResult) {
                const m = state.meshResult.metrics;
                results += `<h3 style="margin-top:16px">Indexed mesh inspection</h3>${resultProperties([['Triangles', fmt(m.triangles, 0)], ['Vertices', fmt(m.vertices, 0)], ['Surface area', `${fmt(m.area, 1)} mm²`], ['Enclosed volume', `${fmt(m.volume / 1000, 3)} cm³`], ['Boundary edges', fmt(m.boundaryEdges, 0)], ['Non-manifold edges', fmt(m.nonManifoldEdges, 0)], ['Closed edge manifold', m.watertight ? 'Yes' : 'No', m.watertight ? 'good' : 'bad']])}<p class="control-note">Edge incidence alone does not establish printability, feature resolution, or absence of self-intersections.</p>`;
            }
        }
        else if (mode === 'thermal') {
            form = numberControl('Voxel resolution', 'resolution', opts.resolution, { min: 12, max: 80, step: 4, unit: 'nodes / axis' }) + `<div class="form-grid">${numberControl('Hot X face', 'hot', opts.hot, { min: -273, max: 3000, step: 1, unit: '°C' })}${numberControl('Cold X face', 'cold', opts.cold, { min: -273, max: 3000, step: 1, unit: '°C' })}</div>` + numberControl('Conductivity', 'conductivity', opts.conductivity, { min: .001, max: 5000, step: 1, unit: 'W/(m·K)' }) + numberControl('Surface convection', 'convection', opts.convection, { min: 0, max: 5000, step: 1, unit: 'W/(m²·K)' }) + `<div class="form-grid">${numberControl('Ambient', 'ambient', opts.ambient, { min: -273, max: 3000, step: 1, unit: '°C' })}${numberControl('Iteration limit', 'maxIterations', opts.maxIterations, { min: 20, max: 20000, step: 100 })}</div>` + numberControl('Residual tolerance', 'tolerance', opts.tolerance, { min: 1e-7, max: 1, step: .001, unit: '°C' }) + numberControl('Heat generation', 'heatSource', opts.heatSource, { min: 0, max: 1e10, step: 10000, unit: 'W/m³' }) + '<div class="inline-warning">Steady-state voxel conduction. Occupied minimum/maximum X planes are held at the specified temperatures; exposed voxel faces exchange heat with ambient air. No fluid flow or radiation model.</div>' + B('run-analysis', 'Solve heat conduction', 'thermometer', '', 'primary full');
            if (state.analysis?.kind === 'thermal') {
                const a = state.analysis;
                results = `<div class="result-banner ${a.converged ? '' : 'warning'}">${a.converged ? 'Converged' : 'Iteration limit reached'} · ${a.iterations} iterations</div>${resultProperties([['Temperature range', `${fmt(a.minValue, 1)}–${fmt(a.maxValue, 1)} °C`], ['Fixed-point residual', `${fmt(a.residual, 5)} °C`], ['Hot boundary power', `${fmt(a.hotPower, 3)} W`], ['Cold boundary power', `${fmt(a.coldPower, 3)} W`], ['Convective loss', `${fmt(a.convectivePower, 3)} W`], ['Energy imbalance', `${fmt(a.energyImbalance, 4)} W`], ['Backend', a.backend]])}${B('show-analysis', 'Show temperature field', 'field', '', 'subtle full')}${B('analysis-csv', 'Export sampled field CSV', 'download', '', 'subtle full')}`;
            }
        }
        else if (mode === 'elasticity') {
            form = numberControl('Voxel element resolution', 'resolution', opts.resolution, { min: 4, max: 24, step: 1, unit: 'elements / axis' }) + numberControl('Young’s modulus', 'E', opts.E, { min: .01, max: 1e7, step: 1000, unit: 'MPa' }) + numberControl('Poisson ratio', 'nu', opts.nu, { min: -.9, max: .49, step: .01, unit: '' }) + numberControl('Total Z load', 'force', opts.force, { min: -1e7, max: 1e7, step: 10, unit: 'N' }) + '<div class="inline-warning">Linear isotropic Hex8 FEM. Minimum-X nodes are fixed in XYZ; the total load is distributed across maximum-X nodes. Coarse voxelization may remove thin members. This is not a validated stress-certification tool.</div>' + B('run-analysis', 'Solve linear elasticity', 'bolt', '', 'primary full');
            if (state.analysis?.kind === 'elasticity') {
                const a = state.analysis;
                results = `<div class="result-banner ${a.converged ? '' : 'warning'}">${a.converged ? 'PCG converged' : 'PCG did not converge'}</div>${resultProperties([['Maximum displacement', `${fmt(a.maxDisplacement, 5)} mm`], ['Maximum von Mises', `${fmt(a.maxStress, 3)} MPa`], ['Compliance', `${fmt(a.compliance, 5)} N·mm`], ['Strain energy', `${fmt(a.strainEnergy, 5)} N·mm`], ['Hex8 elements', fmt(a.elements, 0)], ['Degrees of freedom', fmt(a.degreesOfFreedom, 0)], ['Relative residual', a.relativeResidual.toExponential(2)], ['Linear iterations', String(a.iterations)]])}${B('show-analysis', 'Show von Mises field', 'field', '', 'subtle full')}${B('analysis-csv', 'Export stress field CSV', 'download', '', 'subtle full')}`;
            }
        }
        else if (mode === 'topology') {
            form = numberControl('Design voxel resolution', 'resolution', opts.resolution, { min: 4, max: 18, step: 1, unit: 'elements / axis' }) + numberControl('Target material fraction', 'volumeFraction', opts.volumeFraction, { min: .1, max: .9, step: .05, unit: '0–1' }) + numberControl('Optimization iterations', 'iterations', opts.iterations, { min: 1, max: 80, step: 1 }) + numberControl('Total Z load', 'force', opts.force, { min: -1e7, max: 1e7, step: 10, unit: 'N' }) + '<div class="inline-warning">SIMP compliance minimization with a sensitivity filter and an optimality-criteria volume update. Use a connected solid design domain, such as the Cantilever example. The thresholded result must be revalidated.</div>' + B('run-analysis', 'Optimize material layout', 'chart', '', 'primary full');
            if (state.topology) {
                const a = state.topology;
                results = `<div class="result-banner">${a.iterations} optimization iterations complete</div>${resultProperties([['Final density fraction', `${fmt(a.volumeFraction * 100, 1)}%`], ['Last solved compliance', `${fmt(a.history.at(-1).compliance, 3)} N·mm`]])}<p class="control-note">${esc(a.note)}</p>${B('apply-topology', 'Add optimized implicit body', 'plus', '', 'primary full')}${B('topology-csv', 'Export optimization history', 'download', '', 'subtle full')}`;
            }
        }
        else {
            const candidates = store.value.nodes.filter(n => Object.values(NODE_TYPES[n.type].params).some(p => !p.vector && !p.hidden));
            const chosen = candidates.find(n => n.id === opts.nodeId) ?? candidates.find(n => n.id === state.selected) ?? candidates[0];
            const params = chosen ? Object.entries(NODE_TYPES[chosen.type].params).filter(([, p]) => !p.vector && !p.hidden) : [];
            const selectedParameter = params.some(([k]) => k === opts.parameter) ? opts.parameter : params[0]?.[0];
            form = `<div class="control"><label>Design block</label><select id="sweep-node" class="full">${candidates.map(n => `<option value="${n.id}" ${chosen?.id === n.id ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></div><div class="control"><label>Parameter</label><select id="sweep-parameter" class="full">${params.map(([k, p]) => `<option value="${k}" ${selectedParameter === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div><div class="form-grid">${numberControl('Start', 'min', opts.min, { step: .1 })}${numberControl('End', 'max', opts.max, { step: .1 })}${numberControl('Designs', 'steps', opts.steps, { min: 2, max: 30, step: 1 })}${numberControl('Sample grid', 'resolution', opts.resolution, { min: 12, max: 80, step: 4 })}</div>${B('run-analysis', 'Run parameter study', 'chart', '', 'primary full')}`;
            if (state.sweep) {
                results = `<h3>Design study · approximate volume</h3><svg id="sweep-chart" class="sweep-chart" viewBox="0 0 240 110"></svg><table class="result-table"><thead><tr><th>Parameter</th><th>Volume cm³</th><th>Mass g</th></tr></thead><tbody>${state.sweep.map(r => `<tr><td>${fmt(r.value, 2)}</td><td>${fmt(r.volume / 1000, 3)}</td><td>${fmt(r.mass, 3)}</td></tr>`).join('')}</tbody></table>${B('sweep-csv', 'Export study CSV', 'download', '', 'subtle full')}`;
            }
        }
        $('#inspector-content').innerHTML = `<div class="analysis-lead"><h3>Engineering workspace</h3><p>Evaluate geometry, solve numerical models, and explore your design space.</p></div><select class="analysis-mode-select" id="analysis-mode" aria-label="Analysis type">${[['metrics', 'Volume & mesh inspection'], ['thermal', 'Steady-state heat conduction'], ['elasticity', 'Linear elasticity · Hex8 FEM'], ['topology', 'Topology optimization · SIMP'], ['sweep', 'Parametric design study']].map(([k, label]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${label}</option>`).join('')}</select><div class="analysis-form">${form}</div>${results ? `<div class="analysis-results">${results}</div>` : ''}<div class="parameter-footer">${B('source', 'Kernel source', 'code', '', 'subtle')}</div>`;
        if (state.sweep && mode === 'sweep') {
            const data = state.sweep, lo = Math.min(...data.map(r => r.volume)), hi = Math.max(...data.map(r => r.volume)), dy = hi - lo || 1;
            $('#sweep-chart').innerHTML = `<path d="M20 15V90H225" stroke="var(--border)" fill="none"/><path d="${data.map((r, i) => `${i ? 'L' : 'M'}${20 + i * 205 / (data.length - 1)} ${88 - (r.volume - lo) / dy * 67}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>${data.map((r, i) => `<circle cx="${20 + i * 205 / (data.length - 1)}" cy="${88 - (r.volume - lo) / dy * 67}" r="2.5" fill="var(--accent)"/>`).join('')}`;
        }
    }
    function readSettings() { const mode = state.analysisMode, opts = { ...state.settings[mode] }; $$('[data-setting]').forEach(input => { if (input.closest('.analysis-form'))
        opts[input.dataset.setting] = +input.value; }); if (mode === 'sweep') {
        opts.nodeId = $('#sweep-node')?.value;
        opts.parameter = $('#sweep-parameter')?.value;
    } state.settings[mode] = opts; return opts; }
    async function runJob(type, payload, handler) {
        const token = ++state.jobToken, key = modelKey(store.value);
        state.busy = true;
        $('#job-bar').hidden = false;
        $('#job-title').textContent = 'Preparing computation';
        $('#job-progress').style.width = '0%';
        $('#job-details').textContent = 'Worker job · editing the model cancels this computation';
        try {
            const result = await worker.run(type, { doc: clone(store.value), preferGPU: renderer.backend === 'WebGPU', ...payload }, p => { if (token !== state.jobToken)
                return; $('#job-title').textContent = p.stage; $('#job-progress').style.width = `${Math.round(clamp(p.fraction ?? 0, 0, 1) * 100)}%`; $('#job-details').textContent = p.relativeResidual !== undefined ? `PCG ${p.iterations} · relative residual ${p.relativeResidual.toExponential(2)}` : p.residual !== undefined ? `Iteration ${p.iterations} · residual ${fmt(p.residual, 5)}` : p.compliance !== undefined ? `Iteration ${p.iteration} · compliance ${fmt(p.compliance, 3)} N·mm` : p.notice ?? `${Math.round(clamp(p.fraction ?? 0, 0, 1) * 100)}% complete`; });
            if (token !== state.jobToken || key !== modelKey(store.value))
                return null;
            state.busy = false;
            $('#job-bar').hidden = true;
            handler?.(result);
            return result;
        }
        catch (e) {
            if (token === state.jobToken) {
                state.busy = false;
                $('#job-bar').hidden = true;
            }
            if (e.name !== 'AbortError')
                report(e);
            return null;
        }
    }
    function cancelJob() { state.jobToken++; worker.cancel(); state.busy = false; $('#job-bar').hidden = true; }
    async function evaluate(resolution = state.settings.metrics.resolution) { if (!store.value.root) {
        toast.show('Add an output body before evaluating.');
        return;
    } await runJob('evaluate', { resolution }, r => { state.metrics = r.metrics; renderMetrics(); if (state.inspectorTab === 'analysis')
        renderAnalysis(); toast.show(`Evaluated ${resolution}³ samples · ${fmt(r.metrics.volume / 1000, 2)} cm³ · ${r.backend}`, 'success', 3500); }); }
    async function runAnalysis() {
        const mode = state.analysisMode, o = readSettings();
        if (!store.value.root) {
            toast.show('Choose an output body first.');
            return;
        }
        if (mode === 'metrics') {
            await evaluate(o.resolution);
            return;
        }
        if (mode === 'sweep') {
            if (!o.nodeId || !o.parameter || o.steps < 2 || o.steps > 30 || o.min >= o.max)
                throw new Error('Choose a numeric parameter, 2–30 designs, and an increasing range.');
            await runJob('sweep', o, r => { state.sweep = r; renderAnalysis(); toast.show('Parameter study complete. The notebook was not modified.', 'success'); });
            return;
        }
        if (mode === 'topology') {
            await runJob('topology', { options: { ...o, load: [0, 0, o.force] } }, r => { state.topology = r; renderAnalysis(); toast.show('Topology optimization complete. Review and add the result as a new body.', 'success', 7000); });
            return;
        }
        await runJob(mode, { resolution: o.resolution, options: { ...o, load: [0, 0, o.force] } }, r => { state.analysis = r; renderer.setAnalysis(r); renderer.mode = 3; $('[data-setting=view-mode] option[value="3"]').disabled = false; $('[data-setting=view-mode]').value = '3'; renderLegend(); renderAnalysis(); toast.show(r.converged ? `${r.label} solve converged.` : `${r.label} solve reached its iteration limit; inspect residuals.`, r.converged ? 'success' : 'info', 6000); });
    }
    async function inspectMesh(resolution = state.settings.metrics.resolution) { await runJob('mesh', { resolution }, r => { state.meshResult = r; state.metrics = r.gridMetrics; renderMetrics(); renderInspector(); toast.show(`${fmt(r.metrics.triangles, 0)} triangles · ${r.metrics.watertight ? 'closed edge manifold' : 'mesh requires attention'}`, r.metrics.watertight ? 'success' : 'info'); }); }
    function openLibrary() {
        let category = 'All';
        const d = dialogs.open('Add a block', '', { wide: true, subtitle: 'Compose implicit bodies, connect fields, and build reusable design logic.' });
        function render(filter = '') {
            const categories = ['All', 'Primitives', 'Operations', 'Transforms', 'Lattices', 'Fields'];
            d.querySelector('.dialog-body').innerHTML = `<label class="dialog-search">${icon('search', 17)}<input id="library-search" placeholder="Search blocks, fields, operations…" aria-label="Search block library" value="${esc(filter)}"></label><div class="category-filters">${categories.map(c => `<button data-category="${c}" class="${c === category ? 'active' : ''}">${c}</button>`).join('')}</div><div class="library-grid">${Object.entries(NODE_TYPES).filter(([type, def]) => type !== 'volume' && (category === 'All' || category === def.category) && `${def.label} ${def.description}`.toLowerCase().includes(filter.toLowerCase())).map(([type, def]) => `<button class="library-card" data-add="${type}">${icon(categoryIcon(def.category), 20)}<div><strong>${esc(def.label)}</strong><small>${esc(def.category)} · ${def.output === 'body' ? 'implicit body' : 'scalar field'}</small></div></button>`).join('')}</div>`;
            const search = d.querySelector('#library-search');
            search.addEventListener('input', () => { const value = search.value, pos = search.selectionStart; render(value); const next = d.querySelector('#library-search'); next.focus(); next.setSelectionRange(pos, pos); });
            d.querySelectorAll('[data-category]').forEach(b => b.onclick = () => { category = b.dataset.category; render(search.value); });
            d.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { addBlock(b.dataset.add); dialogs.close(); });
        }
        render();
        d.querySelector('#library-search').focus();
    }
    function addBlock(type) {
        const def = NODE_TYPES[type], selected = store.value.nodes.find(n => n.id === state.selected), n = createNode(type);
        n.position = selected ? { x: selected.position.x + 245, y: selected.position.y + 25 } : { x: 35, y: 35 };
        const first = Object.entries(def.inputs).find(([, p]) => p.required);
        if (first && selected && first[1].type === NODE_TYPES[selected.type].output)
            n.inputs[first[0]] = selected.id;
        state.selected = n.id;
        edit(`Add ${def.label}`, doc => { doc.nodes.push(n); if (!doc.root && def.output === 'body')
            doc.root = n.id; });
        graph.focus(n.id);
        toast.show(`${def.label} added${first && !n.inputs[first[0]] ? ' — connect its required inputs.' : '.'}`);
    }
    function loadExample(example) { const load = () => { cancelJob(); state.preview = null; state.colorRoot = null; const doc = example.make(); state.selected = doc.nodes.find(n => NODE_TYPES[n.type].category === 'Lattices')?.id ?? doc.root; state.settings.thermal.conductivity = doc.material.conductivity; state.settings.elasticity.E = doc.material.E; state.settings.topology.E = doc.material.E; store.replace(doc); renderer.clip = false; $('#section-control').hidden = true; $('[data-action=section]').classList.remove('active'); renderer.camera.orient('iso'); refreshModel({ fit: true }).catch(report); graph.focus(state.selected); dialogs.close(); toast.show(`Opened ${example.name}.`, 'success', 3000); }; if (store.history.length > 0)
        dialogs.confirm('Replace this notebook?', 'The current notebook is saved only in this browser unless you exported a project file. Opening another example replaces the local autosave.', load);
    else
        load(); }
    function openExamples() { const d = dialogs.open('Your next field of possibilities', `<div class="examples-grid">${EXAMPLES.map((e, i) => `<button class="example-card" data-example="${e.id}">${icon(['grid', 'field', 'boolean', 'sphere', 'graph', 'chart', 'transform', 'plus'][i], 28)}<div><small>${e.category}</small><strong>${e.name}</strong><p>${e.description}</p></div></button>`).join('')}</div><div class="dialog-actions">${B('open', 'Open project or mesh…', 'folder', '', 'subtle')}</div>`, { wide: true, subtitle: 'Every example is a fully editable notebook built with the same modeling packages.' }); d.querySelectorAll('[data-example]').forEach(b => b.onclick = () => loadExample(EXAMPLES.find(e => e.id === b.dataset.example))); d.querySelector('[data-action=open]').onclick = () => { dialogs.close(); document.getElementById('open-file').click(); }; }
    function saveProject() { const name = store.value.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'ImplicitForge'; downloadFile(serializeProject(store.value), `${name}.iforge`, 'application/json'); toast.show('Project file saved. Includes the graph, parameters, materials, domain and imported fields.', 'success', 5000); }
    function openExport() {
        if (!store.value.root) {
            toast.show('Choose an output body to export.');
            return;
        }
        let format = 'stl';
        const d = dialogs.open('Export implicit body', `<div class="caption">Manufacturing mesh</div><div class="export-options">${[['stl', 'Binary mesh'], ['obj', 'Indexed normals'], ['ply', 'Binary geometry'], ['3mf', 'Millimetre units']].map(([f, label]) => `<button data-format="${f}" class="${f === format ? 'active' : ''}">${f.toUpperCase()}<small>${label}</small></button>`).join('')}</div><div class="control"><label for="export-resolution">Sampling resolution<span class="unit">nodes per axis</span></label><select id="export-resolution" class="full"><option value="64">64³ · draft</option><option value="96" selected>96³ · standard</option><option value="128">128³ · fine</option><option value="160">160³ · extra fine</option><option value="192">192³ · maximum</option></select><p id="export-spacing" class="control-note"></p></div><div class="inline-warning">The export is extracted from the actual output field, not the display surface. Fine lattice walls require multiple samples across their thickness. The viewport’s section plane does not alter mesh exports.</div><div class="dialog-actions">${B('save', 'Save project instead', 'save', '', 'subtle')}<button class="primary" id="export-now">${icon('download', 16)}Generate & export</button></div>`, { subtitle: 'Welded indexed isosurface · outward-oriented triangles · millimetres' });
        const spacing = () => { const n = +d.querySelector('#export-resolution').value, h = store.value.domain.max.map((v, i) => (v - store.value.domain.min[i]) / (n - 1)); d.querySelector('#export-spacing').textContent = `Grid pitch ${h.map(v => fmt(v, 3)).join(' × ')} mm · ${fmt(n ** 3, 0)} field samples.`; };
        spacing();
        d.querySelector('#export-resolution').onchange = spacing;
        d.querySelectorAll('[data-format]').forEach(b => b.onclick = () => { format = b.dataset.format; d.querySelectorAll('[data-format]').forEach(x => x.classList.toggle('active', x === b)); });
        d.querySelector('[data-action=save]').onclick = saveProject;
        d.querySelector('#export-now').onclick = async () => { const resolution = +d.querySelector('#export-resolution').value; dialogs.close(); await runJob('mesh', { resolution }, r => { if (!r.mesh.indices.length)
            throw new Error('The sampled output is empty. Increase resolution or check the output body.'); state.meshResult = r; state.metrics = r.gridMetrics; const exporter = { stl: exportSTL, obj: exportOBJ, ply: exportPLY, '3mf': m => export3MF(m, store.value.name) }[format], file = store.value.name.replace(/[^a-z0-9_-]+/gi, '-'); downloadFile(exporter(r.mesh), `${file}.${format}`); renderMetrics(); if (state.inspectorTab === 'analysis')
            renderAnalysis(); toast.show(`${format.toUpperCase()} exported · ${fmt(r.metrics.triangles, 0)} triangles${r.metrics.watertight ? ' · closed edge manifold' : ` · WARNING: ${r.metrics.boundaryEdges} boundary edges`}`, r.metrics.watertight ? 'success' : 'info', 7000); }); };
    }
    function editDomain() {
        const doc = store.value;
        const d = dialogs.open('Project & sampling domain', `<div class="control"><label for="project-rename">Project name</label><input id="project-rename" class="full" value="${esc(doc.name)}" maxlength="300"></div><div class="control"><label>Minimum corner <span class="unit">mm</span></label><div class="vector-control">${doc.domain.min.map((v, i) => `<label class="vector-value"><span>${['X', 'Y', 'Z'][i]}</span><input aria-label="Minimum ${['X', 'Y', 'Z'][i]}" data-bound="min" data-axis="${i}" type="number" value="${v}" step="1"></label>`).join('')}</div></div><div class="control"><label>Maximum corner <span class="unit">mm</span></label><div class="vector-control">${doc.domain.max.map((v, i) => `<label class="vector-value"><span>${['X', 'Y', 'Z'][i]}</span><input aria-label="Maximum ${['X', 'Y', 'Z'][i]}" data-bound="max" data-axis="${i}" type="number" value="${v}" step="1"></label>`).join('')}</div></div><p class="control-note">The sampling envelope bounds rendering and numerical calculations. Keep the output surface inside it, with positive field values at the boundary, for a closed exported mesh.</p><div class="dialog-actions"><button id="pad-domain">Expand 10%</button><button class="primary" id="apply-domain">Apply domain</button></div>`);
        d.querySelector('#pad-domain').onclick = () => { for (let i = 0; i < 3; i++) {
            const lo = d.querySelector(`[data-bound=min][data-axis="${i}"]`), hi = d.querySelector(`[data-bound=max][data-axis="${i}"]`), pad = (+hi.value - +lo.value) * .05;
            lo.value = +lo.value - pad;
            hi.value = +hi.value + pad;
        } };
        d.querySelector('#apply-domain').onclick = () => { const domain = { min: [], max: [] }; d.querySelectorAll('[data-bound]').forEach(input => domain[input.dataset.bound][+input.dataset.axis] = +input.value); if (edit('Edit project domain', p => { p.domain = domain; p.name = d.querySelector('#project-rename').value.trim() || 'Untitled'; })) {
            dialogs.close();
            refreshModel({ fit: true }).catch(report);
        } };
    }
    function sourceDialog() { if (!state.program) {
        toast.show('Compile a valid output graph first.');
        return;
    } const program = state.program; const d = dialogs.open('Generated modeling kernel', `<div class="row"><span class="badge">${program.nodeCount} blocks</span><span class="badge">${program.parameterCount} buffer parameters</span><span class="spacer"></span><button id="shader-wgsl" class="active">WGSL</button><button id="shader-glsl">GLSL</button></div><pre class="code-block" id="shader-source"></pre><div class="dialog-actions"><button id="shader-download">${icon('download', 15)}Save shader source</button></div>`, { wide: true, subtitle: 'Generated from the typed graph. Numeric parameters live in storage/uniform buffers.' }); let language = 'wgsl'; const update = () => { d.querySelector('#shader-source').textContent = program[language]; d.querySelector('#shader-wgsl').classList.toggle('active', language === 'wgsl'); d.querySelector('#shader-glsl').classList.toggle('active', language === 'glsl'); }; update(); d.querySelector('#shader-wgsl').onclick = () => { language = 'wgsl'; update(); }; d.querySelector('#shader-glsl').onclick = () => { language = 'glsl'; update(); }; d.querySelector('#shader-download').onclick = () => downloadFile(program[language], `implicitforge-field.${language}`, 'text/plain'); }
    function help() { dialogs.open('ImplicitForge / workbench guide', `<div class="help-grid"><section><h3>Build a computational model</h3><p>Create an implicit design domain, add a lattice, then connect a scalar field to its thickness or radius input. Select any block to edit its parameters. Connections are typed; cycles are rejected.</p><p style="margin-top:12px">The output body is marked <strong>OUT</strong>. Double-click a graph block to preview it without changing the document output. Use <strong>Set as output</strong> to change what is evaluated and exported.</p></section><section><h3>Keyboard & navigation</h3><dl><dt>Command palette</dt><dd>⌘ / Ctrl K</dd><dt>Save project / open</dt><dd>⌘ / Ctrl S / O</dd><dt>Undo / redo</dt><dd>⌘ Z / ⌘ ⇧ Z</dd><dt>Add a block</dt><dd>B</dd><dt>Duplicate selected</dt><dd>⌘ / Ctrl D</dd><dt>Fit / section / graph</dt><dd>F / C / G</dd><dt>Orbit / pan</dt><dd>drag / ⇧ drag</dd><dt>Zoom</dt><dd>scroll / pinch</dd></dl></section><section><h3>Numerical analysis</h3><p>Volume is resolution-dependent occupancy integration. Thermal analysis solves steady voxel conduction. Structural analysis uses fully integrated linear Hex8 elements and a matrix-free PCG solver. SIMP topology optimization minimizes cantilever compliance at a target density fraction.</p></section><section><h3>Files & recovery</h3><p>Save a <strong>.iforge</strong> project to preserve the graph and all imported field assets. Autosave stays in this browser. Import closed, manifold STL or OBJ meshes. Export welded STL, OBJ, PLY and 3MF meshes, section SVGs, numerical CSVs, and viewport PNGs.</p></section><section class="help-boundary"><h3>Numerical and product boundaries</h3><p>This is an independent implementation, not nTop and not compatible with its proprietary notebook format or kernel. TPMS nodal fields are not exact signed-distance surfaces. Sampling can miss thin members; topology thresholds can change connectivity. The thermal and elasticity solvers are educational/prototyping implementations and require independent validation and mesh-convergence studies for engineering use. There is no B-rep/STEP kernel, nonlinear/contact/multiphysics solver, fatigue solver, cloud collaboration, or nTop file importer.</p></section></div>`, { wide: true, subtitle: 'Implicit modeling · field-driven design · reusable browser-native kernels' }); }
    function commandPalette() { const commands = [['library', 'Add a modeling block', 'B', 'plus'], ['examples', 'Open an example notebook', '', 'folder'], ['open', 'Open a project or import a mesh', '⌘ O', 'upload'], ['save', 'Save the current project', '⌘ S', 'save'], ['export', 'Export the output mesh', '', 'download'], ['evaluate', 'Evaluate volume and mass', '', 'play'], ['workspace-analysis', 'Open engineering analysis', '', 'chart'], ['fit', 'Fit the model to the viewport', 'F', 'fit'], ['section', 'Toggle section plane', 'C', 'section'], ['graph-toggle', 'Toggle design graph', 'G', 'graph'], ['undo', 'Undo the last transaction', '⌘ Z', 'undo'], ['redo', 'Redo the last transaction', '⌘ ⇧ Z', 'redo'], ['source', 'Inspect generated shader source', '', 'code'], ['help', 'Workbench guide', '?', 'help']]; const d = dialogs.open('Command palette', `<label class="dialog-search">${icon('search', 17)}<input id="command-filter" placeholder="What would you like to do?" aria-label="Filter commands"></label><div class="commands-list" id="commands-list"></div>`); const render = filter => { d.querySelector('#commands-list').innerHTML = commands.filter(([, label]) => label.toLowerCase().includes(filter.toLowerCase())).map(([action, label, key, glyph]) => `<button class="command-item" data-command="${action}">${icon(glyph, 16)}<span>${label}</span><kbd>${key}</kbd></button>`).join(''); d.querySelectorAll('[data-command]').forEach(b => b.onclick = () => { dialogs.close(); Promise.resolve(actions[b.dataset.command]?.()).catch(report); }); }; render(''); const input = d.querySelector('#command-filter'); input.oninput = () => render(input.value); input.onkeydown = e => { if (e.key === 'Enter') {
        e.preventDefault();
        d.querySelector('[data-command]')?.click();
    } }; input.focus(); }
    function updateWorkspace(tab) { state.workspace = tab; $$('[data-action=workspace]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); if (tab === 'analysis') {
        state.inspectorTab = 'analysis';
        workbench.classList.add('show-inspector');
    }
    else {
        state.inspectorTab = 'parameters';
        state.notebookMode = tab === 'fields' ? 'fields' : 'all';
        renderer.mode = tab === 'fields' ? 1 : 0;
        $('[data-setting=view-mode]').value = String(renderer.mode);
        refreshModel().catch(report);
        if (tab === 'fields') {
            const field = scalarRoot();
            if (field)
                state.selected = field;
        }
    } renderNotebook(); graph.setSelection(state.selected); renderInspector(); }
    function exportCSV(rows, filename) { const quote = v => `"${String(v ?? '').replaceAll('"', '""')}"`; downloadFile(rows.map(r => r.map(quote).join(',')).join('\n'), filename, 'text/csv'); }
    const actions = {
        library: openLibrary, examples: openExamples, commands: commandPalette, open: () => document.getElementById('open-file').click(), save: saveProject, export: openExport, help, source: sourceDialog, domain: editDomain,
        undo: () => store.undo(), redo: () => store.redo(), evaluate: () => evaluate(), cancel: cancelJob, 'run-analysis': runAnalysis, 'inspect-mesh': () => inspectMesh(readSettings().resolution),
        workspace: el => updateWorkspace(el.dataset.tab), 'workspace-analysis': () => updateWorkspace('analysis'), 'inspector-tab': el => { state.inspectorTab = el.dataset.tab; renderInspector(); },
        'notebook-mode': el => { state.notebookMode = el.dataset.mode; renderNotebook(); }, 'notebook-toggle': () => workbench.classList.toggle('show-notebook'), properties: () => workbench.classList.toggle('show-inspector'),
        preview: () => previewNode(state.selected), output: () => { if (state.selected)
            edit('Set output body', d => d.root = state.selected); },
        duplicate: () => { const n = store.value.nodes.find(n => n.id === state.selected); if (!n)
            return; const copy = clone(n); copy.id = uid(); copy.name = `${n.name} copy`; copy.position = { x: n.position.x + 35, y: n.position.y + 105 }; state.selected = copy.id; edit('Duplicate block', d => d.nodes.push(copy)); graph.focus(copy.id); },
        delete: () => { const n = store.value.nodes.find(n => n.id === state.selected); if (!n)
            return; const uses = store.value.nodes.filter(x => Object.values(x.inputs).includes(n.id)); const remove = () => edit('Delete block', d => { d.nodes = d.nodes.filter(x => x.id !== n.id); for (const node of d.nodes)
            for (const [k, v] of Object.entries(node.inputs))
                if (v === n.id)
                    delete node.inputs[k]; if (d.root === n.id)
            d.root = d.nodes.findLast(x => NODE_TYPES[x.type].output === 'body')?.id ?? null; }); if (uses.length)
            dialogs.confirm(`Delete “${n.name}”?`, `${uses.length} block(s) reference this output. Their affected inputs will be disconnected.`, remove);
        else
            remove(); },
        fit: () => { renderer.camera.fit(store.value.domain); renderer.invalidate(); }, orient: el => { renderer.camera.orient(el.dataset.axis); renderer.invalidate(); }, projection: () => { renderer.camera.orthographic = !renderer.camera.orthographic; renderer.invalidate(); $('[data-action=projection]').classList.toggle('active', renderer.camera.orthographic); },
        section: () => { renderer.clip = !renderer.clip; $('#section-control').hidden = !renderer.clip; $('[data-action=section]').classList.toggle('active', renderer.clip); renderer.invalidate(); },
        grid: () => { renderer.grid = !renderer.grid; $('[data-action=grid]').classList.toggle('active', renderer.grid); renderer.invalidate(); }, snapshot: async () => { const blob = await renderer.snapshot(); downloadFile(blob, 'ImplicitForge-viewport.png'); },
        slice: () => { const sample = compileCPU(store.value, state.preview ?? store.value.root); downloadFile(exportSliceSVG(sample, store.value.domain, renderer.clipZ, 256), `ImplicitForge-section-Z${renderer.clipZ}.svg`, 'image/svg+xml'); toast.show('Section contours exported in millimetres.', 'success'); },
        'graph-layout': () => edit('Arrange graph', d => autoLayout(d)), 'graph-fit': () => graph.fit(), 'graph-focus': () => graph.focus(state.selected), 'graph-toggle': () => { state.graphCollapsed = !state.graphCollapsed; $('#graph-panel').classList.toggle('collapsed', state.graphCollapsed); },
        theme: () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; },
        'shade-field': () => { state.colorRoot = state.selected; renderer.mode = 1; $('[data-setting=view-mode]').value = '1'; refreshModel().catch(report); },
        'show-analysis': () => { if (state.analysis) {
            renderer.mode = 3;
            $('[data-setting=view-mode]').value = '3';
            renderer.invalidate();
            renderLegend();
        } },
        'analysis-csv': () => { const a = state.analysis; if (!a)
            return; const rows = [['x_mm', 'y_mm', 'z_mm', `${a.label}_${a.unit}`]]; for (let z = 0; z < a.n; z++)
            for (let y = 0; y < a.n; y++)
                for (let x = 0; x < a.n; x++) {
                    const i = x + a.n * (y + a.n * z);
                    rows.push([a.min[0] + x * a.step[0], a.min[1] + y * a.step[1], a.min[2] + z * a.step[2], a.values[i]]);
                } exportCSV(rows, `ImplicitForge-${a.kind}.csv`); },
        'sweep-csv': () => { if (state.sweep)
            exportCSV([['parameter_value', 'volume_mm3', 'mass_g', 'resolution'], ...state.sweep.map(r => [r.value, r.volume, r.mass, r.resolution])], 'ImplicitForge-design-study.csv'); },
        'topology-csv': () => { if (state.topology)
            exportCSV([['iteration', 'compliance_N_mm', 'volume_fraction', 'next_volume_fraction', 'max_density_change', 'linear_residual'], ...state.topology.history.map(r => [r.iteration, r.compliance, r.volumeFraction, r.nextVolumeFraction, r.change, r.linearResidual])], 'ImplicitForge-topology-history.csv'); },
        'apply-topology': () => { const result = state.topology; if (!result)
            return; const asset = uid('topology'), n = createNode('volume', { name: 'Optimized topology', params: { asset }, position: { x: 35, y: 35 } }); state.selected = n.id; edit('Add optimized topology', d => { d.assets[asset] = { ...result.asset, data: Array.from(result.asset.data) }; d.nodes.push(n); d.root = n.id; d.domain = { min: result.asset.min, max: result.asset.max }; autoLayout(d); }); graph.focus(n.id); refreshModel({ fit: true }).catch(report); toast.show('Thresholded topology added as an implicit body. Re-evaluate its connectivity and stiffness.', 'success', 8000); }
    };
    root.addEventListener('click', event => { const action = event.target.closest('[data-action]'); if (action && !action.disabled) {
        const fn = actions[action.dataset.action];
        if (fn) {
            try {
                Promise.resolve(fn(action, event)).catch(report);
            }
            catch (e) {
                report(e);
            }
        }
        return;
    } const node = event.target.closest('.notebook-row[data-node]'); if (node)
        selectNode(node.dataset.node); });
    $('#notebook-list').addEventListener('keydown', e => { if (e.key === 'Enter') {
        const n = e.target.closest('[data-node]');
        if (n)
            selectNode(n.dataset.node);
    } });
    $('#notebook-search').addEventListener('input', e => { state.filter = e.target.value; renderNotebook(); });
    function commitParameter(input) { const node = store.value.nodes.find(n => n.id === state.selected); if (!node)
        return; const key = input.dataset.param, index = input.dataset.index, number = +input.value; if (!Number.isFinite(number) || input.value === '')
        return; state.editing = true; const ok = edit(`Edit ${NODE_TYPES[node.type].params[key].label}`, d => { const n = d.nodes.find(x => x.id === node.id); if (index !== undefined)
        n.params[key][+index] = number;
    else
        n.params[key] = number; }, { mergeKey: `${node.id}:${key}:${index ?? ''}` }); state.editing = false; if (ok && index === undefined)
        $$(`[data-param="${key}"]`).forEach(other => { if (other !== input)
            other.value = number; });
    else if (!ok)
        renderInspector(); }
    $('#inspector-content').addEventListener('input', event => { const input = event.target; if (input.dataset.param && input.type === 'range')
        commitParameter(input); if (input.id === 'material-color') {
        state.editing = true;
        edit('Change display color', d => { d.view ??= {}; d.view.color = [1, 3, 5].map(i => parseInt(input.value.slice(i, i + 2), 16) / 255); }, { mergeKey: 'material-color' });
        state.editing = false;
        renderer.material.splice(0, 3, ...store.value.view.color);
        renderer.invalidate();
    } });
    $('#inspector-content').addEventListener('change', event => { const input = event.target; if (input.dataset.param && input.type !== 'range')
        commitParameter(input);
    else if (input.dataset.connect)
        edit('Change input binding', d => connect(d, state.selected, input.dataset.connect, input.value));
    else if (input.id === 'block-name')
        edit('Rename block', d => d.nodes.find(n => n.id === state.selected).name = input.value.trim() || NODE_TYPES[d.nodes.find(n => n.id === state.selected).type].label);
    else if (input.id === 'analysis-mode') {
        readSettings();
        state.analysisMode = input.value;
        renderAnalysis();
    }
    else if (input.id === 'material-select') {
        const material = MATERIALS[input.value];
        clearAnalysis();
        edit('Change material', d => d.material = clone(material));
        state.settings.thermal.conductivity = material.conductivity;
        state.settings.elasticity.E = material.E;
        state.settings.elasticity.nu = material.nu;
        state.settings.topology.E = material.E;
        if (state.metrics) {
            state.metrics.density = material.density;
            state.metrics.mass = state.metrics.volume * material.density / 1000;
            renderMetrics();
        }
    }
    else if (input.id === 'sweep-node') {
        const options = readSettings();
        options.nodeId = input.value;
        const n = store.value.nodes.find(n => n.id === input.value), entry = Object.entries(NODE_TYPES[n.type].params).find(([, v]) => !v.vector && !v.hidden);
        options.parameter = entry[0];
        options.min = Math.max(entry[1].min, n.params[entry[0]] * .7);
        options.max = Math.min(entry[1].max, n.params[entry[0]] * 1.3 || 1);
        state.settings.sweep = options;
        renderAnalysis();
    }
    else if (input.id === 'sweep-parameter') {
        const o = readSettings(), n = store.value.nodes.find(n => n.id === o.nodeId), spec = NODE_TYPES[n.type].params[input.value];
        o.parameter = input.value;
        o.min = Math.max(spec.min, n.params[input.value] * .7);
        o.max = Math.min(spec.max, n.params[input.value] * 1.3 || 1);
        state.settings.sweep = o;
        renderAnalysis();
    } });
    $('[data-setting=view-mode]').addEventListener('change', e => { renderer.mode = +e.target.value; if (renderer.mode === 1)
        refreshModel().catch(report);
    else {
        renderer.invalidate();
        renderLegend();
    } });
    $('[data-setting=quality]').addEventListener('change', e => { renderer.quality = +e.target.value; renderer.invalidate(); });
    $('#section-z').addEventListener('input', e => { renderer.clipZ = +e.target.value; $('#section-output').textContent = `${fmt(renderer.clipZ, 1)} mm`; renderer.invalidate(); });
    document.getElementById('open-file').addEventListener('change', async (event) => { const file = event.target.files[0]; event.target.value = ''; if (file)
        await importFile(file).catch(report); });
    async function importFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (file.size > 100 * 1024 * 1024)
            throw new Error('File exceeds the 100 MB input limit.');
        if (ext === 'iforge' || ext === 'json') {
            try {
                const doc = parseProject(await file.text());
                state.selected = doc.root;
                store.replace(doc);
                state.colorRoot = null;
                renderer.camera.orient('iso');
                await refreshModel({ fit: true });
                graph.focus(state.selected);
                toast.show(`Opened ${file.name}.`, 'success');
            }
            catch (e) {
                report(e);
            }
            return;
        }
        if (!['stl', 'obj'].includes(ext)) {
            toast.show('Open an .iforge/.json project or a closed STL/OBJ mesh.', 'error');
            return;
        }
        const d = dialogs.open('Import mesh as an implicit body', `<p class="dialog-copy">${esc(file.name)} · ${fmt(file.size / 1024, 1)} KB</p><div class="control" style="margin-top:18px"><label for="import-resolution">Signed-distance sampling resolution</label><select id="import-resolution" class="full"><option value="32">32³ · quick</option><option value="48" selected>48³ · standard</option><option value="64">64³ · fine</option><option value="80">80³ · extra fine</option></select></div><div class="inline-warning">The mesh must be closed and edge-manifold. Imported coordinates are treated as millimetres. Distance sampling is resolution-dependent and does not retain the source B-rep or exact triangles.</div><div class="dialog-actions"><button id="import-now" class="primary">${icon('upload', 16)}Implicitize mesh</button></div>`);
        d.querySelector('#import-now').onclick = async () => { const resolution = +d.querySelector('#import-resolution').value; dialogs.close(); const buffer = await file.arrayBuffer(); await runJob('import', { buffer, extension: ext, resolution }, asset => { const id = uid('mesh'), n = createNode('volume', { name: file.name.replace(/\.[^.]+$/, ''), params: { asset: id }, position: { x: 35, y: 35 } }); state.selected = n.id; edit('Import mesh field', doc => { doc.assets[id] = { ...asset, data: Array.from(asset.data) }; doc.nodes.push(n); doc.root = n.id; doc.domain = { min: asset.min, max: asset.max }; autoLayout(doc); }); refreshModel({ fit: true }).catch(report); graph.focus(n.id); toast.show(`Mesh implicitized at ${asset.n}³ nodes.`, 'success'); }); };
    }
    root.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files'))
        e.preventDefault(); });
    root.addEventListener('drop', e => { const file = e.dataTransfer?.files[0]; if (file) {
        e.preventDefault();
        importFile(file).catch(report);
    } });
    document.addEventListener('keydown', e => { const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase(), editing = e.target.closest('input,textarea,select,[contenteditable=true]'); if (document.getElementById('dialog').open)
        return; let action = null; if (mod && key === 's')
        action = 'save';
    else if (mod && key === 'o')
        action = 'open';
    else if (mod && key === 'k')
        action = 'commands';
    else if (mod && key === 'z')
        action = e.shiftKey ? 'redo' : 'undo';
    else if (mod && key === 'y')
        action = 'redo';
    else if (mod && key === 'd' && !editing)
        action = 'duplicate';
    else if (!editing && !mod) {
        action = { b: 'library', f: 'fit', c: 'section', g: 'graph-toggle', '?': 'help', delete: 'delete', backspace: 'delete' }[key];
    } if (action) {
        e.preventDefault();
        try {
            Promise.resolve(actions[action]()).catch(report);
        }
        catch (error) {
            report(error);
        }
    } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden)
        renderer.invalidate(); });
    await renderer.init({ forceWebGL: new URLSearchParams(location.search).get('renderer') === 'webgl' });
    state.geometryKey = modelKey(store.value);
    renderProject();
    renderNotebook();
    graph.update(store.value, state.selected, graphDiagnostics(store.value));
    renderInspector();
    renderMetrics();
    await refreshModel({ fit: true });
    graph.focus(state.selected);
    window.ImplicitForge = { store, renderer, state, graph, actions, compileDocument, runJob, evaluate, selectNode, updateWorkspace, importFile, version: '0.1.0' };
    window.__IMPLICITFORGE_READY__ = true;
    if (restored)
        toast.show('Restored your locally saved notebook.', 'success', 3000);
    if (store.value.root)
        setTimeout(() => evaluate(40), 700);
})().catch(error => { console.error(error); root.innerHTML = `<div class="boot"><div class="boot-mark">ƒ</div><h1>ImplicitForge needs attention</h1><p style="max-width:550px;line-height:1.8;text-align:center">${esc(error.message)}</p><p>Serve the project with <code>npm start</code> and open http://localhost:4173.</p></div>`; });
