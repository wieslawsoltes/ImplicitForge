import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
/** Deterministic, dependency-free bundler for the workspace's restricted named-ESM syntax. */
export async function bundle(entry, { format = 'iife' } = {}) {
    const modules = new Map();
    async function load(file) {
        file = resolve(file);
        if (modules.has(file))
            return modules.get(file).id;
        const id = modules.size, record = { id, code: '', exports: new Set() };
        modules.set(file, record);
        let source = await readFile(file, 'utf8');
        const names = record.exports;
        const importRE = /\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g;
        const reexportRE = /\bexport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g;
        const imports = [...source.matchAll(importRE)], reexports = [...source.matchAll(reexportRE)];
        for (const m of imports) {
            if (!m[2].startsWith('.'))
                throw new Error(`Only relative named imports are supported: ${file}`);
            const dep = await load(resolve(dirname(file), m[2]));
            source = source.replace(m[0], `const {${m[1].replace(/\s+as\s+/g, ':')}}=__require(${dep});`);
        }
        for (const m of reexports) {
            const dep = await load(resolve(dirname(file), m[2]));
            source = source.replace(m[0], m[1].split(',').map(n => { const [a, b] = n.trim().split(/\s+as\s+/); names.add(b ?? a); return `__exports.${b ?? a}=__require(${dep}).${a};`; }).join('\n'));
        }
        const localExports = new Map();
        source = source.replace(/\bexport\s+(async\s+)?(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_, async, kind, name) => { names.add(name); localExports.set(name, name); return `${async ?? ''}${kind} ${name}`; });
        source = source.replace(/\bexport\s*\{([^}]+)\}\s*;?/g, (_, values) => { for (const value of values.split(',')) {
            const [local, out] = value.trim().split(/\s+as\s+/);
            names.add(out ?? local);
            localExports.set(out ?? local, local);
        } return ''; });
        source = source.replaceAll('import.meta.url', '(globalThis.__IMPLICITFORGE_BASE_URL__ ?? globalThis.location?.href)');
        record.code = source + `\nObject.assign(__exports,{${[...localExports].map(([out, local]) => `${out}:${local}`).join(',')}});`;
        return id;
    }
    const root = await load(entry), core = `(function(){'use strict';const __cache={};const __modules={${[...modules.values()].map(({ id, code }) => `${id}:(__exports,__require)=>{\n${code}\n}`).join(',\n')}};function __require(id){if(__cache[id])return __cache[id];const value={};__cache[id]=value;__modules[id](value,__require);return value;}return __require(${root});})()`;
    if (format === 'esm') {
        const names = [...modules.get(resolve(entry)).exports].sort();
        return `// Standalone @forge package. Generated from workspace source; no external runtime dependencies.\nconst __entry=${core};\n${names.map(name => `export const ${name}=__entry.${name};`).join('\n')}\n`;
    }
    return `${core};`;
}
