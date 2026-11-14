import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const scripts = ['settings', 'svg', 'svg-lights']
  .map((name) => fs.readFileSync(new URL(`../dist/${name}.js`, import.meta.url), 'utf8'))
  .join('\n');
const renderSvgLights = vm.runInNewContext(scripts + '\nrenderSvgLights', {}, { timeout: 1000 });
const configuration = JSON.parse(fs.readFileSync(new URL('../config/pinball.json', import.meta.url), 'utf8'));

function fixture({ duration = 12, partyAt = 1, superAt = 4, clearedAt = 8 } = {}) {
  const frames = Array.from({ length: Math.round(duration * 60) + 1 }, (_, index) => {
    const time = index / 60;
    const phase = Math.max(0, Math.min(time, clearedAt) - partyAt);
    const rise = 1 - Math.exp(-2.8 * phase);
    const fade = time <= clearedAt ? 1 : Math.exp(-5.6 * (time - clearedAt));
    const intensity = rise * fade;
    return {
      time,
      balls: Array.from({ length: time < partyAt ? 1 : time < superAt ? 5 : 10 }, (_, id) => ({ id, x: 20, y: 180 })),
      score: 0,
      remaining: time < clearedAt ? 1 : 0,
      clubTime: phase,
      clubIntensity: intensity < 0.003 ? 0 : intensity,
    };
  });
  return {
    timeline: {
      width: 880,
      height: 208,
      radius: 6.75,
      duration,
      seed: 1,
      total: 1,
      finalScore: 1,
      clearedAt,
      finalAt: clearedAt + 1.2,
      finalMessage: 'Happy hacking :)',
      cells: [],
      awards: [],
      scoreChanges: [],
      contacts: [],
      steeringEvents: [],
      frames,
    },
    palette: configuration.palettes.dark,
    prefix: 'lights',
  };
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
}

function element(svg, name, id) {
  const match = svg.match(new RegExp(`<${name}\\b([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)<\\/${name}>`));
  assert(match, `${name} ${id} exists`);
  return { attributes: attributes(match[1]), content: match[2] };
}

function animation(content, attribute) {
  const tags = [...content.matchAll(/<animate\b[^>]*\/>/g)].map((match) => attributes(match[0]));
  const result = tags.find((tag) => tag.attributeName === attribute);
  assert(result, `${attribute} animation exists`);
  return result;
}

function sample(animated, time, duration, parse = Number) {
  const keys = animated.keyTimes.split(';').map((value) => Number(value) * duration);
  const values = animated.values.split(';').map(parse);
  let index = 0;
  while (index + 1 < keys.length && keys[index + 1] <= time) index++;
  if (animated.calcMode === 'discrete' || index === keys.length - 1) return values[index];
  const fraction = (time - keys[index]) / (keys[index + 1] - keys[index]);
  const first = values[index];
  const last = values[index + 1];
  return Array.isArray(first)
    ? first.map((value, coordinate) => value + (last[coordinate] - value) * fraction)
    : first + (last - first) * fraction;
}

function sourceState(scene, time) {
  const frames = scene.timeline.frames;
  let index = 0;
  while (index + 1 < frames.length && frames[index + 1].time <= time) index++;
  const first = frames[index];
  const last = frames[index + 1] ?? first;
  const fraction = first.time === last.time ? 0 : (time - first.time) / (last.time - first.time);
  return {
    phase: first.clubTime + (last.clubTime - first.clubTime) * fraction,
    intensity: first.clubIntensity + (last.clubIntensity - first.clubIntensity) * fraction,
  };
}

function close(actual, expected, tolerance, label) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} matches ${expected} within ${tolerance}`);
}

test('SVG beam geometry, user-space gradients and glow match the Canvas formulas in both party phases', () => {
  const scene = fixture();
  const svg = renderSvgLights(scene, 'beams');
  for (const [boosted, times] of [
    [false, [1.25, 2.7, 3.95]],
    [true, [4.05, 6.35, 8.2]],
  ]) {
    const count = boosted ? 6 : 3;
    for (let index = 0; index < count; index++) {
      const id = `lights-beam-${boosted ? '10' : '5'}-${index}`;
      const path = element(svg, 'path', id);
      const gradient = element(svg, 'linearGradient', id + '-gradient');
      const glowGradient = element(svg, 'radialGradient', id + '-glow-gradient');
      const glow = element(svg, 'rect', id + '-glow');
      assert.equal(gradient.attributes.gradientUnits, 'userSpaceOnUse');
      assert.equal(gradient.attributes.y1, '8');
      assert.equal(gradient.attributes.y2, '194');
      assert.equal(glowGradient.attributes.r, '100');
      assert.equal(glow.attributes.y, '68');
      assert.equal(glow.attributes.width, '200');
      assert.equal(glow.attributes.height, '140');
      for (const time of times) {
        const state = sourceState(scene, time);
        const source = 880 * (boosted ? 0.08 + (index * 0.84) / (count - 1) : 0.13 + index * 0.37);
        const target = Math.max(
          80,
          Math.min(
            800,
            source + Math.sin(state.phase * (boosted ? 0.95 : 0.65) + index * 2.1) * 880 * (boosted ? 0.28 : 0.2),
          ),
        );
        const spread = boosted ? 40 + (index % 3) * 10 : 70 + index * 12;
        const pulse = 0.65 + 0.35 * Math.sin(state.phase * Math.PI * (boosted ? 1.8 : 1.4) + index * 1.7);
        const shape = sample(animation(path.content, 'd'), time, 12, (value) =>
          (value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number),
        );
        const expected = [source - 3, 9, target - spread, 193, target + spread, 193, source + 3, 9];
        shape.forEach((coordinate, position) => {
          close(coordinate, expected[position], 0.16, `${id} coordinate ${position} at ${time}`);
        });
        close(sample(animation(gradient.content, 'x2'), time, 12), target, 0.13, `${id} gradient target`);
        close(sample(animation(glowGradient.content, 'cx'), time, 12), target, 0.13, `${id} glow center`);
        close(sample(animation(glowGradient.content, 'fx'), time, 12), target, 0.13, `${id} glow focus`);
        close(sample(animation(glow.content, 'x'), time, 12), target - 100, 0.14, `${id} glow bounds`);
        const middle = gradient.content.match(/<stop offset="\.7"[^>]*>([\s\S]*?)<\/stop>/)?.[1];
        assert(middle);
        close(
          sample(animation(middle, 'stop-opacity'), time, 12),
          state.intensity * (boosted ? 0.2 + pulse * 0.22 : 0.14 + pulse * 0.17),
          0.0015,
          `${id} gradient alpha`,
        );
        const glowStop = glowGradient.content.match(/<stop offset="0"[^>]*>([\s\S]*?)<\/stop>/)?.[1];
        assert(glowStop);
        close(
          sample(animation(glowStop, 'stop-opacity'), time, 12),
          state.intensity * (boosted ? 0.16 + pulse * 0.2 : 0.1 + pulse * 0.15),
          0.0015,
          `${id} glow alpha`,
        );
      }
    }
  }
  assert.equal((svg.match(/id="lights-beam-5-\d+"/g) ?? []).length, 3);
  assert.equal((svg.match(/id="lights-beam-10-\d+"/g) ?? []).length, 6);
  assert.equal((svg.match(/style="mix-blend-mode:screen"/g) ?? []).length, 18);
  assert.doesNotMatch(svg, /<animateTransform/);
});

test('rim lights use the same upper and lower circles, colors, pulse offsets and alpha as Canvas', () => {
  const scene = fixture();
  const svg = renderSvgLights(scene, 'rim');
  for (const boosted of [false, true]) {
    const label = boosted ? '10' : '5';
    const count = boosted ? 40 : 24;
    assert.equal((svg.match(new RegExp(`id="lights-rim-${label}-dot-\\d+"`, 'g')) ?? []).length, count * 2);
    for (const index of [0, Math.floor(count / 2), count - 1]) {
      const pair = element(svg, 'g', `lights-rim-${label}-pair-${index}`);
      const circles = [...pair.content.matchAll(/<circle\b[^>]*\/>/g)].map((match) => attributes(match[0]));
      assert.equal(circles.length, 2);
      assert.deepEqual(
        circles.map((circle) => Number(circle.cy)),
        [8, 194],
      );
      for (const circle of circles) {
        close(Number(circle.cx), 18 + (844 * index) / (count - 1), 0.0051, 'rim x');
        assert.equal(Number(circle.r), boosted ? 3.2 : 2.7);
        assert.equal(circle.fill, configuration.palettes.dark.lights[index % 3]);
      }
      for (const time of boosted ? [4.2, 6.5, 8.2] : [1.3, 2.5, 3.9]) {
        const state = sourceState(scene, time);
        const pulse = 0.5 + 0.5 * Math.sin(state.phase * Math.PI * (boosted ? 1.8 : 1.4) - index * 0.62);
        const expected = state.intensity * (boosted ? 0.35 + pulse * 0.65 : 0.25 + pulse * 0.6);
        close(sample(animation(pair.content, 'opacity'), time, 12), expected, 0.0015, `${label} rim ${index}`);
      }
    }
  }
  assert.doesNotMatch(svg, /<rect|mix-blend-mode/);
  const light = renderSvgLights({ ...scene, palette: configuration.palettes.light }, 'rim');
  for (const color of configuration.palettes.light.lights) assert(light.includes(color));
});

test('phase switches and fade share the loop clock, stop movement at clear, and produce valid SMIL', () => {
  const scene = fixture();
  const beams = renderSvgLights(scene, 'beams');
  const rim = renderSvgLights(scene, 'rim');
  const five = element(beams, 'g', 'lights-club-beams-5');
  const ten = element(beams, 'g', 'lights-club-beams-10');
  const fiveVisibility = animation(five.content, 'opacity');
  const tenVisibility = animation(ten.content, 'opacity');
  assert.equal(sample(fiveVisibility, 3.99, 12), 1);
  assert.equal(sample(fiveVisibility, 4, 12), 0);
  assert.equal(sample(tenVisibility, 3.99, 12), 0);
  assert.equal(sample(tenVisibility, 4, 12), 1);
  const gradient = element(beams, 'linearGradient', 'lights-beam-10-1-gradient');
  const moving = animation(gradient.content, 'x2');
  close(sample(moving, 8, 12), sample(moving, 8.7, 12), 0.001, 'light clock freezes at clear');
  const pair = element(rim, 'g', 'lights-rim-10-pair-0');
  const opacity = animation(pair.content, 'opacity');
  assert(sample(opacity, 8.2, 12) > sample(opacity, 8.8, 12));
  assert.equal(sample(opacity, 9.1, 12), 0);
  for (const [tag] of (beams + rim).matchAll(/<animate\b[^>]*\/>/g)) {
    const animated = attributes(tag);
    assert.equal(animated.dur, '12s');
    assert.equal(animated.repeatCount, 'indefinite');
    const keys = animated.keyTimes.split(';').map(Number);
    assert.equal(keys.length, animated.values.split(';').length);
    assert.equal(keys[0], 0);
    assert.equal(keys.at(-1), 1);
    for (let index = 1; index < keys.length; index++) assert(keys[index] > keys[index - 1]);
  }
  const dark = fixture();
  for (const frame of dark.timeline.frames) frame.clubIntensity = 0;
  assert.equal(renderSvgLights(dark, 'beams'), '');
  assert.equal(renderSvgLights(dark, 'rim'), '');
  assert(Buffer.byteLength(beams + rim) < 1_000_000);
});
