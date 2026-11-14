import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const project = new URL('../', import.meta.url);
const readJson = file => JSON.parse(fs.readFileSync(new URL(file, project), 'utf8'));
const source = ['settings', 'contributions', 'physics', 'animation']
  .map(name => fs.readFileSync(new URL('dist/' + name + '.js', project), 'utf8')).join('\n');
const create = vm.runInNewContext(source + '\ncreatePinballTimeline', {}, { timeout: 1000 });
const config = readJson('config/pinball.json');
const sample = readJson('data/sample.json');
const real = readJson('data/real.json');
const plain = value => JSON.parse(JSON.stringify(value));

function checkCompleted(timeline, settings) {
  const active = timeline.cells.filter(cell => cell.level > 0);
  assert.equal(timeline.total, active.length);
  assert.equal(timeline.finalScore, active.reduce((sum, cell) => sum + settings.points[cell.level], 0));
  assert.equal(timeline.contacts.length, active.length);
  assert.equal(new Set(timeline.contacts.map(contact => contact.cellId)).size, active.length);
  for (const cell of timeline.cells) assert.equal(cell.eatenAt === null, cell.level === 0);
  for (const contact of timeline.contacts) {
    const cell = timeline.cells.find(candidate => candidate.id === contact.cellId);
    const x = Math.max(cell.x, Math.min(cell.x + cell.size, contact.x));
    const y = Math.max(cell.y, Math.min(cell.y + cell.size, contact.y));
    assert(Math.hypot(contact.x - x, contact.y - y) < timeline.radius,
      'Every collected cell has a genuine circle/rectangle contact');
    assert.equal(cell.eatenAt, contact.time);
  }
  let previousTime = -1;
  let previousRemaining = timeline.total;
  for (const frame of timeline.frames) {
    assert(frame.time > previousTime);
    assert(frame.remaining >= 0 && frame.remaining <= previousRemaining);
    assert(frame.balls.length >= 1 && frame.balls.length <= 10);
    assert.equal(new Set(frame.balls.map(ball => ball.id)).size, frame.balls.length);
    for (const ball of frame.balls) {
      assert(Number.isFinite(ball.x) && Number.isFinite(ball.y));
      assert(ball.x >= 8 + timeline.radius - 1e-8 && ball.x <= timeline.width - 8 - timeline.radius + 1e-8);
      assert(ball.y >= 8 + timeline.radius - 1e-8 && ball.y <= timeline.height - 14 - timeline.radius + 1e-8);
    }
    previousTime = frame.time;
    previousRemaining = frame.remaining;
  }
  assert.equal(timeline.frames.at(-1).remaining, 0);
  assert.equal(timeline.frames.at(-1).score, timeline.finalScore);
  assert.equal(timeline.frames[0].time, 0);
  assert.equal(timeline.frames.at(-1).time, timeline.duration);
  assert.equal(timeline.duration, timeline.finalAt + 3);
  assert.equal(timeline.finalMessage, 'Happy hacking :)');
  if (timeline.total > 0) assert(timeline.finalAt >= timeline.clearedAt + 1 - 1e-8);
  assert(timeline.awards.every(award => award.end <= timeline.finalAt + 1e-8));
  assert(timeline.frames.length <= 50000);
}

test('offline timelines clear real, sample, and SUPER data through actual contacts', () => {
  for (const [data, settings, options, maximumBalls] of [
    [real, config, { seed: 1 }, 1],
    [sample, config, { seed: 1 }, 5],
    [sample, { ...config, ballCollisions: true, superPartyScore: 1000 }, { seed: 1, initialBalls: 5 }, 10],
  ]) {
    const timeline = create(data, settings, options);
    checkCompleted(timeline, settings);
    assert.equal(Math.max(...timeline.frames.map(frame => frame.balls.length)), maximumBalls);
    assert.deepEqual(Array.from(timeline.awards.filter(award => award.kind === 'over'), award => award.threshold),
      Array.from({ length: Math.max(0, Math.ceil(timeline.finalScore / settings.overInterval) - 1) }, (_, index) => (index + 1) * settings.overInterval));
  }
});

test('seed, theme, and output frame rate do not disturb deterministic fixed-step physics', () => {
  const first = create(real, config, { seed: 42, frameRate: 30 });
  assert.deepEqual(plain(create(real, config, { seed: 42, frameRate: 30 })), plain(first));
  assert.deepEqual(plain(create(real, { ...config, theme: 'light' }, { seed: 42 })), plain(first));
  const alternateRate = create(real, config, { seed: 42, frameRate: 12 });
  const { frames: firstFrames, ...firstPhysics } = plain(first);
  const { frames: alternateFrames, ...alternatePhysics } = plain(alternateRate);
  assert.deepEqual(firstPhysics, alternatePhysics);
  assert.notEqual(firstFrames.length, alternateFrames.length);
  assert.notDeepEqual(plain(create(real, config, { seed: 43 }).frames[1].balls), plain(first.frames[1].balls));
});

test('a single scoring contact queues strict OVER boundaries after PARTY and SUPER in order', () => {
  const settings = { ...config, points: [0, 1001, 3, 5, 10], ballCollisions: true, superPartyScore: 1000 };
  const timeline = create({ levels: [[1]] }, settings);
  checkCompleted(timeline, settings);
  assert.deepEqual(Array.from(timeline.awards.slice(0, 2), award => award.kind), ['party', 'super-party']);
  assert.deepEqual(Array.from(timeline.awards.filter(award => award.kind === 'over'), award => award.threshold),
    Array.from({ length: 10 }, (_, index) => (index + 1) * 100));
  for (const award of timeline.awards) {
    const duration = award.kind === 'over' ? 1.6 : award.kind === 'party' ? 2.4 : 3.2;
    assert(Math.abs(award.end - award.start - duration) < 1e-8);
  }
  assert.equal(timeline.awards[1].title, 'SUPER\nPARTY TIME');
  assert.equal(timeline.awards[1].detail, '');
  const exact = create({ levels: [[1]] }, { ...config, points: [0, 500, 3, 5, 10], partyScore: 500 });
  assert.equal(exact.awards.some(award => award.kind === 'party'), false);
  assert.equal(exact.awards.some(award => award.threshold === 500), false);
});

test('narrow and empty boards stay in bounds and sparse periodic routes progress at real wall contacts', () => {
  const empty = create({ levels: [[0, null]] }, config);
  checkCompleted(empty, config);
  assert.equal(empty.finalAt, 0);
  assert.equal(empty.duration, 3);
  assert.equal(empty.cells.length, 1);
  const tiny = create({ levels: [[1]] }, config);
  checkCompleted(tiny, config);
  assert(tiny.width >= 320);
  assert(tiny.steeringEvents.length > 0);
  for (const event of tiny.steeringEvents) {
    const distances = [Math.abs(event.x - 8 - tiny.radius), Math.abs(event.x - tiny.width + 8 + tiny.radius),
      Math.abs(event.y - 8 - tiny.radius), Math.abs(event.y - tiny.height + 14 + tiny.radius)];
    assert(Math.min(...distances) < 1e-8);
    assert(event.speed > 0 && Number.isFinite(event.speed));
  }
  const levels = Array.from({ length: 53 }, (_, column) => Array.from({ length: 7 }, (_, row) => column === 52 && row === 6 ? 4 : 0));
  for (const seed of [0, 1, 99, 0xffffffff]) checkCompleted(create({ levels }, config, { seed }), config);
  checkCompleted(create({ levels: [[4, 3, 2, 1, null, 0, 1]] }, { ...config, ballCollisions: true }, { initialBalls: 5 }), config);
});

test('a full contribution grid finishes without a party for boundary seeds, including zero-point grass', () => {
  const levels = Array.from({ length: 53 }, () => Array(7).fill(1));
  for (const seed of [0, 1, 99, 0xffffffff]) {
    const timeline = create({ levels }, config, { seed });
    checkCompleted(timeline, config);
    assert.equal(timeline.finalScore, 371);
    assert.equal(timeline.total, 371);
    assert.equal(timeline.frames.at(-1).balls.length, 1);
    assert(timeline.finalAt <= 300);
    assert(timeline.steeringEvents.length > 0);
    assert(timeline.steeringEvents.every(event => event.time >= 3));
  }
  const zeroPoints = { ...config, points: [0, 0, 0, 0, 0] };
  const zeroTimeline = create({ levels }, zeroPoints, { seed: 99 });
  checkCompleted(zeroTimeline, zeroPoints);
  assert.equal(zeroTimeline.finalScore, 0);
  assert.equal(zeroTimeline.contacts.length, 371);
});

test('unsafe scores, invalid options, oversized input, and incomplete simulations fail explicitly', () => {
  assert.throws(() => create({ levels: [[1]] }, config, { maxDuration: .01 }), /完了しませんでした/);
  assert.throws(() => create({ levels: Array.from({ length: 54 }, () => [1]) }, config), /53週/);
  assert.throws(() => create({ levels: [[1, 1]] }, { ...config, points: [0, Number.MAX_SAFE_INTEGER, 0, 0, 0] }), /得点合計/);
  for (const options of [{ seed: -1 }, { seed: 0x100000000 }, { seed: 1.5 }, { frameRate: 0 },
    { frameRate: 61 }, { maxDuration: NaN }, { initialBalls: 2 }]) {
    assert.throws(() => create({ levels: [[1]] }, config, options));
  }
  const huge = create({ levels: [[1]] }, { ...config, points: [0, 1_000_000_000_000, 0, 0, 0] });
  assert.equal(huge.finalScore, 1_000_000_000_000);
  assert.equal(huge.awards.filter(award => award.kind === 'over').length, 1);
});
