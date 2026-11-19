import { describe, expect, it } from 'vitest';
import { createOverlay, indicatorScreenPoint } from '../src/ui/overlay.js';

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => (force === undefined ? (set.has(c) ? (set.delete(c), false) : (set.add(c), true)) : (force ? (set.add(c), true) : (set.delete(c), false))),
    contains: (c) => set.has(c),
  };
}

function makeMockCanvas() {
  const calls = [];
  const ctx = {
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    beginPath: () => calls.push(['beginPath']),
    arc: (...args) => calls.push(['arc', ...args]),
    ellipse: (...args) => calls.push(['ellipse', ...args]),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setTransform: () => {},
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  };
  return {
    width: 0,
    height: 0,
    calls,
    getContext: () => ctx,
  };
}

describe('indicatorScreenPoint', () => {
  it('maps normalized screen coords to canvas pixels and clamps out-of-range values', () => {
    expect(indicatorScreenPoint({ screenX: 0.25, screenY: 0.6 }, 1000, 800)).toEqual({ x: 250, y: 480 });
    expect(indicatorScreenPoint({ screenX: -0.2, screenY: 1.5 }, 1000, 800)).toEqual({ x: 0, y: 800 });
  });
});

describe('createOverlay', () => {
  it('keeps camera PiP and toggle hidden until camera activates, then toggles cleanly', () => {
    const hudCanvas = makeMockCanvas();
    const video = { classList: makeClassList(['hidden']) };
    const toggleButton = {
      classList: makeClassList(['hidden']),
      textContent: '',
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
    };

    const overlay = createOverlay({ hudCanvas, video, toggleButton });
    overlay.resize(1000, 800, 1);
    expect(video.classList.contains('hidden')).toBe(true);
    expect(toggleButton.classList.contains('hidden')).toBe(true);

    overlay.setCameraActive(true);
    expect(video.classList.contains('hidden')).toBe(false);
    expect(toggleButton.classList.contains('hidden')).toBe(false);
    expect(toggleButton.attrs['aria-pressed']).toBe('true');

    expect(overlay.toggle()).toBe(false);
    expect(video.classList.contains('hidden')).toBe(true);
    expect(toggleButton.attrs['aria-pressed']).toBe('false');

    expect(overlay.toggle()).toBe(true);
    expect(video.classList.contains('hidden')).toBe(false);
    expect(toggleButton.attrs['aria-pressed']).toBe('true');
  });

  it('draws finger, palm, and fading splash rings when visible and clears when hidden', () => {
    const hudCanvas = makeMockCanvas();
    const video = { classList: makeClassList(['hidden']) };
    const toggleButton = { classList: makeClassList(['hidden']), textContent: '', setAttribute() {} };
    const overlay = createOverlay({ hudCanvas, video, toggleButton });
    overlay.resize(1000, 800, 1);
    overlay.setCameraActive(true);

    overlay.draw([
      { key: 'h:0:8', screenX: 0.5, screenY: 0.5, kind: 'finger', radiusPx: 11 },
      { key: 'h:0:splash', screenX: 0.4, screenY: 0.4, kind: 'splash', radiusPx: 28 },
    ], 1000);
    expect(hudCanvas.calls.filter((c) => c[0] === 'arc').length).toBeGreaterThanOrEqual(2);

    // 150ms later, even with empty indicators, splash ring pulse continues animating
    hudCanvas.calls.length = 0;
    overlay.draw([], 1150);
    expect(hudCanvas.calls.filter((c) => c[0] === 'arc').length).toBe(1);

    // 500ms later, splash pulse has expired
    hudCanvas.calls.length = 0;
    overlay.draw([], 1500);
    expect(hudCanvas.calls.filter((c) => c[0] === 'arc').length).toBe(0);

    // Hidden overlay skips drawing arcs
    overlay.setVisible(false);
    hudCanvas.calls.length = 0;
    overlay.draw([{ key: 'h:0:8', screenX: 0.5, screenY: 0.5, kind: 'finger', radiusPx: 11 }], 1600);
    expect(hudCanvas.calls.filter((c) => c[0] === 'arc').length).toBe(0);
  });

  it('draws floating blossoms even before camera activates and updates gesture badge, mirror, and clap pulse', () => {
    const hudCanvas = makeMockCanvas();
    const video = { classList: makeClassList(['hidden']) };
    const toggleButton = { classList: makeClassList(['hidden']), textContent: '', setAttribute() {} };
    const gestureBadge = { classList: makeClassList(['hidden']), textContent: '' };
    const mirrorButton = { classList: makeClassList(['hidden']), textContent: '', setAttribute() {} };
    const sensitivityButton = { classList: makeClassList(['hidden']), textContent: '' };

    const overlay = createOverlay({
      hudCanvas,
      video,
      toggleButton,
      gestureBadge,
      mirrorButton,
      sensitivityButton,
    });
    overlay.resize(1000, 800, 1);

    // Floaters render even while camera is inactive
    overlay.draw([], 1000, {
      floaters: [{ x: 500, y: 400, radiusPx: 18, angle: 0.4, petals: 5, bob: 0 }],
    });
    expect(hudCanvas.calls.filter((c) => c[0] === 'ellipse').length).toBeGreaterThanOrEqual(5);

    // Camera active reveals gesture badge, mirror, and sensitivity controls
    overlay.setCameraActive(true);
    expect(gestureBadge.classList.contains('hidden')).toBe(false);
    expect(mirrorButton.classList.contains('hidden')).toBe(false);
    expect(sensitivityButton.classList.contains('hidden')).toBe(false);

    overlay.setGestureLabel('Clap Shockwave');
    expect(gestureBadge.textContent).toBe('Clap Shockwave');

    overlay.setMirrored(false);
    expect(video.classList.contains('unmirrored')).toBe(true);
    expect(mirrorButton.textContent).toBe('Mirror: Off');

    overlay.setSensitivityLabel('Splash: High');
    expect(sensitivityButton.textContent).toBe('Splash: High');

    // Clap indicator draws a double-ring shockwave pulse
    hudCanvas.calls.length = 0;
    overlay.draw([{ key: 'h:clap', screenX: 0.5, screenY: 0.5, kind: 'clap', radiusPx: 38 }], 1100);
    expect(hudCanvas.calls.filter((c) => c[0] === 'arc').length).toBeGreaterThanOrEqual(2);
  });

  it('clips floating blossoms out of reflective button pill regions when occluders are provided', () => {
    const hudCanvas = makeMockCanvas();
    const ctx = hudCanvas.getContext();
    ctx.rect = (...args) => hudCanvas.calls.push(['rect', ...args]);
    ctx.moveTo = () => {};
    ctx.lineTo = () => {};
    ctx.arcTo = () => {};
    ctx.closePath = () => {};
    ctx.clip = (...args) => hudCanvas.calls.push(['clip', ...args]);

    const overlay = createOverlay({ hudCanvas, video: null, toggleButton: null });
    overlay.resize(1000, 800, 1);
    overlay.draw([], 1000, {
      floaters: [{ x: 500, y: 400, radiusPx: 18, angle: 0.4, petals: 5, bob: 0 }],
      occluders: [{ x: 420, y: 380, width: 160, height: 42, radius: 21 }],
    });

    expect(hudCanvas.calls.some((c) => c[0] === 'clip' && c[1] === 'evenodd')).toBe(true);
    expect(hudCanvas.calls.filter((c) => c[0] === 'ellipse').length).toBeGreaterThanOrEqual(5);
  });

  it('draws visible falling rain streaks and surface impact splashes when rain visuals are provided', () => {
    const hudCanvas = makeMockCanvas();
    const ctx = hudCanvas.getContext();
    ctx.moveTo = (...args) => hudCanvas.calls.push(['moveTo', ...args]);
    ctx.lineTo = (...args) => hudCanvas.calls.push(['lineTo', ...args]);
    ctx.createLinearGradient = () => ({ addColorStop: () => {} });

    const overlay = createOverlay({ hudCanvas, video: null, toggleButton: null });
    overlay.resize(1000, 800, 1);
    overlay.draw([], 1000, {
      rain: {
        streaks: [
          { x: 0.4, y: 0.3, dx: -0.01, dy: 0.06, width: 1.6, alpha: 0.8, isPrimary: true },
          { x: 0.7, y: 0.5, dx: -0.008, dy: 0.04, width: 1.0, alpha: 0.4, isPrimary: false },
        ],
        splashes: [
          {
            screenX: 0.5,
            screenY: 0.6,
            progress: 0.25,
            age: 0.09,
            scale: 1.0,
            beads: [{ vx: -20, vy: -40, size: 1.6 }, { vx: 24, vy: -44, size: 1.4 }],
          },
        ],
      },
    });

    expect(hudCanvas.calls.filter((c) => c[0] === 'lineTo').length).toBeGreaterThanOrEqual(2);
    expect(hudCanvas.calls.filter((c) => c[0] === 'arc').length).toBeGreaterThanOrEqual(4);
  });
});
