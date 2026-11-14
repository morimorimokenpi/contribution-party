declare const pinballRootId: string;

interface PinballSavedState {
  version?: number;
  paused?: boolean;
  manualParty?: boolean;
  party?: boolean;
  theme?: PinballThemeMode;
}

interface PinballHost {
  widgetState?: { modelContent?: unknown } | null;
  setWidgetState?: (state: { modelContent: PinballSavedState }) => Promise<unknown>;
}

interface Window {
  openai?: PinballHost;
}

interface WindowEventMap {
  'openai:set_globals': CustomEvent<{
    globals?: { widgetState?: { modelContent?: unknown } | null };
  } | null>;
}

interface Point {
  x: number;
  y: number;
}

interface DrawRect extends Point {
  width: number;
  height: number;
}

interface Ball extends CollisionBody {
  trail: Point[];
}

interface Cell extends Point {
  size: number;
  level: ContributionLevel;
  alive: boolean;
}

interface Spark extends Point {
  color: string;
  life: number;
}

interface Confetti extends Spark {
  vx: number;
  vy: number;
}

type AwardRequest = { kind: 'over'; threshold: number } | { kind: 'party' } | { kind: 'super-party' };

type ActiveAward = AwardRequest & { age: number; duration: number };

interface AwardPresentation {
  title: string;
  detail: string;
  duration: number;
  particleCount: number;
}

function parseSavedState(value: unknown): PinballSavedState | undefined {
  if (!isRecord(value)) return undefined;
  const state: PinballSavedState = {};
  if (typeof value.version === 'number') state.version = value.version;
  if (typeof value.paused === 'boolean') state.paused = value.paused;
  if (typeof value.manualParty === 'boolean') state.manualParty = value.manualParty;
  if (typeof value.party === 'boolean') state.party = value.party;
  if (isThemeMode(value.theme)) state.theme = value.theme;
  return state;
}

function requireElement<T extends HTMLElement>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector);
  if (!element) throw new Error(`UI element not found: ${selector}`);
  return element;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available.');
  return context;
}

function requireRoot(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error('Game container not found.');
  return element;
}

const root = requireRoot(pinballRootId);
const data = parseContributionData(
  JSON.parse(requireElement<HTMLScriptElement>(root, '[data-pinball-data]').textContent ?? 'null'),
);
const config = parsePinballConfig(
  JSON.parse(requireElement<HTMLScriptElement>(root, '[data-pinball-config]').textContent ?? 'null'),
);
const collisionDemo = root.dataset.pinballCollisionDemo === 'true';
const canvas = requireElement<HTMLCanvasElement>(root, 'canvas');
const ctx = requireContext(canvas);
const play = requireElement<HTMLButtonElement>(root, '[data-pinball-play]');
const party = requireElement<HTMLButtonElement>(root, '[data-pinball-party]');
const restart = requireElement<HTMLButtonElement>(root, '[data-pinball-restart]');
const statusLabel = requireElement<HTMLElement>(root, '[data-pinball-status]');
const scoreLabel = requireElement<HTMLElement>(root, '[data-pinball-score]');
const goal = requireElement<HTMLElement>(root, '[data-pinball-goal]');
const awardElement = requireElement<HTMLElement>(root, '[data-pinball-award]');
const awardCaption = requireElement<HTMLElement>(root, '[data-pinball-award-caption]');
const awardTitle = requireElement<HTMLElement>(root, '[data-pinball-award-title]');
const awardDetail = requireElement<HTMLElement>(root, '[data-pinball-award-detail]');
const themeSelect = requireElement<HTMLSelectElement>(root, '[data-pinball-theme]');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)');
const themeStorageKey = 'contribution-pinball:theme';
let themeMode = config.theme;
let palette = config.palettes.dark;
let colors = palette.grass;
let lightRgb: readonly [Rgb, Rgb, Rgb] = [
  hexToRgb(palette.lights[0]),
  hexToRgb(palette.lights[1]),
  hexToRgb(palette.lights[2]),
];
const points = config.points;
const overInterval = config.overInterval;
const autoPartyScore = config.partyScore;
const superPartyScore = config.superPartyScore;
const width = 32 + data.levels.length * 16;
const height = 208;
const radius = 6.75;
const speed = 410;
const fixedStep = 1 / 240;
const cells: Cell[] = data.levels.flatMap((week, column) =>
  week.flatMap((level, row): Cell[] =>
    level === null
      ? []
      : [
          {
            x: 18 + column * 16,
            y: 18 + row * 16,
            size: 12,
            level,
            alive: level > 0,
          },
        ],
  ),
);
const total = cells.filter((cell) => cell.level > 0).length;
const totalScore = cells.reduce((sum, cell) => sum + points[cell.level], 0);
if (!Number.isSafeInteger(totalScore)) {
  throw new Error('The total score exceeds the safe integer limit. Reduce the point values.');
}
let remaining = total;
let score = 0;
let finalScore: number | null = null;
let nextMilestone: number | null = overInterval;
let autoPartyTriggered = false;
let superPartyTriggered = false;
let manualParty = false;
let pendingAwards: AwardRequest[] = [];
let award: ActiveAward | null = null;
let confetti: Confetti[] = [];
let clubTime = 0;
let clubIntensity = 0;
let balls: Ball[] = [];
let sparks: Spark[] = [];
let running = false;
let lastTime: number | null = null;
let accumulated = 0;
let frame = 0;
let cleared = false;
let started = false;
let themeStorageAvailable = true;

function readThemePreference(): PinballThemeMode | undefined {
  try {
    const saved = window.localStorage?.getItem(themeStorageKey);
    return isThemeMode(saved) ? saved : undefined;
  } catch {
    themeStorageAvailable = false;
    return undefined;
  }
}

function applyTheme(): void {
  const resolved = themeMode === 'auto' ? (colorScheme?.matches ? 'dark' : 'light') : themeMode;
  palette = config.palettes[resolved];
  colors = palette.grass;
  lightRgb = [hexToRgb(palette.lights[0]), hexToRgb(palette.lights[1]), hexToRgb(palette.lights[2])];
  const variables: Record<string, string> = {
    '--pinball-background': palette.background,
    '--pinball-foreground': palette.foreground,
    '--pinball-muted-foreground': palette.mutedForeground,
    '--pinball-surface': palette.surface,
    '--pinball-border': palette.border,
    '--pinball-ball': palette.ball,
    '--pinball-celebration': palette.celebration,
    '--background': palette.background,
    '--foreground': palette.foreground,
    '--muted': palette.surface,
    '--muted-foreground': palette.mutedForeground,
    '--border': palette.border,
    '--input': palette.border,
    '--card': palette.surface,
    '--card-foreground': palette.foreground,
    '--popover': palette.surface,
    '--popover-foreground': palette.foreground,
    '--primary': palette.surface,
    '--primary-foreground': palette.foreground,
    '--secondary': palette.surface,
    '--secondary-foreground': palette.foreground,
    '--accent': palette.surface,
    '--accent-foreground': palette.foreground,
    '--ring': palette.celebration,
  };
  palette.grass.forEach((color, index) => {
    variables[`--pinball-grass-${index}`] = color;
  });
  const page = document.querySelector<HTMLElement>('[data-pinball-page]');
  for (const element of page && page !== root ? [root, page] : [root]) {
    for (const [name, value] of Object.entries(variables)) element.style.setProperty(name, value);
    element.style.colorScheme = resolved;
    element.dataset.theme = resolved;
  }
  themeSelect.value = themeMode;
  for (const level of [1, 2, 3, 4] as const) {
    requireElement<HTMLElement>(root, `[data-pinball-swatch="${level}"]`).style.backgroundColor = colors[level];
    requireElement<HTMLElement>(root, `[data-pinball-points="${level}"]`).textContent = `${points[level]} pt`;
  }
}

function hasEffects(): boolean {
  return (
    award !== null || pendingAwards.length > 0 || confetti.length > 0 || sparks.length > 0 || clubIntensity > 0.003
  );
}

function getPlayLabel(): string {
  if (cleared && !hasEffects()) return 'Finished';
  if (running) return 'Pause';
  return started ? 'Resume' : 'Launch';
}

function getPartyGoal(): string {
  if (balls.length >= 10) return 'SUPER PARTY ×10';
  if (balls.length < 5) return `5 balls above ${autoPartyScore} pt`;
  return superPartyScore === null ? 'PARTY ×5' : `10 balls above ${superPartyScore} pt`;
}

function updateStatus(): void {
  statusLabel.textContent = cleared
    ? `All clear! ${total} cells cleared`
    : `Balls: ${balls.length} · Cleared: ${total - remaining} / ${total}`;
  play.textContent = getPlayLabel();
  scoreLabel.textContent = score.toLocaleString();
  const nextOver = nextMilestone === null ? 'No more OVER' : `Next: ${nextMilestone} OVER`;
  const message = cleared ? 'ALL CLEAR!' : `${nextOver} · ${getPartyGoal()}`;
  if (goal.textContent !== message) goal.textContent = message;
  play.disabled = cleared && !hasEffects();
  party.disabled = cleared || balls.length >= 5;
}

function reset(): void {
  cells.forEach((cell) => {
    cell.alive = cell.level > 0;
  });
  remaining = total;
  score = 0;
  finalScore = null;
  nextMilestone = overInterval;
  autoPartyTriggered = false;
  superPartyTriggered = false;
  manualParty = collisionDemo;
  pendingAwards = [];
  award = null;
  confetti = [];
  clubTime = 0;
  clubIntensity = 0;
  awardElement.hidden = true;
  awardCaption.hidden = true;
  awardCaption.textContent = '';
  awardTitle.textContent = '';
  awardDetail.textContent = '';
  const angle = -Math.PI * (0.2 + Math.random() * 0.15);
  balls = [{ x: width / 2, y: height - 28, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, trail: [] }];
  if (collisionDemo) {
    const center = width / 2;
    balls = [
      { x: center - 64, y: 157, vx: speed, vy: 0, trail: [] },
      { x: center + 64, y: 165, vx: -speed, vy: 0, trail: [] },
      { x: center - 178, y: 179, vx: speed * Math.cos(-0.3), vy: speed * Math.sin(-0.3), trail: [] },
      { x: center + 180, y: 147, vx: speed * Math.cos(2.9), vy: speed * Math.sin(2.9), trail: [] },
      { x: center + 260, y: 178, vx: speed * Math.cos(-2.6), vy: speed * Math.sin(-2.6), trail: [] },
    ];
    balls.forEach(keepInsideWalls);
  }
  cleared = total === 0;
  sparks = [];
  accumulated = 0;
  lastTime = null;
  started = false;
  updateStatus();
}

function collide(ball: Ball, cell: Cell): boolean {
  if (!cell.alive) return false;
  const nearestX = Math.max(cell.x, Math.min(cell.x + cell.size, ball.x));
  const nearestY = Math.max(cell.y, Math.min(cell.y + cell.size, ball.y));
  const dx = ball.x - nearestX;
  const dy = ball.y - nearestY;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return false;
  const overlapX = Math.min(ball.x + radius - cell.x, cell.x + cell.size + radius - ball.x);
  const overlapY = Math.min(ball.y + radius - cell.y, cell.y + cell.size + radius - ball.y);
  if (overlapX < overlapY) {
    const direction = ball.x < cell.x + cell.size / 2 ? -1 : 1;
    ball.x = direction < 0 ? cell.x - radius - 0.05 : cell.x + cell.size + radius + 0.05;
    ball.vx = direction * Math.abs(ball.vx);
  } else {
    const direction = ball.y < cell.y + cell.size / 2 ? -1 : 1;
    ball.y = direction < 0 ? cell.y - radius - 0.05 : cell.y + cell.size + radius + 0.05;
    ball.vy = direction * Math.abs(ball.vy);
  }
  cell.alive = false;
  remaining--;
  score += points[cell.level];
  processScoreMilestones();
  sparks.push({ x: cell.x + 6, y: cell.y + 6, color: colors[cell.level], life: 0.22 });
  cleared = remaining === 0;
  updateStatus();
  return true;
}

function queueOverAwards(): void {
  if (nextMilestone === null || score <= nextMilestone) return;
  const lastMilestone = score - 1 - ((score - 1) % overInterval);
  const count = Math.round((lastMilestone - nextMilestone) / overInterval) + 1;
  const pendingOvers = pendingAwards.filter((request) => request.kind === 'over').length;
  // 極端な配点でも演出の待ち行列が膨らまないよう、32件を超える保留分は最新の境界へまとめる。
  if (count + pendingOvers > 32) {
    pendingAwards = pendingAwards.filter((request) => request.kind !== 'over');
    pendingAwards.push({ kind: 'over', threshold: lastMilestone });
  } else {
    for (let index = 0; index < count; index++) {
      pendingAwards.push({ kind: 'over', threshold: nextMilestone + index * overInterval });
    }
  }
  const next = lastMilestone + overInterval;
  nextMilestone = Number.isSafeInteger(next) ? next : null;
}

function processScoreMilestones(): void {
  queueOverAwards();
  const celebrations: AwardRequest[] = [];
  if (!autoPartyTriggered && score > autoPartyScore) {
    autoPartyTriggered = true;
    if (activateParty()) celebrations.push({ kind: 'party' });
  }
  if (!superPartyTriggered && superPartyScore !== null && score > superPartyScore) {
    superPartyTriggered = true;
    if (activateParty(10)) celebrations.push({ kind: 'super-party' });
  }
  if (celebrations.length > 0) {
    pendingAwards.unshift(...celebrations);
    const priority = { party: 0, 'super-party': 1, over: 2 };
    pendingAwards.sort((a, b) => priority[a.kind] - priority[b.kind]);
  }
  startNextAward();
}

function getAwardPresentation(request: AwardRequest): AwardPresentation {
  switch (request.kind) {
    case 'super-party':
      return { title: 'SUPER\nPARTY TIME', detail: '', duration: 3.2, particleCount: 160 };
    case 'party':
      return { title: 'PARTY TIME!', detail: '', duration: 2.4, particleCount: 48 };
    case 'over':
      return { title: `${request.threshold} OVER`, detail: '', duration: 1.6, particleCount: 28 };
  }
}

function createConfetti(count: number, duration: number): Confetti[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const velocity = 65 + Math.random() * 85;
    return {
      x: width / 2,
      y: height / 2,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 30,
      life: duration,
      color: index % 3 === 0 ? palette.celebration : index % 2 === 0 ? colors[3] : colors[4],
    };
  });
}

function createSuperConfetti(count: number, duration: number): Confetti[] {
  return Array.from({ length: count }, (_, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const fan = (Math.floor(index / 2) % 20) / 19;
    const angle = -Math.PI / 2 + side * (0.18 + fan * 0.55);
    const velocity = 140 + Math.random() * 120;
    return {
      x: side > 0 ? 24 : width - 24,
      y: height - 24,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: duration,
      color: palette.lights[index % 3] ?? palette.celebration,
    };
  });
}

function startNextAward(): void {
  if (award || !pendingAwards.length) return;
  const next = pendingAwards.shift();
  if (!next) return;
  const { title, detail, duration, particleCount } = getAwardPresentation(next);
  award = { ...next, age: 0, duration };
  awardElement.hidden = false;
  awardCaption.hidden = true;
  awardTitle.textContent = title;
  awardDetail.textContent = detail;
  awardElement.style.opacity = '0';
  awardElement.style.transform = reducedMotion ? 'none' : 'scale(.75)';
  if (!reducedMotion) {
    confetti =
      next.kind === 'super-party'
        ? createSuperConfetti(particleCount, duration)
        : createConfetti(particleCount, duration);
  }
}

function showFinalScore(): void {
  if (!cleared || hasEffects() || finalScore !== null) return;
  finalScore = totalScore;
  awardCaption.textContent = 'FINAL SCORE';
  awardCaption.hidden = false;
  awardTitle.textContent = `${finalScore.toLocaleString()} pt`;
  awardDetail.textContent = 'Happy hacking :)';
  awardElement.style.opacity = '1';
  awardElement.style.transform = 'none';
  awardElement.hidden = false;
}

function keepInsideWalls(ball: Ball): void {
  if (ball.x < 8 + radius) {
    ball.x = 8 + radius;
    ball.vx = Math.abs(ball.vx);
  }
  if (ball.x > width - 8 - radius) {
    ball.x = width - 8 - radius;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y < 8 + radius) {
    ball.y = 8 + radius;
    ball.vy = Math.abs(ball.vy);
  }
  if (ball.y > height - 14 - radius) {
    ball.y = height - 14 - radius;
    ball.vy = -Math.abs(ball.vy);
  }
}

function advanceBalls(dt: number): void {
  for (const ball of balls) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    keepInsideWalls(ball);
    for (const cell of cells) {
      if (cell.alive && collide(ball, cell)) break;
    }
    keepInsideWalls(ball);
    if (cleared) break;
  }
}

function resolveBallContactPairs(): void {
  for (const [index, a] of balls.entries()) {
    for (let other = index + 1; other < balls.length; other++) {
      const b = balls[other];
      if (!b || !resolveBallCollision(a, b, radius)) continue;
      if (!reducedMotion) {
        sparks.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, color: palette.celebration, life: 0.22 });
      }
    }
  }
}

function updateBallContacts(): void {
  for (let pass = 0; pass < 2; pass++) {
    resolveBallContactPairs();
    balls.forEach(keepInsideWalls);
  }
}

function updateParticles(dt: number): void {
  sparks.forEach((spark) => {
    spark.life -= dt;
  });
  sparks = sparks.filter((spark) => spark.life > 0);
  confetti.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 80 * dt;
    particle.life -= dt;
  });
  confetti = confetti.filter((particle) => particle.life > 0);
}

function updateAward(dt: number): void {
  if (!award) return;
  award.age += dt;
  const progress = award.age / award.duration;
  awardElement.style.opacity = String(Math.max(0, Math.min(1, award.age / 0.16, (1 - progress) / 0.15)));
  const scale =
    award.age < 0.3
      ? 0.75 + 0.33 * Math.sin(((award.age / 0.3) * Math.PI) / 2)
      : 1 + 0.08 * Math.max(0, 1 - (award.age - 0.3) / 0.22);
  const superPulse = award.kind === 'super-party' ? 0.04 * Math.sin(award.age * Math.PI * 1.8) : 0;
  awardElement.style.transform = reducedMotion ? 'none' : `scale(${scale + superPulse})`;
  if (award.age >= award.duration) {
    award = null;
    awardElement.hidden = true;
    startNextAward();
  }
}

function updateLighting(dt: number): void {
  const partyActive = balls.length >= 5 && !cleared;
  if (partyActive && !reducedMotion) clubTime += dt;
  const lightingRate = partyActive ? 2.8 : 5.6;
  clubIntensity += ((partyActive ? 1 : 0) - clubIntensity) * Math.min(1, dt * lightingRate);
  if (!partyActive && clubIntensity < 0.003) clubIntensity = 0;
}

function tick(dt: number): void {
  if (!cleared) advanceBalls(dt);
  if (config.ballCollisions && !cleared) updateBallContacts();
  updateParticles(dt);
  updateAward(dt);
  updateLighting(dt);
  showFinalScore();
}

function roundedRect(rect: DrawRect, radiusValue: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radiusValue);
  ctx.fill();
}

function drawClubBeam(hue: Rgb, index: number, count: number, boosted: boolean): void {
  const phase = reducedMotion ? 0 : clubTime;
  const pulseRate = boosted ? 1.8 : 1.4;
  const pulse = reducedMotion ? 0.65 : 0.65 + 0.35 * Math.sin(phase * Math.PI * pulseRate + index * 1.7);
  const sourceX = width * (boosted ? 0.08 + (index * 0.84) / (count - 1) : 0.13 + index * 0.37);
  const sweep = Math.sin(phase * (boosted ? 0.95 : 0.65) + index * 2.1) * width * (boosted ? 0.28 : 0.2);
  const targetX = Math.max(80, Math.min(width - 80, sourceX + sweep));
  const spread = boosted ? 40 + (index % 3) * 10 : 70 + index * 12;
  const rgb = hue.join(',');
  const beam = ctx.createLinearGradient(sourceX, 8, targetX, height - 14);
  beam.addColorStop(0, `rgba(${rgb},${boosted ? 0.16 : 0.1})`);
  beam.addColorStop(0.7, `rgba(${rgb},${boosted ? 0.2 + pulse * 0.22 : 0.14 + pulse * 0.17})`);
  beam.addColorStop(1, `rgba(${rgb},.02)`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(sourceX - 3, 9);
  ctx.lineTo(targetX - spread, height - 15);
  ctx.lineTo(targetX + spread, height - 15);
  ctx.lineTo(sourceX + 3, 9);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createRadialGradient(targetX, height - 40, 0, targetX, height - 40, 100);
  glow.addColorStop(0, `rgba(${rgb},${boosted ? 0.16 + pulse * 0.2 : 0.1 + pulse * 0.15})`);
  glow.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(targetX - 100, height - 140, 200, 140);
}

function drawClubLights(): void {
  if (clubIntensity <= 0) return;
  const boosted = balls.length >= 10;
  const count = boosted ? 6 : 3;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clubIntensity;
  for (let index = 0; index < count; index++) {
    drawClubBeam(lightRgb[index % 3] ?? lightRgb[0], index, count, boosted);
  }
  ctx.restore();
}

function drawClubRim(): void {
  if (clubIntensity <= 0) return;
  const boosted = balls.length >= 10;
  const count = boosted ? 40 : 24;
  ctx.save();
  for (let index = 0; index < count; index++) {
    const phase = reducedMotion ? 0 : clubTime;
    const pulse = reducedMotion ? 0.65 : 0.5 + 0.5 * Math.sin(phase * Math.PI * (boosted ? 1.8 : 1.4) - index * 0.62);
    ctx.globalAlpha = clubIntensity * (boosted ? 0.35 + pulse * 0.65 : 0.25 + pulse * 0.6);
    ctx.fillStyle = `rgb(${(lightRgb[index % 3] ?? lightRgb[0]).join(',')})`;
    const x = 18 + ((width - 36) * index) / (count - 1);
    for (const y of [8, height - 14]) {
      ctx.beginPath();
      ctx.arc(x, y, boosted ? 3.2 : 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBalls(): void {
  for (const ball of balls) {
    ball.trail.forEach((point, index) => {
      ctx.globalAlpha = ((index + 1) / ball.trail.length) * 0.2;
      ctx.fillStyle = palette.ball;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.ball;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAwardOverlay(): void {
  if (finalScore !== null) {
    ctx.fillStyle = palette.background;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  if (award) {
    ctx.fillStyle = palette.background;
    ctx.globalAlpha = 0.35 * Math.min(1, award.age / 0.15);
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    if (!reducedMotion) {
      if (award.kind === 'super-party') {
        drawSuperPartyBurst(ctx, { width, height, age: award.age, colors: palette.lights });
      } else {
        ctx.strokeStyle = palette.celebration;
        ctx.lineWidth = 2;
        ctx.globalAlpha = Math.max(0, 0.7 - award.age / 2);
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 12 + award.age * 85, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function draw(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssWidth = root.clientWidth;
  const cssHeight = (cssWidth * height) / width;
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawClubLights();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, width - 16, height - 22);
  for (const cell of cells) {
    roundedRect({ x: cell.x, y: cell.y, width: cell.size, height: cell.size }, 2, colors[cell.alive ? cell.level : 0]);
  }
  sparks.forEach((spark) => {
    const spread = (1 - spark.life / 0.22) * 11;
    ctx.globalAlpha = spark.life / 0.22;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      roundedRect(
        {
          x: spark.x + Math.cos(angle) * spread - 1.5,
          y: spark.y + Math.sin(angle) * spread - 1.5,
          width: 3,
          height: 3,
        },
        1,
        spark.color,
      );
    }
  });
  ctx.globalAlpha = 1;
  drawBalls();
  drawClubRim();
  drawAwardOverlay();
  confetti.forEach((particle) => {
    ctx.globalAlpha = Math.min(1, particle.life);
    roundedRect({ x: particle.x - 2, y: particle.y - 2, width: 4, height: 4 }, 1, particle.color);
  });
  ctx.globalAlpha = 1;
}

function animate(time: number): void {
  if (!running || (cleared && !hasEffects())) return;
  if (lastTime !== null) accumulated += Math.min((time - lastTime) / 1000, 0.06);
  lastTime = time;
  while (accumulated >= fixedStep && (!cleared || hasEffects())) {
    tick(fixedStep);
    accumulated -= fixedStep;
  }
  balls.forEach((ball) => {
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 7) ball.trail.shift();
  });
  draw();
  if (cleared && !hasEffects()) {
    running = false;
    updateStatus();
  } else frame = requestAnimationFrame(animate);
}

function sync(): void {
  cancelAnimationFrame(frame);
  lastTime = null;
  showFinalScore();
  updateStatus();
  draw();
  if (running && (!cleared || hasEffects())) frame = requestAnimationFrame(animate);
}

function activateParty(target: 5 | 10 = 5): boolean {
  if (cleared || balls.length >= target) return false;
  const origin = balls[0];
  if (!origin) return false;
  const additions = target - balls.length;
  for (let i = 0; i < additions; i++) {
    const angle = -Math.PI + ((i + 1) * Math.PI) / (additions + 1) + (Math.random() - 0.5) * 0.12;
    balls.push({ x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, trail: [] });
  }
  return true;
}

function saveState(): void {
  if (themeStorageAvailable) {
    try {
      window.localStorage?.setItem(themeStorageKey, themeMode);
    } catch {
      themeStorageAvailable = false;
    }
  }
  window.openai
    ?.setWidgetState?.({ modelContent: { version: 3, paused: !running, manualParty, theme: themeMode } })
    ?.catch(() => {});
}

play.addEventListener('click', () => {
  started = true;
  running = !running;
  sync();
  saveState();
});
party.addEventListener('click', () => {
  if (!activateParty()) return;
  manualParty = true;
  pendingAwards.unshift({ kind: 'party' });
  startNextAward();
  started = true;
  running = true;
  sync();
  saveState();
});
restart.addEventListener('click', () => {
  reset();
  started = true;
  running = true;
  sync();
  saveState();
});
themeSelect.addEventListener('change', () => {
  if (!isThemeMode(themeSelect.value)) return;
  themeMode = themeSelect.value;
  applyTheme();
  draw();
  saveState();
});
colorScheme?.addEventListener?.('change', () => {
  if (themeMode !== 'auto') return;
  applyTheme();
  draw();
});
function applyState(input: unknown): void {
  const saved = parseSavedState(input);
  if (saved?.theme) themeMode = saved.theme;
  const requestedParty = saved?.manualParty ?? saved?.party;
  if (requestedParty === true && !manualParty) {
    manualParty = true;
    activateParty();
  }
  if (requestedParty === false && manualParty) {
    if (superPartyTriggered) manualParty = false;
    else reset();
  }
  if (typeof saved?.paused === 'boolean') {
    running = !saved.paused;
    started = true;
  }
  applyTheme();
  sync();
}
window.addEventListener('openai:set_globals', (event) => applyState(event.detail?.globals?.widgetState?.modelContent));
const saved = window.openai?.widgetState?.modelContent;
const storedTheme = readThemePreference();
if (storedTheme) themeMode = storedTheme;
new ResizeObserver(() => draw()).observe(root);
reset();
applyState(saved);
