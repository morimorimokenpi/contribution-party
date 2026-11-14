import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFiles, svgNames } from '../scripts/generate.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));

async function withDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'contribution-party-generate-'));
  try { return await run(directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test('CLI generates both README themes from arbitrary working directories and paths with spaces', async () => {
  await withDirectory(async directory => {
    const input = path.join(directory, '芝 data.json');
    await fs.writeFile(input, JSON.stringify({ levels: [[1, 0, null, 4]], username: '<script>alert(1)</script> & user' }));
    const result = spawnSync(process.execPath, [path.join(project, 'scripts/generate.mjs'), '--data', input,
      '--output-dir', '画像 output', '--seed', '0'], { cwd: directory, encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const [dark, light] = await Promise.all(Object.values(svgNames).map(name =>
      fs.readFile(path.join(directory, '画像 output', name), 'utf8')));
    for (const svg of [dark, light]) {
      assert.match(svg, /<svg\b/);
      assert.match(svg, /Happy hacking :\)/);
      assert.match(svg, /MIT License/);
      assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bonload\s*=/i);
      assert.match(svg, /&lt;script&gt;/);
    }
    assert.notEqual(dark, light);
  });
});

test('one seed generates reproducible files and a score based on the supplied data', async () => {
  await withDirectory(async directory => {
    const input = path.join(directory, 'data.json');
    await fs.writeFile(input, JSON.stringify({ levels: [[1, 2, 3, 4]] }));
    const options = { data: input, outputDir: path.join(directory, 'output'), seed: 24 };
    const first = await generateFiles(options);
    const content = await fs.readFile(first.darkSvg, 'utf8');
    const second = await generateFiles(options);
    assert.equal(second.score, 19);
    assert.equal(second.activeCells, 4);
    assert.equal(await fs.readFile(second.darkSvg, 'utf8'), content);
  });
});

test('invalid inputs fail without writing output files', async () => {
  await withDirectory(async directory => {
    const input = path.join(directory, 'data.json');
    const outputDir = path.join(directory, 'output');
    await fs.writeFile(input, JSON.stringify({ levels: [['1']] }));
    await assert.rejects(generateFiles({ data: input, outputDir }), /草の濃淡/);
    await assert.rejects(fs.access(outputDir));
    for (const seed of [-1, 4294967296, 'NaN', '1;echo bad']) {
      await assert.rejects(generateFiles({ data: input, outputDir, seed }), /seed/);
    }
    await assert.rejects(generateFiles({ data: input, outputDir, initialBalls: 10 }), /initial-balls/);
    await assert.rejects(generateFiles({ outputDir }), /--data/);
    await assert.rejects(fs.access(outputDir));
  });
});
