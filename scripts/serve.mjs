import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = resolve(fileURLToPath(new URL('../', import.meta.url))), port = Number(process.env.PORT ?? process.argv[2] ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
createServer(async (req, res) => { try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
    }
    if ((await stat(file)).isDirectory())
        file = resolve(file, 'index.html');
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
}
catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
} }).listen(port, '0.0.0.0', () => console.log(`ImplicitForge: http://localhost:${port}`));
