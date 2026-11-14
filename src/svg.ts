interface ContributionSvgOptions {
  timeline: PinballTimeline;
  config: PinballConfig;
  theme: 'dark' | 'light';
  idPrefix?: string;
  title?: string;
  license?: string;
}

interface SvgPosition {
  time: number;
  x: number;
  y: number;
}
interface SvgBallTrack {
  id: number;
  points: SvgPosition[];
}
interface SvgScene {
  timeline: PinballTimeline;
  palette: ThemePalette;
  prefix: string;
}

const SVG_DEFAULT_LICENSE = `MIT License
Copyright (c) 2026 morimorimokenpi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function svgCleanText(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Remove characters that XML 1.0 cannot represent.
  const invalidXmlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;
  return value
    .replace(invalidXmlCharacters, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');
}

function svgEscape(value: string): string {
  return svgCleanText(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character] ?? character,
  );
}

function svgFinite(value: number, label: string, minimum = 0): void {
  if (!Number.isFinite(value) || value < minimum || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`SVG ${label} must be a finite number within the safe range.`);
  }
}

function svgInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`SVG ${label} must be a non-negative safe integer.`);
}

function svgTime(value: number, duration: number): string {
  return String(Number((value / duration).toPrecision(12)));
}

function svgNumber(value: number): string {
  svgFinite(value, 'coordinate', -Number.MAX_SAFE_INTEGER);
  return String(Number(value.toFixed(2)));
}

function validateSvgTimeline(timeline: PinballTimeline): void {
  svgFinite(timeline.width, 'width', 1);
  svgFinite(timeline.height, 'height', 1);
  svgFinite(timeline.radius, 'ball radius', 0.01);
  svgFinite(timeline.duration, 'duration', 0.001);
  svgFinite(timeline.clearedAt, 'board clear time');
  svgFinite(timeline.finalAt, 'final display time');
  if (timeline.clearedAt > timeline.finalAt || timeline.finalAt >= timeline.duration) {
    throw new Error('SVG clear, final display, and end times must be in order.');
  }
  svgInteger(timeline.finalScore, 'final score');
  svgInteger(timeline.total, 'cell count');
  if (typeof timeline.finalMessage !== 'string') throw new Error('The SVG final message must be a string.');
  for (const cell of timeline.cells) validateSvgCell(cell, timeline);
  validateSvgFrames(timeline);
  let previous = -1;
  for (const change of timeline.scoreChanges) {
    svgFinite(change.time, 'score time');
    svgInteger(change.score, 'score');
    svgInteger(change.remaining, 'remaining cells');
    if (change.time < previous || change.time > timeline.duration)
      throw new Error('SVG score times must be in order and within the animation duration.');
    previous = change.time;
  }
  for (const award of timeline.awards) {
    svgFinite(award.start, 'effect start time');
    svgFinite(award.end, 'effect end time');
    if (award.start >= award.end || award.end > timeline.finalAt) throw new Error('SVG effect times are invalid.');
    if (typeof award.title !== 'string' || typeof award.detail !== 'string')
      throw new Error('SVG effect titles and details must be strings.');
    if (!['over', 'party', 'super-party'].includes(award.kind)) throw new Error('The SVG effect kind is invalid.');
  }
}

function validateSvgCell(cell: PinballTimelineCell, timeline: PinballTimeline): void {
  svgInteger(cell.id, 'cell ID');
  svgFinite(cell.x, 'cell x position');
  svgFinite(cell.y, 'cell y position');
  svgFinite(cell.size, 'cell size', 0.01);
  if (![0, 1, 2, 3, 4].includes(cell.level)) throw new Error('SVG contribution levels must be 0 to 4.');
  if (cell.eatenAt !== null) {
    svgFinite(cell.eatenAt, 'cell removal time');
    if (cell.eatenAt > timeline.clearedAt) throw new Error('An SVG cell removal time exceeds the board clear time.');
  }
  if (cell.level > 0 && cell.eatenAt === null)
    throw new Error('SVG rendering requires a timeline with all contribution cells cleared.');
}

function validateSvgFrames(timeline: PinballTimeline): void {
  if (
    timeline.frames.length < 1 ||
    timeline.frames[0]?.time !== 0 ||
    timeline.frames.at(-1)?.time !== timeline.duration
  )
    throw new Error('The SVG timeline must include its start and end frames.');
  let previous = -1;
  for (const frame of timeline.frames) {
    svgFinite(frame.time, 'frame time');
    if (frame.time <= previous || frame.time > timeline.duration)
      throw new Error('SVG frame times must be strictly increasing and within the animation duration.');
    previous = frame.time;
    svgFinite(frame.clubIntensity, 'light intensity');
    if (frame.clubIntensity > 1) throw new Error('SVG light intensity must be from 0 to 1.');
    const ids = new Set<number>();
    for (const ball of frame.balls) {
      svgInteger(ball.id, 'ball ID');
      svgFinite(ball.x, 'ball x position', -Number.MAX_SAFE_INTEGER);
      svgFinite(ball.y, 'ball y position', -Number.MAX_SAFE_INTEGER);
      if (ids.has(ball.id)) throw new Error('SVG ball IDs must be unique within each frame.');
      ids.add(ball.id);
    }
  }
}

function svgAnimation(
  attribute: string,
  values: string[],
  times: number[],
  duration: number,
  discrete = false,
): string {
  const pairs: Array<{ time: string; value: string }> = [];
  for (const [index, time] of times.entries()) {
    const pair = { time: svgTime(time, duration), value: values[index] ?? '' };
    if (pairs.at(-1)?.time === pair.time) pairs[pairs.length - 1] = pair;
    else pairs.push(pair);
  }
  const transform = attribute === 'translate' || attribute === 'rotate' || attribute === 'scale';
  const tag = transform ? 'animateTransform' : 'animate';
  const name = transform ? `attributeName="transform" type="${attribute}"` : `attributeName="${attribute}"`;
  return `<${tag} ${name} dur="${Number(duration.toPrecision(12))}s" repeatCount="indefinite" calcMode="${discrete ? 'discrete' : 'linear'}" keyTimes="${pairs.map((pair) => pair.time).join(';')}" values="${pairs.map((pair) => pair.value).join(';')}"/>`;
}

function svgVisible(start: number, end: number, duration: number): string {
  const times = [0];
  const values = [start === 0 ? '1' : '0'];
  if (start > 0) {
    times.push(start);
    values.push('1');
  }
  if (end < duration) {
    times.push(end);
    values.push('0');
  }
  times.push(duration);
  values.push(values.at(-1) ?? '0');
  return svgAnimation('opacity', values, times, duration, true);
}

function simplifySvgTrack(points: SvgPosition[], tolerance = 0.2): SvgPosition[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const pending: Array<[number, number]> = [[0, points.length - 1]];
  for (let segment = pending.pop(); segment; segment = pending.pop()) {
    const [start, end] = segment;
    const first = points[start];
    const last = points[end];
    if (!first || !last) continue;
    let maximum = tolerance ** 2;
    let selected = -1;
    for (let index = start + 1; index < end; index++) {
      const point = points[index];
      if (!point) continue;
      const fraction = (point.time - first.time) / (last.time - first.time);
      const error =
        (point.x - first.x - (last.x - first.x) * fraction) ** 2 +
        (point.y - first.y - (last.y - first.y) * fraction) ** 2;
      if (error > maximum) {
        maximum = error;
        selected = index;
      }
    }
    if (selected >= 0) {
      keep.add(selected);
      pending.push([start, selected], [selected, end]);
    }
  }
  return points.filter((_, index) => keep.has(index));
}

function svgTracks(timeline: PinballTimeline): SvgBallTrack[] {
  const tracks = new Map<number, SvgBallTrack>();
  for (const frame of timeline.frames)
    for (const ball of frame.balls) {
      let track = tracks.get(ball.id);
      if (!track) {
        track = { id: ball.id, points: [] };
        tracks.set(ball.id, track);
      }
      track.points.push({ time: frame.time, x: ball.x, y: ball.y });
    }
  return [...tracks.values()];
}

function svgCells(scene: SvgScene, active: boolean): string {
  return scene.timeline.cells
    .map((cell) => {
      if (active && cell.level === 0) return '';
      const animation = active && cell.eatenAt !== null ? svgVisible(0, cell.eatenAt, scene.timeline.duration) : '';
      return `<rect x="${svgNumber(cell.x)}" y="${svgNumber(cell.y)}" width="${svgNumber(cell.size)}" height="${svgNumber(cell.size)}" rx="2" fill="${scene.palette.grass[active ? cell.level : 0]}">${animation}</rect>`;
    })
    .join('');
}

interface SvgLegendLayout {
  height: number;
  content: string;
}

function svgPointLegend({ timeline, palette, prefix }: SvgScene, points: PinballConfig['points']): SvgLegendLayout {
  const levels = [1, 2, 3, 4] as const;
  const fontSize = 16;
  const inset = 10.5;
  const swatchSize = timeline.cells[0]?.size ?? 12;
  const textGap = 3.5;
  const columnGap = 4;
  const rowHeight = fontSize * 1.6;
  let x = inset;
  let y = 0;
  const items = levels
    .map((level) => {
      const label = `${points[level].toLocaleString('en-US')} pt`;
      const itemWidth = swatchSize + textGap + label.length * fontSize * 0.62;
      if (x > inset && x + itemWidth > timeline.width - inset) {
        x = inset;
        y += rowHeight;
      }
      const item = `<g id="${prefix}-points-${level}" role="listitem" aria-label="Level ${level}: ${label}" transform="translate(${svgNumber(x)} ${svgNumber(y)})"><rect y="${svgNumber((rowHeight - swatchSize) / 2)}" width="${svgNumber(swatchSize)}" height="${svgNumber(swatchSize)}" rx="2" fill="${palette.grass[level]}"/><text x="${svgNumber(swatchSize + textGap)}" y="${svgNumber(rowHeight / 2 + fontSize * 0.35)}" font-size="${svgNumber(fontSize)}" fill="${palette.foreground}" style="font-variant-numeric:tabular-nums">${label}</text></g>`;
      x += itemWidth + columnGap;
      return item;
    })
    .join('');
  return {
    height: inset * 2 + y + rowHeight,
    content: `<g id="${prefix}-points-legend" role="list" aria-label="Points per grass block" transform="translate(0 ${svgNumber(timeline.height + inset)})">${items}</g>`,
  };
}

function svgTextLines(title: string, x: number, y: number, size: number, color: HexColor): string {
  const lines = title.split('\n');
  return `<text x="${svgNumber(x)}" y="${svgNumber(y)}" text-anchor="middle" font-size="${svgNumber(size)}" font-weight="500" fill="${color}">${lines.map((line, index) => `<tspan x="${svgNumber(x)}" dy="${index === 0 ? '0' : svgNumber(size * 1.1)}">${svgEscape(line)}</tspan>`).join('')}</text>`;
}

function svgAwardAges(lifetime: number, extra: number[] = [], interval = 0.04): number[] {
  const samples = Array.from({ length: Math.ceil(lifetime / interval) }, (_, index) => index * interval);
  return [...new Set([0, lifetime, ...samples, ...extra.filter((age) => age >= 0 && age <= lifetime)])].sort(
    (a, b) => a - b,
  );
}

function svgAwardAnimation(
  attribute: string,
  award: PinballTimelineAward,
  duration: number,
  ages: number[],
  value: (age: number) => string,
): string {
  const first = value(0);
  const last = value(award.end - award.start);
  return svgAnimation(
    attribute,
    [first, ...ages.map(value), last],
    [0, ...ages.map((age) => award.start + age), duration],
    duration,
  );
}

function svgAwards({ timeline, palette, prefix }: SvgScene): string {
  return timeline.awards
    .map((award, index) => {
      const lines = award.title.split('\n');
      const longest = Math.max(1, ...lines.map((line) => line.length));
      const size = Math.min(44.8, (timeline.width - 40) / (longest * 0.68));
      const y = timeline.height * 0.5 - (lines.length - 1) * size * 0.55 + size * 0.35;
      const title = svgTextLines(award.title, timeline.width / 2, y, size, palette.celebration);
      const detail = award.detail
        ? `<text x="${svgNumber(timeline.width / 2)}" y="${svgNumber(y + lines.length * size * 1.1)}" text-anchor="middle" font-size="12" fill="${palette.foreground}">${svgEscape(award.detail)}</text>`
        : '';
      const lifetime = award.end - award.start;
      const ages = svgAwardAges(lifetime, [0.16, lifetime * 0.85, 0.3, 0.52]);
      const opacity = svgAwardAnimation('opacity', award, timeline.duration, ages, (age) =>
        svgNumber(Math.max(0, Math.min(1, age / 0.16, (1 - age / lifetime) / 0.15))),
      );
      const scale = svgAwardAnimation('scale', award, timeline.duration, ages, (age) =>
        String(
          Number(
            (
              (age < 0.3
                ? 0.75 + 0.33 * Math.sin(((age / 0.3) * Math.PI) / 2)
                : 1 + 0.08 * Math.max(0, 1 - (age - 0.3) / 0.22)) +
              (award.kind === 'super-party' ? 0.04 * Math.sin(age * Math.PI * 1.8) : 0)
            ).toFixed(5),
          ),
        ),
      );
      const center = `${svgNumber(timeline.width / 2)} ${svgNumber(timeline.height / 2)}`;
      return `<g id="${prefix}-${award.kind}-${index}-text" opacity="0" stroke="${palette.background}" stroke-width="2" paint-order="stroke fill">${opacity}<g transform="translate(${center})"><g id="${prefix}-${award.kind}-${index}-scale" transform="scale(.75)">${scale}<g transform="translate(-${svgNumber(timeline.width / 2)} -${svgNumber(timeline.height / 2)})">${title}${detail}</g></g></g></g>`;
    })
    .join('');
}

function svgFinal({ timeline, palette }: SvgScene, animated: boolean): string {
  const center = timeline.width / 2;
  const scoreText = `${timeline.finalScore.toLocaleString('en-US')} pt`;
  const scoreSize = Math.min(52, (timeline.width - 40) / (scoreText.length * 0.7));
  const messageSize = Math.min(32, (timeline.width - 40) / (Math.max(1, timeline.finalMessage.length) * 0.65));
  const content =
    `<rect width="${svgNumber(timeline.width)}" height="${svgNumber(timeline.height)}" fill="${palette.background}" opacity=".92"/>` +
    svgTextLines('FINAL SCORE', center, timeline.height / 2 - 48, 32, palette.celebration) +
    svgTextLines(scoreText, center, timeline.height / 2 + 12, scoreSize, palette.foreground) +
    svgTextLines(timeline.finalMessage, center, timeline.height / 2 + 66, messageSize, palette.mutedForeground);
  return `<g${animated ? ' opacity="0"' : ''}>${animated ? svgVisible(timeline.finalAt, timeline.duration, timeline.duration) : ''}${content}</g>`;
}

function svgAwardEffects(scene: SvgScene, award: PinballTimelineAward, awardIndex: number): string {
  const { timeline, palette, prefix } = scene;
  const lifetime = award.end - award.start;
  const ages = svgAwardAges(lifetime, [0.15, 1.4, lifetime - 1]);
  const veilOpacity = svgAwardAnimation('opacity', award, timeline.duration, ages, (age) =>
    svgNumber(0.35 * Math.min(1, age / 0.15)),
  );
  const veil = `<rect id="${prefix}-${award.kind}-${awardIndex}-veil" width="${svgNumber(timeline.width)}" height="${svgNumber(timeline.height)}" fill="${palette.background}" opacity="0">${veilOpacity}</rect>`;
  let ring = '';
  if (award.kind !== 'super-party') {
    const radius = svgAwardAnimation('r', award, timeline.duration, ages, (age) => svgNumber(12 + age * 85));
    const ringOpacity = svgAwardAnimation('opacity', award, timeline.duration, ages, (age) =>
      svgNumber(Math.max(0, 0.7 - age / 2)),
    );
    ring = `<circle id="${prefix}-${award.kind}-${awardIndex}-ring" cx="${svgNumber(timeline.width / 2)}" cy="${svgNumber(timeline.height / 2)}" r="12" fill="none" stroke="${palette.celebration}" stroke-width="2" opacity="0">${radius}${ringOpacity}</circle>`;
  }
  return `<g id="${prefix}-${award.kind}-${awardIndex}-effects" opacity="0">${svgVisible(award.start, award.end, timeline.duration)}${veil}${ring}${svgSuperBurst(scene, award, awardIndex)}${svgParticleBurst(scene, award, awardIndex)}</g>`;
}

function svgParticleBurst(scene: SvgScene, award: PinballTimelineAward, awardIndex: number): string {
  const { timeline, palette, prefix } = scene;
  const superParty = award.kind === 'super-party';
  const count = superParty ? 160 : award.kind === 'party' ? 48 : 28;
  const lifetime = award.end - award.start;
  const ages = svgAwardAges(lifetime, [lifetime - 1], 0.1);
  const opacity = svgAwardAnimation('fill-opacity', award, timeline.duration, ages, (age) =>
    svgNumber(Math.min(1, Math.max(0, lifetime - age))),
  );
  let randomState = timeline.seed ^ Math.imul(awardIndex + 1, 0x9e3779b1);
  const particles = Array.from({ length: count }, (_, index) => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    const random = randomState / 0x100000000;
    const side = index % 2 === 0 ? 1 : -1;
    const fan = (Math.floor(index / 2) % 20) / 19;
    const angle = superParty ? -Math.PI / 2 + side * (0.18 + fan * 0.55) : (index / count) * Math.PI * 2;
    const velocity = superParty ? 140 + random * 120 : 65 + random * 85;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity - (superParty ? 0 : 30);
    const x = superParty ? (side > 0 ? 24 : timeline.width - 24) : timeline.width / 2;
    const y = superParty ? timeline.height - 24 : timeline.height / 2;
    const translate = svgAwardAnimation(
      'translate',
      award,
      timeline.duration,
      ages,
      (age) => `${svgNumber(x + vx * age)} ${svgNumber(y + vy * age + 40 * age ** 2)}`,
    );
    const color = superParty
      ? (palette.lights[index % 3] ?? palette.celebration)
      : index % 3 === 0
        ? palette.celebration
        : index % 2 === 0
          ? palette.grass[3]
          : palette.grass[4];
    return `<g id="${prefix}-${award.kind}-${awardIndex}-particle-${index}">${translate}<rect x="-2" y="-2" width="4" height="4" rx="1" fill="${color}"/></g>`;
  }).join('');
  return `<g id="${prefix}-${award.kind}-${awardIndex}-confetti" fill-opacity="0">${opacity}${particles}</g>`;
}

function svgSuperBurst(scene: SvgScene, award: PinballTimelineAward, awardIndex: number): string {
  if (award.kind !== 'super-party') return '';
  const { timeline, palette, prefix } = scene;
  const lifetime = Math.min(1.4, award.end - award.start);
  const burst = { ...award, end: award.start + lifetime };
  const ages = svgAwardAges(lifetime);
  const maxRadius = Math.max(1, Math.min(timeline.width * 0.32, timeline.height * 0.8));
  const expansion = (age: number) => 1 - (1 - age / 1.4) ** 3;
  const fade = (age: number) => (1 - age / 1.4) ** 2;
  const rings = palette.lights
    .map((color, index) => {
      const radius = svgAwardAnimation('r', burst, timeline.duration, ages, (age) =>
        svgNumber(maxRadius * (0.12 + index * 0.09 + expansion(age) * 0.64)),
      );
      const opacity = svgAwardAnimation('opacity', burst, timeline.duration, ages, (age) =>
        svgNumber(fade(age) * (0.65 - index * 0.12)),
      );
      const stroke = svgAwardAnimation('stroke-width', burst, timeline.duration, ages, (age) =>
        svgNumber((2.2 - index * 0.35) * (1 - (age / 1.4) * 0.6)),
      );
      return `<circle id="${prefix}-super-party-${awardIndex}-ring-${index}" cx="${svgNumber(timeline.width / 2)}" cy="${svgNumber(timeline.height / 2)}" r="0" fill="none" stroke="${color}" opacity="0">${radius}${opacity}${stroke}</circle>`;
    })
    .join('');
  const rays = Array.from({ length: 18 }, (_, index) => {
    const color = palette.lights[index % 3] ?? palette.lights[0];
    const shape = svgAwardAnimation('d', burst, timeline.duration, ages, (age) => {
      const angle = (index * Math.PI * 2) / 18 - Math.PI / 2 + expansion(age) * 0.08;
      const innerRadius = maxRadius * (0.1 + expansion(age) * 0.52);
      const length = Math.min(timeline.height * 0.12, 24) * (1 - (age / 1.4) * 0.75);
      const x = timeline.width / 2 + Math.cos(angle) * innerRadius;
      const y = timeline.height / 2 + Math.sin(angle) * innerRadius;
      return `M${svgNumber(x)} ${svgNumber(y)}l${svgNumber(Math.cos(angle) * length)} ${svgNumber(Math.sin(angle) * length)}`;
    });
    const opacity = svgAwardAnimation('opacity', burst, timeline.duration, ages, (age) => svgNumber(fade(age) * 0.5));
    const stroke = svgAwardAnimation('stroke-width', burst, timeline.duration, ages, (age) =>
      svgNumber(1.4 - (age / 1.4) * 0.9),
    );
    return `<path id="${prefix}-super-party-${awardIndex}-ray-${index}" d="M0 0l0 0" stroke="${color}" opacity="0">${shape}${opacity}${stroke}</path>`;
  }).join('');
  return `<g opacity="0">${svgVisible(burst.start, burst.end, timeline.duration)}${rings}${rays}</g>`;
}

function svgNamespace(timeline: PinballTimeline, theme: string, requested?: string): string {
  if (requested !== undefined) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(requested))
      throw new Error(
        'SVG idPrefix must start with a letter and contain only letters, digits, hyphens, or underscores.',
      );
    return requested;
  }
  const identity = JSON.stringify([
    timeline.seed,
    timeline.width,
    timeline.duration,
    timeline.cells.map((cell) => [cell.id, cell.level, cell.eatenAt]),
  ]);
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  return `cp-${theme}-${(hash >>> 0).toString(36)}`;
}

function compactSvgAnimationTimes(svg: string): string {
  return svg.replace(
    /(<(?:animate|animateTransform|animateMotion)\b[^>]*\bkeyTimes=")([^"]+)"/g,
    (attribute, prefix: string, text: string) => {
      const times = text.split(';').map(Number);
      const compact = times.map((time) => Number(time.toPrecision(7)));
      if (compact.some((time, index) => index > 0 && time <= (compact[index - 1] ?? -Infinity))) return attribute;
      return `${prefix}${compact.join(';')}"`;
    },
  );
}

function renderContributionSvg(options: ContributionSvgOptions): string {
  const { timeline } = options;
  if (options.theme !== 'dark' && options.theme !== 'light') throw new Error('The SVG theme must be dark or light.');
  const config = parsePinballConfig(options.config);
  validateSvgTimeline(timeline);
  const prefix = svgNamespace(timeline, options.theme, options.idPrefix);
  const scene: SvgScene = { timeline, palette: config.palettes[options.theme], prefix };
  const { palette } = scene;
  const legend = svgPointLegend(scene, config.points);
  const imageHeight = timeline.height + legend.height;
  const title = svgEscape(options.title ?? 'Contribution party');
  const pointDescription = config.points
    .slice(1)
    .map((value, index) => `level ${index + 1}: ${value} points`)
    .join(', ');
  const description = svgEscape(
    `Contribution activity animation. Points per grass block: ${pointDescription}. Final score ${timeline.finalScore}. ${timeline.finalMessage}`,
  );
  const license = svgCleanText(options.license ?? SVG_DEFAULT_LICENSE)
    .replace(/--/g, '- -')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const effects = timeline.awards.map((award, index) => svgAwardEffects(scene, award, index)).join('');
  return compactSvgAnimationTimes(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${license} -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(timeline.width)}" height="${svgNumber(imageHeight)}" viewBox="0 0 ${svgNumber(timeline.width)} ${svgNumber(imageHeight)}" role="img" aria-labelledby="${prefix}-title ${prefix}-description" style="max-width:100%;height:auto;font-family:system-ui,sans-serif">
<title id="${prefix}-title">${title}</title><desc id="${prefix}-description">${description}</desc>
<style>.${prefix}-still{display:none}@media(prefers-reduced-motion:reduce){.${prefix}-motion{display:none}.${prefix}-still{display:inline}}</style>
<defs><clipPath id="${prefix}-board"><rect width="${svgNumber(timeline.width)}" height="${svgNumber(timeline.height)}" rx="4"/></clipPath></defs>
<rect width="100%" height="100%" rx="6" fill="${palette.background}"/>
${svgCells(scene, false)}
<g class="${prefix}-motion"><g><g clip-path="url(#${prefix}-board)">${renderSvgLights(scene, 'beams')}<rect x="8" y="8" width="${svgNumber(timeline.width - 16)}" height="${svgNumber(timeline.height - 22)}" fill="none" stroke="${palette.border}" stroke-width="1"/>${svgCells(scene, false)}${svgCells(scene, true)}${renderSvgMotion(scene)}${renderSvgLights(scene, 'rim')}${effects}</g>${svgAwards(scene)}${svgFinal(scene, true)}</g></g>
<g class="${prefix}-still"><g>${svgFinal(scene, false)}</g></g>
${legend.content}
</svg>\n`);
}
