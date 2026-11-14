import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionRequest, runAction } from '../scripts/action.mjs';

const actionDirectory = fileURLToPath(new URL('../', import.meta.url));

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contribution-party action-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    environment: {
      GITHUB_WORKSPACE: directory,
      GITHUB_OUTPUT: path.join(directory, 'github-output'),
      INPUT_DATA_FILE: 'grass.json',
    },
  };
}

function writeOutputs(directory) {
  fs.mkdirSync(directory, { recursive: true });
  for (const theme of ['dark', 'light']) {
    fs.writeFileSync(path.join(directory, `contribution-party-${theme}.svg`), '<svg></svg>');
  }
}

test('the action resolves user paths against the workspace and defaults configuration to its installed code', (t) => {
  const { directory, environment } = workspace(t);
  const request = createActionRequest(environment, actionDirectory);
  assert.equal(request.workspace, directory);
  assert.deepEqual(request.arguments, [
    path.join(actionDirectory, 'scripts/generate.mjs'),
    '--data',
    path.join(directory, 'grass.json'),
    '--config',
    path.join(actionDirectory, 'config/pinball.json'),
    '--output-dir',
    path.join(directory, 'dist'),
    '--seed',
    '1',
    '--initial-balls',
    '1',
  ]);
  const custom = createActionRequest(
    {
      ...environment,
      INPUT_CONFIG_FILE: '設定/配色.json',
      INPUT_SEED: '4294967295',
      INPUT_INITIAL_BALLS: '5',
    },
    actionDirectory,
  );
  assert.equal(custom.arguments[custom.arguments.indexOf('--config') + 1], path.join(directory, '設定/配色.json'));
  assert.equal(custom.arguments[custom.arguments.indexOf('--seed') + 1], '4294967295');
});

test('spaces, Japanese, quotes, and shell metacharacters remain literal process arguments and action outputs', (t) => {
  const { directory, environment } = workspace(t);
  environment.INPUT_DATA_FILE = '資料/草 $(touch injected); "quoted".json';
  environment.INPUT_OUTPUT_DIR = '出力 $(touch injected); "quoted"';
  environment.INPUT_CONFIG_FILE = "設定/配色 'quoted'.json";
  const calls = [];
  const outputs = runAction({
    environment,
    actionDirectory,
    execute(command, argumentsList, options) {
      calls.push({ command, argumentsList, options });
      writeOutputs(path.join(directory, environment.INPUT_OUTPUT_DIR));
      return { status: 0 };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.cwd, directory);
  assert(calls[0].argumentsList.includes(path.join(directory, environment.INPUT_DATA_FILE)));
  assert(calls[0].argumentsList.includes(path.join(directory, environment.INPUT_CONFIG_FILE)));
  assert.deepEqual(outputs, {
    'dark-svg': path.join(directory, environment.INPUT_OUTPUT_DIR, 'contribution-party-dark.svg'),
    'light-svg': path.join(directory, environment.INPUT_OUTPUT_DIR, 'contribution-party-light.svg'),
  });
  assert.equal(
    fs.readFileSync(environment.GITHUB_OUTPUT, 'utf8'),
    `dark-svg=${outputs['dark-svg']}\nlight-svg=${outputs['light-svg']}\n`,
  );
  assert.equal(fs.existsSync(path.join(directory, 'injected')), false);
});

test('invalid action inputs fail before invoking a process or writing output commands', (t) => {
  const { directory, environment } = workspace(t);
  const mutations = [
    { INPUT_DATA_FILE: '' },
    { INPUT_DATA_FILE: '../private.json' },
    { INPUT_DATA_FILE: path.join(directory, 'absolute.json') },
    { INPUT_CONFIG_FILE: '../private.json' },
    { INPUT_OUTPUT_DIR: '../outside' },
    { INPUT_OUTPUT_DIR: 'out\nforged-output=value' },
    { INPUT_DATA_FILE: 'grass\u0000.json' },
    { INPUT_SEED: '-1' },
    { INPUT_SEED: '1.5' },
    { INPUT_SEED: '4294967296' },
    { INPUT_SEED: '1; touch injected' },
    { INPUT_INITIAL_BALLS: '10' },
    { INPUT_INITIAL_BALLS: '5; touch injected' },
    { GITHUB_OUTPUT: '' },
  ];
  let calls = 0;
  for (const mutation of mutations) {
    assert.throws(() =>
      runAction({
        environment: { ...environment, ...mutation },
        actionDirectory,
        execute() {
          calls++;
          return { status: 0 };
        },
      }),
    );
  }
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(environment.GITHUB_OUTPUT), false);
  assert.equal(fs.existsSync(path.join(directory, 'injected')), false);
});

test('a failed generator or a missing SVG cannot publish successful action outputs', (t) => {
  const { environment } = workspace(t);
  assert.throws(() => runAction({ environment, actionDirectory, execute: () => ({ status: 1 }) }), /generation failed/);
  assert.throws(
    () => runAction({ environment, actionDirectory, execute: () => ({ status: null, signal: 'SIGTERM' }) }),
    /SIGTERM/,
  );
  assert.throws(
    () => runAction({ environment, actionDirectory, execute: () => ({ error: new Error('spawn failed') }) }),
    /spawn failed/,
  );
  assert.throws(() => runAction({ environment, actionDirectory, execute: () => ({ status: 0 }) }), /ENOENT/);
  assert.equal(fs.existsSync(environment.GITHUB_OUTPUT), false);
});

test('symlinks cannot redirect data, configuration, or newly created output directories outside the workspace', (t) => {
  const { directory, environment } = workspace(t);
  const outside = workspace(t).directory;
  fs.symlinkSync(outside, path.join(directory, 'external'), 'dir');
  fs.symlinkSync(path.join(outside, 'missing'), path.join(directory, 'dangling'), 'dir');
  for (const mutation of [
    { INPUT_DATA_FILE: 'external/grass.json' },
    { INPUT_CONFIG_FILE: 'external/config.json' },
    { INPUT_OUTPUT_DIR: 'external/new/nested/output' },
    { INPUT_DATA_FILE: 'dangling/grass.json' },
    { INPUT_OUTPUT_DIR: 'dangling/new/output' },
  ]) {
    assert.throws(() => createActionRequest({ ...environment, ...mutation }, actionDirectory));
  }
  assert.equal(fs.existsSync(path.join(outside, 'new')), false);
});

test('workspace-internal symlinks and a symlinked workspace remain usable', (t) => {
  const { directory, environment } = workspace(t);
  const aliasDirectory = workspace(t).directory;
  fs.mkdirSync(path.join(directory, 'real'));
  fs.symlinkSync(path.join(directory, 'real'), path.join(directory, 'internal'), 'dir');
  fs.symlinkSync(directory, path.join(aliasDirectory, 'workspace'), 'dir');
  const request = createActionRequest(
    {
      ...environment,
      GITHUB_WORKSPACE: path.join(aliasDirectory, 'workspace'),
      INPUT_DATA_FILE: 'internal/grass.json',
      INPUT_OUTPUT_DIR: 'internal/new/output',
    },
    actionDirectory,
  );
  assert.equal(request.outputDirectory, path.join(aliasDirectory, 'workspace/internal/new/output'));
});

test('the distributed action and CLI run through symlinks without source files or installed dependencies', (t) => {
  const { directory, environment } = workspace(t);
  const distribution = workspace(t).directory;
  fs.mkdirSync(path.join(distribution, 'scripts'));
  for (const filename of ['action.mjs', 'generate.mjs']) {
    fs.copyFileSync(path.join(actionDirectory, 'scripts', filename), path.join(distribution, 'scripts', filename));
  }
  for (const dirname of ['config', '.action']) {
    fs.cpSync(path.join(actionDirectory, dirname), path.join(distribution, dirname), { recursive: true });
  }
  for (const filename of ['package.json', 'LICENSE']) {
    fs.copyFileSync(path.join(actionDirectory, filename), path.join(distribution, filename));
  }
  const alias = path.join(workspace(t).directory, '配布 action');
  fs.symlinkSync(distribution, alias, 'dir');
  environment.INPUT_DATA_FILE = '草 $(touch injected); "quoted".json';
  environment.INPUT_OUTPUT_DIR = '出力 $(touch injected); "quoted"';
  environment.INPUT_INITIAL_BALLS = '5';
  fs.writeFileSync(path.join(directory, environment.INPUT_DATA_FILE), JSON.stringify({ levels: [[1, 0, 2]] }));
  const result = spawnSync(process.execPath, [path.join(alias, 'scripts/action.mjs')], {
    cwd: directory,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const outputText = fs.readFileSync(environment.GITHUB_OUTPUT, 'utf8');
  for (const theme of ['dark', 'light']) {
    const file = path.join(directory, environment.INPUT_OUTPUT_DIR, `contribution-party-${theme}.svg`);
    assert.match(fs.readFileSync(file, 'utf8'), /<svg\b/);
    assert(outputText.includes(`${theme}-svg=${file}\n`));
  }
  const cli = spawnSync(
    process.execPath,
    [path.join(alias, 'scripts/generate.mjs'), '--data', environment.INPUT_DATA_FILE, '--output-dir', 'direct CLI'],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  assert.ifError(cli.error);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  for (const theme of ['dark', 'light']) {
    assert.match(
      fs.readFileSync(path.join(directory, 'direct CLI', `contribution-party-${theme}.svg`), 'utf8'),
      /<svg\b/,
    );
  }
  assert.equal(fs.existsSync(path.join(directory, 'injected')), false);
  assert.equal(fs.existsSync(path.join(directory, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(distribution, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(distribution, 'src')), false);
});
