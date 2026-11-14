import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export const POINTS = [0, 1, 3, 5, 10];

export function readFixture(name) {
  const html = fs.readFileSync(new URL('../dist/' + name + '.fragment.html', import.meta.url), 'utf8');
  const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g));
  const dataScript = scripts.find(([, attributes]) => attributes.includes('data-pinball-data'));
  const configScript = scripts.find(([, attributes]) => attributes.includes('data-pinball-config'));
  const gameScript = scripts.find(([, attributes]) => !attributes.includes('application/json'));
  const rootTag = html.match(/<[^>]+\bdata-pinball-root\b[^>]*>/)?.[0];
  const rootId = rootTag?.match(/\bid="([^"]+)"/)?.[1];
  assert(dataScript && configScript && gameScript, 'The generated fragment includes data, configuration, and game scripts');
  assert(rootId, 'The generated fragment has an identified root element');
  const collisionDemo = /\bdata-pinball-collision-demo="true"/.test(rootTag);
  return { html, rootId, collisionDemo, data: JSON.parse(dataScript[2]), config: JSON.parse(configScript[2]), script: gameScript[2] };
}

export function createGame(name, options = {}) {
  const fixture = readFixture(name);
  const data = Object.hasOwn(options, 'data') ? options.data : fixture.data;
  const config = Object.hasOwn(options, 'config') ? options.config : fixture.config;
  assert.equal(fixture.script.match(/applyState\(saved\);/g)?.length, 1, 'The game has one initialization entry point');
  const collisionInstrumentation = options.recordCollisions ? `
    const originalCollisionSolver = resolveBallCollision;
    resolveBallCollision = (a, b, radius) => {
      const snapshot = body => ({ x: body.x, y: body.y, vx: body.vx, vy: body.vy });
      const before = [snapshot(a), snapshot(b)];
      const reflected = originalCollisionSolver(a, b, radius);
      if (reflected) root.recordCollision({ before, after: [snapshot(a), snapshot(b)] });
      return reflected;
    };
  ` : '';
  const instrumented = fixture.script.replace(
    'applyState(saved);',
    collisionInstrumentation + 'applyState(saved); root.inspect = () => ({ themeMode, palette, colors, lightRgb, points, autoPartyScore, width, height, radius, speed, cells, total, remaining, score, finalScore, nextMilestone, autoPartyTriggered, superPartyTriggered, manualParty, pendingAwards, award, confetti, sparks, clubTime, clubIntensity, balls, running, cleared, lastTime }); root.testing = { collide, tick, draw, hasEffects, showFinalScore, sync };',
  );
  assert.notEqual(instrumented, fixture.script, 'The VM instrumentation matches the compiled game initialization');

  const controlHandlers = {};
  const globalHandlers = {};
  const frames = new Map();
  const saves = [];
  const awardLog = [];
  const gradients = [];
  const paintLog = [];
  const collisionLog = [];
  const storageWrites = [];
  let frameId = 0;
  let seed = options.seed ?? 1;
  let title = '';
  let themeChange;
  let storedTheme = options.storageTheme ?? null;
  function style() {
    const properties = new Map();
    return {
      properties,
      setProperty(name, value) { properties.set(name, value); },
      getPropertyValue(name) { return properties.get(name) ?? ''; },
    };
  }
  const nodes = {
    '[data-pinball-data]': { textContent: JSON.stringify(data) },
    '[data-pinball-config]': { textContent: JSON.stringify(config) },
    '[data-pinball-status]': {},
    '[data-pinball-score]': {},
    '[data-pinball-goal]': {},
    '[data-pinball-award]': { hidden: true, style: {} },
    '[data-pinball-award-caption]': { hidden: true },
    '[data-pinball-award-title]': {
      get textContent() { return title; },
      set textContent(value) {
        title = value;
        if (value) awardLog.push(value);
      },
    },
    '[data-pinball-award-detail]': {},
    '[data-pinball-theme]': {
      value: '',
      addEventListener(event, callback) {
        assert.equal(event, 'change');
        themeChange = callback;
      },
    },
  };
  for (let level = 1; level <= 4; level++) {
    nodes['[data-pinball-swatch="' + level + '"]'] = { style: style() };
    nodes['[data-pinball-points="' + level + '"]'] = {};
  }
  for (const name of ['play', 'party', 'restart']) {
    nodes['[data-pinball-' + name + ']'] = {
      addEventListener(event, callback) {
        assert.equal(event, 'click');
        controlHandlers[name] = callback;
      },
    };
  }
  const context = {};
  for (const method of [
    'setTransform', 'clearRect', 'fillRect', 'beginPath', 'roundRect',
    'fill', 'arc', 'strokeRect', 'stroke', 'save', 'restore',
    'moveTo', 'lineTo', 'closePath',
  ]) {
    context[method] = (...values) => {
      assert(values.every(Number.isFinite), 'Canvas coordinates remain finite');
      if (options.recordPaint) paintLog.push({ method, values, fillStyle: context.fillStyle, strokeStyle: context.strokeStyle });
    };
  }
  for (const method of ['createLinearGradient', 'createRadialGradient']) {
    context[method] = (...values) => {
      assert(values.every(Number.isFinite));
      const gradient = { method, values, stops: [] };
      if (options.recordPaint) gradients.push(gradient);
      return {
        addColorStop(offset, color) {
          assert(Number.isFinite(offset) && offset >= 0 && offset <= 1);
          assert.equal(typeof color, 'string');
          if (options.recordPaint) gradient.stops.push({ offset, color });
        },
      };
    };
  }
  nodes.canvas = {
    getContext(type) {
      assert.equal(type, '2d');
      return context;
    },
  };
  const root = {
    clientWidth: options.width ?? 880,
    style: style(),
    dataset: fixture.collisionDemo ? { pinballCollisionDemo: 'true' } : {},
    recordCollision(collision) { collisionLog.push(collision); },
    querySelector(selector) {
      assert(Object.hasOwn(nodes, selector), 'The DOM mock contains ' + selector);
      return nodes[selector];
    },
  };
  const page = { style: style(), dataset: {} };
  const mediaQueries = new Map();
  function matchMedia(query) {
    if (!mediaQueries.has(query)) {
      const listeners = new Set();
      const matches = query === '(prefers-reduced-motion: reduce)'
        ? options.reducedMotion ?? false
        : query === '(prefers-color-scheme: dark)' ? options.systemDark ?? false : false;
      mediaQueries.set(query, {
        matches,
        media: query,
        listeners,
        addEventListener(event, callback) {
          assert.equal(event, 'change');
          listeners.add(callback);
        },
        removeEventListener(event, callback) {
          assert.equal(event, 'change');
          listeners.delete(callback);
        },
      });
    }
    return mediaQueries.get(query);
  }
  const storage = {
    getItem(key) {
      assert.equal(key, 'contribution-pinball:theme');
      return storedTheme;
    },
    setItem(key, value) {
      assert.equal(key, 'contribution-pinball:theme');
      storedTheme = value;
      storageWrites.push({ key, value });
    },
  };
  const browserWindow = {
    devicePixelRatio: 2,
    matchMedia,
    addEventListener: (event, callback) => { globalHandlers[event] = callback; },
    openai: {
      widgetState: { modelContent: options.saved },
      setWidgetState(value) {
        saves.push(value);
        return Promise.resolve();
      },
    },
  };
  if (options.hostUnavailable) delete browserWindow.openai;
  Object.defineProperty(browserWindow, 'localStorage', {
    get() {
      if (options.storageUnavailable) throw new Error('Storage is blocked');
      return storage;
    },
  });
  const randomMath = Object.create(Math);
  randomMath.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  vm.runInNewContext(instrumented, {
    Math: randomMath,
    document: {
      getElementById(id) {
        assert.equal(id, fixture.rootId, 'The compiled game binds to its own fragment root');
        return root;
      },
      querySelector(selector) {
        if (selector === '[data-pinball-root]') return root;
        assert.equal(selector, '[data-pinball-page]');
        return options.includePage ? page : null;
      },
    },
    window: browserWindow,
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
  });

  return {
    fixture,
    root,
    nodes,
    saves,
    storageWrites,
    awardLog,
    gradients,
    paintLog,
    collisionLog,
    page,
    state: () => root.inspect(),
    hasFrame: () => frames.size > 0,
    click(name) { controlHandlers[name](); },
    selectTheme(value) {
      nodes['[data-pinball-theme]'].value = value;
      assert(themeChange);
      themeChange({ target: nodes['[data-pinball-theme]'] });
    },
    setSystemDark(matches) {
      const media = matchMedia('(prefers-color-scheme: dark)');
      media.matches = matches;
      for (const callback of media.listeners) callback({ matches, media: media.media });
    },
    restore(modelContent) {
      globalHandlers['openai:set_globals']({
        detail: { globals: { widgetState: { modelContent } } },
      });
    },
    advance(time) {
      assert.equal(frames.size, 1, 'Only one animation loop is scheduled');
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(time);
    },
  };
}

export function hitCell(game, cell) {
  const before = game.state().score;
  assert.equal(game.root.testing.collide({
    x: cell.x + cell.size / 2,
    y: cell.y + cell.size / 2,
    vx: 10,
    vy: -10,
    trail: [],
  }, cell), true);
  assert.equal(game.state().score, before + game.state().points[cell.level]);
}

export function reachScore(game, target) {
  while (game.state().score < target) {
    const needed = target - game.state().score;
    const level = [4, 3, 2, 1].find(candidate => game.state().points[candidate] <= needed
      && game.state().cells.some(cell => cell.alive && cell.level === candidate));
    assert(level, 'Available grass can reach ' + target + ' points');
    hitCell(game, game.state().cells.find(cell => cell.alive && cell.level === level));
  }
  assert.equal(game.state().score, target);
}

export function awards(game) {
  const state = game.state();
  return [...(state.award ? [state.award] : []), ...state.pendingAwards];
}

export function freezeBalls(game) {
  for (const ball of game.state().balls) {
    ball.x = game.state().width / 2;
    ball.y = 180;
    ball.vx = 0;
    ball.vy = 0;
  }
}

export function clearAll(game) {
  for (const cell of game.state().cells) {
    if (cell.alive) hitCell(game, cell);
  }
  assert.equal(game.state().remaining, 0);
  assert.equal(game.state().cleared, true);
}

export function finishFrames(game, start = 0, limit = 60000) {
  let elapsed = start;
  while (game.hasFrame() && elapsed < start + limit) {
    elapsed += 50;
    game.advance(elapsed);
  }
  assert.equal(game.hasFrame(), false, 'Animation and effect queues finish within the limit');
  return elapsed;
}
