import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { awards, createGame, finishFrames, freezeBalls, hitCell, reachScore, readFixture } from './harness.mjs';

function configuration() {
  return JSON.parse(JSON.stringify(readFixture('sample').config));
}

function gameplay(game) {
  const { themeMode, palette, colors, lightRgb, ...state } = game.state();
  return JSON.parse(JSON.stringify(state));
}

test('generated configuration matches the editable JSON', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../config/pinball.json', import.meta.url), 'utf8'));
  assert.deepEqual(readFixture('sample').config, config);
  assert.deepEqual(readFixture('real').config, config);
  assert.equal(config.theme, 'dark');
});

test('explicit and automatic initial themes resolve independently of reduced motion', () => {
  for (const mode of ['dark', 'light', 'auto']) {
    for (const systemDark of [false, true]) {
      const config = configuration();
      config.theme = mode;
      const game = createGame('sample', { config, systemDark, reducedMotion: false });
      const resolved = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;
      assert.equal(game.state().themeMode, mode);
      assert.equal(game.root.dataset.theme, resolved);
      assert.equal(game.nodes['[data-pinball-theme]'].value, mode);
      assert.equal(game.state().palette.background, config.palettes[resolved].background);
      assert.equal(game.saves.length, 0);
      assert.equal(game.storageWrites.length, 0);
    }
  }
});

test('changing the native theme selector preserves ongoing play and saves version 3', () => {
  const game = createGame('sample');
  reachScore(game, 501);
  game.click('play');
  freezeBalls(game);
  game.advance(0);
  game.advance(50);
  const before = gameplay(game);
  game.selectTheme('light');
  assert.deepEqual(gameplay(game), before);
  assert.equal(game.state().themeMode, 'light');
  assert.equal(game.root.dataset.theme, 'light');
  assert.equal(game.saves.at(-1).modelContent.version, 3);
  assert.equal(game.saves.at(-1).modelContent.theme, 'light');
  assert.equal(game.saves.at(-1).modelContent.manualParty, false);
  game.advance(100);
  assert(game.state().clubTime > before.clubTime, 'The scheduled game continues after the theme changes');
});

test('auto follows system changes while explicit themes remain fixed', () => {
  const config = configuration();
  config.theme = 'auto';
  const game = createGame('real', { config, systemDark: false });
  const before = gameplay(game);
  game.setSystemDark(true);
  assert.equal(game.state().themeMode, 'auto');
  assert.equal(game.root.dataset.theme, 'dark');
  assert.deepEqual(gameplay(game), before);
  assert.equal(game.saves.length, 0);
  assert.equal(game.storageWrites.length, 0);
  game.selectTheme('light');
  const saves = game.saves.length;
  game.setSystemDark(false);
  game.setSystemDark(true);
  assert.equal(game.root.dataset.theme, 'light');
  assert.equal(game.state().themeMode, 'light');
  assert.equal(game.saves.length, saves);
});

test('custom palettes reach Canvas, lighting, legend, and standalone styles', () => {
  const config = configuration();
  config.palettes.dark = {
    background: '#010203',
    foreground: '#112233',
    mutedForeground: '#223344',
    surface: '#334455',
    border: '#445566',
    ball: '#123456',
    grass: ['#234567', '#345678', '#456789', '#56789A', '#6789AB'],
    celebration: '#FA1234',
    lights: ['#102030', '#405060', '#708090'],
  };
  const palette = config.palettes.dark;
  const game = createGame('real', { config, recordPaint: true, includePage: true });
  assert.deepEqual(Array.from(game.state().colors), palette.grass);
  assert.equal(game.state().palette.ball, palette.ball);
  assert(game.paintLog.some((operation) => operation.method === 'fill' && operation.fillStyle === palette.ball));
  assert(
    game.paintLog.some((operation) => operation.method === 'strokeRect' && operation.strokeStyle === palette.border),
  );
  for (const level of [0, 1, 2, 4]) {
    assert(
      game.paintLog.some((operation) => operation.method === 'fill' && operation.fillStyle === palette.grass[level]),
    );
  }
  const rootStyles = Array.from(game.root.style.properties.values());
  assert(rootStyles.includes(palette.background));
  assert(rootStyles.includes(palette.foreground));
  assert.equal(game.root.style.getPropertyValue('--pinball-border'), palette.border);
  const pageStyles = [
    ...game.page.style.properties.values(),
    game.page.style.background,
    game.page.style.backgroundColor,
    game.page.style.color,
  ];
  assert(pageStyles.includes(palette.background));
  assert(pageStyles.includes(palette.foreground));
  for (let level = 1; level <= 4; level++) {
    const swatch = game.nodes['[data-pinball-swatch="' + level + '"]'].style;
    assert([...swatch.properties.values(), swatch.background, swatch.backgroundColor].includes(palette.grass[level]));
    assert.equal(game.nodes['[data-pinball-points="' + level + '"]'].textContent, config.points[level] + ' pt');
  }
  game.click('party');
  freezeBalls(game);
  game.advance(0);
  game.advance(50);
  assert(game.state().confetti.some((particle) => particle.color === palette.celebration));
  const stops = game.gradients.flatMap((gradient) => gradient.stops).map((stop) => stop.color.replace(/\s/g, ''));
  for (const rgb of ['16,32,48', '64,80,96', '112,128,144']) {
    assert(stops.some((color) => color.startsWith('rgba(' + rgb + ',')));
  }
});

test('configured points and strict thresholds control OVER and automatic party', () => {
  const config = configuration();
  config.points = [0, 1, 4, 7, 12];
  config.overInterval = 50;
  config.partyScore = 80;
  const game = createGame('sample', { config });
  assert.deepEqual(Array.from(game.state().points), config.points);
  assert.equal(game.state().autoPartyScore, 80);
  reachScore(game, 50);
  assert.equal(awards(game).length, 0);
  hitCell(
    game,
    game.state().cells.find((cell) => cell.alive && cell.level === 1),
  );
  assert.deepEqual(
    awards(game)
      .filter((award) => award.kind === 'over')
      .map((award) => award.threshold),
    [50],
  );
  reachScore(game, 80);
  assert.equal(game.state().balls.length, 1);
  assert.equal(game.state().autoPartyTriggered, false);
  hitCell(
    game,
    game.state().cells.find((cell) => cell.alive && cell.level === 1),
  );
  assert.equal(game.state().score, 81);
  assert.equal(game.state().balls.length, 5);
  assert.equal(game.state().autoPartyTriggered, true);
});

test('saved themes override local preference without saving during restoration', () => {
  const game = createGame('real', {
    saved: { version: 3, paused: true, manualParty: true, theme: 'light' },
    storageTheme: 'dark',
  });
  assert.equal(game.state().themeMode, 'light');
  assert.equal(game.root.dataset.theme, 'light');
  assert.equal(game.state().balls.length, 5);
  assert.equal(game.saves.length, 0);
  assert.equal(game.storageWrites.length, 0);
  game.restore({ version: 3, paused: true, manualParty: true, theme: 'dark' });
  assert.equal(game.state().themeMode, 'dark');
  assert.equal(game.state().balls.length, 5);
  assert.equal(game.saves.length, 0);
  assert.equal(game.storageWrites.length, 0);
  const legacy = createGame('real', { saved: { version: 2, paused: true, manualParty: true } });
  assert.equal(legacy.state().themeMode, 'dark');
  assert.equal(legacy.state().balls.length, 5);
});

test('large safe scores collapse pending OVER effects and preserve a pending PARTY', () => {
  const config = configuration();
  config.points = [0, 101, 400, 1_000_000_000_000, 0];
  const game = createGame('sample', { config, data: { levels: [[1, 2, 3]] } });
  hitCell(game, game.state().cells[0]);
  assert.equal(game.state().award.threshold, 100);
  hitCell(game, game.state().cells[1]);
  assert.equal(game.state().balls.length, 5);
  assert.equal(game.state().pendingAwards.filter((award) => award.kind === 'party').length, 1);
  hitCell(game, game.state().cells[2]);
  assert.equal(game.state().score, 1_000_000_000_501);
  assert.equal(game.state().nextMilestone, 1_000_000_000_600);
  const pending = game.state().pendingAwards;
  assert(pending.filter((award) => award.kind === 'over').length <= 32);
  assert.equal(pending.filter((award) => award.kind === 'party').length, 1);
  assert.equal(pending.at(-1).threshold, 1_000_000_000_500);
  game.click('play');
  finishFrames(game);
  assert.equal(game.state().finalScore, 1_000_000_000_501);
  assert.equal(game.awardLog.filter((label) => label === 'PARTY TIME!').length, 1);
  assert(game.awardLog.includes('1000000000500 OVER'));
});

test('the last safe OVER boundary terminates and unsafe total scores are rejected', () => {
  const config = configuration();
  config.points = [0, Number.MAX_SAFE_INTEGER, 0, 0, 0];
  config.overInterval = Number.MAX_SAFE_INTEGER - 1;
  config.partyScore = Number.MAX_SAFE_INTEGER;
  const game = createGame('sample', { config, data: { levels: [[1, 2]] } });
  hitCell(game, game.state().cells[0]);
  assert.equal(game.state().score, Number.MAX_SAFE_INTEGER);
  assert.equal(game.state().nextMilestone, null);
  assert.equal(game.state().award.threshold, Number.MAX_SAFE_INTEGER - 1);
  assert.match(game.nodes['[data-pinball-goal]'].textContent, /No more OVER/);
  assert.equal(game.state().balls.length, 1);
  hitCell(game, game.state().cells[1]);
  game.click('play');
  finishFrames(game);
  assert.equal(game.state().finalScore, Number.MAX_SAFE_INTEGER);
  assert.throws(() => createGame('sample', { config, data: { levels: [[1, 1]] } }), /total score/);
});

test('standalone local preference is restored and unavailable storage is tolerated', () => {
  const local = createGame('real', { hostUnavailable: true, storageTheme: 'light' });
  assert.equal(local.state().themeMode, 'light');
  local.selectTheme('auto');
  assert.equal(local.storageWrites.at(-1).value, 'auto');
  assert.equal(local.saves.length, 0);
  const blocked = createGame('sample', { hostUnavailable: true, storageUnavailable: true });
  assert.equal(blocked.state().themeMode, 'dark');
  assert.doesNotThrow(() => blocked.selectTheme('light'));
  assert.equal(blocked.root.dataset.theme, 'light');
  const blockedWithHost = createGame('sample', { storageUnavailable: true });
  blockedWithHost.selectTheme('light');
  assert.equal(blockedWithHost.saves.at(-1).modelContent.theme, 'light');
  blockedWithHost.selectTheme('auto');
  assert.equal(blockedWithHost.saves.at(-1).modelContent.theme, 'auto');
  assert.equal(blockedWithHost.saves.length, 2, 'Unavailable local storage must not interrupt host theme saves');
  const invalidLocal = createGame('real', { hostUnavailable: true, storageTheme: 'sepia' });
  assert.equal(invalidLocal.state().themeMode, 'dark');
});

test('invalid configuration values and unknown keys are rejected', () => {
  const mutations = [
    (config) => {
      config.theme = 'sepia';
    },
    (config) => {
      delete config.theme;
    },
    (config) => {
      config.unknownOption = true;
    },
    (config) => {
      config.overInterval = 0;
    },
    (config) => {
      config.overInterval = 1.5;
    },
    (config) => {
      config.partyScore = -1;
    },
    (config) => {
      config.points = [0, 1, 3, 5];
    },
    (config) => {
      config.points[0] = 1;
    },
    (config) => {
      config.points[1] = 1.5;
    },
    (config) => {
      config.points[1] = Number.MAX_SAFE_INTEGER + 1;
    },
    (config) => {
      config.overInterval = Number.MAX_SAFE_INTEGER + 1;
    },
    (config) => {
      config.partyScore = Number.MAX_SAFE_INTEGER + 1;
    },
    (config) => {
      config.palettes.dark.background = 'red';
    },
    (config) => {
      config.palettes.light.ball = '#fff';
    },
    (config) => {
      delete config.palettes.dark.surface;
    },
    (config) => {
      config.palettes.dark.extra = '#112233';
    },
    (config) => {
      config.palettes.light.grass.pop();
    },
    (config) => {
      config.palettes.dark.lights.pop();
    },
  ];
  for (const mutate of mutations) {
    const config = configuration();
    mutate(config);
    assert.throws(() => createGame('sample', { config }));
  }
  const metadata = configuration();
  metadata.$schema = './pinball.schema.json';
  assert.doesNotThrow(() => createGame('sample', { config: metadata }));
});
