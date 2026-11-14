/*
MIT License

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
SOFTWARE.
*/
"use strict";
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isThemeMode(value) {
    return value === 'auto' || value === 'dark' || value === 'light';
}
function readRecord(value, label) {
    if (!isRecord(value))
        throw new Error(`${label} must be an object.`);
    return value;
}
function checkKeys(value, keys, label) {
    for (const key of Object.keys(value)) {
        if (!keys.includes(key))
            throw new Error(`${label} contains an unsupported setting: ${key}`);
    }
}
function readInteger(value, label, minimum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`${label} must be a safe integer greater than or equal to ${minimum}.`);
    }
    return value;
}
function isHexColor(value) {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}
function readColor(value, label) {
    if (!isHexColor(value))
        throw new Error(`${label} must be a color in #RRGGBB format.`);
    return value;
}
function readList(value, length, label) {
    if (!Array.isArray(value) || value.length !== length) {
        throw new Error(`${label} must contain exactly ${length} values.`);
    }
    return value;
}
function parsePalette(value, label) {
    const palette = readRecord(value, label);
    checkKeys(palette, ['background', 'foreground', 'mutedForeground', 'surface', 'border', 'ball', 'grass', 'celebration', 'lights'], label);
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
function parsePinballConfig(value) {
    const settings = readRecord(value, 'configuration');
    checkKeys(settings, ['$schema', 'theme', 'ballCollisions', 'points', 'overInterval', 'partyScore', 'superPartyScore', 'palettes'], 'configuration');
    if (settings.$schema !== undefined && typeof settings.$schema !== 'string') {
        throw new Error('$schema must be a string.');
    }
    if (!isThemeMode(settings.theme))
        throw new Error('theme must be auto, dark, or light.');
    if (settings.ballCollisions !== undefined && typeof settings.ballCollisions !== 'boolean') {
        throw new Error('ballCollisions must be true or false.');
    }
    const pointValues = readList(settings.points, 5, 'points');
    if (pointValues[0] !== 0)
        throw new Error('points[0] must be 0 for days without activity.');
    const palettes = readRecord(settings.palettes, 'palettes');
    checkKeys(palettes, ['dark', 'light'], 'palettes');
    const partyScore = readInteger(settings.partyScore, 'partyScore', 0);
    const superPartyScore = settings.superPartyScore === undefined || settings.superPartyScore === null
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
function hexToRgb(color) {
    return [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
    ];
}

"use strict";
function parseContributionData(value) {
    if (!isRecord(value) || !Array.isArray(value.levels) || value.levels.length === 0) {
        throw new Error('Contribution data must contain a non-empty levels array.');
    }
    const levels = value.levels.map((week) => {
        if (!Array.isArray(week) || week.length === 0 || week.length > 7) {
            throw new Error('Each contribution week must contain 1 to 7 days.');
        }
        return week.map((level) => {
            if (level === null || level === 0 || level === 1 || level === 2 || level === 3 || level === 4) {
                return level;
            }
            throw new Error('Contribution levels must be 0 to 4, or null for dates outside the displayed period.');
        });
    });
    return { levels };
}

"use strict";
function resolveBallCollision(a, b, radius) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const diameter = radius * 2;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > diameter * diameter)
        return false;
    const distance = Math.sqrt(distanceSquared);
    const relativeX = b.vx - a.vx;
    const relativeY = b.vy - a.vy;
    const relativeSpeed = Math.hypot(relativeX, relativeY);
    const nx = distance > 0 ? dx / distance : relativeSpeed > 0 ? -relativeX / relativeSpeed : 1;
    const ny = distance > 0 ? dy / distance : relativeSpeed > 0 ? -relativeY / relativeSpeed : 0;
    const separation = (diameter - distance) / 2 + 0.000001;
    a.x -= nx * separation;
    a.y -= ny * separation;
    b.x += nx * separation;
    b.y += ny * separation;
    const approachingSpeed = relativeX * nx + relativeY * ny;
    if (approachingSpeed >= 0)
        return false;
    // 同じ質量の弾性衝突では、接触方向の速度成分を交換し、接線方向の成分は保つ。
    a.vx += approachingSpeed * nx;
    a.vy += approachingSpeed * ny;
    b.vx -= approachingSpeed * nx;
    b.vy -= approachingSpeed * ny;
    return true;
}

"use strict";
function createPinballTimeline(input, settings, options = {}) {
    const contributionData = parseContributionData(input);
    if (contributionData.levels.length > 53)
        throw new Error('README animations support up to 53 weeks of contribution data.');
    const configuration = parsePinballConfig(settings);
    const seed = options.seed ?? 1;
    const frameRate = options.frameRate ?? 30;
    const maxDuration = options.maxDuration ?? 300;
    const initialBalls = options.initialBalls ?? 1;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new Error('seed must be an integer from 0 to 4294967295.');
    if (!Number.isInteger(frameRate) || frameRate < 1 || frameRate > 60)
        throw new Error('frameRate must be an integer from 1 to 60.');
    if (!Number.isFinite(maxDuration) || maxDuration <= 0 || maxDuration > 3600)
        throw new Error('maxDuration must be greater than 0 and at most 3600 seconds.');
    if (initialBalls !== 1 && initialBalls !== 5)
        throw new Error('initialBalls must be 1 or 5.');
    const width = Math.max(320, 32 + contributionData.levels.length * 16);
    const height = 208;
    const radius = Math.min(6.75, (width - 16) / 6);
    const speed = 410;
    const fixedStep = 1 / 240;
    const cells = contributionData.levels.flatMap((week, column) => week.flatMap((level, row) => level === null
        ? []
        : [
            {
                id: column * 7 + row,
                column,
                row,
                x: 18 + column * 16,
                y: 18 + row * 16,
                size: 12,
                level,
                eatenAt: null,
            },
        ]));
    const grid = new Map(cells.map((cell) => [cell.id, cell]));
    const total = cells.filter((cell) => cell.level > 0).length;
    const finalScore = cells.reduce((sum, cell) => sum + configuration.points[cell.level], 0);
    if (!Number.isSafeInteger(finalScore))
        throw new Error('The total contribution score exceeds the safe integer limit.');
    let randomState = seed;
    function random() {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 4294967296;
    }
    const angle = -Math.PI * (0.2 + random() * 0.15);
    const balls = [
        { id: 0, x: width / 2, y: height - 28, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
    ];
    if (initialBalls === 5) {
        const horizontalScale = Math.min(1, (width - 16 - radius * 2) / (880 - 16 - radius * 2));
        const positions = [
            [-64, 157, 0],
            [64, 165, Math.PI],
            [-178, 179, -0.3],
            [180, 147, 2.9],
            [260, 178, -2.6],
        ];
        balls.splice(0, 1, ...positions.map(([offset = 0, y = 180, heading = 0], id) => ({
            id,
            x: width / 2 + offset * horizontalScale,
            y,
            vx: Math.cos(heading) * speed,
            vy: Math.sin(heading) * speed,
        })));
    }
    const frames = [];
    const awards = [];
    const scoreChanges = [{ time: 0, score: 0, remaining: total }];
    const contacts = [];
    const ballContacts = [];
    const steeringEvents = [];
    let remaining = total;
    let score = 0;
    let time = 0;
    let nextMilestone = configuration.overInterval;
    let partyTriggered = false;
    let superTriggered = false;
    let pending = [];
    let active = null;
    let clearedAt = total === 0 ? 0 : null;
    let finalAt = total === 0 ? 0 : null;
    let clubTime = 0;
    let clubIntensity = 0;
    let sparkUntil = 0;
    let lastCollected = 0;
    let lastSteering = -Infinity;
    let criticalFrame = false;
    function capture(at) {
        const snapshot = {
            time: at,
            balls: balls.map((ball) => ({ id: ball.id, x: ball.x, y: ball.y })),
            score,
            remaining,
            clubTime,
            clubIntensity,
        };
        if (frames.at(-1)?.time === at)
            frames[frames.length - 1] = snapshot;
        else {
            if (frames.length >= 50000)
                throw new Error('The animation exceeds the 50000-frame limit. Lower frameRate.');
            frames.push(snapshot);
        }
    }
    function beginAward() {
        if (active || pending.length === 0)
            return;
        const request = pending.shift();
        if (!request)
            return;
        const presentation = request.kind === 'over'
            ? { title: `${request.threshold} OVER`, detail: '', duration: 1.6 }
            : request.kind === 'party'
                ? { title: 'PARTY TIME!', detail: '', duration: 2.4 }
                : { title: 'SUPER\nPARTY TIME', detail: '', duration: 3.2 };
        active = {
            ...request,
            start: time,
            end: time + presentation.duration,
            title: presentation.title,
            detail: presentation.detail,
        };
        awards.push(active);
        criticalFrame = true;
    }
    function advanceAward() {
        if (active && time >= active.end - 1e-9) {
            active = null;
            criticalFrame = true;
            beginAward();
        }
    }
    function promote(target) {
        if (balls.length >= target)
            return false;
        const origin = balls[0];
        if (!origin)
            return false;
        const count = target - balls.length;
        for (let index = 0; index < count; index++) {
            const heading = -Math.PI + ((index + 1) * Math.PI) / (count + 1) + (random() - 0.5) * 0.12;
            balls.push({
                id: balls.length,
                x: origin.x,
                y: origin.y,
                vx: Math.cos(heading) * speed,
                vy: Math.sin(heading) * speed,
            });
        }
        criticalFrame = true;
        return true;
    }
    function queueMilestones() {
        if (nextMilestone !== null && score > nextMilestone) {
            const last = score - 1 - ((score - 1) % configuration.overInterval);
            const count = Math.round((last - nextMilestone) / configuration.overInterval) + 1;
            if (count + pending.filter((request) => request.kind === 'over').length > 32) {
                pending = pending.filter((request) => request.kind !== 'over');
                pending.push({ kind: 'over', threshold: last });
            }
            else {
                for (let index = 0; index < count; index++)
                    pending.push({ kind: 'over', threshold: nextMilestone + index * configuration.overInterval });
            }
            const next = last + configuration.overInterval;
            nextMilestone = Number.isSafeInteger(next) ? next : null;
        }
        const celebrations = [];
        if (!partyTriggered && score > configuration.partyScore) {
            partyTriggered = true;
            if (promote(5))
                celebrations.push({ kind: 'party' });
        }
        if (!superTriggered && configuration.superPartyScore !== null && score > configuration.superPartyScore) {
            superTriggered = true;
            if (promote(10))
                celebrations.push({ kind: 'super-party' });
        }
        if (celebrations.length > 0) {
            pending.unshift(...celebrations);
            const priority = { party: 0, 'super-party': 1, over: 2 };
            pending.sort((a, b) => priority[a.kind] - priority[b.kind]);
        }
        beginAward();
    }
    function steerAtWall(ball) {
        if (time - lastCollected < 3 || time - lastSteering < 0.5)
            return;
        const magnitude = Math.hypot(ball.vx, ball.vy);
        if (magnitude < 1)
            return;
        let target;
        let distance = Infinity;
        for (const cell of cells) {
            if (cell.level === 0 || cell.eatenAt !== null)
                continue;
            const candidate = Math.hypot(cell.x + 6 - ball.x, cell.y + 6 - ball.y);
            if (candidate < distance) {
                target = cell;
                distance = candidate;
            }
        }
        if (!target || distance === 0)
            return;
        // 回収が止まった場合だけ、実際の壁接触位置で反射方向を調整する。
        ball.vx = ((target.x + 6 - ball.x) / distance) * magnitude;
        ball.vy = ((target.y + 6 - ball.y) / distance) * magnitude;
        steeringEvents.push({ time, ballId: ball.id, cellId: target.id, x: ball.x, y: ball.y, speed: magnitude });
        lastSteering = time;
    }
    function walls(ball, allowSteering) {
        let touched = false;
        if (ball.x < 8 + radius) {
            ball.x = 8 + radius;
            ball.vx = Math.abs(ball.vx);
            touched = true;
        }
        if (ball.x > width - 8 - radius) {
            ball.x = width - 8 - radius;
            ball.vx = -Math.abs(ball.vx);
            touched = true;
        }
        if (ball.y < 8 + radius) {
            ball.y = 8 + radius;
            ball.vy = Math.abs(ball.vy);
            touched = true;
        }
        if (ball.y > height - 14 - radius) {
            ball.y = height - 14 - radius;
            ball.vy = -Math.abs(ball.vy);
            touched = true;
        }
        if (touched) {
            criticalFrame = true;
            if (allowSteering)
                steerAtWall(ball);
        }
    }
    function hit(ball, cell) {
        if (cell.level === 0 || cell.eatenAt !== null)
            return false;
        const nearestX = Math.max(cell.x, Math.min(cell.x + cell.size, ball.x));
        const nearestY = Math.max(cell.y, Math.min(cell.y + cell.size, ball.y));
        if (Math.hypot(ball.x - nearestX, ball.y - nearestY) >= radius)
            return false;
        contacts.push({ time, cellId: cell.id, ballId: ball.id, x: ball.x, y: ball.y });
        const overlapX = Math.min(ball.x + radius - cell.x, cell.x + cell.size + radius - ball.x);
        const overlapY = Math.min(ball.y + radius - cell.y, cell.y + cell.size + radius - ball.y);
        if (overlapX < overlapY) {
            const direction = ball.x < cell.x + 6 ? -1 : 1;
            ball.x = direction < 0 ? cell.x - radius - 0.05 : cell.x + cell.size + radius + 0.05;
            ball.vx = direction * Math.abs(ball.vx);
        }
        else {
            const direction = ball.y < cell.y + 6 ? -1 : 1;
            ball.y = direction < 0 ? cell.y - radius - 0.05 : cell.y + cell.size + radius + 0.05;
            ball.vy = direction * Math.abs(ball.vy);
        }
        cell.eatenAt = time;
        remaining--;
        score += configuration.points[cell.level];
        lastCollected = time;
        sparkUntil = time + 0.22;
        queueMilestones();
        if (remaining === 0)
            clearedAt = time;
        const change = { time, score, remaining };
        if (scoreChanges.at(-1)?.time === time)
            scoreChanges[scoreChanges.length - 1] = change;
        else
            scoreChanges.push(change);
        criticalFrame = true;
        return true;
    }
    function move() {
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
                    if (cell)
                        collided = hit(ball, cell);
                }
            }
            walls(ball, false);
            if (remaining === 0)
                break;
        }
        if (!configuration.ballCollisions || remaining === 0)
            return;
        for (let pass = 0; pass < 2; pass++) {
            for (const [index, ball] of balls.entries()) {
                for (let other = index + 1; other < balls.length; other++) {
                    const body = balls[other];
                    if (body && resolveBallCollision(ball, body, radius)) {
                        ballContacts.push({ time, a: ball.id, b: body.id, x: (ball.x + body.x) / 2, y: (ball.y + body.y) / 2 });
                        sparkUntil = time + 0.22;
                        criticalFrame = true;
                    }
                }
            }
            balls.forEach((ball) => {
                walls(ball, false);
            });
        }
    }
    balls.forEach((ball) => {
        walls(ball, false);
    });
    capture(0);
    let nextFrame = 1 / frameRate;
    const maxSteps = Math.floor(maxDuration / fixedStep);
    for (let step = 1; finalAt === null && step <= maxSteps; step++) {
        time = step * fixedStep;
        criticalFrame = false;
        if (remaining > 0)
            move();
        advanceAward();
        const lightsOn = balls.length >= 5 && remaining > 0;
        if (lightsOn)
            clubTime += fixedStep;
        clubIntensity += ((lightsOn ? 1 : 0) - clubIntensity) * fixedStep * (lightsOn ? 2.8 : 5.6);
        if (!lightsOn && clubIntensity < 0.003)
            clubIntensity = 0;
        if (clearedAt !== null &&
            time >= clearedAt + 1 &&
            time >= sparkUntil &&
            !active &&
            pending.length === 0 &&
            clubIntensity === 0)
            finalAt = time;
        if (time >= nextFrame - 1e-9 || criticalFrame || finalAt !== null)
            capture(time);
        if (time >= nextFrame - 1e-9)
            nextFrame += 1 / frameRate;
    }
    if (clearedAt === null || finalAt === null)
        throw new Error(`The animation did not finish within ${maxDuration} seconds (${remaining} cells remaining). Try another seed or check the data and configuration.`);
    capture(finalAt);
    const duration = finalAt + 3;
    capture(duration);
    return {
        width,
        height,
        radius,
        duration,
        seed,
        total,
        finalScore,
        clearedAt,
        finalAt,
        finalMessage: 'Happy hacking :)',
        cells,
        frames,
        awards,
        scoreChanges,
        contacts,
        ballContacts,
        steeringEvents,
    };
}

"use strict";
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
function svgCleanText(value) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Remove characters that XML 1.0 cannot represent.
    const invalidXmlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;
    return value
        .replace(invalidXmlCharacters, '')
        .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');
}
function svgEscape(value) {
    return svgCleanText(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
    })[character] ?? character);
}
function svgFinite(value, label, minimum = 0) {
    if (!Number.isFinite(value) || value < minimum || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
        throw new Error(`SVG ${label} must be a finite number within the safe range.`);
    }
}
function svgInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`SVG ${label} must be a non-negative safe integer.`);
}
function svgTime(value, duration) {
    return String(Number((value / duration).toPrecision(12)));
}
function svgNumber(value) {
    svgFinite(value, 'coordinate', -Number.MAX_SAFE_INTEGER);
    return String(Number(value.toFixed(2)));
}
function validateSvgTimeline(timeline) {
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
    if (typeof timeline.finalMessage !== 'string')
        throw new Error('The SVG final message must be a string.');
    for (const cell of timeline.cells)
        validateSvgCell(cell, timeline);
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
        if (award.start >= award.end || award.end > timeline.finalAt)
            throw new Error('SVG effect times are invalid.');
        if (typeof award.title !== 'string' || typeof award.detail !== 'string')
            throw new Error('SVG effect titles and details must be strings.');
        if (!['over', 'party', 'super-party'].includes(award.kind))
            throw new Error('The SVG effect kind is invalid.');
    }
}
function validateSvgCell(cell, timeline) {
    svgInteger(cell.id, 'cell ID');
    svgFinite(cell.x, 'cell x position');
    svgFinite(cell.y, 'cell y position');
    svgFinite(cell.size, 'cell size', 0.01);
    if (![0, 1, 2, 3, 4].includes(cell.level))
        throw new Error('SVG contribution levels must be 0 to 4.');
    if (cell.eatenAt !== null) {
        svgFinite(cell.eatenAt, 'cell removal time');
        if (cell.eatenAt > timeline.clearedAt)
            throw new Error('An SVG cell removal time exceeds the board clear time.');
    }
    if (cell.level > 0 && cell.eatenAt === null)
        throw new Error('SVG rendering requires a timeline with all contribution cells cleared.');
}
function validateSvgFrames(timeline) {
    if (timeline.frames.length < 1 ||
        timeline.frames[0]?.time !== 0 ||
        timeline.frames.at(-1)?.time !== timeline.duration)
        throw new Error('The SVG timeline must include its start and end frames.');
    let previous = -1;
    for (const frame of timeline.frames) {
        svgFinite(frame.time, 'frame time');
        if (frame.time <= previous || frame.time > timeline.duration)
            throw new Error('SVG frame times must be strictly increasing and within the animation duration.');
        previous = frame.time;
        svgFinite(frame.clubIntensity, 'light intensity');
        if (frame.clubIntensity > 1)
            throw new Error('SVG light intensity must be from 0 to 1.');
        const ids = new Set();
        for (const ball of frame.balls) {
            svgInteger(ball.id, 'ball ID');
            svgFinite(ball.x, 'ball x position', -Number.MAX_SAFE_INTEGER);
            svgFinite(ball.y, 'ball y position', -Number.MAX_SAFE_INTEGER);
            if (ids.has(ball.id))
                throw new Error('SVG ball IDs must be unique within each frame.');
            ids.add(ball.id);
        }
    }
}
function svgAnimation(attribute, values, times, duration, discrete = false) {
    const pairs = [];
    for (const [index, time] of times.entries()) {
        const pair = { time: svgTime(time, duration), value: values[index] ?? '' };
        if (pairs.at(-1)?.time === pair.time)
            pairs[pairs.length - 1] = pair;
        else
            pairs.push(pair);
    }
    const transform = attribute === 'translate' || attribute === 'rotate' || attribute === 'scale';
    const tag = transform ? 'animateTransform' : 'animate';
    const name = transform ? `attributeName="transform" type="${attribute}"` : `attributeName="${attribute}"`;
    return `<${tag} ${name} dur="${Number(duration.toPrecision(12))}s" repeatCount="indefinite" calcMode="${discrete ? 'discrete' : 'linear'}" keyTimes="${pairs.map((pair) => pair.time).join(';')}" values="${pairs.map((pair) => pair.value).join(';')}"/>`;
}
function svgVisible(start, end, duration) {
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
function simplifySvgTrack(points, tolerance = 0.2) {
    if (points.length < 3)
        return points;
    const keep = new Set([0, points.length - 1]);
    const pending = [[0, points.length - 1]];
    for (let segment = pending.pop(); segment; segment = pending.pop()) {
        const [start, end] = segment;
        const first = points[start];
        const last = points[end];
        if (!first || !last)
            continue;
        let maximum = tolerance ** 2;
        let selected = -1;
        for (let index = start + 1; index < end; index++) {
            const point = points[index];
            if (!point)
                continue;
            const fraction = (point.time - first.time) / (last.time - first.time);
            const error = (point.x - first.x - (last.x - first.x) * fraction) ** 2 +
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
function svgTracks(timeline) {
    const tracks = new Map();
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
function svgCells(scene, active) {
    return scene.timeline.cells
        .map((cell) => {
        if (active && cell.level === 0)
            return '';
        const animation = active && cell.eatenAt !== null ? svgVisible(0, cell.eatenAt, scene.timeline.duration) : '';
        return `<rect x="${svgNumber(cell.x)}" y="${svgNumber(cell.y)}" width="${svgNumber(cell.size)}" height="${svgNumber(cell.size)}" rx="2" fill="${scene.palette.grass[active ? cell.level : 0]}">${animation}</rect>`;
    })
        .join('');
}
function svgPointLegend({ timeline, palette, prefix }, points) {
    const levels = [1, 2, 3, 4];
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
function svgTextLines(title, x, y, size, color) {
    const lines = title.split('\n');
    return `<text x="${svgNumber(x)}" y="${svgNumber(y)}" text-anchor="middle" font-size="${svgNumber(size)}" font-weight="500" fill="${color}">${lines.map((line, index) => `<tspan x="${svgNumber(x)}" dy="${index === 0 ? '0' : svgNumber(size * 1.1)}">${svgEscape(line)}</tspan>`).join('')}</text>`;
}
function svgAwardAges(lifetime, extra = [], interval = 0.04) {
    const samples = Array.from({ length: Math.ceil(lifetime / interval) }, (_, index) => index * interval);
    return [...new Set([0, lifetime, ...samples, ...extra.filter((age) => age >= 0 && age <= lifetime)])].sort((a, b) => a - b);
}
function svgAwardAnimation(attribute, award, duration, ages, value) {
    const first = value(0);
    const last = value(award.end - award.start);
    return svgAnimation(attribute, [first, ...ages.map(value), last], [0, ...ages.map((age) => award.start + age), duration], duration);
}
function svgAwards({ timeline, palette, prefix }) {
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
        const opacity = svgAwardAnimation('opacity', award, timeline.duration, ages, (age) => svgNumber(Math.max(0, Math.min(1, age / 0.16, (1 - age / lifetime) / 0.15))));
        const scale = svgAwardAnimation('scale', award, timeline.duration, ages, (age) => String(Number(((age < 0.3
            ? 0.75 + 0.33 * Math.sin(((age / 0.3) * Math.PI) / 2)
            : 1 + 0.08 * Math.max(0, 1 - (age - 0.3) / 0.22)) +
            (award.kind === 'super-party' ? 0.04 * Math.sin(age * Math.PI * 1.8) : 0)).toFixed(5))));
        const center = `${svgNumber(timeline.width / 2)} ${svgNumber(timeline.height / 2)}`;
        return `<g id="${prefix}-${award.kind}-${index}-text" opacity="0" stroke="${palette.background}" stroke-width="2" paint-order="stroke fill">${opacity}<g transform="translate(${center})"><g id="${prefix}-${award.kind}-${index}-scale" transform="scale(.75)">${scale}<g transform="translate(-${svgNumber(timeline.width / 2)} -${svgNumber(timeline.height / 2)})">${title}${detail}</g></g></g></g>`;
    })
        .join('');
}
function svgFinal({ timeline, palette }, animated) {
    const center = timeline.width / 2;
    const scoreText = `${timeline.finalScore.toLocaleString('en-US')} pt`;
    const scoreSize = Math.min(52, (timeline.width - 40) / (scoreText.length * 0.7));
    const messageSize = Math.min(32, (timeline.width - 40) / (Math.max(1, timeline.finalMessage.length) * 0.65));
    const content = `<rect width="${svgNumber(timeline.width)}" height="${svgNumber(timeline.height)}" fill="${palette.background}" opacity=".92"/>` +
        svgTextLines('FINAL SCORE', center, timeline.height / 2 - 48, 32, palette.celebration) +
        svgTextLines(scoreText, center, timeline.height / 2 + 12, scoreSize, palette.foreground) +
        svgTextLines(timeline.finalMessage, center, timeline.height / 2 + 66, messageSize, palette.mutedForeground);
    return `<g${animated ? ' opacity="0"' : ''}>${animated ? svgVisible(timeline.finalAt, timeline.duration, timeline.duration) : ''}${content}</g>`;
}
function svgAwardEffects(scene, award, awardIndex) {
    const { timeline, palette, prefix } = scene;
    const lifetime = award.end - award.start;
    const ages = svgAwardAges(lifetime, [0.15, 1.4, lifetime - 1]);
    const veilOpacity = svgAwardAnimation('opacity', award, timeline.duration, ages, (age) => svgNumber(0.35 * Math.min(1, age / 0.15)));
    const veil = `<rect id="${prefix}-${award.kind}-${awardIndex}-veil" width="${svgNumber(timeline.width)}" height="${svgNumber(timeline.height)}" fill="${palette.background}" opacity="0">${veilOpacity}</rect>`;
    let ring = '';
    if (award.kind !== 'super-party') {
        const radius = svgAwardAnimation('r', award, timeline.duration, ages, (age) => svgNumber(12 + age * 85));
        const ringOpacity = svgAwardAnimation('opacity', award, timeline.duration, ages, (age) => svgNumber(Math.max(0, 0.7 - age / 2)));
        ring = `<circle id="${prefix}-${award.kind}-${awardIndex}-ring" cx="${svgNumber(timeline.width / 2)}" cy="${svgNumber(timeline.height / 2)}" r="12" fill="none" stroke="${palette.celebration}" stroke-width="2" opacity="0">${radius}${ringOpacity}</circle>`;
    }
    return `<g id="${prefix}-${award.kind}-${awardIndex}-effects" opacity="0">${svgVisible(award.start, award.end, timeline.duration)}${veil}${ring}${svgSuperBurst(scene, award, awardIndex)}${svgParticleBurst(scene, award, awardIndex)}</g>`;
}
function svgParticleBurst(scene, award, awardIndex) {
    const { timeline, palette, prefix } = scene;
    const superParty = award.kind === 'super-party';
    const count = superParty ? 160 : award.kind === 'party' ? 48 : 28;
    const lifetime = award.end - award.start;
    const ages = svgAwardAges(lifetime, [lifetime - 1], 0.1);
    const opacity = svgAwardAnimation('fill-opacity', award, timeline.duration, ages, (age) => svgNumber(Math.min(1, Math.max(0, lifetime - age))));
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
        const translate = svgAwardAnimation('translate', award, timeline.duration, ages, (age) => `${svgNumber(x + vx * age)} ${svgNumber(y + vy * age + 40 * age ** 2)}`);
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
function svgSuperBurst(scene, award, awardIndex) {
    if (award.kind !== 'super-party')
        return '';
    const { timeline, palette, prefix } = scene;
    const lifetime = Math.min(1.4, award.end - award.start);
    const burst = { ...award, end: award.start + lifetime };
    const ages = svgAwardAges(lifetime);
    const maxRadius = Math.max(1, Math.min(timeline.width * 0.32, timeline.height * 0.8));
    const expansion = (age) => 1 - (1 - age / 1.4) ** 3;
    const fade = (age) => (1 - age / 1.4) ** 2;
    const rings = palette.lights
        .map((color, index) => {
        const radius = svgAwardAnimation('r', burst, timeline.duration, ages, (age) => svgNumber(maxRadius * (0.12 + index * 0.09 + expansion(age) * 0.64)));
        const opacity = svgAwardAnimation('opacity', burst, timeline.duration, ages, (age) => svgNumber(fade(age) * (0.65 - index * 0.12)));
        const stroke = svgAwardAnimation('stroke-width', burst, timeline.duration, ages, (age) => svgNumber((2.2 - index * 0.35) * (1 - (age / 1.4) * 0.6)));
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
        const stroke = svgAwardAnimation('stroke-width', burst, timeline.duration, ages, (age) => svgNumber(1.4 - (age / 1.4) * 0.9));
        return `<path id="${prefix}-super-party-${awardIndex}-ray-${index}" d="M0 0l0 0" stroke="${color}" opacity="0">${shape}${opacity}${stroke}</path>`;
    }).join('');
    return `<g opacity="0">${svgVisible(burst.start, burst.end, timeline.duration)}${rings}${rays}</g>`;
}
function svgNamespace(timeline, theme, requested) {
    if (requested !== undefined) {
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(requested))
            throw new Error('SVG idPrefix must start with a letter and contain only letters, digits, hyphens, or underscores.');
        return requested;
    }
    const identity = JSON.stringify([
        timeline.seed,
        timeline.width,
        timeline.duration,
        timeline.cells.map((cell) => [cell.id, cell.level, cell.eatenAt]),
    ]);
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index++)
        hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
    return `cp-${theme}-${(hash >>> 0).toString(36)}`;
}
function compactSvgAnimationTimes(svg) {
    return svg.replace(/(<(?:animate|animateTransform|animateMotion)\b[^>]*\bkeyTimes=")([^"]+)"/g, (attribute, prefix, text) => {
        const times = text.split(';').map(Number);
        const compact = times.map((time) => Number(time.toPrecision(7)));
        if (compact.some((time, index) => index > 0 && time <= (compact[index - 1] ?? -Infinity)))
            return attribute;
        return `${prefix}${compact.join(';')}"`;
    });
}
function renderContributionSvg(options) {
    const { timeline } = options;
    if (options.theme !== 'dark' && options.theme !== 'light')
        throw new Error('The SVG theme must be dark or light.');
    const config = parsePinballConfig(options.config);
    validateSvgTimeline(timeline);
    const prefix = svgNamespace(timeline, options.theme, options.idPrefix);
    const scene = { timeline, palette: config.palettes[options.theme], prefix };
    const { palette } = scene;
    const legend = svgPointLegend(scene, config.points);
    const imageHeight = timeline.height + legend.height;
    const title = svgEscape(options.title ?? 'Contribution party');
    const pointDescription = config.points
        .slice(1)
        .map((value, index) => `level ${index + 1}: ${value} points`)
        .join(', ');
    const description = svgEscape(`Contribution activity animation. Points per grass block: ${pointDescription}. Final score ${timeline.finalScore}. ${timeline.finalMessage}`);
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

"use strict";
function svgMotionPath(track, prefix, duration) {
    const points = simplifySvgTrack(track.points).map((point) => ({
        ...point,
        x: Number(svgNumber(point.x)),
        y: Number(svgNumber(point.y)),
    }));
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last)
        throw new Error('The SVG ball path is empty.');
    if (first.time > 0)
        points.unshift({ ...first, time: 0 });
    if (last.time < duration)
        points.push({ ...last, time: duration });
    let distance = 0;
    const distances = points.map((point, index) => {
        const previous = points[index - 1];
        if (previous)
            distance += Math.hypot(point.x - previous.x, point.y - previous.y);
        return distance;
    });
    return {
        id: `${prefix}-motion-route-${track.id}`,
        points,
        distance,
        fractions: distances.map((value) => (distance === 0 ? 0 : value / distance)),
    };
}
function svgMotionFractionAt(path, time) {
    const index = path.points.findIndex((point) => point.time >= time);
    if (index <= 0)
        return index < 0 ? (path.fractions.at(-1) ?? 0) : (path.fractions[0] ?? 0);
    const previous = path.points[index - 1];
    const next = path.points[index];
    if (!previous || !next)
        return 0;
    const from = path.fractions[index - 1] ?? 0;
    const to = path.fractions[index] ?? from;
    return from + ((to - from) * (time - previous.time)) / (next.time - previous.time);
}
function svgDelayedMotion(path, delay, duration) {
    const first = path.points[0];
    if (!first)
        return '';
    if (path.distance === 0) {
        const position = `${svgNumber(first.x)} ${svgNumber(first.y)}`;
        return svgAnimation('translate', [position, position], [0, duration], duration);
    }
    const pairs = [{ time: 0, value: path.fractions[0] ?? 0 }];
    for (const [index, point] of path.points.entries()) {
        const time = point.time + delay;
        if (time > 0 && time < duration)
            pairs.push({ time, value: path.fractions[index] ?? 0 });
    }
    pairs.push({ time: duration, value: svgMotionFractionAt(path, Math.max(0, duration - delay)) });
    return `<animateMotion dur="${Number(duration.toPrecision(12))}s" repeatCount="indefinite" calcMode="linear" keyTimes="${pairs.map((pair) => svgTime(pair.time, duration)).join(';')}" keyPoints="${pairs.map((pair) => Number(pair.value.toPrecision(12))).join(';')}"><mpath href="#${path.id}"/></animateMotion>`;
}
function svgTrailOpacity(birth, lag, duration) {
    const times = [0];
    const values = ['0'];
    for (let length = lag + 1; length <= 7; length++) {
        const time = birth + (length - 1) / 60;
        if (time >= duration)
            break;
        times.push(time);
        values.push(String(Number((((length - lag) / length) * 0.2).toPrecision(12))));
    }
    times.push(duration);
    values.push(values.at(-1) ?? '0');
    return svgAnimation('opacity', values, times, duration, true);
}
function svgMotionBalls(scene) {
    const { timeline, palette, prefix } = scene;
    if (timeline.clearedAt === 0)
        return '';
    return svgTracks(timeline)
        .map((track) => {
        const first = track.points[0];
        if (!first || first.time > timeline.clearedAt)
            return '';
        const path = svgMotionPath(track, prefix, timeline.duration);
        const definition = path.distance > 0
            ? `<defs><path id="${path.id}" d="${path.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${svgNumber(point.x)} ${svgNumber(point.y)}`).join('')}"/></defs>`
            : '';
        const trails = Array.from({ length: 7 }, (_, index) => {
            const lag = 6 - index;
            return `<g id="${prefix}-trail-${track.id}-${index}" opacity="0">${svgTrailOpacity(first.time, lag, timeline.duration)}${svgDelayedMotion(path, lag / 60, timeline.duration)}<circle r="${svgNumber(timeline.radius * 0.8)}" fill="${palette.ball}"/></g>`;
        }).join('');
        const translation = svgAnimation('translate', path.points.map((point) => `${svgNumber(point.x)} ${svgNumber(point.y)}`), path.points.map((point) => point.time), timeline.duration);
        const body = `<g id="${prefix}-ball-${track.id}" opacity="0">${svgVisible(first.time, timeline.duration, timeline.duration)}${translation}<circle r="${svgNumber(timeline.radius)}" fill="${palette.ball}"/></g>`;
        return definition + trails + body;
    })
        .join('');
}
function svgSparkEvent(scene, time, x, y, color, order) {
    svgFinite(time, 'contact time');
    svgFinite(x, 'contact x position');
    svgFinite(y, 'contact y position');
    if (time > scene.timeline.clearedAt)
        throw new Error('An SVG contact time exceeds the board clear time.');
    return { time, end: Math.min(time + 0.22, scene.timeline.duration), x, y, color, order };
}
function svgSparkSlots(events) {
    const sorted = [...events].sort((a, b) => a.time - b.time || a.order - b.order);
    const bursts = [];
    let end = -Infinity;
    for (const event of sorted) {
        const current = bursts.at(-1);
        if (!current || event.time > end + 1e-9)
            bursts.push([event]);
        else
            current.push(event);
        end = Math.max(end, event.end);
    }
    const slots = [];
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
function svgSparkSlot(scene, id, events) {
    const first = events[0];
    if (!first)
        return '';
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
    const display = svgAnimation('display', gates.map((point) => point.value), gates.map((point) => point.time), duration, true);
    const opacity = svgAnimation('fill-opacity', fades.map((point) => point.value), fades.map((point) => point.time), duration);
    const position = svgAnimation('translate', positions.map((point) => point.value), positions.map((point) => point.time), duration, true);
    const color = svgAnimation('fill', colors.map((point) => point.value), colors.map((point) => point.time), duration, true);
    const particles = Array.from({ length: 4 }, (_, index) => {
        const angle = (index * Math.PI) / 2 + Math.PI / 4;
        const values = travel.map((point) => `${svgNumber(Math.cos(angle) * 11 * point.value)} ${svgNumber(Math.sin(angle) * 11 * point.value)}`);
        return `<rect x="-1.5" y="-1.5" width="3" height="3" rx="1">${svgAnimation('translate', values, travel.map((point) => point.time), duration)}</rect>`;
    }).join('');
    return `<g id="${id}" display="none" fill="${first.color}" fill-opacity="0">${display}${opacity}${position}${color}${particles}</g>`;
}
function svgContactSparks(scene) {
    const cells = new Map(scene.timeline.cells.map((cell) => [cell.id, cell]));
    const grass = scene.timeline.contacts.map((contact, index) => {
        const cell = cells.get(contact.cellId);
        if (!cell || cell.level === 0)
            throw new Error('The SVG contact cell ID is invalid.');
        return svgSparkEvent(scene, contact.time, cell.x + cell.size / 2, cell.y + cell.size / 2, scene.palette.grass[cell.level], index);
    });
    const balls = (scene.timeline.ballContacts ?? []).map((contact, index) => svgSparkEvent(scene, contact.time, contact.x, contact.y, scene.palette.celebration, index));
    const layer = (name, events) => `<g id="${scene.prefix}-${name}-sparks">${svgSparkSlots(events)
        .map((slot, index) => svgSparkSlot(scene, `${scene.prefix}-${name}-spark-slot-${index}`, slot))
        .join('')}</g>`;
    return `<g id="${scene.prefix}-contact-sparks">${layer('grass', grass)}${layer('ball', balls)}</g>`;
}
function renderSvgMotion(scene) {
    return svgContactSparks(scene) + svgMotionBalls(scene);
}

"use strict";
function svgLightValue(value) {
    return String(Number(value.toFixed(4)));
}
function svgLightModes(timeline) {
    const party = timeline.frames.find((frame) => frame.balls.length >= 5)?.time;
    if (party === undefined || !timeline.frames.some((frame) => frame.clubIntensity > 0))
        return [];
    const superAt = timeline.frames.find((frame) => frame.balls.length >= 10)?.time ?? timeline.finalAt;
    const spans = [
        { boosted: false, start: party, end: Math.min(superAt, timeline.finalAt) },
        { boosted: true, start: superAt, end: timeline.finalAt },
    ];
    return spans
        .filter((span) => span.end > span.start)
        .map((span) => {
        const times = new Set([span.start, span.end]);
        if (timeline.clearedAt > span.start && timeline.clearedAt < span.end)
            times.add(timeline.clearedAt);
        for (let index = Math.ceil(span.start / 0.05); index * 0.05 < span.end; index++)
            times.add(index * 0.05);
        // 立ち上がりと消灯は、計算済みのフレーム時刻も残して指数曲線の補間誤差を抑える。
        for (const frame of timeline.frames) {
            if (frame.time > span.start &&
                frame.time < span.end &&
                frame.clubIntensity > 0 &&
                frame.clubIntensity < 0.999) {
                times.add(frame.time);
            }
        }
        let frameIndex = 0;
        const samples = [...times]
            .sort((a, b) => a - b)
            .map((time) => {
            while (frameIndex + 1 < timeline.frames.length && (timeline.frames[frameIndex + 1]?.time ?? Infinity) <= time)
                frameIndex++;
            const before = timeline.frames[frameIndex];
            const after = timeline.frames[frameIndex + 1] ?? before;
            if (!before || !after)
                throw new Error('No frames are available to render lighting.');
            const fraction = after.time === before.time
                ? 0
                : Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time)));
            return {
                time,
                phase: before.clubTime + (after.clubTime - before.clubTime) * fraction,
                intensity: before.clubIntensity + (after.clubIntensity - before.clubIntensity) * fraction,
            };
        });
        return { ...span, samples };
    });
}
function svgLightTrack(mode, duration, value, tolerance) {
    const source = mode.samples.map((state) => ({ time: state.time, x: value(state), y: 0 }));
    const frozenPhase = mode.samples.at(-1)?.phase;
    const freeze = mode.samples.findIndex((state) => state.phase === frozenPhase);
    const points = freeze > 0 && freeze < source.length - 1
        ? [
            ...simplifySvgTrack(source.slice(0, freeze + 1), tolerance),
            ...simplifySvgTrack(source.slice(freeze), tolerance).slice(1),
        ]
        : simplifySvgTrack(source, tolerance);
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last)
        return [];
    if (first.time > 0)
        points.unshift({ ...first, time: 0 });
    if (last.time < duration)
        points.push({ ...last, time: duration });
    return points;
}
function svgLightScalar(attribute, points, duration) {
    return svgAnimation(attribute, points.map((point) => svgLightValue(point.x)), points.map((point) => point.time), duration);
}
function svgLightBeam(scene, mode, index) {
    const { timeline, palette, prefix } = scene;
    const { width, height, duration } = timeline;
    const count = mode.boosted ? 6 : 3;
    const sourceX = width * (mode.boosted ? 0.08 + (index * 0.84) / (count - 1) : 0.13 + index * 0.37);
    const spread = mode.boosted ? 40 + (index % 3) * 10 : 70 + index * 12;
    const color = palette.lights[index % 3] ?? palette.lights[0];
    const id = `${prefix}-beam-${mode.boosted ? '10' : '5'}-${index}`;
    const pulse = (state) => 0.65 + 0.35 * Math.sin(state.phase * Math.PI * (mode.boosted ? 1.8 : 1.4) + index * 1.7);
    const target = svgLightTrack(mode, duration, (state) => Math.max(80, Math.min(width - 80, sourceX +
        Math.sin(state.phase * (mode.boosted ? 0.95 : 0.65) + index * 2.1) * width * (mode.boosted ? 0.28 : 0.2))), 0.12);
    const startOpacity = svgLightTrack(mode, duration, (state) => state.intensity * (mode.boosted ? 0.16 : 0.1), 0.0008);
    const middleOpacity = svgLightTrack(mode, duration, (state) => state.intensity * (mode.boosted ? 0.2 + pulse(state) * 0.22 : 0.14 + pulse(state) * 0.17), 0.0008);
    const endOpacity = svgLightTrack(mode, duration, (state) => state.intensity * 0.02, 0.0008);
    const glowOpacity = svgLightTrack(mode, duration, (state) => state.intensity * (mode.boosted ? 0.16 + pulse(state) * 0.2 : 0.1 + pulse(state) * 0.15), 0.0008);
    const beamPath = (targetX) => `M${svgNumber(sourceX - 3)} 9L${svgNumber(targetX - spread)} ${svgNumber(height - 15)}L${svgNumber(targetX + spread)} ${svgNumber(height - 15)}L${svgNumber(sourceX + 3)} 9Z`;
    const firstTarget = target[0]?.x ?? sourceX;
    const targetTimes = target.map((point) => point.time);
    const pathMotion = svgAnimation('d', target.map((point) => beamPath(point.x)), targetTimes, duration);
    const gradientMotion = svgLightScalar('x2', target, duration);
    const glowMotion = svgLightScalar('cx', target, duration) + svgLightScalar('fx', target, duration);
    const glowRectMotion = svgAnimation('x', target.map((point) => svgNumber(point.x - 100)), targetTimes, duration);
    return `<defs><linearGradient id="${id}-gradient" gradientUnits="userSpaceOnUse" x1="${svgNumber(sourceX)}" y1="8" x2="${svgNumber(firstTarget)}" y2="${svgNumber(height - 14)}">${gradientMotion}<stop offset="0" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', startOpacity, duration)}</stop><stop offset=".7" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', middleOpacity, duration)}</stop><stop offset="1" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', endOpacity, duration)}</stop></linearGradient><radialGradient id="${id}-glow-gradient" gradientUnits="userSpaceOnUse" cx="${svgNumber(firstTarget)}" cy="${svgNumber(height - 40)}" fx="${svgNumber(firstTarget)}" fy="${svgNumber(height - 40)}" r="100">${glowMotion}<stop offset="0" stop-color="${color}" stop-opacity="0">${svgLightScalar('stop-opacity', glowOpacity, duration)}</stop><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><path id="${id}" d="${beamPath(firstTarget)}" fill="url(#${id}-gradient)" style="mix-blend-mode:screen">${pathMotion}</path><rect id="${id}-glow" x="${svgNumber(firstTarget - 100)}" y="${svgNumber(height - 140)}" width="200" height="140" fill="url(#${id}-glow-gradient)" style="mix-blend-mode:screen">${glowRectMotion}</rect>`;
}
function svgLightRim(scene, mode) {
    const { timeline, palette, prefix } = scene;
    const count = mode.boosted ? 40 : 24;
    const label = mode.boosted ? '10' : '5';
    return Array.from({ length: count }, (_, index) => {
        const x = 18 + ((timeline.width - 36) * index) / (count - 1);
        const color = palette.lights[index % 3] ?? palette.lights[0];
        const opacity = svgLightTrack(mode, timeline.duration, (state) => {
            const pulse = 0.5 + 0.5 * Math.sin(state.phase * Math.PI * (mode.boosted ? 1.8 : 1.4) - index * 0.62);
            return state.intensity * (mode.boosted ? 0.35 + pulse * 0.65 : 0.25 + pulse * 0.6);
        }, 0.0008);
        const dots = [8, timeline.height - 14]
            .map((y, edge) => `<circle id="${prefix}-rim-${label}-dot-${index * 2 + edge}" cx="${svgNumber(x)}" cy="${svgNumber(y)}" r="${mode.boosted ? '3.2' : '2.7'}" fill="${color}"/>`)
            .join('');
        return `<g id="${prefix}-rim-${label}-pair-${index}" opacity="0">${svgLightScalar('opacity', opacity, timeline.duration)}${dots}</g>`;
    }).join('');
}
function renderSvgLights(scene, layer = 'beams') {
    const modes = svgLightModes(scene.timeline);
    if (modes.length === 0)
        return '';
    const groups = modes
        .map((mode) => {
        const label = mode.boosted ? '10' : '5';
        const content = layer === 'beams'
            ? Array.from({ length: mode.boosted ? 6 : 3 }, (_, index) => svgLightBeam(scene, mode, index)).join('')
            : svgLightRim(scene, mode);
        return `<g id="${scene.prefix}-club-${layer}-${label}" opacity="0">${svgVisible(mode.start, mode.end, scene.timeline.duration)}${content}</g>`;
    })
        .join('');
    return `<g id="${scene.prefix}-club-${layer}">${groups}</g>`;
}

export { parsePinballConfig, parseContributionData, createPinballTimeline, renderContributionSvg };
