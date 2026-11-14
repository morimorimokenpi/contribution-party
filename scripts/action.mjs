import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installedActionDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileNames = {
  'dark-svg': 'contribution-party-dark.svg',
  'light-svg': 'contribution-party-light.svg',
};

function readInput(environment, name, fallback = '') {
  return (environment[`INPUT_${name}`] ?? fallback).trim();
}

function assertInside(workspace, target, name) {
  const relative = path.relative(workspace, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${name} must stay inside GITHUB_WORKSPACE.`);
  }
}

function resolveExistingParent(target) {
  const suffix = [];
  let current = target;
  for (;;) {
    try {
      fs.lstatSync(current);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
  return path.resolve(fs.realpathSync(current), ...suffix);
}

function workspacePath(workspace, value, name) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in workspace paths.
  if (/[\u0000-\u001f\u007f]/u.test(value) || path.isAbsolute(value)) {
    throw new Error(`${name} must be a workspace-relative path without control characters.`);
  }
  const result = path.resolve(workspace, value);
  assertInside(workspace, result, name);
  assertInside(fs.realpathSync(workspace), resolveExistingParent(result), name);
  return result;
}

export function createActionRequest(environment, actionDirectory = installedActionDirectory) {
  const workspace = path.resolve(environment.GITHUB_WORKSPACE || process.cwd());
  const dataInput = readInput(environment, 'DATA_FILE');
  if (!dataInput) throw new Error('data_file is required. Prepare the contribution JSON in your workspace.');
  const configInput = readInput(environment, 'CONFIG_FILE');
  const seed = readInput(environment, 'SEED', '1') || '1';
  if (!/^\d+$/u.test(seed) || !Number.isSafeInteger(Number(seed)) || Number(seed) > 0xffff_ffff) {
    throw new Error('seed must be an integer from 0 to 4294967295.');
  }
  const initialBalls = readInput(environment, 'INITIAL_BALLS', '1') || '1';
  if (initialBalls !== '1' && initialBalls !== '5') {
    throw new Error('initial_balls must be 1 or 5.');
  }
  const outputDirectory = workspacePath(
    workspace,
    readInput(environment, 'OUTPUT_DIR', 'dist') || 'dist',
    'output_dir',
  );
  const configPath = configInput
    ? workspacePath(workspace, configInput, 'config_file')
    : path.join(actionDirectory, 'config/pinball.json');
  return {
    workspace,
    outputDirectory,
    arguments: [
      path.join(actionDirectory, 'scripts/generate.mjs'),
      '--data',
      workspacePath(workspace, dataInput, 'data_file'),
      '--config',
      configPath,
      '--output-dir',
      outputDirectory,
      '--seed',
      String(Number(seed)),
      '--initial-balls',
      initialBalls,
    ],
  };
}

export function runAction({
  environment = process.env,
  actionDirectory = installedActionDirectory,
  execute = spawnSync,
} = {}) {
  const request = createActionRequest(environment, actionDirectory);
  if (!environment.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required when running the action entry point.');
  const result = execute(process.execPath, request.arguments, {
    cwd: request.workspace,
    env: environment,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`SVG generation failed (${result.signal || `exit ${result.status}`}).`);
  }
  const outputs = Object.fromEntries(
    Object.entries(fileNames).map(([name, fileName]) => {
      const filePath = path.join(request.outputDirectory, fileName);
      if (!fs.statSync(filePath).isFile()) throw new Error(`The generated output is not a file: ${fileName}`);
      return [name, filePath];
    }),
  );
  fs.appendFileSync(
    environment.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([name, filePath]) => `${name}=${filePath}\n`)
      .join(''),
    'utf8',
  );
  return outputs;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runAction();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
