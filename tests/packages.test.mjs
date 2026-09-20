import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packages = ['kernel', 'graph', 'document', 'field', 'lattice', 'compile', 'compute', 'mesh', 'analysis', 'io', 'render', 'ui'];
for (const name of packages) {
  test(`Standalone @forge/${name} bundle imports outside the workspace`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `implicitforge-${name}-`));
    try {
      const target = join(directory, 'library.mjs');
      await copyFile(new URL(`../packages/${name}/dist/index.js`, import.meta.url), target);
      const source = await import(`../packages/${name}/src/index.js`);
      const standalone = await import(pathToFileURL(target).href);
      assert.deepEqual(Object.keys(standalone).sort(), Object.keys(source).sort());
      assert.ok(Object.keys(standalone).length > 0);
      if (name === 'graph') assert.equal(standalone.createNode('sphere', { params: { radius: 7 } }).params.radius, 7);
      if (name === 'field') assert.equal(standalone.sdBox(0, 0, 0, 2, 3, 4), -2);
      if (name === 'mesh') {
        const grid = await standalone.sampleGrid((x, y, z) => Math.hypot(x, y, z) - 3, { min: [-4, -4, -4], max: [4, 4, 4] }, 16);
        const mesh = await standalone.extractMesh(grid);
        assert.equal(standalone.meshMetrics(mesh).watertight, true);
      }
      if (name === 'ui') {
        const manifest = JSON.parse(await readFile(new URL('../packages/ui/package.json', import.meta.url), 'utf8'));
        assert.equal(manifest.exports['./styles.css'], './dist/styles.css');
        assert.ok((await readFile(new URL('../packages/ui/dist/styles.css', import.meta.url), 'utf8')).includes('.graph-node'));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
