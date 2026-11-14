import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const settings = fs.readFileSync(new URL('../dist/settings.js', import.meta.url), 'utf8');
const renderer = ['svg-motion', 'svg-lights', 'svg'].map(name => fs.readFileSync(new URL('../dist/' + name + '.js', import.meta.url), 'utf8')).join('\n');
const { renderContributionSvg, compactSvgAnimationTimes } = vm.runInNewContext(settings + '\n' + renderer + '\n({ renderContributionSvg, compactSvgAnimationTimes })', {}, { timeout: 1000 });
const configuration = JSON.parse(fs.readFileSync(new URL('../config/pinball.json', import.meta.url), 'utf8'));

function fixture() {
  const frames = Array.from({ length: 301 }, (_, index) => {
    const time = index / 60;
    const travel = Math.min(time, 1.5);
    return { time, balls: [{ id: 0, x: travel <= 1 ? 30 + travel * 100 : 130 - (travel - 1) * 100, y: 170 - travel * 30 }],
      score: time < 1.5 ? 0 : 1, remaining: time < 1.5 ? 1 : 0, clubIntensity: 0, clubTime: 0 };
  });
  return { width: 320, height: 208, radius: 6.75, duration: 5, seed: 1, total: 1, finalScore: 1,
    clearedAt: 1.5, finalAt: 2, finalMessage: 'Happy hacking :)',
    cells: [{ id: 0, column: 0, row: 0, x: 18, y: 18, size: 12, level: 1, eatenAt: 1.5 }],
    frames, awards: [], scoreChanges: [{ time: 0, score: 0, remaining: 1 }, { time: 1.5, score: 1, remaining: 0 }],
    contacts: [], steeringEvents: [] };
}

function render(timeline = fixture(), options = {}) {
  return renderContributionSvg({ timeline, config: structuredClone(configuration), theme: 'dark', ...options });
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
}

test('SVG is standalone, themed, responsive and has a completed reduced-motion alternative', () => {
  const dark = render();
  const light = render(fixture(), { theme: 'light' });
  for (const svg of [dark, light]) {
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 320 254\.6"/);
    assert.match(svg, /prefers-reduced-motion:reduce/);
    assert.match(svg, /FINAL SCORE/);
    assert.match(svg, /Happy hacking :\)/);
    assert.match(svg, /MIT License/);
    assert.match(svg, /Copyright \(c\) 2026 morimorimokenpi/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\son\w+=|(?:href|src)="(?!#)/i);
    assert.doesNotMatch(svg, /\bNaN\b|\bInfinity\b/);
    const ids = [...svg.matchAll(/\bid="([^"]*)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    const still = svg.slice(svg.lastIndexOf('<g class="'));
    assert.doesNotMatch(still, /<animate/);
  }
  assert(dark.includes(configuration.palettes.dark.ball));
  assert(light.includes(configuration.palettes.light.ball));
  assert.notEqual(dark.match(/id="([^"]*)-title"/)[1], light.match(/id="([^"]*)-title"/)[1]);
});

test('motion keyframes compress straight segments while preserving rebounds within 0.22 pixels', () => {
  const timeline = fixture();
  const svg = render(timeline);
  const transform = [...svg.matchAll(/<animateTransform\b[^>]*\/>/g)].map(match => attributes(match[0]))
    .find(animation => animation.type === 'translate');
  assert(transform);
  const times = transform.keyTimes.split(';').map(Number);
  const values = transform.values.split(';').map(value => value.split(' ').map(Number));
  assert.equal(times.length, values.length);
  assert(times.length < 12, 'Hundreds of straight-motion samples reduce to the collision corners');
  assert.equal(times[0], 0);
  assert.equal(times.at(-1), 1);
  for (const [index, time] of times.entries()) if (index > 0) assert(time > times[index - 1]);
  for (const frame of timeline.frames) {
    const time = frame.time / timeline.duration;
    const end = Math.max(1, times.findIndex(key => key >= time));
    const fraction = (time - times[end - 1]) / (times[end] - times[end - 1]);
    const actualX = values[end - 1][0] + (values[end][0] - values[end - 1][0]) * fraction;
    const actualY = values[end - 1][1] + (values[end][1] - values[end - 1][1]) * fraction;
    assert(Math.hypot(actualX - frame.balls[0].x, actualY - frame.balls[0].y) <= .22);
  }
});

test('grass disappearance and final hold use the shared loop duration without a score HUD', () => {
  const timeline = fixture();
  const svg = render(timeline);
  assert.match(svg, /keyTimes="0;0\.3;1" values="1;0;0"/);
  assert.match(svg, /keyTimes="0;0\.4;1" values="0;1;1"/);
  assert.doesNotMatch(svg, /\bSCORE \d/);
  assert.match(svg, /FINAL SCORE/);
  const animations = [...svg.matchAll(/<(?:animate|animateTransform)\b[^>]*\/>/g)];
  assert(animations.length > 0);
  for (const [tag] of animations) {
    const animation = attributes(tag);
    assert.equal(animation.dur, '5s');
    assert.equal(animation.repeatCount, 'indefinite');
    const times = animation.keyTimes.split(';').map(Number);
    assert.equal(times[0], 0);
    assert.equal(times.at(-1), 1);
    for (const [index, time] of times.entries()) if (index > 0) assert(time > times[index - 1]);
  }
});

test('a compact left-aligned static legend maps all four grass levels to their configured points in both themes', () => {
  for (const theme of ['dark', 'light']) for (const width of [320, 880]) {
    const config = structuredClone(configuration);
    config.points = [0, 2, 2, 8, 16];
    const timeline = fixture();
    timeline.width = width;
    const svg = render(timeline, { config, theme, idPrefix: 'legend-check' });
    const legend = svg.slice(svg.indexOf('<g id="legend-check-points-legend"'));
    assert.equal((svg.match(/id="legend-check-points-legend"/g) ?? []).length, 1);
    assert.doesNotMatch(legend, /<animate/);
    assert.match(legend, /points-1\"[^>]*transform=\"translate\(10\.5 0\)\"/);
    assert.equal((legend.match(/font-size=\"16\"/g) ?? []).length, 4);
    assert.equal((legend.match(/width=\"12\" height=\"12\"/g) ?? []).length, 4);
    assert(svg.indexOf('id="legend-check-points-legend"') > svg.lastIndexOf('<g class="legend-check-still"'));
    for (let level = 1; level <= 4; level++) {
      const item = legend.match(new RegExp(`<g id="legend-check-points-${level}"[^>]*>([\\s\\S]*?)<\\/g>`))?.[1];
      assert(item);
      assert(item.includes(`fill="${config.palettes[theme].grass[level]}"`));
      assert(item.includes(`>${config.points[level]} pt</text>`));
    }
    assert.doesNotMatch(legend, /id="legend-check-points-0"/);
    assert.doesNotMatch(svg, /\bSCORE \d|>\d+ BALLS</);
  }
});

test('zero-point entries remain distinct and long point labels wrap without overflowing a narrow image', () => {
  for (const value of [0, Number.MAX_SAFE_INTEGER]) {
    const config = structuredClone(configuration);
    config.points = [0, value, value, value, value];
    const timeline = fixture();
    timeline.finalScore = value;
    const svg = render(timeline, { config, idPrefix: 'wrapped' });
    const legend = svg.slice(svg.indexOf('<g id="wrapped-points-legend"'));
    const items = [...legend.matchAll(/<g id="wrapped-points-[1-4]"[^>]*transform="translate\(([\d.]+) ([\d.]+)\)"[^>]*>([\s\S]*?)<\/g>/g)];
    assert.equal(items.length, 4);
    const rowPositions = new Set(items.map(match => match[2]));
    assert.equal(rowPositions.size, value === 0 ? 1 : 4);
    for (const [, x, , contents] of items) {
      const text = contents.match(/<text\b([^>]*)>([^<]*)<\/text>/);
      assert(text);
      const label = attributes(text[1]);
      const right = Number(x) + Number(label.x) + text[2].length * Number(label['font-size']) * .62;
      assert(right <= timeline.width - 17);
    }
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});

test('the final message stays readable at a 320-pixel display width and its spacing fits the board', () => {
  const timeline = fixture();
  timeline.width = 880;
  const svg = render(timeline, { idPrefix: 'readable' });
  const matches = [...svg.matchAll(/<text\b([^>]*)><tspan\b[^>]*>Happy hacking :\)<\/tspan><\/text>/g)];
  assert.equal(matches.length, 2, 'Animated and reduced-motion finals share the same message layout');
  for (const [, attributesText] of matches) {
    const text = attributes(attributesText);
    const size = Number(text['font-size']);
    assert(size * 320 / timeline.width >= 11);
    assert(Number(text.y) + size * .25 < timeline.height);
  }
});

test('party and super awards expose 5 and 10 balls, configured colors and complete final score', () => {
  const timeline = fixture();
  timeline.duration = 9;
  timeline.clearedAt = 4;
  timeline.finalAt = 6;
  timeline.finalScore = 1764;
  timeline.frames = [0, 1, 2, 4, 6, 9].map(time => ({ time,
    balls: Array.from({ length: time < 1 ? 1 : time < 2 ? 5 : 10 }, (_, id) => ({ id, x: 30 + id * 18, y: 170 })),
    score: time >= 4 ? 1764 : 0, remaining: time >= 4 ? 0 : 1, clubTime: time, clubIntensity: time < 4 ? 1 : 0 }));
  timeline.awards = [
    { kind: 'over', threshold: 100, start: .2, end: .8, title: '100 OVER', detail: '' },
    { kind: 'party', start: 1, end: 1.8, title: 'PARTY TIME!', detail: '' },
    { kind: 'super-party', start: 2, end: 4, title: 'SUPER\nPARTY TIME', detail: '' },
  ];
  timeline.scoreChanges = [{ time: 0, score: 0, remaining: 1 }, { time: 4, score: 1764, remaining: 0 }];
  const svg = render(timeline);
  assert.match(svg, /100 OVER/);
  assert.doesNotMatch(svg, /100 OVER!/);
  assert.match(svg, /PARTY TIME!/);
  assert.match(svg, /SUPER<\/tspan>/);
  assert.doesNotMatch(svg, /1 → 5 BALLS|5 → 10 BALLS/);
  assert.doesNotMatch(svg, />\d+ BALLS</);
  assert.doesNotMatch(svg, /\bSCORE \d/);
  assert.match(svg, />1,764 pt<\/tspan>/);
  assert.equal((svg.match(/-ball-\d+"/g) ?? []).length, 10);
  for (const color of configuration.palettes.dark.lights) assert(svg.includes(color));
  assert(Buffer.byteLength(svg) < 1_000_000);
});



function numericAnimationAt(animation, time) {
  const duration = Number(animation.dur.slice(0, -1));
  const times = animation.keyTimes.split(';').map(value => Number(value) * duration);
  const values = animation.values.split(';').map(value => value.trim().split(/\s+/).map(Number));
  const exact = times.findIndex(key => Math.abs(key - time) <= Math.max(1e-8, duration * 6e-8));
  if (exact >= 0) return values[exact];
  let upper = times.findIndex(key => key >= time);
  if (upper < 0) return values.at(-1);
  if (upper === 0) return values[0];
  if (Math.abs(times[upper] - time) <= Math.max(1e-8, duration * 6e-8)) return values[upper];
  if (animation.calcMode === 'discrete') return values[upper - (times[upper] > time + 1e-10 ? 1 : 0)];
  const fraction = (time - times[upper - 1]) / (times[upper] - times[upper - 1]);
  return values[upper].map((value, index) => values[upper - 1][index] + (value - values[upper - 1][index]) * fraction);
}

function groupAnimations(svg, id) {
  const content = svg.match(new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)<\\/g>`))?.[1];
  assert(content, `Expected group ${id}`);
  return [...content.matchAll(/<(?:animate|animateTransform)\b[^>]*\/>/g)].map(match => attributes(match[0]));
}

test('OVER restores the HTML zoom, fade, dimming, expanding ring and 28 central ballistic particles', () => {
  const timeline = fixture();
  timeline.duration = 6;
  timeline.finalAt = 3;
  timeline.frames.push({ ...timeline.frames.at(-1), time: 6 });
  timeline.awards = [{ kind: 'over', start: .5, end: 2.1, threshold: 100, title: '100 OVER', detail: '' }];
  const svg = render(timeline, { idPrefix: 'award-test' });
  const award = timeline.awards[0];
  assert.equal((svg.match(/id="award-test-over-0-particle-\d+"/g) ?? []).length, 28);
  const titleOpacity = groupAnimations(svg, 'award-test-over-0-text').find(animation => animation.attributeName === 'opacity');
  const scale = groupAnimations(svg, 'award-test-over-0-scale').find(animation => animation.type === 'scale');
  assert(titleOpacity && scale);
  assert.equal(numericAnimationAt(scale, award.start)[0], .75);
  assert(Math.abs(numericAnimationAt(scale, award.start + .3)[0] - 1.08) < .00001);
  assert(Math.abs(numericAnimationAt(scale, award.start + .52)[0] - 1) < .00001);
  assert(scale.values.split(';').map(Number).every(value => value >= .75 && value <= 1.08));
  assert.equal(numericAnimationAt(titleOpacity, award.start)[0], 0);
  assert(Math.abs(numericAnimationAt(titleOpacity, award.start + .16)[0] - 1) < .001);
  assert(Math.abs(numericAnimationAt(titleOpacity, award.start + 1.6 * .925)[0] - .5) < .01);
  assert.equal(numericAnimationAt(titleOpacity, award.end)[0], 0);
  assert.match(svg, /translate\(160 104\)/);
  assert.match(svg, /translate\(-160 -104\)/);
  assert.match(svg, /font-weight="500"/);
  const veil = svg.match(/<rect id="award-test-over-0-veil"[^>]*>([\s\S]*?)<\/rect>/)?.[1];
  const veilOpacity = attributes(veil.match(/<animate\b[^>]*\/>/)[0]);
  assert(Math.abs(numericAnimationAt(veilOpacity, award.start + .15)[0] - .35) < .001);
  const ring = svg.match(/<circle id="award-test-over-0-ring"[^>]*>([\s\S]*?)<\/circle>/);
  assert(ring);
  assert.match(ring[0], /stroke-width="2"/);
  const ringAnimations = [...ring[1].matchAll(/<animate\b[^>]*\/>/g)].map(match => attributes(match[0]));
  const radius = ringAnimations.find(animation => animation.attributeName === 'r');
  const ringOpacity = ringAnimations.find(animation => animation.attributeName === 'opacity');
  assert.equal(numericAnimationAt(radius, award.start)[0], 12);
  assert(Math.abs(numericAnimationAt(radius, award.start + 1)[0] - 97) < .01);
  assert(Math.abs(numericAnimationAt(ringOpacity, award.start)[0] - .7) < .001);
  assert.equal(numericAnimationAt(ringOpacity, award.start + 1.4)[0], 0);
  const visibility = groupAnimations(svg, 'award-test-over-0-effects').find(animation => animation.calcMode === 'discrete');
  assert.equal(numericAnimationAt(visibility, award.end + .01)[0], 0);
  const particleOpacity = groupAnimations(svg, 'award-test-over-0-confetti').find(animation => animation.attributeName === 'fill-opacity');
  assert(particleOpacity);
  for (let index = 0; index < 28; index++) {
    const animations = groupAnimations(svg, `award-test-over-0-particle-${index}`);
    const motion = animations.find(animation => animation.type === 'translate');
    assert.equal(animations.some(animation => animation.attributeName === 'opacity' || animation.attributeName === 'fill-opacity'), false);
    const initial = numericAnimationAt(motion, award.start);
    assert.deepEqual(initial, [160, 104]);
    const early = numericAnimationAt(motion, award.start + .1);
    const vx = (early[0] - initial[0]) / .1;
    const vy = (early[1] - initial[1] - .4) / .1;
    const speed = Math.hypot(vx, vy + 30);
    assert(speed >= 64.9 && speed <= 150.1);
    const later = numericAnimationAt(motion, award.start + .8);
    assert(Math.hypot(later[0] - (initial[0] + vx * .8), later[1] - (initial[1] + vy * .8 + 40 * .8 ** 2)) < .08);
    assert.equal(numericAnimationAt(particleOpacity, award.end)[0], 0);
  }
  const veilIndex = svg.indexOf('id="award-test-over-0-veil"');
  const ringIndex = svg.indexOf('id="award-test-over-0-ring"');
  const particleIndex = svg.indexOf('id="award-test-over-0-particle-0"');
  const titleIndex = svg.indexOf('id="award-test-over-0-text"');
  assert(veilIndex < ringIndex && ringIndex < particleIndex && particleIndex < titleIndex);
  assert.doesNotMatch(svg, /1 → 5 BALLS|5 → 10 BALLS/);
  assert(Buffer.byteLength(svg) < 1_000_000);
  for (const [tag] of svg.matchAll(/<(?:animate|animateTransform)\b[^>]*\/>/g)) {
    const animation = attributes(tag);
    assert.equal(animation.dur, '6s');
    const keys = animation.keyTimes.split(';').map(Number);
    assert.equal(keys.length, animation.values.split(';').length);
    assert.equal(keys[0], 0);
    assert.equal(keys.at(-1), 1);
    for (let index = 1; index < keys.length; index++) assert(keys[index] > keys[index - 1]);
  }
});

test('PARTY and SUPER retain their HTML particle counts, launch positions, lifetimes and caption animation', () => {
  const timeline = fixture();
  timeline.duration = 12;
  timeline.finalAt = 9;
  timeline.clearedAt = 6;
  timeline.frames = [0, 1, 3, 6, 9, 12].map(time => ({ ...timeline.frames[0], time }));
  timeline.awards = [
    { kind: 'party', start: 1, end: 3.4, title: 'PARTY TIME!', detail: '' },
    { kind: 'super-party', start: 3.5, end: 6.7, title: 'SUPER\nPARTY TIME', detail: '' },
  ];
  const svg = render(timeline, { idPrefix: 'phase-test' });
  for (const [index, kind, count] of [[0, 'party', 48], [1, 'super-party', 160]]) {
    const award = timeline.awards[index];
    const particleIds = [...svg.matchAll(new RegExp(`id="phase-test-${kind}-${index}-particle-\\d+"`, 'g'))];
    assert.equal(particleIds.length, count);
    const opacity = groupAnimations(svg, `phase-test-${kind}-${index}-text`).find(animation => animation.attributeName === 'opacity');
    const scale = groupAnimations(svg, `phase-test-${kind}-${index}-scale`).find(animation => animation.type === 'scale');
    assert(opacity && scale);
    assert.equal(numericAnimationAt(opacity, award.start)[0], 0);
    assert.equal(numericAnimationAt(opacity, award.end)[0], 0);
    assert(scale.values.split(';').map(Number).every(value => value >= .75 && value <= 1.12));
    const particleOpacity = groupAnimations(svg, `phase-test-${kind}-${index}-confetti`).find(animation => animation.attributeName === 'fill-opacity');
    assert(particleOpacity);
    for (let particle = 0; particle < count; particle++) {
      const animations = groupAnimations(svg, `phase-test-${kind}-${index}-particle-${particle}`);
      const motion = animations.find(animation => animation.type === 'translate');
      assert.equal(animations.some(animation => animation.attributeName === 'opacity' || animation.attributeName === 'fill-opacity'), false);
      const launch = numericAnimationAt(motion, award.start);
      assert.deepEqual(launch, kind === 'party' ? [160, 104] : [particle % 2 === 0 ? 24 : 296, 184]);
      const early = numericAnimationAt(motion, award.start + .1);
      const vx = (early[0] - launch[0]) / .1;
      const vy = (early[1] - launch[1] - .4) / .1;
      const speed = Math.hypot(vx, vy + (kind === 'party' ? 30 : 0));
      assert(speed >= (kind === 'party' ? 64.9 : 139.9) && speed <= (kind === 'party' ? 150.1 : 260.1));
      assert.equal(numericAnimationAt(particleOpacity, award.end)[0], 0);
    }
  }
  assert.equal((svg.match(/id="phase-test-super-party-1-ring-\d+"/g) ?? []).length, 3);
  assert.equal((svg.match(/id="phase-test-super-party-1-ray-\d+"/g) ?? []).length, 18);
  assert.doesNotMatch(svg, /1 → 5 BALLS|5 → 10 BALLS/);
});

test('confetti share one inherited fill alpha without changing particle overlap or fade', () => {
  const timeline = fixture();
  timeline.duration = 9;
  timeline.finalAt = 6;
  timeline.frames.push({ ...timeline.frames.at(-1), time: 9 });
  timeline.awards = [
    { kind: 'over', start: .2, end: 1.8, threshold: 100, title: '100 OVER', detail: '' },
    { kind: 'party', start: 2, end: 4.4, title: 'PARTY TIME!', detail: '' },
    { kind: 'super-party', start: 0, end: 3.2, title: 'SUPER\nPARTY TIME', detail: '' },
  ];
  const svg = render(timeline, { idPrefix: 'shared-test' });
  const fillAnimations = [...svg.matchAll(/<animate\b[^>]*attributeName="fill-opacity"[^>]*\/>/g)];
  assert.equal(fillAnimations.length, 3, 'One alpha animation serves each whole burst');
  assert.equal((svg.match(/id="shared-test-[^"]*-particle-\d+"/g) ?? []).length, 28 + 48 + 160);
  for (const [index, award] of timeline.awards.entries()) {
    const id = `shared-test-${award.kind}-${index}-confetti`;
    const opening = svg.match(new RegExp(`<g id="${id}"[^>]*>`))?.[0];
    assert(opening);
    assert.match(opening, /fill-opacity="0"/);
    assert.doesNotMatch(opening, /\sopacity=/);
    const alpha = groupAnimations(svg, id).find(animation => animation.attributeName === 'fill-opacity');
    const lifetime = award.end - award.start;
    for (const age of [0, .25, .75, lifetime - .5, lifetime - .1, lifetime]) {
      const actual = numericAnimationAt(alpha, award.start + age)[0];
      const expected = Math.min(1, Math.max(0, lifetime - age));
      assert(Math.abs(actual - expected) < 1e-5);
      const originalOverlap = expected + expected * (1 - expected);
      const inheritedFillOverlap = actual + actual * (1 - actual);
      assert(Math.abs(originalOverlap - inheritedFillOverlap) < 1e-5);
    }
    const firstParticle = svg.match(new RegExp(`<g id="shared-test-${award.kind}-${index}-particle-0"[^>]*>`))?.[0];
    assert(firstParticle);
    assert.doesNotMatch(firstParticle, /(?:fill-)?opacity=/);
  }
});

test('serialized key times shrink to seven significant digits and retain distinct close events', () => {
  const times = [0, .123456789012, .456789123456, .987654321987, 1];
  const original = `<animate attributeName="opacity" keyTimes="${times.join(';')}" values="0;1;1;1;0"/>`;
  const compact = compactSvgAnimationTimes(original);
  assert(compact.length < original.length);
  const actual = attributes(compact).keyTimes.split(';').map(Number);
  assert.equal(actual.length, times.length);
  for (let index = 0; index < times.length; index++) {
    assert(Math.abs(actual[index] - times[index]) <= 5e-8);
    if (index > 0) assert(actual[index] > actual[index - 1]);
  }
  const close = '<animate keyTimes="0;0.12345671;0.12345672;1" values="0;1;0;1"/>';
  assert.equal(compactSvgAnimationTimes(close), close, 'Close distinct events keep their original precision');
  const metadata = '<title>keyTimes="0;0.123456789012;1"</title>';
  assert.equal(compactSvgAnimationTimes(metadata), metadata);
});

test('XML text and license comments cannot inject elements, attributes or malformed controls', () => {
  const timeline = fixture();
  timeline.finalMessage = 'Happy </text><script>alert(1)</script> & hacking\u0000';
  timeline.awards = [{ kind: 'party', start: .1, end: 1, title: '<image href="https://bad.test"/>', detail: '<foreignObject>bad</foreignObject>' }];
  const svg = render(timeline, { title: '" onload="alert(1) <svg> & \ud800', license: '--><script>bad()</script><!--' });
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\u0000/i);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&lt;image href=&quot;https:\/\/bad\.test&quot;\//);
  assert.match(svg, /\ufffd/);
  assert.throws(() => render(fixture(), { idPrefix: 'bad" onload="bad()' }), /idPrefix/);
  const a = render(fixture(), { idPrefix: 'first' });
  const b = render(fixture(), { idPrefix: 'second' });
  assert.match(a, /aria-labelledby="first-title first-description"/);
  assert.match(b, /aria-labelledby="second-title second-description"/);
});

test('unsafe numbers and incomplete or unordered timelines are rejected before serialization', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const timeline = fixture();
    timeline.width = invalid;
    assert.throws(() => render(timeline));
  }
  const unsafeScore = fixture();
  unsafeScore.finalScore = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => render(unsafeScore));
  const badCoordinate = fixture();
  badCoordinate.frames[1].balls[0].x = NaN;
  assert.throws(() => render(badCoordinate));
  const unsafeLight = fixture();
  unsafeLight.frames[0].clubIntensity = NaN;
  assert.throws(() => render(unsafeLight));
  const excessiveLight = fixture();
  excessiveLight.frames[0].clubIntensity = 1.1;
  assert.throws(() => render(excessiveLight));
  const wrongOrder = fixture();
  wrongOrder.frames[2].time = wrongOrder.frames[1].time;
  assert.throws(() => render(wrongOrder));
  const incomplete = fixture();
  incomplete.cells[0].eatenAt = null;
  assert.throws(() => render(incomplete));
});

test('zero-contribution input starts at the final display and remains a valid static alternative', () => {
  const timeline = fixture();
  timeline.cells[0].level = 0;
  timeline.cells[0].eatenAt = null;
  timeline.total = 0;
  timeline.finalScore = 0;
  timeline.clearedAt = 0;
  timeline.finalAt = 0;
  timeline.duration = 3;
  timeline.frames = [0, 3].map(time => ({ time, balls: [], score: 0, remaining: 0, clubIntensity: 0, clubTime: 0 }));
  timeline.scoreChanges = [{ time: 0, score: 0, remaining: 0 }];
  const svg = render(timeline);
  assert.match(svg, /FINAL SCORE/);
  assert.match(svg, /Happy hacking :\)/);
  assert.doesNotMatch(svg, /NaN|Infinity|<animateTransform/);
  assert.match(svg, /values="1;1"/);
});
