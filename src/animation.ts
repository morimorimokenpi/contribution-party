interface PinballTimelineOptions {
  seed?: number;
  frameRate?: number;
  maxDuration?: number;
  initialBalls?: 1 | 5;
}

interface PinballTimelineCell {
  id: number;
  column: number;
  row: number;
  x: number;
  y: number;
  size: number;
  level: ContributionLevel;
  eatenAt: number | null;
}

interface PinballTimelineFrame {
  time: number;
  balls: Array<{ id: number; x: number; y: number }>;
  score: number;
  remaining: number;
  clubIntensity: number;
  clubTime: number;
}

interface PinballTimelineAward {
  kind: 'over' | 'party' | 'super-party';
  threshold?: number;
  start: number;
  end: number;
  title: string;
  detail: string;
}

interface PinballTimeline {
  width: number;
  height: number;
  radius: number;
  duration: number;
  seed: number;
  total: number;
  finalScore: number;
  clearedAt: number;
  finalAt: number;
  finalMessage: string;
  cells: PinballTimelineCell[];
  frames: PinballTimelineFrame[];
  awards: PinballTimelineAward[];
  scoreChanges: Array<{ time: number; score: number; remaining: number }>;
  contacts: Array<{ time: number; cellId: number; ballId: number; x: number; y: number }>;
  ballContacts?: Array<{ time: number; a: number; b: number; x: number; y: number }>;
  steeringEvents: Array<{ time: number; ballId: number; cellId: number; x: number; y: number; speed: number }>;
}

interface TimelineBall extends CollisionBody { id: number }
type TimelineAwardRequest = { kind: 'over'; threshold: number } | { kind: 'party' | 'super-party' };

function createPinballTimeline(input: unknown, settings: unknown, options: PinballTimelineOptions = {}): PinballTimeline {
  const contributionData = parseContributionData(input);
  if (contributionData.levels.length > 53) throw new Error('READMEアニメーションの草データは53週までにしてください。');
  const configuration = parsePinballConfig(settings);
  const seed = options.seed ?? 1;
  const frameRate = options.frameRate ?? 30;
  const maxDuration = options.maxDuration ?? 300;
  const initialBalls = options.initialBalls ?? 1;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seedは0〜4294967295の整数にしてください。');
  if (!Number.isInteger(frameRate) || frameRate < 1 || frameRate > 60) throw new Error('frameRateは1〜60の整数にしてください。');
  if (!Number.isFinite(maxDuration) || maxDuration <= 0 || maxDuration > 3600) throw new Error('maxDurationは0より大きく3600秒以下にしてください。');
  if (initialBalls !== 1 && initialBalls !== 5) throw new Error('initialBallsは1または5にしてください。');

  const width = Math.max(320, 32 + contributionData.levels.length * 16);
  const height = 208;
  const radius = Math.min(6.75, (width - 16) / 6);
  const speed = 410;
  const fixedStep = 1 / 240;
  const cells: PinballTimelineCell[] = contributionData.levels.flatMap((week, column) => week.flatMap((level, row) =>
    level === null ? [] : [{ id: column * 7 + row, column, row, x: 18 + column * 16, y: 18 + row * 16,
      size: 12, level, eatenAt: null }]));
  const grid = new Map(cells.map(cell => [cell.id, cell]));
  const total = cells.filter(cell => cell.level > 0).length;
  const finalScore = cells.reduce((sum, cell) => sum + configuration.points[cell.level], 0);
  if (!Number.isSafeInteger(finalScore)) throw new Error('草の得点合計が安全な整数の上限を超えています。');

  let randomState = seed;
  function random(): number {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }
  const angle = -Math.PI * (.2 + random() * .15);
  const balls: TimelineBall[] = [{ id: 0, x: width / 2, y: height - 28, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }];
  if (initialBalls === 5) {
    const horizontalScale = Math.min(1, (width - 16 - radius * 2) / (880 - 16 - radius * 2));
    const positions = [[-64, 157, 0], [64, 165, Math.PI], [-178, 179, -.3], [180, 147, 2.9], [260, 178, -2.6]];
    balls.splice(0, 1, ...positions.map(([offset = 0, y = 180, heading = 0], id) => ({
      id, x: width / 2 + offset * horizontalScale, y, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed,
    })));
  }

  const frames: PinballTimelineFrame[] = [];
  const awards: PinballTimelineAward[] = [];
  const scoreChanges: PinballTimeline['scoreChanges'] = [{ time: 0, score: 0, remaining: total }];
  const contacts: PinballTimeline['contacts'] = [];
  const ballContacts: NonNullable<PinballTimeline['ballContacts']> = [];
  const steeringEvents: PinballTimeline['steeringEvents'] = [];
  let remaining = total;
  let score = 0;
  let time = 0;
  let nextMilestone: number | null = configuration.overInterval;
  let partyTriggered = false;
  let superTriggered = false;
  let pending: TimelineAwardRequest[] = [];
  let active: PinballTimelineAward | null = null;
  let clearedAt: number | null = total === 0 ? 0 : null;
  let finalAt: number | null = total === 0 ? 0 : null;
  let clubTime = 0;
  let clubIntensity = 0;
  let sparkUntil = 0;
  let lastCollected = 0;
  let lastSteering = -Infinity;
  let criticalFrame = false;

  function capture(at: number): void {
    const snapshot = { time: at, balls: balls.map(ball => ({ id: ball.id, x: ball.x, y: ball.y })),
      score, remaining, clubTime, clubIntensity };
    if (frames.at(-1)?.time === at) frames[frames.length - 1] = snapshot;
    else {
      if (frames.length >= 50000) throw new Error('アニメーションのフレーム数が上限50000を超えました。frameRateを下げてください。');
      frames.push(snapshot);
    }
  }

  function beginAward(): void {
    if (active || pending.length === 0) return;
    const request = pending.shift();
    if (!request) return;
    const presentation = request.kind === 'over'
      ? { title: `${request.threshold} OVER`, detail: '', duration: 1.6 }
      : request.kind === 'party'
        ? { title: 'PARTY TIME!', detail: '', duration: 2.4 }
        : { title: 'SUPER\nPARTY TIME', detail: '', duration: 3.2 };
    active = { ...request, start: time, end: time + presentation.duration, title: presentation.title, detail: presentation.detail };
    awards.push(active);
    criticalFrame = true;
  }

  function advanceAward(): void {
    if (active && time >= active.end - 1e-9) {
      active = null;
      criticalFrame = true;
      beginAward();
    }
  }

  function promote(target: 5 | 10): boolean {
    if (balls.length >= target) return false;
    const origin = balls[0];
    if (!origin) return false;
    const count = target - balls.length;
    for (let index = 0; index < count; index++) {
      const heading = -Math.PI + (index + 1) * Math.PI / (count + 1) + (random() - .5) * .12;
      balls.push({ id: balls.length, x: origin.x, y: origin.y, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed });
    }
    criticalFrame = true;
    return true;
  }

  function queueMilestones(): void {
    if (nextMilestone !== null && score > nextMilestone) {
      const last = score - 1 - (score - 1) % configuration.overInterval;
      const count = Math.round((last - nextMilestone) / configuration.overInterval) + 1;
      if (count + pending.filter(request => request.kind === 'over').length > 32) {
        pending = pending.filter(request => request.kind !== 'over');
        pending.push({ kind: 'over', threshold: last });
      } else {
        for (let index = 0; index < count; index++) pending.push({ kind: 'over', threshold: nextMilestone + index * configuration.overInterval });
      }
      const next = last + configuration.overInterval;
      nextMilestone = Number.isSafeInteger(next) ? next : null;
    }
    const celebrations: TimelineAwardRequest[] = [];
    if (!partyTriggered && score > configuration.partyScore) {
      partyTriggered = true;
      if (promote(5)) celebrations.push({ kind: 'party' });
    }
    if (!superTriggered && configuration.superPartyScore !== null && score > configuration.superPartyScore) {
      superTriggered = true;
      if (promote(10)) celebrations.push({ kind: 'super-party' });
    }
    if (celebrations.length > 0) {
      pending.unshift(...celebrations);
      const priority = { party: 0, 'super-party': 1, over: 2 };
      pending.sort((a, b) => priority[a.kind] - priority[b.kind]);
    }
    beginAward();
  }

  function steerAtWall(ball: TimelineBall): void {
    if (time - lastCollected < 3 || time - lastSteering < .5) return;
    const magnitude = Math.hypot(ball.vx, ball.vy);
    if (magnitude < 1) return;
    let target: PinballTimelineCell | undefined;
    let distance = Infinity;
    for (const cell of cells) {
      if (cell.level === 0 || cell.eatenAt !== null) continue;
      const candidate = Math.hypot(cell.x + 6 - ball.x, cell.y + 6 - ball.y);
      if (candidate < distance) { target = cell; distance = candidate; }
    }
    if (!target || distance === 0) return;
    // 回収が止まった場合だけ、実際の壁接触位置で反射方向を調整する。
    ball.vx = (target.x + 6 - ball.x) / distance * magnitude;
    ball.vy = (target.y + 6 - ball.y) / distance * magnitude;
    steeringEvents.push({ time, ballId: ball.id, cellId: target.id, x: ball.x, y: ball.y, speed: magnitude });
    lastSteering = time;
  }

  function walls(ball: TimelineBall, allowSteering: boolean): void {
    let touched = false;
    if (ball.x < 8 + radius) { ball.x = 8 + radius; ball.vx = Math.abs(ball.vx); touched = true; }
    if (ball.x > width - 8 - radius) { ball.x = width - 8 - radius; ball.vx = -Math.abs(ball.vx); touched = true; }
    if (ball.y < 8 + radius) { ball.y = 8 + radius; ball.vy = Math.abs(ball.vy); touched = true; }
    if (ball.y > height - 14 - radius) { ball.y = height - 14 - radius; ball.vy = -Math.abs(ball.vy); touched = true; }
    if (touched) {
      criticalFrame = true;
      if (allowSteering) steerAtWall(ball);
    }
  }

  function hit(ball: TimelineBall, cell: PinballTimelineCell): boolean {
    if (cell.level === 0 || cell.eatenAt !== null) return false;
    const nearestX = Math.max(cell.x, Math.min(cell.x + cell.size, ball.x));
    const nearestY = Math.max(cell.y, Math.min(cell.y + cell.size, ball.y));
    if (Math.hypot(ball.x - nearestX, ball.y - nearestY) >= radius) return false;
    contacts.push({ time, cellId: cell.id, ballId: ball.id, x: ball.x, y: ball.y });
    const overlapX = Math.min(ball.x + radius - cell.x, cell.x + cell.size + radius - ball.x);
    const overlapY = Math.min(ball.y + radius - cell.y, cell.y + cell.size + radius - ball.y);
    if (overlapX < overlapY) {
      const direction = ball.x < cell.x + 6 ? -1 : 1;
      ball.x = direction < 0 ? cell.x - radius - .05 : cell.x + cell.size + radius + .05;
      ball.vx = direction * Math.abs(ball.vx);
    } else {
      const direction = ball.y < cell.y + 6 ? -1 : 1;
      ball.y = direction < 0 ? cell.y - radius - .05 : cell.y + cell.size + radius + .05;
      ball.vy = direction * Math.abs(ball.vy);
    }
    cell.eatenAt = time;
    remaining--;
    score += configuration.points[cell.level];
    lastCollected = time;
    sparkUntil = time + .22;
    queueMilestones();
    if (remaining === 0) clearedAt = time;
    const change = { time, score, remaining };
    if (scoreChanges.at(-1)?.time === time) scoreChanges[scoreChanges.length - 1] = change;
    else scoreChanges.push(change);
    criticalFrame = true;
    return true;
  }

  function move(): void {
    for (const ball of balls) {
      ball.x += ball.vx * fixedStep;
      ball.y += ball.vy * fixedStep;
      walls(ball, true);
      const firstColumn = Math.max(0, Math.floor((ball.x - radius - 30) / 16));
      const lastColumn = Math.min(contributionData.levels.length - 1, Math.floor((ball.x + radius - 18) / 16));
      const firstRow = Math.max(0, Math.floor((ball.y - radius - 30) / 16));
      const lastRow = Math.min(6, Math.floor((ball.y + radius - 18) / 16));
      let collided = false;
      for (let column = firstColumn; column <= lastColumn && !collided; column++) {
        for (let row = firstRow; row <= lastRow && !collided; row++) {
          const cell = grid.get(column * 7 + row);
          if (cell) collided = hit(ball, cell);
        }
      }
      walls(ball, false);
      if (remaining === 0) break;
    }
    if (!configuration.ballCollisions || remaining === 0) return;
    for (let pass = 0; pass < 2; pass++) {
      for (const [index, ball] of balls.entries()) {
        for (let other = index + 1; other < balls.length; other++) {
          const body = balls[other];
          if (body && resolveBallCollision(ball, body, radius)) {
            ballContacts.push({ time, a: ball.id, b: body.id, x: (ball.x + body.x) / 2, y: (ball.y + body.y) / 2 });
            sparkUntil = time + .22;
            criticalFrame = true;
          }
        }
      }
      balls.forEach(ball => walls(ball, false));
    }
  }

  balls.forEach(ball => walls(ball, false));
  capture(0);
  let nextFrame = 1 / frameRate;
  const maxSteps = Math.floor(maxDuration / fixedStep);
  for (let step = 1; finalAt === null && step <= maxSteps; step++) {
    time = step * fixedStep;
    criticalFrame = false;
    if (remaining > 0) move();
    advanceAward();
    const lightsOn = balls.length >= 5 && remaining > 0;
    if (lightsOn) clubTime += fixedStep;
    clubIntensity += ((lightsOn ? 1 : 0) - clubIntensity) * fixedStep * (lightsOn ? 2.8 : 5.6);
    if (!lightsOn && clubIntensity < .003) clubIntensity = 0;
    if (clearedAt !== null && time >= clearedAt + 1 && time >= sparkUntil && !active && pending.length === 0 && clubIntensity === 0) finalAt = time;
    if (time >= nextFrame - 1e-9 || criticalFrame || finalAt !== null) capture(time);
    if (time >= nextFrame - 1e-9) nextFrame += 1 / frameRate;
  }
  if (clearedAt === null || finalAt === null) throw new Error(`アニメーションが${maxDuration}秒以内に完了しませんでした（残り${remaining}マス）。seedを変えるか、データと設定を確認してください。`);
  capture(finalAt);
  const duration = finalAt + 3;
  capture(duration);
  return { width, height, radius, duration, seed, total, finalScore, clearedAt, finalAt,
    finalMessage: 'Happy hacking :)', cells, frames, awards, scoreChanges, contacts, ballContacts, steeringEvents };
}
