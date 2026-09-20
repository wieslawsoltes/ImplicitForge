import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const [address, expectedCommit] = process.argv.slice(2);
assert(address && expectedCommit, 'Usage: node scripts/verify-pages.mjs <site-url> <commit-sha>');
const base = new URL(address.endsWith('/') ? address : `${address}/`);
assert(base.protocol === 'https:', 'Public deployment verification requires HTTPS.');

async function request(path, attempt = 0) {
  const url = new URL(path, base);
  url.searchParams.set('verify', `${expectedCommit}-${attempt}`);
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${path || '/'}: HTTP ${response.status}`);
  return response;
}

let published = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await request('deployment.json', attempt);
    const metadata = await response.json();
    assert.equal(metadata.commit, expectedCommit, 'The edge is serving a different deployment.');
    published = true;
    break;
  } catch (error) {
    console.log(`Deployment propagation check ${attempt + 1}/30: ${error.message}`);
    if (attempt < 29) await delay(3000);
  }
}
assert(published, `Could not verify deployment ${expectedCommit} at ${base}`);

const packages = ['analysis', 'compile', 'compute', 'document', 'field', 'graph', 'io', 'kernel', 'lattice', 'mesh', 'render', 'ui'];
const paths = ['', 'ImplicitForge.html', 'app/main.js', 'app/worker.js', 'app/styles.css',
  'packages/analysis/src/fem.js', 'packages/render/src/software.js', 'packages/ui/dist/styles.css',
  'docs/USER_GUIDE.md', 'docs/workbench.png', 'examples/exchanger.iforge', 'tests/gpu.html',
  ...packages.map(name => `packages/${name}/dist/index.js`)];
for (const path of paths) {
  const response = await request(path);
  const type = response.headers.get('content-type') ?? '';
  if (path.endsWith('.js')) assert(/(?:javascript|ecmascript)/i.test(type), `${path}: wrong module MIME type ${type}`);
  if (path.endsWith('.css')) assert(type.includes('text/css'), `${path}: wrong CSS MIME type ${type}`);
  if (path.endsWith('.png')) assert(type.includes('image/png'), `${path}: wrong image MIME type ${type}`);
  const body = new Uint8Array(await response.arrayBuffer());
  assert(body.length > 0, `${path}: empty response`);
  if (path === '') assert(new TextDecoder().decode(body).includes('ImplicitForge'), 'Unexpected entry document');
  if (path.endsWith('.iforge')) JSON.parse(new TextDecoder().decode(body));
  console.log(`PASS ${path || '/'} (${body.length} bytes; ${type})`);
}
console.log(`Verified commit ${expectedCommit} and ${paths.length} public application assets at ${base}`);
