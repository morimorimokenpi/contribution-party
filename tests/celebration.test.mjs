import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, freezeBalls, reachScore, readFixture } from './harness.mjs';

const source = fs.readFileSync(new URL('../dist/celebration.js', import.meta.url), 'utf8');
const drawSuperPartyBurst = vm.runInNewContext(source + '\ndrawSuperPartyBurst', {}, { timeout: 1000 });
const lights = ['#123456', '#789ABC', '#FEDCBA'];

function burstFrame(age) {
  const operations = [];
  const stack = [];
  const context = { globalAlpha: 0.75, lineWidth: 2, strokeStyle: '#ABCDEF' };
  for (const method of ['beginPath', 'arc', 'stroke', 'moveTo', 'lineTo']) {
    context[method] = (...values) => {
      assert(values.every(Number.isFinite), 'Burst coordinates remain finite');
      assert(Number.isFinite(context.globalAlpha) && context.globalAlpha >= 0 && context.globalAlpha <= 1);
      assert(Number.isFinite(context.lineWidth) && context.lineWidth > 0);
      operations.push({ method, values, strokeStyle: context.strokeStyle });
    };
  }
  context.save = () => {
    stack.push({ globalAlpha: context.globalAlpha, lineWidth: context.lineWidth, strokeStyle: context.strokeStyle });
  };
  context.restore = () => {
    assert(stack.length > 0);
    Object.assign(context, stack.pop());
  };
  drawSuperPartyBurst(context, { width: 880, height: 208, age, colors: lights });
  assert.equal(context.globalAlpha, 0.75);
  assert.equal(context.lineWidth, 2);
  assert.equal(context.strokeStyle, '#ABCDEF');
  assert.equal(stack.length, 0);
  return operations;
}

function paintFrame(game) {
  game.paintLog.length = 0;
  game.gradients.length = 0;
  game.root.testing.draw();
  return {
    beams: game.gradients.filter((gradient) => gradient.method === 'createLinearGradient'),
    rim: game.paintLog.filter(
      (operation) =>
        operation.method === 'arc' && (operation.values[1] === 8 || operation.values[1] === game.state().height - 14),
    ),
    burst: game.paintLog.filter((operation) => operation.method === 'stroke' && lights.includes(operation.strokeStyle)),
  };
}

test('SUPER burst expands three palette-colored rings, keeps drawing finite, and ends after 1.4 seconds', () => {
  const early = burstFrame(0.1);
  const later = burstFrame(0.8);
  for (const frame of [early, later]) {
    assert.equal(frame.filter((operation) => operation.method === 'arc').length, 3);
    assert(frame.some((operation) => operation.method === 'lineTo'));
    assert.deepEqual(
      [
        ...new Set(
          frame.filter((operation) => operation.method === 'stroke').map((operation) => operation.strokeStyle),
        ),
      ],
      lights,
    );
  }
  assert(
    later.find((operation) => operation.method === 'arc').values[2] >
      early.find((operation) => operation.method === 'arc').values[2],
  );
  for (const age of [-0.1, 1.4, 3.2, NaN, Infinity]) assert.equal(burstFrame(age).length, 0);
});

test('SUPER doubles club beams and adds rim lights while honoring custom colors and reduced motion', () => {
  for (const reducedMotion of [false, true]) {
    const config = readFixture('super-party').config;
    config.palettes.dark.lights = [...lights];
    const game = createGame('super-party', { config, reducedMotion, recordPaint: true });
    freezeBalls(game);
    game.click('play');
    game.advance(0);
    game.advance(100);
    const five = paintFrame(game);
    assert.equal(five.beams.length, 3);
    assert.equal(five.rim.length, 48);
    reachScore(game, 1001);
    freezeBalls(game);
    const ten = paintFrame(game);
    assert.equal(ten.beams.length, 6);
    assert.equal(ten.rim.length, 80);
    assert.equal(ten.burst.length, 0, 'The queued SUPER burst waits until its title is displayed');
    const stops = ten.beams.flatMap((beam) => beam.stops).map((stop) => stop.color.replace(/\s/g, ''));
    for (const rgb of ['18,52,86', '120,154,188', '254,220,186']) {
      assert(stops.some((color) => color.startsWith('rgba(' + rgb + ',')));
    }
    let time = 100;
    while (game.state().award?.kind !== 'super-party' && time < 10000) {
      time += 50;
      game.advance(time);
    }
    assert.equal(game.state().award?.kind, 'super-party');
    assert.equal(game.state().award.duration, 3.2);
    const active = paintFrame(game);
    if (reducedMotion) {
      assert.equal(active.burst.length, 0);
      assert.equal(game.state().confetti.length, 0);
    } else {
      assert(active.burst.length >= 3);
      assert(game.state().confetti.every((particle) => lights.includes(particle.color)));
      assert.equal(game.state().confetti.filter((particle) => particle.x < game.state().width / 2).length, 80);
      assert.equal(game.state().confetti.filter((particle) => particle.x >= game.state().width / 2).length, 80);
    }
    const transforms = [];
    while (game.state().award.age < 1.5) {
      time += 50;
      game.advance(time);
      if (game.state().award.age > 0.6) transforms.push(game.nodes['[data-pinball-award]'].style.transform);
    }
    const settled = paintFrame(game);
    assert.equal(game.state().award.kind, 'super-party');
    assert.equal(settled.burst.length, 0, 'The burst ends while the SUPER title remains visible');
    if (reducedMotion) {
      assert.equal(game.state().clubTime, 0);
      assert(transforms.every((transform) => transform === 'none'));
      assert.deepEqual(settled.beams, ten.beams, 'Reduced-motion lighting geometry and colors remain static');
    } else {
      assert(new Set(transforms).size > 1, 'The SUPER title continues its smooth pulse after the entrance');
    }
  }
});
