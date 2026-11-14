import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));

async function withBuildProject(run) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pinball-build-test-'));
  try {
    await Promise.all(
      ['src', 'templates', 'config', 'scripts'].map((directory) =>
        fs.cp(path.join(projectDirectory, directory), path.join(temporaryDirectory, directory), { recursive: true }),
      ),
    );
    await fs.mkdir(path.join(temporaryDirectory, 'data'));
    await Promise.all(
      ['LICENSE', 'package.json', 'tsconfig.json', 'data/real.json', 'data/sample.json'].map((file) =>
        fs.copyFile(path.join(projectDirectory, file), path.join(temporaryDirectory, file)),
      ),
    );
    await fs.mkdir(path.join(temporaryDirectory, 'node_modules'));
    await fs.symlink(
      path.join(projectDirectory, 'node_modules/typescript'),
      path.join(temporaryDirectory, 'node_modules/typescript'),
      'dir',
    );
    return await run(temporaryDirectory);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function buildProject(directory) {
  const result = spawnSync(process.execPath, [path.join(directory, 'scripts/build.mjs')], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ifError(result.error);
  return result;
}

test('the real build rejects invalid contribution levels before writing any HTML', async () => {
  await withBuildProject(async (temporaryDirectory) => {
    const samplePath = path.join(temporaryDirectory, 'data/sample.json');
    const sample = JSON.parse(await fs.readFile(samplePath, 'utf8'));
    sample.levels[0][0] = '1';
    await fs.writeFile(samplePath, JSON.stringify(sample));

    const result = buildProject(temporaryDirectory);
    assert.notEqual(result.status, 0, 'Invalid input must fail the build');
    assert.match(result.stdout + result.stderr, /Contribution levels must be 0 to 4/);
    const outputFiles = await fs.readdir(path.join(temporaryDirectory, 'dist'));
    assert.equal(
      outputFiles.some((file) => file.endsWith('.html')),
      false,
      'Rejected data must not produce deployable HTML',
    );
  });
});

test('the real build accepts levels-only data and omits invalid optional display metadata', async () => {
  await withBuildProject(async (temporaryDirectory) => {
    for (const data of [
      { levels: [[1]] },
      { levels: [[1]], username: { unexpected: 'user' }, retrievedAt: 424242, start: false, end: null },
    ]) {
      await fs.writeFile(path.join(temporaryDirectory, 'data/real.json'), JSON.stringify(data));
      const result = buildProject(temporaryDirectory);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const fragment = await fs.readFile(path.join(temporaryDirectory, 'dist/real.fragment.html'), 'utf8');
      const page = await fs.readFile(path.join(temporaryDirectory, 'dist/index.html'), 'utf8');
      assert(page.includes(fragment), 'The standalone page contains the generated real-data fragment');
      assert.match(page, /<html lang="en">/);
      assert.match(fragment, /data-pinball-root[^>]*lang="en"/);
      const canvasLabel = fragment.match(/<canvas\b[^>]*\baria-label="([^"]*)"/)?.[1];
      const note = fragment.match(/<span class="text-muted">([^<]*)<\/span>/)?.[1];
      assert(canvasLabel?.trim(), 'The canvas retains a useful description without metadata');
      assert(note?.trim(), 'The data note retains a useful fallback without metadata');
      for (const displayText of [canvasLabel, note]) {
        assert.doesNotMatch(displayText, /[ぁ-ゖァ-ヺ一-龯]/);
        assert.doesNotMatch(displayText, /undefined|\[object Object\]|424242|\bfalse\b|\bnull\b/);
      }
    }
  });
});
