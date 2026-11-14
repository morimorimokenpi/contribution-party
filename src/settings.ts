type PinballThemeMode = 'auto' | 'dark' | 'light';

type HexColor = `#${string}`;
type Rgb = readonly [number, number, number];

interface ThemePalette {
  background: HexColor;
  foreground: HexColor;
  mutedForeground: HexColor;
  surface: HexColor;
  border: HexColor;
  ball: HexColor;
  grass: readonly [HexColor, HexColor, HexColor, HexColor, HexColor];
  celebration: HexColor;
  lights: readonly [HexColor, HexColor, HexColor];
}

interface PinballConfig {
  theme: PinballThemeMode;
  ballCollisions: boolean;
  points: readonly [0, number, number, number, number];
  overInterval: number;
  partyScore: number;
  superPartyScore: number | null;
  palettes: { dark: ThemePalette; light: ThemePalette };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isThemeMode(value: unknown): value is PinballThemeMode {
  return value === 'auto' || value === 'dark' || value === 'light';
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function checkKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`${label} contains an unsupported setting: ${key}`);
  }
}

function readInteger(value: unknown, label: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

function readColor(value: unknown, label: string): HexColor {
  if (!isHexColor(value)) throw new Error(`${label} must be a color in #RRGGBB format.`);
  return value;
}

function readList(value: unknown, length: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain exactly ${length} values.`);
  }
  return value;
}

function parsePalette(value: unknown, label: string): ThemePalette {
  const palette = readRecord(value, label);
  checkKeys(
    palette,
    ['background', 'foreground', 'mutedForeground', 'surface', 'border', 'ball', 'grass', 'celebration', 'lights'],
    label,
  );
  const grass = readList(palette.grass, 5, `${label}.grass`);
  const lights = readList(palette.lights, 3, `${label}.lights`);
  return {
    background: readColor(palette.background, `${label}.background`),
    foreground: readColor(palette.foreground, `${label}.foreground`),
    mutedForeground: readColor(palette.mutedForeground, `${label}.mutedForeground`),
    surface: readColor(palette.surface, `${label}.surface`),
    border: readColor(palette.border, `${label}.border`),
    ball: readColor(palette.ball, `${label}.ball`),
    grass: [
      readColor(grass[0], `${label}.grass[0]`),
      readColor(grass[1], `${label}.grass[1]`),
      readColor(grass[2], `${label}.grass[2]`),
      readColor(grass[3], `${label}.grass[3]`),
      readColor(grass[4], `${label}.grass[4]`),
    ],
    celebration: readColor(palette.celebration, `${label}.celebration`),
    lights: [
      readColor(lights[0], `${label}.lights[0]`),
      readColor(lights[1], `${label}.lights[1]`),
      readColor(lights[2], `${label}.lights[2]`),
    ],
  };
}

function parsePinballConfig(value: unknown): PinballConfig {
  const settings = readRecord(value, 'configuration');
  checkKeys(
    settings,
    ['$schema', 'theme', 'ballCollisions', 'points', 'overInterval', 'partyScore', 'superPartyScore', 'palettes'],
    'configuration',
  );
  if (settings.$schema !== undefined && typeof settings.$schema !== 'string') {
    throw new Error('$schema must be a string.');
  }
  if (!isThemeMode(settings.theme)) throw new Error('theme must be auto, dark, or light.');
  if (settings.ballCollisions !== undefined && typeof settings.ballCollisions !== 'boolean') {
    throw new Error('ballCollisions must be true or false.');
  }
  const pointValues = readList(settings.points, 5, 'points');
  if (pointValues[0] !== 0) throw new Error('points[0] must be 0 for days without activity.');
  const palettes = readRecord(settings.palettes, 'palettes');
  checkKeys(palettes, ['dark', 'light'], 'palettes');
  const partyScore = readInteger(settings.partyScore, 'partyScore', 0);
  const superPartyScore =
    settings.superPartyScore === undefined || settings.superPartyScore === null
      ? null
      : readInteger(settings.superPartyScore, 'superPartyScore', 0);
  if (superPartyScore !== null && superPartyScore < partyScore) {
    throw new Error('superPartyScore must be greater than or equal to partyScore.');
  }
  return {
    theme: settings.theme,
    ballCollisions: settings.ballCollisions ?? false,
    points: [
      0,
      readInteger(pointValues[1], 'points[1]', 0),
      readInteger(pointValues[2], 'points[2]', 0),
      readInteger(pointValues[3], 'points[3]', 0),
      readInteger(pointValues[4], 'points[4]', 0),
    ],
    overInterval: readInteger(settings.overInterval, 'overInterval', 1),
    partyScore,
    superPartyScore,
    palettes: {
      dark: parsePalette(palettes.dark, 'palettes.dark'),
      light: parsePalette(palettes.light, 'palettes.light'),
    },
  };
}

function hexToRgb(color: HexColor): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}
