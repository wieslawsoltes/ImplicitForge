import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
let checked = 0;
async function visit(path) { for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['dist', 'node_modules', '.git'].includes(entry.name))
        continue;
    const file = join(path, entry.name);
    if (entry.isDirectory())
        await visit(file);
    else if (/\.(?:js|mjs)$/.test(file)) {
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (result.status !== 0) {
            console.error(result.stderr);
            process.exitCode = 1;
        }
        checked++;
    }
} }
await visit('.');
console.log(`Syntax checked ${checked} JavaScript files.`);
