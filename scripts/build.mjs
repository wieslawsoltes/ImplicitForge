import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url))), dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of await readdir(join(root, 'packages'))) {
    const dir = join(root, 'packages', name);
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist/index.js'), await bundle(join(dir, 'src/index.js'), { format: 'esm' }));
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    manifest.main = './dist/index.js';
    manifest.exports = name === 'ui' ? { '.': './dist/index.js', './styles.css': './dist/styles.css' } : './dist/index.js';
    manifest.files = ['dist', 'src', 'README.md', 'LICENSE'];
    manifest.sideEffects = name === 'ui' ? ['**/*.css'] : false;
    if (name === 'ui') await cp(join(dir, 'src/styles.css'), join(dir, 'dist/styles.css'));
    manifest.description = `ImplicitForge standalone ${name} package`;
    await writeFile(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
}
for (const path of ['index.html', 'app', 'packages', 'examples', 'docs', 'README.md', 'LICENSE', '.nojekyll'])
    await cp(join(root, path), join(dist, path), { recursive: true });
await mkdir(join(dist, 'tests'), { recursive: true });
for (const file of ['gpu.html', 'gpu.js']) await cp(join(root, 'tests', file), join(dist, 'tests', file));
const worker = await bundle(join(root, 'app/worker.js')), main = await bundle(join(root, 'app/main.js'));
const css = await readFile(join(root, 'packages/ui/src/styles.css'), 'utf8');
const script = `globalThis.__IMPLICITFORGE_WORKER_TYPE__='classic';globalThis.__IMPLICITFORGE_WORKER_URL__=URL.createObjectURL(new Blob([${JSON.stringify(worker).replaceAll('<', '\\u003c')}],{type:'text/javascript'}));\n${main}`.replace(/<\/script/gi, '<\\/script');
const html = (await readFile(join(root, 'index.html'), 'utf8')).replace('<link rel="stylesheet" href="app/styles.css">', () => `<style>${css}</style>`).replace('<script type="module" src="app/main.js"></script>', () => `<script>${script}</script>`);
await writeFile(join(dist, 'ImplicitForge.html'), html);
await writeFile(join(root, 'ImplicitForge.html'), html);
await writeFile(join(root, 'tests/worker.bundle.js'), worker);
console.log(`Built portable HTML (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB), static site, and 12 standalone ESM packages.`);
