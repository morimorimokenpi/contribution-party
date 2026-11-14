import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
export const svgNames = Object.freeze({ dark: 'contribution-party-dark.svg', light: 'contribution-party-light.svg' });

function parseSeed(value) {
  const text = String(value ?? '1');
  if (!/^(0|[1-9]\d*)$/.test(text) || Number(text) > 0xffff_ffff) {
    throw new Error('seed must be an integer from 0 to 4294967295.');
  }
  return Number(text);
}

async function readJson(filename, label) {
  const stats = await fs.stat(filename);
  if (!stats.isFile() || stats.size > 1024 * 1024) {
    throw new Error(`${label} must be a JSON file no larger than 1 MiB.`);
  }
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}

async function writeAtomic(filename, content) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx' });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function generateFiles(options) {
  if (typeof options.data !== 'string' || options.data.trim() === '') {
    throw new Error('Specify a contribution JSON file with --data <path>.');
  }
  const seed = parseSeed(options.seed);
  const initialBalls = Number(options.initialBalls ?? 1);
  if (![1, 5].includes(initialBalls)) throw new Error('initial-balls must be 1 or 5.');
  const dataPath = path.resolve(options.data);
  const configPath = path.resolve(options.config ?? path.join(projectDirectory, 'config/pinball.json'));
  const outputDirectory = path.resolve(options.outputDir ?? 'dist');
  const [runtime, rawData, rawConfig, license] = await Promise.all([
    import('../.action/runtime.js'),
    readJson(dataPath, 'Contribution data'),
    readJson(configPath, 'Configuration'),
    fs.readFile(path.join(projectDirectory, 'LICENSE'), 'utf8'),
  ]);
  const data = runtime.parseContributionData(rawData);
  const config = runtime.parsePinballConfig(rawConfig);
  const timeline = runtime.createPinballTimeline(data, config, { seed, initialBalls });
  const title =
    typeof rawData.username === 'string' && rawData.username.trim() !== ''
      ? `${rawData.username.trim()} · Contribution Party`
      : 'Contribution Party';
  const files = Object.fromEntries(
    Object.keys(svgNames).map((theme) => [
      theme,
      {
        path: path.join(outputDirectory, svgNames[theme]),
        content: runtime.renderContributionSvg({ timeline, config, theme, title, license }),
      },
    ]),
  );
  for (const { path: filename, content } of Object.values(files)) {
    if ([dataPath, configPath].includes(filename)) throw new Error('Input and output files must use different paths.');
    if (Buffer.byteLength(content) > 5 * 1024 * 1024) throw new Error('A generated SVG exceeds the 5 MiB limit.');
  }
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all(Object.values(files).map((file) => writeAtomic(file.path, file.content)));
  return {
    darkSvg: files.dark.path,
    lightSvg: files.light.path,
    score: timeline.finalScore,
    activeCells: timeline.total,
    duration: timeline.duration,
    seed,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: 'string' },
      config: { type: 'string' },
      'output-dir': { type: 'string' },
      seed: { type: 'string' },
      'initial-balls': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(
      'Usage: node scripts/generate.mjs --data <levels.json> [--config <config.json>] [--output-dir <directory>] [--seed <uint32>] [--initial-balls <1|5>]',
    );
    return;
  }
  const result = await generateFiles({
    data: values.data,
    config: values.config,
    outputDir: values['output-dir'],
    seed: values.seed,
    initialBalls: values['initial-balls'],
  });
  console.log(
    `Generated ${result.darkSvg}\nGenerated ${result.lightSvg}\n${result.activeCells} cells · ${result.score} pt · ${result.duration.toFixed(2)} s`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
