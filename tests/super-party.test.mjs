import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awards,
  clearAll,
  createGame,
  finishFrames,
  freezeBalls,
  hitCell,
  reachScore,
  readFixture,
} from './harness.mjs';

const normalizeLabel = (label) => label.replace(/\s+/g, ' ').trim();
const energy = (balls) => balls.reduce((sum, ball) => sum + ball.vx ** 2 + ball.vy ** 2, 0);

function insideWalls(game) {
  const state = game.state();
  for (const ball of state.balls) {
    for (const key of ['x', 'y', 'vx', 'vy']) assert(Number.isFinite(ball[key]), key + ' remains finite');
    assert(ball.x >= 8 + state.radius - 0.01 && ball.x <= state.width - 8 - state.radius + 0.01);
    assert(ball.y >= 8 + state.radius - 0.01 && ball.y <= state.height - 14 - state.radius + 0.01);
  }
}

test('SUPER PARTY configuration is optional, disabled by default, and validates its threshold', () => {
  const config = readFixture('sample').config;
  assert.equal(config.superPartyScore ?? null, null);
  for (const value of [null, 500, 1000, Number.MAX_SAFE_INTEGER]) {
    assert.doesNotThrow(() => createGame('sample', { config: { ...config, superPartyScore: value } }));
  }
  const { superPartyScore, ...legacy } = config;
  assert.doesNotThrow(() => createGame('sample', { config: legacy }));
  for (const value of [-1, 499, 1000.5, Number.MAX_SAFE_INTEGER + 1, true, '1000']) {
    assert.throws(() => createGame('sample', { config: { ...config, superPartyScore: value } }));
  }
  const fixture = readFixture('super-party');
  assert.equal(fixture.config.ballCollisions, true);
  assert.equal(fixture.config.superPartyScore, 1000);
  assert.equal(fixture.collisionDemo, true);
  assert.deepEqual(fixture.data, readFixture('sample').data);
});

for (const reducedMotion of [false, true]) {
  test('1000 stays at five balls and 1001 triggers SUPER PARTY once, reduced motion ' + reducedMotion, () => {
    const game = createGame('super-party', { reducedMotion });
    assert.equal(game.state().balls.length, 5);
    assert.equal(game.hasFrame(), false);
    reachScore(game, 1000);
    assert.equal(game.state().balls.length, 5);
    assert.equal(game.state().superPartyTriggered, false);
    assert.equal(awards(game).filter((award) => award.threshold === 1000).length, 0);
    const cell = game.state().cells.find((cell) => cell.alive && cell.level === 1);
    hitCell(game, cell);
    assert.equal(game.state().score, 1001);
    assert.equal(game.state().balls.length, 10);
    assert.equal(game.state().superPartyTriggered, true);
    assert.equal(awards(game).filter((award) => award.threshold === 1000).length, 1);
    const registered = awards(game).length;
    const saves = game.saves.length;
    game.click('party');
    assert.equal(game.state().balls.length, 10);
    assert.equal(awards(game).length, registered);
    assert.equal(game.saves.length, saves);
    assert.equal(game.root.testing.collide({ x: cell.x + 6, y: cell.y + 6, vx: 10, vy: -10 }, cell), false);
    assert.equal(game.state().score, 1001);

    game.click('play');
    freezeBalls(game);
    game.advance(0);
    game.advance(50);
    assert(game.state().clubIntensity > 0);
    assert.equal(game.state().clubTime > 0, !reducedMotion);
    if (reducedMotion) assert.equal(game.state().confetti.length, 0);
    game.click('play');
    const paused = JSON.stringify({
      award: game.state().award,
      time: game.state().clubTime,
      intensity: game.state().clubIntensity,
    });
    assert.equal(game.hasFrame(), false);
    const beforeRestoreSaves = game.saves.length;
    const beforeRestoreStorage = game.storageWrites.length;
    game.restore({ version: 3, paused: true, manualParty: false, theme: 'light' });
    assert.equal(game.state().score, 1001);
    assert.equal(game.state().balls.length, 10);
    assert.equal(game.state().superPartyTriggered, true);
    assert.equal(game.state().manualParty, false);
    assert.equal(
      JSON.stringify({ award: game.state().award, time: game.state().clubTime, intensity: game.state().clubIntensity }),
      paused,
    );
    assert.equal(game.saves.length, beforeRestoreSaves);
    assert.equal(game.storageWrites.length, beforeRestoreStorage);
    game.click('play');
    game.advance(1000);
    let time = 1000;
    while (
      normalizeLabel(game.nodes['[data-pinball-award-title]'].textContent) !== 'SUPER PARTY TIME' &&
      time < 10000
    ) {
      time += 50;
      game.advance(time);
    }
    assert.equal(normalizeLabel(game.nodes['[data-pinball-award-title]'].textContent), 'SUPER PARTY TIME');
    assert.equal(game.nodes['[data-pinball-award-detail]'].textContent, '');
    assert.equal(game.state().confetti.length, reducedMotion ? 0 : 160);
    clearAll(game);
    finishFrames(game, time);
    assert.equal(game.state().finalScore, 1764);
    assert.equal(game.state().balls.length, 10);
    assert.equal(game.state().clubIntensity, 0);
    assert.equal(game.state().running, false);
    assert.equal(game.hasFrame(), false);
    assert.equal(game.awardLog.map(normalizeLabel).filter((label) => label === 'SUPER PARTY TIME').length, 1);
    assert.deepEqual(
      game.awardLog.filter((label) => label.endsWith('OVER')),
      Array.from({ length: 17 }, (_, index) => (index + 1) * 100 + ' OVER'),
    );
    game.click('restart');
    assert.equal(game.state().score, 0);
    assert.equal(game.state().finalScore, null);
    assert.equal(game.state().balls.length, 5);
    assert.equal(game.state().superPartyTriggered, false);
    assert.equal(game.state().pendingAwards.length, 0);
    assert.equal(game.state().award, null);
    assert.equal(game.state().clubTime, 0);
    assert.equal(game.state().clubIntensity, 0);
  });
}

test('one scoring event can promote a single ball through both party phases in order', () => {
  const config = {
    ...readFixture('sample').config,
    superPartyScore: 1000,
    ballCollisions: true,
    points: [0, 1001, 3, 5, 10],
  };
  const game = createGame('sample', { config, data: { levels: [[1]] } });
  assert.equal(game.state().balls.length, 1);
  hitCell(game, game.state().cells[0]);
  assert.equal(game.state().score, 1001);
  assert.equal(game.state().balls.length, 10);
  assert.equal(game.state().autoPartyTriggered, true);
  assert.equal(game.state().superPartyTriggered, true);
  assert.equal(awards(game).filter((award) => award.threshold === 1000).length, 1);
  game.click('play');
  finishFrames(game);
  const labels = game.awardLog.map(normalizeLabel);
  assert.equal(labels[0], 'PARTY TIME!');
  assert.equal(labels[1], 'SUPER PARTY TIME');
  assert.equal(labels.filter((label) => label === 'SUPER PARTY TIME').length, 1);
  assert.equal(game.state().finalScore, 1001);
});

test('a manually started party keeps its automatic ten-ball upgrade during host restoration', () => {
  const config = { ...readFixture('sample').config, superPartyScore: 1000, ballCollisions: true };
  const game = createGame('sample', { config });
  game.click('party');
  assert.equal(game.state().manualParty, true);
  reachScore(game, 1001);
  const remaining = game.state().remaining;
  const saves = game.saves.length;
  game.restore({ version: 3, paused: true, manualParty: false });
  assert.equal(game.state().manualParty, false);
  assert.equal(game.state().balls.length, 10);
  assert.equal(game.state().score, 1001);
  assert.equal(game.state().remaining, remaining);
  assert.equal(game.state().superPartyTriggered, true);
  assert.equal(game.saves.length, saves);
});

test('the overlapping ten-ball spawn stays finite, inside walls, and conserves energy', () => {
  const game = createGame('super-party', { seed: 1 });
  reachScore(game, 1001);
  const initialEnergy = energy(game.state().balls);
  game.click('play');
  for (let tick = 0; tick < 100; tick++) {
    game.advance((tick * 1000) / 60);
    assert.equal(game.state().balls.length, 10);
    insideWalls(game);
    assert(Math.abs(energy(game.state().balls) - initialEnergy) <= initialEnergy * 1e-8);
  }
});

test('SUPER PARTY natural play clears all grass and finishes every queued effect', (t) => {
  const game = createGame('super-party', { seed: 1 });
  const initialEnergy = energy(game.state().balls);
  let maximumSpeed = 0;
  let maximumRelativeDrift = 0;
  let elapsed = 0;
  let clearedAt = null;
  const pauseDuration = 5000;
  game.click('play');
  for (let time = 0; time <= 300000 && game.hasFrame(); time += 1000 / 30) {
    game.advance(time);
    elapsed = time;
    const state = game.state();
    assert.equal(state.balls.length, state.score > 1000 ? 10 : 5);
    assert.equal(state.superPartyTriggered, state.score > 1000);
    assert.equal(
      state.score,
      state.cells.reduce((sum, cell) => sum + (cell.alive ? 0 : state.points[cell.level]), 0),
    );
    const expectedEnergy = initialEnergy + (state.balls.length - 5) * state.speed ** 2;
    const drift = Math.abs(energy(state.balls) - expectedEnergy) / expectedEnergy;
    maximumRelativeDrift = Math.max(maximumRelativeDrift, drift);
    assert(drift <= 1e-8);
    insideWalls(game);
    for (const ball of state.balls) maximumSpeed = Math.max(maximumSpeed, Math.hypot(ball.vx, ball.vy));
    if (clearedAt === null && state.remaining === 0) {
      clearedAt = time;
      assert.equal(state.award, null);
      assert.equal(state.pendingAwards.length, 0);
      assert.equal(state.confetti.length, 0);
      assert.equal(state.finalScore, null);
      assert(state.clubIntensity > 0);
      const fading = JSON.stringify({ intensity: state.clubIntensity, phase: state.clubTime, sparks: state.sparks });
      game.click('play');
      assert.equal(game.hasFrame(), false);
      game.click('play');
      time += pauseDuration;
      game.advance(time);
      assert.equal(
        JSON.stringify({
          intensity: game.state().clubIntensity,
          phase: game.state().clubTime,
          sparks: game.state().sparks,
        }),
        fading,
        'Paused wall-clock time does not advance the clear lighting fade or particles',
      );
    }
  }
  const final = game.state();
  assert.equal(final.remaining, 0);
  assert.equal(final.finalScore, 1764);
  assert.equal(final.balls.length, 10);
  assert.equal(final.clubIntensity, 0);
  assert.equal(final.award, null);
  assert.equal(final.pendingAwards.length, 0);
  assert.equal(final.confetti.length, 0);
  assert.equal(final.sparks.length, 0);
  assert.equal(final.running, false);
  assert.equal(game.hasFrame(), false);
  assert.equal(game.awardLog.map(normalizeLabel).filter((label) => label === 'SUPER PARTY TIME').length, 1);
  assert.deepEqual(
    game.awardLog.filter((label) => label.endsWith('OVER')),
    Array.from({ length: 17 }, (_, index) => (index + 1) * 100 + ' OVER'),
  );
  assert.notEqual(clearedAt, null);
  const finalDelay = (elapsed - clearedAt - pauseDuration) / 1000;
  assert(finalDelay >= 0.9 && finalDelay <= 1.15, 'The clear lighting fade finishes in about one second');
  t.diagnostic(
    'Settled at ' +
      ((elapsed - pauseDuration) / 1000).toFixed(1) +
      ' active simulated seconds; clear-to-final delay ' +
      finalDelay.toFixed(3) +
      ' seconds; maximum ball speed ' +
      maximumSpeed.toFixed(2) +
      '; maximum relative energy drift ' +
      maximumRelativeDrift.toExponential(2),
  );
});
