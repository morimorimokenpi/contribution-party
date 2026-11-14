import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const project = new URL('../', import.meta.url);
const source = ['settings', 'contributions', 'physics', 'animation', 'svg', 'svg-motion']
  .map(name => fs.readFileSync(new URL(`dist/${name}.js`, project), 'utf8')).join('\n');
const { createPinballTimeline, renderSvgMotion } = vm.runInNewContext(
  `${source}\n({ createPinballTimeline, renderSvgMotion })`, {}, { timeout: 1000 });
const config = JSON.parse(fs.readFileSync(new URL('config/pinball.json', project), 'utf8'));

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}

function fixture() {
  const frames = [0, .25, .5, .75, 1, 1.25, 1.5, 2.5, 5.5].map(time => ({ time,
    balls: [{ id: 0, x: time <= 1 ? 100 + time * 100 : 200 - Math.min(time - 1, .5) * 100, y: 170 },
      ...(time >= .5 ? [{ id: 1, x: 220 - Math.min(time - .5, 1) * 50, y: 150 }] : [])],
    score: time >= 1.5 ? 5 : 0, remaining: time >= 1.5 ? 0 : 1, clubIntensity: 0, clubTime: 0 }));
  return { width: 320, height: 208, radius: 6.75, duration: 5.5, seed: 1, total: 1, finalScore: 5,
    clearedAt: 1.5, finalAt: 2.5, finalMessage: 'Happy hacking :)',
    cells: [{ id: 0, column: 0, row: 0, x: 18, y: 18, size: 12, level: 3, eatenAt: 1.5 }],
    frames, awards: [], scoreChanges: [{ time: 0, score: 0, remaining: 1 }, { time: 1.5, score: 5, remaining: 0 }],
    contacts: [{ time: 1.5, cellId: 0, ballId: 0, x: 32, y: 24 }],
    ballContacts: [{ time: .5, a: 0, b: 1, x: 150, y: 160 }], steeringEvents: [] };
}

function render(timeline = fixture()) {
  return renderSvgMotion({ timeline, palette: config.palettes.dark, prefix: 'motion-test' });
}

function interpolate(times, values, time) {
  let end = times.findIndex(key => key >= time);
  if (end <= 0) return end < 0 ? values.at(-1) : values[0];
  const fraction = (time - times[end - 1]) / (times[end] - times[end - 1]);
  return values[end - 1] + (values[end] - values[end - 1]) * fraction;
}

function sparkSlots(svg) {
  return [...svg.matchAll(/<g (id="motion-test-(grass|ball)-spark-slot-(\d+)"[^>]*)>([\s\S]*?)<\/g>/g)]
    .map(([, tag, layer, index, content]) => ({ layer, index: Number(index), content, attributes: attributes(tag),
      animations: [...content.matchAll(/<(?:animate|animateTransform)\b[^>]*\/>/g)].map(match => attributes(match[0])) }));
}

function animationValue(animation, time, duration) {
  const times = animation.keyTimes.split(';').map(value => Number(value) * duration);
  const values = animation.values.split(';');
  if (animation.calcMode === 'discrete') {
    let index = times.findLastIndex(key => key <= time + 1e-12);
    return values[Math.max(0, index)];
  }
  const numbers = values.map(value => value.split(' ').map(Number));
  return numbers[0].map((_, index) => interpolate(times, numbers.map(value => value[index]), time));
}

function sampleSpark(slot, time, duration) {
  const find = name => slot.animations.find(animation => animation.attributeName === name);
  if (animationValue(find('display'), time, duration) === 'none') return null;
  const transforms = slot.animations.filter(animation => animation.attributeName === 'transform');
  return { layer: slot.layer, index: slot.index,
    center: animationValue(transforms[0], time, duration).split(' ').map(Number),
    color: animationValue(find('fill'), time, duration),
    alpha: animationValue(find('fill-opacity'), time, duration)[0],
    offsets: transforms.slice(1).map(animation => animationValue(animation, time, duration)) };
}

function contactFixture(times) {
  const timeline = fixture();
  timeline.cells = times.map((time, index) => ({ id: index, column: index, row: 0,
    x: 18 + index * 16, y: 18, size: 12, level: index % 4 + 1, eatenAt: time }));
  timeline.contacts = times.map((time, index) => ({ time, cellId: index, ballId: 0, x: 30 + index * 16, y: 24 }));
  timeline.ballContacts = [];
  timeline.total = times.length;
  return timeline;
}

test('balls retain their radius and use seven delayed HTML-sized traces without a halo', () => {
  const svg = render();
  assert.equal((svg.match(/id="motion-test-ball-\d+"/g) ?? []).length, 2);
  assert.equal((svg.match(/id="motion-test-trail-\d+-\d+"/g) ?? []).length, 14);
  assert.equal((svg.match(/<path id="motion-test-motion-route-\d+"/g) ?? []).length, 2);
  assert.equal((svg.match(/<circle r="5.4"/g) ?? []).length, 14);
  assert.equal((svg.match(/<circle r="6.75"/g) ?? []).length, 2);
  assert.doesNotMatch(svg, /r="8.75"/);
  for (let index = 0; index < 7; index++) {
    const contents = svg.match(new RegExp(`<g id="motion-test-trail-0-${index}" opacity="0">([\\s\\S]*?)</g>`))?.[1];
    assert(contents);
    const opacity = attributes(contents.match(/<animate\b[^>]*\/>/)[0]);
    assert(Math.abs(Number(opacity.values.split(';').at(-1)) - (index + 1) / 7 * .2) < 1e-10);
    const motion = attributes(contents.match(/<animateMotion\b[^>]*>/)[0]);
    assert(contents.includes('<mpath href="#motion-test-motion-route-0"/>'));
    const times = motion.keyTimes.split(';').map(Number);
    const points = motion.keyPoints.split(';').map(Number);
    assert.equal(times.length, points.length);
    assert.equal(times[0], 0);
    assert.equal(times.at(-1), 1);
    for (let next = 1; next < times.length; next++) assert(times[next] > times[next - 1]);
    assert(points.every(point => point >= 0 && point <= 1));
  }
  const body = svg.match(/<g id="motion-test-ball-0" opacity="0">([\s\S]*?)<\/g>/)[1];
  assert.match(body, /values="1;1"/);
});

test('shared motion paths preserve rebound timing with a one-sixtieth-second delay per trace', () => {
  const timeline = fixture();
  const svg = render(timeline);
  const pathData = svg.match(/<path id="motion-test-motion-route-0" d="([^"]*)"/)[1];
  const positions = [...pathData.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
  let distance = 0;
  const distances = positions.map((position, index) => {
    if (index > 0) distance += Math.hypot(position[0] - positions[index - 1][0], position[1] - positions[index - 1][1]);
    return distance;
  });
  const fractions = distances.map(value => value / distance);
  for (const index of [0, 3, 6]) {
    const contents = svg.match(new RegExp(`<g id="motion-test-trail-0-${index}" opacity="0">([\\s\\S]*?)</g>`))[1];
    const motion = attributes(contents.match(/<animateMotion\b[^>]*>/)[0]);
    const times = motion.keyTimes.split(';').map(value => Number(value) * timeline.duration);
    const keyPoints = motion.keyPoints.split(';').map(Number);
    for (const time of [.8, 1.04, 1.3, 1.8, 3.5]) {
      const fraction = interpolate(times, keyPoints, time);
      const x = interpolate(fractions, positions.map(position => position[0]), fraction);
      const y = interpolate(fractions, positions.map(position => position[1]), fraction);
      const previous = Math.max(0, time - (6 - index) / 60);
      const expectedX = previous <= 1 ? 100 + previous * 100 : 200 - Math.min(previous - 1, .5) * 100;
      assert(Math.hypot(x - expectedX, y - 170) < .22);
    }
  }
});

test('new balls do not leave traces before their birth and stationary paths remain finite', () => {
  const timeline = fixture();
  for (const frame of timeline.frames) for (const ball of frame.balls) if (ball.id === 1) { ball.x = 200; ball.y = 150; }
  const svg = render(timeline);
  const oldest = svg.match(/<g id="motion-test-trail-1-0" opacity="0">([\s\S]*?)<\/g>/)[1];
  const opacity = attributes(oldest.match(/<animate\b[^>]*\/>/)[0]);
  const times = opacity.keyTimes.split(';').map(value => Number(value) * timeline.duration);
  const values = opacity.values.split(';').map(Number);
  assert.equal(values[0], 0);
  assert(Math.abs(times[1] - .6) < 1e-10);
  assert(values[1] > 0);
  assert.doesNotMatch(oldest, /<animateMotion/);
  assert.match(oldest, /values="200 150;200 150"/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('grass and ball contacts create four diagonal three-pixel sparks with a 0.22-second lifetime', () => {
  const timeline = fixture();
  const svg = render(timeline);
  const slots = sparkSlots(svg);
  for (const [name, time, color, location] of [
    ['grass', 1.5, config.palettes.dark.grass[3], [24, 24]],
    ['ball', .5, config.palettes.dark.celebration, [150, 160]],
  ]) {
    const slot = slots.find(candidate => candidate.layer === name);
    assert(slot);
    assert.equal(slot.attributes.display, 'none');
    assert.equal(slot.attributes.opacity, undefined, 'Opacity must be inherited by each rectangle, rather than composited as a group');
    assert.equal(slot.attributes['fill-opacity'], '0');
    assert.equal((slot.content.match(/width="3" height="3" rx="1"/g) ?? []).length, 4);
    assert.equal((slot.content.match(/<rect[^>]*(?:fill|opacity)=/g) ?? []).length, 0);
    assert.equal(sampleSpark(slot, time - .01, timeline.duration), null, 'Future contacts must not be visible');
    assert.equal(sampleSpark(slot, time + .22, timeline.duration), null, 'The contact disappears exactly at its lifetime boundary');
    for (const age of [0, .025, .11, .219]) {
      const state = sampleSpark(slot, time + age, timeline.duration);
      assert(state);
      assert.deepEqual(state.center, location);
      assert.equal(state.color, color);
      assert(Math.abs(state.alpha - (1 - age / .22)) < 1e-9);
      for (const [x, y] of state.offsets) {
        assert(Math.abs(Math.hypot(x, y) - 11 * age / .22) < .01);
        assert(Math.abs(Math.abs(x) - Math.abs(y)) < .01);
      }
    }
    const overlapAlpha = sampleSpark(slot, time + .025, timeline.duration).alpha;
    assert(1 - (1 - overlapAlpha) ** 4 > overlapAlpha + .1, 'Four inherited fills retain HTML-style alpha accumulation where their rectangles overlap');
  }
  assert(svg.indexOf('contact-sparks') < svg.indexOf('motion-test-ball-0'));
});

test('non-overlapping bursts reuse slots while simultaneous sparks preserve original order, coordinates, and colors', () => {
  const timeline = contactFixture([.1, .15, .12, 1, 1.1]);
  timeline.ballContacts = [{ time: .13, a: 0, b: 1, x: 24, y: 24 }, { time: 1.05, a: 0, b: 1, x: 72, y: 24 }];
  const svg = render(timeline);
  const slots = sparkSlots(svg);
  const grass = slots.filter(slot => slot.layer === 'grass');
  const balls = slots.filter(slot => slot.layer === 'ball');
  assert.equal(grass.length, 3);
  assert.equal(balls.length, 1);
  assert(svg.indexOf('motion-test-grass-sparks') < svg.indexOf('motion-test-ball-sparks'));
  for (const [time, expected] of [[.17, [0, 1, 2]], [1.12, [3, 4]]]) {
    const states = grass.map(slot => sampleSpark(slot, time, timeline.duration)).filter(Boolean);
    assert.equal(states.length, expected.length);
    states.forEach((state, index) => {
      const event = expected[index];
      assert.deepEqual(state.center, [24 + event * 16, 24]);
      assert.equal(state.color, config.palettes.dark.grass[event % 4 + 1]);
      assert(Math.abs(state.alpha - (1 - (time - timeline.contacts[event].time) / .22)) < 1e-9);
    });
  }
  assert(grass.every(slot => sampleSpark(slot, .8, timeline.duration) === null));
  assert.equal(sampleSpark(balls[0], .14, timeline.duration).color, config.palettes.dark.celebration);
  for (const slot of slots) for (const animation of slot.animations) {
    const times = animation.keyTimes.split(';').map(Number);
    assert.equal(times[0], 0);
    assert.equal(times.at(-1), 1);
    assert.equal(times.length, animation.values.split(';').length);
    for (let index = 1; index < times.length; index++) assert(times[index] > times[index - 1]);
  }
});

test('touching lifetimes and simultaneous contacts use distinct slots without losing fade or spread endpoints', () => {
  const timeline = contactFixture([0, .22, .44, 1]);
  const slots = sparkSlots(render(timeline)).filter(slot => slot.layer === 'grass');
  assert.equal(slots.length, 3, 'Touching lifetimes remain one connected burst; only a positive idle gap allows reuse');
  for (const time of [0, .11, .22, .33, .44, .55, .66, .9, 1, 1.11, 1.22]) {
    const states = slots.map(slot => sampleSpark(slot, time, timeline.duration)).filter(Boolean);
    const active = timeline.contacts.map((event, index) => ({ ...event, index }))
      .filter(event => time >= event.time && time < event.time + .22 - 1e-12);
    assert.equal(states.length, active.length);
    for (const [index, state] of states.entries()) {
      const event = active[index];
      assert.deepEqual(state.center, [24 + event.index * 16, 24]);
      assert(Math.abs(state.alpha - (1 - (time - event.time) / .22)) < 1e-9);
      assert(Math.abs(Math.hypot(...state.offsets[0]) - 11 * (time - event.time) / .22) < .01);
    }
  }
  const simultaneous = contactFixture([.1, .1, .1, .32 + 1e-10]);
  const simultaneousSlots = sparkSlots(render(simultaneous)).filter(slot => slot.layer === 'grass');
  assert.equal(simultaneousSlots.length, 4, 'An epsilon-close boundary must not create duplicate linear keyTimes in a reused slot');
  assert.deepEqual(simultaneousSlots.slice(0, 3).map(slot => sampleSpark(slot, .11, timeline.duration).center),
    [[24, 24], [40, 24], [56, 24]]);
});

test('collision events are optional, record only real enabled ball contacts, and do not alter scoring', t => {
  const data = JSON.parse(fs.readFileSync(new URL('data/sample.json', project), 'utf8'));
  const settings = { ...config, ballCollisions: true, superPartyScore: 1000 };
  const timeline = createPinballTimeline(data, settings, { initialBalls: 5, seed: 1 });
  assert(timeline.ballContacts.length > 0);
  assert.equal(timeline.finalScore, 1764);
  assert.equal(timeline.contacts.length, 371);
  for (const contact of timeline.ballContacts) {
    assert(contact.time > 0 && contact.time <= timeline.clearedAt);
    assert(Number.isFinite(contact.x) && Number.isFinite(contact.y));
    assert(contact.a !== contact.b);
  }
  const svg = render(timeline);
  const slots = sparkSlots(svg);
  const sparkAnimations = slots.reduce((sum, slot) => sum + slot.animations.length, 0);
  const contactCount = timeline.contacts.length + timeline.ballContacts.length;
  assert(slots.length < contactCount / 5, 'Disjoint bursts reuse the same rectangle groups');
  assert(sparkAnimations < contactCount * 5 * .3, 'Pooling removes at least 70% of the original five animations per contact');
  t.diagnostic(`${contactCount} contacts use ${slots.length} slots and ${sparkAnimations} spark animations`);
  assert(Buffer.byteLength(svg) < 3.5 * 1024 * 1024, 'Motion and sparks leave room for awards within the complete 5 MiB SVG budget');
  assert.equal((svg.match(/<path id="motion-test-motion-route-\d+"/g) ?? []).length, 10);
  const disabled = createPinballTimeline({ levels: [[1, 2, 3]] }, config, { initialBalls: 5 });
  assert.equal(disabled.ballContacts.length, 0);
  const legacy = fixture();
  delete legacy.ballContacts;
  assert.doesNotThrow(() => render(legacy));
});

test('empty timelines do not animate and invalid contact events fail before serialization', () => {
  const empty = createPinballTimeline({ levels: [[0, null]] }, config);
  assert.doesNotMatch(render(empty), /<animate/);
  const invalidCell = fixture();
  invalidCell.contacts[0].cellId = 999;
  assert.throws(() => render(invalidCell), /芝ID/);
  const invalidTime = fixture();
  invalidTime.ballContacts[0].time = 10;
  assert.throws(() => render(invalidTime), /接触時刻/);
  const invalidPosition = fixture();
  invalidPosition.ballContacts[0].x = NaN;
  assert.throws(() => render(invalidPosition), /接触の横位置/);
});
