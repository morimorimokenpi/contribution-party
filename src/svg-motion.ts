interface SvgMotionPath {
  id: string;
  points: SvgPosition[];
  fractions: number[];
  distance: number;
}

function svgMotionPath(track: SvgBallTrack, prefix: string, duration: number): SvgMotionPath {
  const points = simplifySvgTrack(track.points).map((point) => ({
    ...point,
    x: Number(svgNumber(point.x)),
    y: Number(svgNumber(point.y)),
  }));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) throw new Error('The SVG ball path is empty.');
  if (first.time > 0) points.unshift({ ...first, time: 0 });
  if (last.time < duration) points.push({ ...last, time: duration });
  let distance = 0;
  const distances = points.map((point, index) => {
    const previous = points[index - 1];
    if (previous) distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    return distance;
  });
  return {
    id: `${prefix}-motion-route-${track.id}`,
    points,
    distance,
    fractions: distances.map((value) => (distance === 0 ? 0 : value / distance)),
  };
}

function svgMotionFractionAt(path: SvgMotionPath, time: number): number {
  const index = path.points.findIndex((point) => point.time >= time);
  if (index <= 0) return index < 0 ? (path.fractions.at(-1) ?? 0) : (path.fractions[0] ?? 0);
  const previous = path.points[index - 1];
  const next = path.points[index];
  if (!previous || !next) return 0;
  const from = path.fractions[index - 1] ?? 0;
  const to = path.fractions[index] ?? from;
  return from + ((to - from) * (time - previous.time)) / (next.time - previous.time);
}

function svgDelayedMotion(path: SvgMotionPath, delay: number, duration: number): string {
  const first = path.points[0];
  if (!first) return '';
  if (path.distance === 0) {
    const position = `${svgNumber(first.x)} ${svgNumber(first.y)}`;
    return svgAnimation('translate', [position, position], [0, duration], duration);
  }
  const pairs = [{ time: 0, value: path.fractions[0] ?? 0 }];
  for (const [index, point] of path.points.entries()) {
    const time = point.time + delay;
    if (time > 0 && time < duration) pairs.push({ time, value: path.fractions[index] ?? 0 });
  }
  pairs.push({ time: duration, value: svgMotionFractionAt(path, Math.max(0, duration - delay)) });
  return `<animateMotion dur="${Number(duration.toPrecision(12))}s" repeatCount="indefinite" calcMode="linear" keyTimes="${pairs.map((pair) => svgTime(pair.time, duration)).join(';')}" keyPoints="${pairs.map((pair) => Number(pair.value.toPrecision(12))).join(';')}"><mpath href="#${path.id}"/></animateMotion>`;
}

function svgTrailOpacity(birth: number, lag: number, duration: number): string {
  const times = [0];
  const values = ['0'];
  for (let length = lag + 1; length <= 7; length++) {
    const time = birth + (length - 1) / 60;
    if (time >= duration) break;
    times.push(time);
    values.push(String(Number((((length - lag) / length) * 0.2).toPrecision(12))));
  }
  times.push(duration);
  values.push(values.at(-1) ?? '0');
  return svgAnimation('opacity', values, times, duration, true);
}

function svgMotionBalls(scene: SvgScene): string {
  const { timeline, palette, prefix } = scene;
  if (timeline.clearedAt === 0) return '';
  return svgTracks(timeline)
    .map((track) => {
      const first = track.points[0];
      if (!first || first.time > timeline.clearedAt) return '';
      const path = svgMotionPath(track, prefix, timeline.duration);
      const definition =
        path.distance > 0
          ? `<defs><path id="${path.id}" d="${path.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${svgNumber(point.x)} ${svgNumber(point.y)}`).join('')}"/></defs>`
          : '';
      const trails = Array.from({ length: 7 }, (_, index) => {
        const lag = 6 - index;
        return `<g id="${prefix}-trail-${track.id}-${index}" opacity="0">${svgTrailOpacity(first.time, lag, timeline.duration)}${svgDelayedMotion(path, lag / 60, timeline.duration)}<circle r="${svgNumber(timeline.radius * 0.8)}" fill="${palette.ball}"/></g>`;
      }).join('');
      const translation = svgAnimation(
        'translate',
        path.points.map((point) => `${svgNumber(point.x)} ${svgNumber(point.y)}`),
        path.points.map((point) => point.time),
        timeline.duration,
      );
      const body = `<g id="${prefix}-ball-${track.id}" opacity="0">${svgVisible(first.time, timeline.duration, timeline.duration)}${translation}<circle r="${svgNumber(timeline.radius)}" fill="${palette.ball}"/></g>`;
      return definition + trails + body;
    })
    .join('');
}

interface SvgSparkEvent {
  time: number;
  end: number;
  x: number;
  y: number;
  color: HexColor;
  order: number;
}

function svgSparkEvent(
  scene: SvgScene,
  time: number,
  x: number,
  y: number,
  color: HexColor,
  order: number,
): SvgSparkEvent {
  svgFinite(time, 'contact time');
  svgFinite(x, 'contact x position');
  svgFinite(y, 'contact y position');
  if (time > scene.timeline.clearedAt) throw new Error('An SVG contact time exceeds the board clear time.');
  return { time, end: Math.min(time + 0.22, scene.timeline.duration), x, y, color, order };
}

function svgSparkSlots(events: SvgSparkEvent[]): SvgSparkEvent[][] {
  const sorted = [...events].sort((a, b) => a.time - b.time || a.order - b.order);
  const bursts: SvgSparkEvent[][] = [];
  let end = -Infinity;
  for (const event of sorted) {
    const current = bursts.at(-1);
    if (!current || event.time > end + 1e-9) bursts.push([event]);
    else current.push(event);
    end = Math.max(end, event.end);
  }
  const slots: SvgSparkEvent[][] = [];
  for (const burst of bursts) {
    // 同時に見える粒の前後関係を保つため、区間内の元の描画順をスロット順にする。
    burst
      .sort((a, b) => a.order - b.order)
      .forEach((event, index) => {
        slots[index] ??= [];
        slots[index].push(event);
      });
  }
  return slots;
}

function svgSparkSlot(scene: SvgScene, id: string, events: SvgSparkEvent[]): string {
  const first = events[0];
  if (!first) return '';
  const duration = scene.timeline.duration;
  const gates = [{ time: 0, value: 'none' }];
  const fades = [{ time: 0, value: '0' }];
  const travel = [{ time: 0, value: 0 }];
  const positions = [{ time: 0, value: `${svgNumber(first.x)} ${svgNumber(first.y)}` }];
  const colors = [{ time: 0, value: first.color }];
  for (const [index, event] of events.entries()) {
    const end = Math.min(event.end, events[index + 1]?.time ?? duration);
    gates.push({ time: event.time, value: 'inline' }, { time: end, value: 'none' });
    fades.push({ time: event.time, value: '1' }, { time: end, value: '0' });
    travel.push({ time: event.time, value: 0 }, { time: end, value: 1 });
    positions.push({ time: event.time, value: `${svgNumber(event.x)} ${svgNumber(event.y)}` });
    colors.push({ time: event.time, value: event.color });
  }
  gates.push({ time: duration, value: 'none' });
  fades.push({ time: duration, value: '0' });
  travel.push({ time: duration, value: 1 });
  positions.push({ time: duration, value: positions.at(-1)?.value ?? '0 0' });
  colors.push({ time: duration, value: colors.at(-1)?.value ?? first.color });
  const display = svgAnimation(
    'display',
    gates.map((point) => point.value),
    gates.map((point) => point.time),
    duration,
    true,
  );
  const opacity = svgAnimation(
    'fill-opacity',
    fades.map((point) => point.value),
    fades.map((point) => point.time),
    duration,
  );
  const position = svgAnimation(
    'translate',
    positions.map((point) => point.value),
    positions.map((point) => point.time),
    duration,
    true,
  );
  const color = svgAnimation(
    'fill',
    colors.map((point) => point.value),
    colors.map((point) => point.time),
    duration,
    true,
  );
  const particles = Array.from({ length: 4 }, (_, index) => {
    const angle = (index * Math.PI) / 2 + Math.PI / 4;
    const values = travel.map(
      (point) => `${svgNumber(Math.cos(angle) * 11 * point.value)} ${svgNumber(Math.sin(angle) * 11 * point.value)}`,
    );
    return `<rect x="-1.5" y="-1.5" width="3" height="3" rx="1">${svgAnimation(
      'translate',
      values,
      travel.map((point) => point.time),
      duration,
    )}</rect>`;
  }).join('');
  return `<g id="${id}" display="none" fill="${first.color}" fill-opacity="0">${display}${opacity}${position}${color}${particles}</g>`;
}

function svgContactSparks(scene: SvgScene): string {
  const cells = new Map(scene.timeline.cells.map((cell) => [cell.id, cell]));
  const grass = scene.timeline.contacts.map((contact, index) => {
    const cell = cells.get(contact.cellId);
    if (!cell || cell.level === 0) throw new Error('The SVG contact cell ID is invalid.');
    return svgSparkEvent(
      scene,
      contact.time,
      cell.x + cell.size / 2,
      cell.y + cell.size / 2,
      scene.palette.grass[cell.level],
      index,
    );
  });
  const balls = (scene.timeline.ballContacts ?? []).map((contact, index) =>
    svgSparkEvent(scene, contact.time, contact.x, contact.y, scene.palette.celebration, index),
  );
  const layer = (name: string, events: SvgSparkEvent[]) =>
    `<g id="${scene.prefix}-${name}-sparks">${svgSparkSlots(events)
      .map((slot, index) => svgSparkSlot(scene, `${scene.prefix}-${name}-spark-slot-${index}`, slot))
      .join('')}</g>`;
  return `<g id="${scene.prefix}-contact-sparks">${layer('grass', grass)}${layer('ball', balls)}</g>`;
}

function renderSvgMotion(scene: SvgScene): string {
  return svgContactSparks(scene) + svgMotionBalls(scene);
}
