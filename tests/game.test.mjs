import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POINTS, createGame, readFixture, hitCell, reachScore,
  awards, freezeBalls, clearAll, finishFrames,
} from './harness.mjs';

for (const name of ['sample', 'real']) {
  for (const seed of [1, 24, 88]) {
    for (const useParty of [false, true]) {
      test(name + ' natural play, seed ' + seed + ', ' + (useParty ? 'manual party' : 'single ball'), () => {
        const game = createGame(name, { seed, width: useParty ? 736 : 320 });
        const levels = readFixture(name).data.levels.flat().filter(level => level !== null);
        const total = levels.filter(level => level > 0).length;
        const maxScore = levels.reduce((sum, level) => sum + POINTS[level], 0);
        game.click(useParty ? 'party' : 'play');
        const velocities = [];
        let previousRemaining = total;
        for (let time = 0; time <= 900000 && game.hasFrame(); time += 1000 / 30) {
          game.advance(time);
          if (Math.round(time) % 1000 >= 34) continue;
          const state = game.state();
          assert(state.remaining <= previousRemaining && state.remaining >= 0);
          assert.equal(state.remaining, state.cells.filter(cell => cell.alive).length);
          const expected = state.cells.reduce((sum, cell) => sum + (cell.alive ? 0 : POINTS[cell.level]), 0);
          assert.equal(state.score, expected);
          assert.equal(state.nextMilestone, Math.max(100, Math.ceil(state.score / 100) * 100));
          assert.equal(state.autoPartyTriggered, state.score > 500);
          assert(state.balls.length <= 5);
          if (state.score > 500) assert.equal(state.balls.length, 5);
          for (const [index, ball] of state.balls.entries()) {
            velocities[index] ??= { vx: Math.abs(ball.vx), vy: Math.abs(ball.vy) };
            assert(Number.isFinite(ball.x) && Number.isFinite(ball.y));
            assert(Math.abs(Math.hypot(ball.vx, ball.vy) - 410) < 0.00001);
            assert(Math.abs(Math.abs(ball.vx) - velocities[index].vx) < 0.000001);
            assert(Math.abs(Math.abs(ball.vy) - velocities[index].vy) < 0.000001);
            assert(ball.x >= 8 + state.radius - 0.01 && ball.x <= state.width - 8 - state.radius + 0.01);
            assert(ball.y >= 8 + state.radius - 0.01 && ball.y <= state.height - 14 - state.radius + 0.01);
          }
          previousRemaining = state.remaining;
        }
        const state = game.state();
        assert.equal(state.cleared, true, 'The game must clear every active cell');
        assert.equal(state.remaining, 0);
        assert.equal(game.hasFrame(), false, 'All effects must finish within the simulation limit');
        assert.equal(state.score, maxScore);
        assert.equal(state.finalScore, maxScore);
        assert.equal(state.pendingAwards.length, 0);
        assert.equal(state.award, null);
        assert.equal(state.confetti.length, 0);
        assert.equal(state.sparks.length, 0);
        assert.equal(state.clubIntensity, 0);
        assert.equal(state.running, false);
        const expectedOver = Array.from(
          { length: Math.max(0, Math.ceil(maxScore / 100) - 1) },
          (_, index) => (index + 1) * 100 + ' OVER',
        );
        assert.deepEqual(game.awardLog.filter(label => label.endsWith('OVER')), expectedOver);
        assert.equal(game.awardLog.filter(label => label === 'PARTY TIME!').length, useParty || maxScore > 500 ? 1 : 0);
        assert.equal(Number(game.awardLog.at(-1).replace(/\D/g, '')), maxScore);
        assert.equal(game.nodes['[data-pinball-award-caption]'].textContent, 'FINAL SCORE');
        assert.equal(game.nodes['[data-pinball-award-caption]'].hidden, false);
        assert.equal(game.nodes['[data-pinball-play]'].disabled, true);
        assert.equal(game.nodes['[data-pinball-play]'].textContent, '終了');
      });
    }
  }
}

test('strict score boundaries register each OVER once and add four balls after 500', () => {
  const game = createGame('sample');
  for (const threshold of [100, 200, 300]) {
    reachScore(game, threshold);
    assert.equal(awards(game).some(award => award.threshold === threshold), false);
    hitCell(game, game.state().cells.find(cell => cell.alive && cell.level === 1));
    assert.equal(awards(game).filter(award => award.threshold === threshold).length, 1);
  }
  reachScore(game, 500);
  assert.equal(game.state().balls.length, 1);
  assert.equal(game.state().autoPartyTriggered, false);
  assert.equal(awards(game).some(award => award.threshold === 500), false);
  const cell = game.state().cells.find(candidate => candidate.alive && candidate.level === 1);
  hitCell(game, cell);
  assert.equal(game.state().score, 501);
  assert.equal(game.state().balls.length, 5);
  assert.equal(game.state().autoPartyTriggered, true);
  assert.equal(game.state().manualParty, false);
  const registered = awards(game);
  assert.deepEqual(registered.filter(award => award.kind === 'over').map(award => award.threshold), [100, 200, 300, 400, 500]);
  assert.equal(registered.filter(award => award.kind === 'party').length, 1);
  assert(registered.findIndex(award => award.kind === 'party') < registered.findIndex(award => award.threshold === 500));
  assert.equal(game.root.testing.collide({ x: cell.x + 6, y: cell.y + 6, vx: 10, vy: -10 }, cell), false);
  assert.equal(game.state().score, 501, 'A consumed cell cannot score twice');
});

test('manual party clicks and host restoration cannot duplicate balls or reset an automatic party', () => {
  const manual = createGame('sample');
  manual.click('party');
  const saves = manual.saves.length;
  manual.click('party');
  assert.equal(manual.saves.length, saves);
  reachScore(manual, 501);
  assert.equal(manual.state().balls.length, 5);
  assert.equal(awards(manual).filter(award => award.kind === 'party').length, 1);
  assert.equal(manual.state().autoPartyTriggered, true);

  const automatic = createGame('sample');
  reachScore(automatic, 501);
  const before = automatic.state().remaining;
  for (let index = 0; index < 3; index++) {
    automatic.restore({ version: 2, paused: true, manualParty: false });
  }
  assert.equal(automatic.state().score, 501);
  assert.equal(automatic.state().remaining, before);
  assert.equal(automatic.state().balls.length, 5);
  assert.equal(automatic.state().running, false);
  assert.equal(automatic.hasFrame(), false);
  assert.equal(automatic.saves.length, 0, 'Restoration never writes widget state');
  automatic.restore({ paused: 'false', manualParty: 'true' });
  assert.equal(automatic.state().running, false, 'Invalid saved field types are ignored');
  assert.equal(automatic.saves.length, 0);
  for (const saved of [
    { version: 2, paused: true, manualParty: true },
    { paused: true, party: true },
  ]) {
    const restored = createGame('real', { saved });
    assert.equal(restored.state().balls.length, 5);
    assert.equal(restored.hasFrame(), false);
    assert.equal(restored.saves.length, 0);
  }
});

for (const reducedMotion of [false, true]) {
  test('lighting, pause, and FINAL SCORE with reduced motion ' + reducedMotion, () => {
    const game = createGame('sample', { reducedMotion, width: reducedMotion ? 320 : 880, recordPaint: true });
    game.click('play');
    freezeBalls(game);
    game.advance(0);
    game.advance(50);
    assert.equal(game.state().clubTime, 0);
    assert.equal(game.state().clubIntensity, 0);
    game.click('party');
    freezeBalls(game);
    game.advance(1000);
    game.advance(1050);
    assert(game.state().clubIntensity > 0);
    assert.equal(game.state().clubTime > 0, !reducedMotion);
    const beamGeometry = game.gradients.filter(entry => entry.method === 'createLinearGradient').slice(-3);
    assert.equal(beamGeometry.length, 3);
    game.click('play');
    const paused = JSON.stringify({
      time: game.state().clubTime,
      intensity: game.state().clubIntensity,
      award: game.state().award,
      pending: game.state().pendingAwards,
      confetti: game.state().confetti,
    });
    assert.equal(game.hasFrame(), false);
    game.click('play');
    game.advance(5000);
    assert.equal(JSON.stringify({
      time: game.state().clubTime,
      intensity: game.state().clubIntensity,
      award: game.state().award,
      pending: game.state().pendingAwards,
      confetti: game.state().confetti,
    }), paused, 'Paused wall-clock time does not advance effects');
    game.advance(5050);
    if (reducedMotion) {
      assert.equal(game.state().clubTime, 0);
      assert.equal(game.state().confetti.length, 0);
      assert.deepEqual(game.gradients.filter(entry => entry.method === 'createLinearGradient').slice(-3), beamGeometry);
    }
    assert.equal(game.state().finalScore, null);
    clearAll(game);
    assert.equal(game.state().score, 1764);
    assert.equal(game.state().finalScore, null);
    assert(game.state().pendingAwards.length > 0);
    assert.equal(game.nodes['[data-pinball-award-caption]'].hidden, true);
    finishFrames(game, 5050);
    assert.equal(game.state().finalScore, 1764);
    assert.equal(game.root.testing.hasEffects(), false);
    assert.equal(game.state().clubIntensity, 0);
    assert.equal(game.nodes['[data-pinball-award-caption]'].textContent, 'FINAL SCORE');
    assert.equal(game.nodes['[data-pinball-award-detail]'].textContent, 'Happy hacking :)');
    const title = game.nodes['[data-pinball-award-title]'].textContent;
    game.root.testing.sync();
    game.root.testing.showFinalScore();
    assert.equal(game.nodes['[data-pinball-award-title]'].textContent, title);
    assert.equal(game.hasFrame(), false, 'The final score persists without an animation loop');
    game.click('restart');
    const state = game.state();
    assert.equal(state.score, 0);
    assert.equal(state.finalScore, null);
    assert.equal(state.nextMilestone, 100);
    assert.equal(state.autoPartyTriggered, false);
    assert.equal(state.manualParty, false);
    assert.equal(state.balls.length, 1);
    assert.equal(state.pendingAwards.length, 0);
    assert.equal(state.award, null);
    assert.equal(state.confetti.length, 0);
    assert.equal(state.sparks.length, 0);
    assert.equal(state.clubTime, 0);
    assert.equal(state.clubIntensity, 0);
    assert.equal(game.nodes['[data-pinball-award]'].hidden, true);
    assert.equal(game.nodes['[data-pinball-award-caption]'].hidden, true);
    assert.equal(game.nodes['[data-pinball-award-title]'].textContent, '');
    assert.equal(game.nodes['[data-pinball-award-detail]'].textContent, '');
  });
}

test('zero-contribution data produces a stable zero-point result', () => {
  const game = createGame('sample', { data: { levels: [[0, null, 0]] } });
  assert.equal(game.state().total, 0);
  assert.equal(game.state().score, 0);
  assert.equal(game.state().finalScore, 0);
  assert.equal(game.hasFrame(), false);
  assert.equal(game.nodes['[data-pinball-award-caption]'].textContent, 'FINAL SCORE');
  assert.equal(game.nodes['[data-pinball-play]'].disabled, true);
});
