import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectDirectory, 'dist');
const argumentsList = process.argv.slice(2);

if (argumentsList.length !== 0 && (argumentsList.length !== 2 || argumentsList[0] !== '--preview-dir')) {
  console.error('Usage: node scripts/build.mjs [--preview-dir <path>]');
  process.exit(1);
}

const previewDirectory = argumentsList[1] ? path.resolve(argumentsList[1]) : null;
const compiler = path.join(projectDirectory, 'node_modules/typescript/bin/tsc');
const compilation = spawnSync(process.execPath, [compiler, '--project', path.join(projectDirectory, 'tsconfig.json')], {
  cwd: projectDirectory,
  stdio: 'inherit',
});

if (compilation.error) throw compilation.error;
if (compilation.status !== 0) process.exit(compilation.status ?? 1);

const [
  template,
  settingsScript,
  contributionsScript,
  physicsScript,
  celebrationScript,
  compiledScript,
  animationScript,
  svgScript,
  svgMotionScript,
  svgLightsScript,
  realText,
  sampleText,
  configText,
  licenseText,
] = await Promise.all([
  fs.readFile(path.join(projectDirectory, 'templates/game.html'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'settings.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'contributions.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'physics.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'celebration.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'game.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'animation.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'svg.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'svg-motion.js'), 'utf8'),
  fs.readFile(path.join(outputDirectory, 'svg-lights.js'), 'utf8'),
  fs.readFile(path.join(projectDirectory, 'data/real.json'), 'utf8'),
  fs.readFile(path.join(projectDirectory, 'data/sample.json'), 'utf8'),
  fs.readFile(path.join(projectDirectory, 'config/pinball.json'), 'utf8'),
  fs.readFile(path.join(projectDirectory, 'LICENSE'), 'utf8'),
]);

const realData = JSON.parse(realText);
const sampleData = JSON.parse(sampleText);
const config = JSON.parse(configText);
const { parsePinballConfig, parseContributionData } = runInNewContext(
  `${settingsScript}\n${contributionsScript}\n({ parsePinballConfig, parseContributionData })`,
  Object.create(null),
  { timeout: 1000 },
);
parsePinballConfig(config);
parseContributionData(realData);
parseContributionData(sampleData);

function renderScript(rootId) {
  return `/*\n${licenseText.trim()}\n*/\n(() => {\n'use strict';\nconst pinballRootId = ${JSON.stringify(rootId)};\n${settingsScript}\n${contributionsScript}\n${physicsScript}\n${celebrationScript}\n${compiledScript}\n})();`.replace(
    /<\/script/gi,
    '<\\/script',
  );
}

function summarize(data) {
  return data.levels.flat().reduce(
    (totals, level) => {
      if (level !== null && level > 0) {
        totals.activeDays += 1;
        totals.maxPoints += config.points[level];
        if (!Number.isSafeInteger(totals.maxPoints)) {
          throw new Error('The total score exceeds the safe integer limit. Reduce the point values.');
        }
      }
      return totals;
    },
    { activeDays: 0, maxPoints: 0 },
  );
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}

function renderFragment({ rootId, data, note, canvasLabel, settings = config, collisionDemo = false }) {
  parsePinballConfig(settings);
  const replacements = {
    __ROOT_ID__: rootId,
    __COLLISION_DEMO__: String(collisionDemo),
    __DATA_JSON__: JSON.stringify(data).replace(/</g, '\\u003c'),
    __CONFIG_JSON__: JSON.stringify(settings).replace(/</g, '\\u003c'),
    __DATA_NOTE__: escapeHtml(note),
    __CANVAS_LABEL__: escapeHtml(canvasLabel),
    __GAME_SCRIPT__: renderScript(rootId),
    __OVER_INTERVAL__: String(settings.overInterval),
    __PARTY_SCORE__: String(settings.partyScore),
    ...Object.fromEntries(settings.points.slice(1).map((points, index) => [`__POINTS_${index + 1}__`, String(points)])),
  };
  return template.replace(/__[A-Z_0-9]+__/g, (placeholder) => {
    if (!(placeholder in replacements)) throw new Error(`Unknown template placeholder: ${placeholder}`);
    return replacements[placeholder];
  });
}

function renderPage(title, fragment) {
  const palette = config.palettes[config.theme === 'light' ? 'light' : 'dark'];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --font-size-base: 14px; }
    * { box-sizing: border-box; }
    body { margin: 0; color-scheme: ${config.theme === 'light' ? 'light' : 'dark'}; --pinball-background: ${palette.background}; --pinball-foreground: ${palette.foreground}; --pinball-muted-foreground: ${palette.mutedForeground}; --pinball-surface: ${palette.surface}; --pinball-border: ${palette.border}; --pinball-ball: ${palette.ball}; --pinball-celebration: ${palette.celebration}; --pinball-grass-1: ${palette.grass[1]}; --pinball-grass-3: ${palette.grass[3]}; background: var(--pinball-background); color: var(--pinball-foreground); font: 400 var(--font-size-base)/1.6 system-ui, sans-serif; }
    main { width: min(1080px, calc(100% - 32px)); margin: 32px auto; }
    h1, p { margin: 0; }
    h1 { font-weight: 500; line-height: 1.2; }
    .btn, .form-select { padding: 8px 12px; border: 1px solid var(--pinball-border); border-radius: 6px; background: var(--pinball-surface); color: var(--pinball-foreground); font: inherit; }
    .btn { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .btn-primary { background: var(--pinball-grass-1); border-color: var(--pinball-grass-3); }
    .btn:disabled { opacity: .5; cursor: default; }
    .btn:focus-visible, .form-select:focus-visible { outline: 2px solid var(--pinball-ball); outline-offset: 3px; }
    .text-small { font-size: 12px; }
    .text-muted { color: var(--pinball-muted-foreground); }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    @media (pointer: coarse) { .btn, .form-select { min-height: 44px; } }
  </style>
</head>
<body data-pinball-page>
  <main>
${fragment}
  </main>
</body>
</html>
`;
}

function metadataText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const realUsername = metadataText(realData.username);
const realRetrievedAt = metadataText(realData.retrievedAt);
const realStart = metadataText(realData.start);
const realEnd = metadataText(realData.end);
const realKind = realUsername ? `${realUsername} · Activity snapshot` : 'Contribution data';
const realNote = realRetrievedAt ? `${realKind} (retrieved ${realRetrievedAt.replaceAll('-', '/')})` : realKind;
const realPeriod = realStart && realEnd ? ` from ${realStart} to ${realEnd}` : '';
const realSubject = `Contribution graph${realUsername ? ` for ${realUsername}` : ''}${realPeriod}`;
const realTotals = summarize(realData);
const sampleTotals = summarize(sampleData);
const pointDescription = config.points.slice(1).join(', ');
const behaviorLabel = `OVER milestones appear above each ${config.overInterval}-point boundary. Above ${config.partyScore} points, five balls and party lights start automatically. Clearing all cells reveals the final score. Dark and light themes are available.`;
const realLabel = `${realSubject}. Clear ${realTotals.activeDays} active cells, worth ${pointDescription} points by activity level. Maximum score: ${realTotals.maxPoints}. ${behaviorLabel}`;
const sampleLabel = `Sample with ${sampleTotals.activeDays} active cells, worth ${pointDescription} points by activity level. Maximum score: ${sampleTotals.maxPoints}. ${behaviorLabel}`;
const collisionLabel = `Sample with ${sampleTotals.activeDays} active cells and five balls at the start. Elastic ball collisions change their paths. Cells are worth ${pointDescription} points by activity level. Maximum score: ${sampleTotals.maxPoints}. OVER milestones appear above each ${config.overInterval}-point boundary. Includes party lights, a final score, and theme selection.`;
const superPartyLabel = `${collisionLabel} Above 1000 points, SUPER PARTY TIME increases the ball count from five to ten once. Ball collisions remain enabled.`;
const fragments = {
  real: renderFragment({ rootId: 'contribution-pinball-real', data: realData, note: realNote, canvasLabel: realLabel }),
  sample: renderFragment({
    rootId: 'contribution-pinball-score',
    data: sampleData,
    note: `Full grid sample · ${sampleTotals.activeDays} active cells`,
    canvasLabel: sampleLabel,
  }),
  collision: renderFragment({
    rootId: 'contribution-pinball-collisions',
    data: sampleData,
    note: 'Ball collision sample · Starts with five balls',
    canvasLabel: collisionLabel,
    settings: { ...config, ballCollisions: true },
    collisionDemo: true,
  }),
  superParty: renderFragment({
    rootId: 'contribution-pinball-super-party',
    data: sampleData,
    note: 'SUPER PARTY sample · Five balls, ten above 1000 points',
    canvasLabel: superPartyLabel,
    settings: { ...config, ballCollisions: true, partyScore: 500, superPartyScore: 1000 },
    collisionDemo: true,
  }),
};

await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(path.join(outputDirectory, 'real.fragment.html'), fragments.real);
await fs.writeFile(path.join(outputDirectory, 'sample.fragment.html'), fragments.sample);
await fs.writeFile(path.join(outputDirectory, 'collision.fragment.html'), fragments.collision);
await fs.writeFile(path.join(outputDirectory, 'super-party.fragment.html'), fragments.superParty);
await fs.writeFile(
  path.join(outputDirectory, 'index.html'),
  renderPage('Contribution Party · Activity snapshot', fragments.real),
);
await fs.writeFile(
  path.join(outputDirectory, 'sample.html'),
  renderPage('Contribution Party · Full grid sample', fragments.sample),
);
await fs.writeFile(
  path.join(outputDirectory, 'collisions.html'),
  renderPage('Contribution Party · Five-ball collision sample', fragments.collision),
);
await fs.writeFile(
  path.join(outputDirectory, 'super-party.html'),
  renderPage('Contribution Party · SUPER PARTY sample', fragments.superParty),
);

const actionDirectory = path.join(projectDirectory, '.action');
const actionRuntime = `/*\n${licenseText.trim()}\n*/\n${settingsScript}\n${contributionsScript}\n${physicsScript}\n${animationScript}\n${svgScript}\n${svgMotionScript}\n${svgLightsScript}\nexport { parsePinballConfig, parseContributionData, createPinballTimeline, renderContributionSvg };\n`;
await fs.mkdir(actionDirectory, { recursive: true });
await fs.writeFile(path.join(actionDirectory, 'runtime.js'), actionRuntime);

if (previewDirectory) {
  await fs.mkdir(previewDirectory, { recursive: true });
  await fs.writeFile(path.join(previewDirectory, 'contribution-bounce-real.html'), fragments.real);
  await fs.writeFile(path.join(previewDirectory, 'contribution-bounce-score.html'), fragments.sample);
  await fs.writeFile(path.join(previewDirectory, 'contribution-bounce-collisions.html'), fragments.collision);
  await fs.writeFile(path.join(previewDirectory, 'contribution-bounce-super-party.html'), fragments.superParty);
}

console.log(`Built ${path.relative(process.cwd(), outputDirectory) || '.'}`);
if (previewDirectory) console.log(`Updated previews in ${previewDirectory}`);
