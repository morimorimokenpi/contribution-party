interface SvgLightState {
  time: number;
  phase: number;
  intensity: number;
}

interface SvgLightMode {
  boosted: boolean;
  start: number;
  end: number;
  samples: SvgLightState[];
}

function svgLightValue(value: number): string {
  return String(Number(value.toFixed(4)));
}

function svgLightModes(timeline: PinballTimeline): SvgLightMode[] {
  const party = timeline.frames.find(frame => frame.balls.length >= 5)?.time;
  if (party === undefined || !timeline.frames.some(frame => frame.clubIntensity > 0)) return [];
  const superAt = timeline.frames.find(frame => frame.balls.length >= 10)?.time ?? timeline.finalAt;
  const spans = [
    { boosted: false, start: party, end: Math.min(superAt, timeline.finalAt) },
    { boosted: true, start: superAt, end: timeline.finalAt },
  ];
  return spans.filter(span => span.end > span.start).map(span => {
    const times = new Set([span.start, span.end]);
    if (timeline.clearedAt > span.start && timeline.clearedAt < span.end) times.add(timeline.clearedAt);
    for (let index = Math.ceil(span.start / .05); index * .05 < span.end; index++) times.add(index * .05);
    // 立ち上がりと消灯は、計算済みのフレーム時刻も残して指数曲線の補間誤差を抑える。
    for (const frame of timeline.frames) {
      if (frame.time > span.start && frame.time < span.end && frame.clubIntensity > 0 && frame.clubIntensity < .999) {
        times.add(frame.time);
      }
    }
    let frameIndex = 0;
    const samples = [...times].sort((a, b) => a - b).map(time => {
      while (frameIndex + 1 < timeline.frames.length && (timeline.frames[frameIndex + 1]?.time ?? Infinity) <= time) frameIndex++;
      const before = timeline.frames[frameIndex];
      const after = timeline.frames[frameIndex + 1] ?? before;
      if (!before || !after) throw new Error('照明を描画するフレームがありません。');
      const fraction = after.time === before.time ? 0 : Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time)));
      return { time, phase: before.clubTime + (after.clubTime - before.clubTime) * fraction,
        intensity: before.clubIntensity + (after.clubIntensity - before.clubIntensity) * fraction };
    });
    return { ...span, samples };
  });
}

function svgLightTrack(mode: SvgLightMode, duration: number, value: (state: SvgLightState) => number, tolerance: number): SvgPosition[] {
  const source = mode.samples.map(state => ({ time: state.time, x: value(state), y: 0 }));
  const frozenPhase = mode.samples.at(-1)?.phase;
  const freeze = mode.samples.findIndex(state => state.phase === frozenPhase);
  const points = freeze > 0 && freeze < source.length - 1
    ? [...simplifySvgTrack(source.slice(0, freeze + 1), tolerance), ...simplifySvgTrack(source.slice(freeze), tolerance).slice(1)]
    : simplifySvgTrack(source, tolerance);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return [];
  if (first.time > 0) points.unshift({ ...first, time: 0 });
  if (last.time < duration) points.push({ ...last, time: duration });
  return points;
}

function svgLightScalar(attribute: string, points: SvgPosition[], duration: number): string {
  return svgAnimation(attribute, points.map(point => svgLightValue(point.x)), points.map(point => point.time), duration);
}

function svgLightBeam(scene: SvgScene, mode: SvgLightMode, index: number): string {
  const { timeline, palette, prefix } = scene;
  const { width, height, duration } = timeline;
  const count = mode.boosted ? 6 : 3;
  const sourceX = width * (mode.boosted ? .08 + index * .84 / (count - 1) : .13 + index * .37);
  const spread = mode.boosted ? 40 + index % 3 * 10 : 70 + index * 12;
  const color = palette.lights[index % 3] ?? palette.lights[0];
  const id = `${prefix}-beam-${mode.boosted ? '10' : '5'}-${index}`;
  const pulse = (state: SvgLightState) => .65 + .35 * Math.sin(state.phase * Math.PI * (mode.boosted ? 1.8 : 1.4) + index * 1.7);
  const target = svgLightTrack(mode, duration, state => Math.max(80, Math.min(width - 80,
    sourceX + Math.sin(state.phase * (mode.boosted ? .95 : .65) + index * 2.1) * width * (mode.boosted ? .28 : .2))), .12);
  const startOpacity = svgLightTrack(mode, duration, state => state.intensity * (mode.boosted ? .16 : .10), .0008);
  const middleOpacity = svgLightTrack(mode, duration,
    state => state.intensity * (mode.boosted ? .20 + pulse(state) * .22 : .14 + pulse(state) * .17), .0008);
  const endOpacity = svgLightTrack(mode, duration, state => state.intensity * .02, .0008);
  const glowOpacity = svgLightTrack(mode, duration,
    state => state.intensity * (mode.boosted ? .16 + pulse(state) * .20 : .10 + pulse(state) * .15), .0008);
  const beamPath = (targetX: number) => `M${svgNumber(sourceX - 3)} 9L${svgNumber(targetX - spread)} ${svgNumber(height - 15)}L${svgNumber(targetX + spread)} ${svgNumber(height - 15)}L${svgNumber(sourceX + 3)} 9Z`;
  const firstTarget = target[0]?.x ?? sourceX;
  const targetTimes = target.map(point => point.time);
  const pathMotion = svgAnimation('d', target.map(point => beamPath(point.x)), targetTimes, duration);
  const gradientMotion = svgLightScalar('x2', target, duration);
  const glowMotion = svgLightScalar('cx', target, duration) + svgLightScalar('fx', target, duration);
  const glowRectMotion = svgAnimation('x', target.map(point => svgNumber(point.x - 100)), targetTimes, duration);
  return `<defs><linearGradient id="${id}-gradient" gradientUnits="userSpaceOnUse" x1="${svgNumber(sourceX)}" y1="8" x2="${svgNumber(firstTarget)}" y2="${svgNumber(height - 14)}">${gradientMotion}<stop offset="0" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', startOpacity, duration)}</stop><stop offset=".7" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', middleOpacity, duration)}</stop><stop offset="1" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', endOpacity, duration)}</stop></linearGradient><radialGradient id="${id}-glow-gradient" gradientUnits="userSpaceOnUse" cx="${svgNumber(firstTarget)}" cy="${svgNumber(height - 40)}" fx="${svgNumber(firstTarget)}" fy="${svgNumber(height - 40)}" r="100">${glowMotion}<stop offset="0" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', glowOpacity, duration)}</stop><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><path id="${id}" d="${beamPath(firstTarget)}" fill="url(#${id}-gradient)" style="mix-blend-mode:screen">${pathMotion}</path><rect id="${id}-glow" x="${svgNumber(firstTarget - 100)}" y="${svgNumber(height - 140)}" width="200" height="140" fill="url(#${id}-glow-gradient)" style="mix-blend-mode:screen">${glowRectMotion}</rect>`;
}

function svgLightRim(scene: SvgScene, mode: SvgLightMode): string {
  const { timeline, palette, prefix } = scene;
  const count = mode.boosted ? 40 : 24;
  const label = mode.boosted ? '10' : '5';
  return Array.from({ length: count }, (_, index) => {
    const x = 18 + (timeline.width - 36) * index / (count - 1);
    const color = palette.lights[index % 3] ?? palette.lights[0];
    const opacity = svgLightTrack(mode, timeline.duration, state => {
      const pulse = .5 + .5 * Math.sin(state.phase * Math.PI * (mode.boosted ? 1.8 : 1.4) - index * .62);
      return state.intensity * (mode.boosted ? .35 + pulse * .65 : .25 + pulse * .6);
    }, .0008);
    const dots = [8, timeline.height - 14].map((y, edge) => `<circle id="${prefix}-rim-${label}-dot-${index * 2 + edge}" cx="${svgNumber(x)}" cy="${svgNumber(y)}" r="${mode.boosted ? '3.2' : '2.7'}" fill="${color}"/>`).join('');
    return `<g id="${prefix}-rim-${label}-pair-${index}" opacity="0">${svgLightScalar('opacity', opacity, timeline.duration)}${dots}</g>`;
  }).join('');
}

function renderSvgLights(scene: SvgScene, layer: 'beams' | 'rim' = 'beams'): string {
  const modes = svgLightModes(scene.timeline);
  if (modes.length === 0) return '';
  const groups = modes.map(mode => {
    const label = mode.boosted ? '10' : '5';
    const content = layer === 'beams'
      ? Array.from({ length: mode.boosted ? 6 : 3 }, (_, index) => svgLightBeam(scene, mode, index)).join('')
      : svgLightRim(scene, mode);
    return `<g id="${scene.prefix}-club-${layer}-${label}" opacity="0">${svgVisible(mode.start, mode.end, scene.timeline.duration)}${content}</g>`;
  }).join('');
  return `<g id="${scene.prefix}-club-${layer}">${groups}</g>`;
}
