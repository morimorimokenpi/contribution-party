import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, readFixture } from './harness.mjs';

const physics = fs.readFileSync(new URL('../dist/physics.js', import.meta.url), 'utf8');
const resolveBallCollision = vm.runInNewContext(physics + '\nresolveBallCollision', {}, { timeout: 1000 });
const radius = 6.75;

function near(actual, expected, label) {
  assert(
    Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    label + ': expected ' + expected + ', received ' + actual,
  );
}

function quantities(bodies) {
  return {
    momentumX: bodies.reduce((sum, body) => sum + body.vx, 0),
    momentumY: bodies.reduce((sum, body) => sum + body.vy, 0),
    energy: bodies.reduce((sum, body) => sum + body.vx ** 2 + body.vy ** 2, 0),
  };
}

function conserve(before, after) {
  const previous = quantities(before);
  const current = quantities(after);
  for (const key of Object.keys(previous)) near(current[key], previous[key], key);
  for (const body of after) {
    for (const key of ['x', 'y', 'vx', 'vy']) assert(Number.isFinite(body[key]), key + ' remains finite');
  }
}

test('head-on collisions exchange velocities at contact and correct overlapping positions', () => {
  for (const distance of [2 * radius, 12]) {
    const a = { x: 0, y: 0, vx: 120, vy: 0 };
    const b = { x: distance, y: 0, vx: -80, vy: 0 };
    const before = [{ ...a }, { ...b }];
    assert.equal(resolveBallCollision(a, b, radius), true);
    near(a.vx, -80, 'first velocity');
    near(b.vx, 120, 'second velocity');
    near(a.vy, 0, 'first vertical velocity');
    near(b.vy, 0, 'second vertical velocity');
    assert(Math.hypot(b.x - a.x, b.y - a.y) >= 2 * radius - 1e-9);
    near((a.x + b.x) / 2, distance / 2, 'position center');
    conserve(before, [a, b]);
    const separated = [{ ...a }, { ...b }];
    assert.equal(resolveBallCollision(a, b, radius), false);
    near(a.vx, separated[0].vx, 'first velocity after a repeated check');
    near(b.vx, separated[1].vx, 'second velocity after a repeated check');
  }
});

test('oblique collisions exchange normal velocity and preserve tangential velocity and total energy', () => {
  const a = { x: 0, y: 0, vx: 100, vy: 30 };
  const b = { x: 9, y: 9, vx: -20, vy: -40 };
  const before = [{ ...a }, { ...b }];
  const normal = (body) => (body.vx + body.vy) / Math.SQRT2;
  const tangent = (body) => (-body.vx + body.vy) / Math.SQRT2;
  assert.equal(resolveBallCollision(a, b, radius), true);
  near(normal(a), normal(before[1]), 'first normal velocity');
  near(normal(b), normal(before[0]), 'second normal velocity');
  near(tangent(a), tangent(before[0]), 'first tangential velocity');
  near(tangent(b), tangent(before[1]), 'second tangential velocity');
  assert.notEqual(Math.hypot(a.vx, a.vy), Math.hypot(before[0].vx, before[0].vy));
  conserve(before, [a, b]);
});

test('separated circles are untouched and overlapping circles moving apart are only repositioned', () => {
  const a = { x: 0, y: 0, vx: -10, vy: 3 };
  const b = { x: 30, y: 0, vx: 20, vy: 7 };
  const untouched = [{ ...a }, { ...b }];
  assert.equal(resolveBallCollision(a, b, radius), false);
  assert.deepEqual([a, b], untouched);
  b.x = 12;
  const before = [{ ...a }, { ...b }];
  assert.equal(resolveBallCollision(a, b, radius), false);
  for (const [index, body] of [a, b].entries()) {
    near(body.vx, before[index].vx, 'unchanged horizontal velocity');
    near(body.vy, before[index].vy, 'unchanged vertical velocity');
  }
  assert(Math.hypot(b.x - a.x, b.y - a.y) >= 2 * radius - 1e-9);
  conserve(before, [a, b]);
});

test('coincident centers remain finite for moving, identical, and stationary velocities', () => {
  for (const velocities of [
    [120, -80, -30, 90],
    [12, -8, 12, -8],
    [0, 0, 0, 0],
  ]) {
    const a = { x: 10, y: 20, vx: velocities[0], vy: velocities[1] };
    const b = { x: 10, y: 20, vx: velocities[2], vy: velocities[3] };
    const before = [{ ...a }, { ...b }];
    const reflected = resolveBallCollision(a, b, radius);
    assert.equal(reflected, a.vx !== before[0].vx || a.vy !== before[0].vy);
    assert(Math.hypot(b.x - a.x, b.y - a.y) >= 2 * radius - 1e-9);
    near((a.x + b.x) / 2, 10, 'horizontal position center');
    near((a.y + b.y) / 2, 20, 'vertical position center');
    conserve(before, [a, b]);
  }
});

for (const reducedMotion of [false, true]) {
  test(
    'collision demo starts paused with five balls and collides within one second, reduced motion ' + reducedMotion,
    () => {
      const fixture = readFixture('collision');
      assert.equal(fixture.config.ballCollisions, true);
      assert.equal(fixture.collisionDemo, true);
      assert.deepEqual(fixture.data, readFixture('sample').data);
      const game = createGame('collision', { reducedMotion, recordCollisions: true });
      assert.equal(game.state().balls.length, 5);
      assert.equal(game.state().running, false);
      assert.equal(game.hasFrame(), false);
      game.click('play');
      let time = 0;
      for (; time <= 1000 && game.collisionLog.length === 0; time += 1000 / 60) game.advance(time);
      assert(game.collisionLog.length > 0, 'The initial arrangement produces an actual ball collision');
      for (const collision of game.collisionLog) conserve(collision.before, collision.after);
      assert(
        game.collisionLog.some(({ before, after }) =>
          before.some(
            (body, index) => Math.abs(body.vx - after[index].vx) > 1e-6 || Math.abs(body.vy - after[index].vy) > 1e-6,
          ),
        ),
      );
      if (reducedMotion) {
        assert.equal(game.state().sparks.length, 0);
      } else {
        assert(game.state().sparks.some((spark) => spark.color === fixture.config.palettes.dark.celebration));
      }
      game.click('play');
      assert.equal(game.hasFrame(), false);
      const paused = JSON.stringify(game.state().balls);
      game.selectTheme('light');
      assert.equal(JSON.stringify(game.state().balls), paused);
      game.click('restart');
      assert.equal(game.state().balls.length, 5);
      assert.equal(game.state().score, 0);
    },
  );
}

test('ball collisions are optional, default off, and reject non-boolean configuration', () => {
  const config = readFixture('sample').config;
  assert.equal(config.ballCollisions ?? false, false);
  for (const value of [true, false]) {
    assert.doesNotThrow(() => createGame('sample', { config: { ...config, ballCollisions: value } }));
  }
  const { ballCollisions, ...legacy } = config;
  assert.doesNotThrow(() => createGame('sample', { config: legacy }));
  for (const value of [0, 1, null, 'true']) {
    assert.throws(() => createGame('sample', { config: { ...config, ballCollisions: value } }));
  }
});

test('collision demo clears all sample grass and settles with finite conserved total energy', (t) => {
  const game = createGame('collision', { seed: 1 });
  const initialEnergy = quantities(game.state().balls).energy;
  const maximumSpeed = Math.sqrt(initialEnergy);
  let greatestSpeed = 0;
  let greatestEnergyDrift = 0;
  let elapsed = 0;
  let previousRemaining = game.state().total;
  game.click('play');
  for (let time = 0; time <= 300000 && game.hasFrame(); time += 1000 / 30) {
    game.advance(time);
    elapsed = time;
    const state = game.state();
    assert.equal(state.balls.length, 5);
    assert(state.remaining >= 0 && state.remaining <= previousRemaining);
    assert.equal(state.remaining, state.cells.filter((cell) => cell.alive).length);
    assert.equal(
      state.score,
      state.cells.reduce((sum, cell) => sum + (cell.alive ? 0 : state.points[cell.level]), 0),
    );
    const energy = quantities(state.balls).energy;
    assert(Number.isFinite(energy));
    greatestEnergyDrift = Math.max(greatestEnergyDrift, Math.abs(energy - initialEnergy));
    assert(Math.abs(energy - initialEnergy) <= initialEnergy * 1e-8, 'Total kinetic energy does not drift during play');
    for (const ball of state.balls) {
      for (const key of ['x', 'y', 'vx', 'vy']) assert(Number.isFinite(ball[key]));
      const speed = Math.hypot(ball.vx, ball.vy);
      greatestSpeed = Math.max(greatestSpeed, speed);
      assert(speed <= maximumSpeed + 1e-6);
      assert(ball.x >= 8 + state.radius - 0.01 && ball.x <= state.width - 8 - state.radius + 0.01);
      assert(ball.y >= 8 + state.radius - 0.01 && ball.y <= state.height - 14 - state.radius + 0.01);
    }
    previousRemaining = state.remaining;
  }
  const final = game.state();
  assert.equal(final.remaining, 0, 'The collision demo clears every sample cell within five simulated minutes');
  assert.equal(final.cleared, true);
  assert.equal(final.score, 1764);
  assert.equal(final.finalScore, 1764);
  assert.equal(final.running, false);
  assert.equal(game.hasFrame(), false);
  assert.equal(final.pendingAwards.length, 0);
  assert.equal(final.award, null);
  assert.equal(final.clubIntensity, 0);
  assert.equal(final.sparks.length, 0);
  assert(greatestSpeed > 410, 'Elastic collisions can redistribute speed among the five balls');
  assert.deepEqual(
    game.awardLog.filter((label) => label.endsWith('OVER')),
    Array.from({ length: 17 }, (_, index) => (index + 1) * 100 + ' OVER'),
  );
  t.diagnostic(
    'Settled at ' +
      (elapsed / 1000).toFixed(1) +
      ' simulated seconds; maximum ball speed ' +
      greatestSpeed.toFixed(2) +
      '; maximum relative energy drift ' +
      (greatestEnergyDrift / initialEnergy).toExponential(2),
  );
});

test('enabling collisions in the regular game safely separates the five balls spawned together', () => {
  const config = { ...readFixture('sample').config, ballCollisions: true };
  const game = createGame('sample', { config, seed: 1 });
  assert.equal(game.state().balls.length, 1);
  game.click('party');
  const balls = game.state().balls;
  assert.equal(balls.length, 5);
  assert(balls.every((ball) => ball.x === balls[0].x && ball.y === balls[0].y));
  const initialEnergy = quantities(balls).energy;
  for (let tick = 0; tick < 100; tick++) {
    game.advance((tick * 1000) / 60);
    const state = game.state();
    assert.equal(state.balls.length, 5);
    near(quantities(state.balls).energy, initialEnergy, 'total energy after a shared-position spawn');
    for (const ball of state.balls) {
      for (const key of ['x', 'y', 'vx', 'vy']) assert(Number.isFinite(ball[key]));
      assert(ball.x >= 8 + state.radius - 0.01 && ball.x <= state.width - 8 - state.radius + 0.01);
      assert(ball.y >= 8 + state.radius - 0.01 && ball.y <= state.height - 14 - state.radius + 0.01);
    }
  }
});
