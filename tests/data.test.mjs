import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, createGame, readFixture } from './harness.mjs';

test('both fragments use the same compiled game and preserve their data', () => {
  const sample = readFixture('sample');
  const real = readFixture('real');
  assert.notEqual(sample.rootId, real.rootId);
  assert.equal(
    sample.script.replace(`const pinballRootId = ${JSON.stringify(sample.rootId)};`, 'const pinballRootId = "";'),
    real.script.replace(`const pinballRootId = ${JSON.stringify(real.rootId)};`, 'const pinballRootId = "";'),
  );
  for (const [name, fixture] of [['sample', sample], ['real', real]]) {
    const data = JSON.parse(fs.readFileSync(new URL('../data/' + name + '.json', import.meta.url), 'utf8'));
    assert.deepEqual(fixture.data, data);
  }
  assert.equal(sample.data.levels.flat().filter(level => level > 0).length, 371);
  assert.equal(sample.data.levels.flat().reduce((sum, level) => sum + POINTS[level], 0), 1764);
});

test('the real snapshot preserves API weekdays, contribution levels, and totals', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../data/real-source.json', import.meta.url), 'utf8'));
  const data = readFixture('real').data;
  const calendar = raw.data.user.contributionsCollection.contributionCalendar;
  const days = calendar.weeks.flatMap(week => week.contributionDays);
  const levelNumbers = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
  };
  const histogram = [0, 0, 0, 0, 0];
  const dates = new Set();
  const levels = calendar.weeks.map(week => {
    const result = Array(7).fill(null);
    for (const day of week.contributionDays) {
      assert(Object.hasOwn(levelNumbers, day.contributionLevel));
      assert.equal(new Date(day.date + 'T00:00:00Z').getUTCDay(), day.weekday);
      assert.equal(result[day.weekday], null);
      assert.equal(dates.has(day.date), false);
      dates.add(day.date);
      const level = levelNumbers[day.contributionLevel];
      assert.equal(level === 0, day.contributionCount === 0);
      histogram[level]++;
      result[day.weekday] = level;
    }
    return result;
  });
  assert.equal(raw.data.user.login, 'morimorimokenpi');
  assert.equal(days.length, 365);
  assert.equal(calendar.weeks.length, 53);
  assert.deepEqual(histogram, [314, 34, 11, 0, 6]);
  assert.equal(days.reduce((sum, day) => sum + day.contributionCount, 0), 384);
  assert.equal(calendar.totalContributions, 384);
  for (let index = 1; index < days.length; index++) {
    assert.equal(new Date(days[index].date) - new Date(days[index - 1].date), 86400000);
  }
  assert.deepEqual(data.levels, levels);
  assert.equal(data.start, days[0].date);
  assert.equal(data.end, days.at(-1).date);
  assert.equal(data.retrievedAt, '2026-11-08');
  assert.equal(data.activeDays, 51);
  assert.equal(data.maxPoints, 127);
  assert.equal(histogram.reduce((sum, count, level) => sum + count * POINTS[level], 0), 127);
  const game = createGame('real');
  assert.equal(game.state().cells.length, 365);
  assert.equal(game.state().cells.some(cell => cell.level === null), false);
  assert.equal(game.state().total, 51);
  assert.equal(game.state().remaining, 51);
  assert.equal(game.state().cells.filter(cell => cell.level === 0).length, 314);
  assert.equal(game.state().autoPartyScore, 500);
});

test('runtime validation accepts the supported levels and rejects invalid data', () => {
  const valid = createGame('sample', { data: { levels: [[0, null, 1, 2, 3, 4]] } });
  assert.equal(valid.state().cells.length, 5);
  assert.equal(valid.state().total, 4);
  for (const level of [-1, 5, 1.5, '1', true]) {
    assert.throws(() => createGame('sample', { data: { levels: [[level]] } }));
  }
  for (const data of [null, {}, { levels: [] }, { levels: 'invalid' }, { levels: [[]] }]) {
    assert.throws(() => createGame('sample', { data }));
  }
});
