import { describe, expect, it } from 'vitest';
import { CAMERA, CLAP, PALM, POOL, SPLASH } from '../src/config.js';
import { createHandTracker } from '../src/input/handTracker.js';

function makeHand({ extended = [4, 8, 12, 16, 20], cx = 0.5, cy = 0.65, scale = 0.7 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i, dx, dy) => { pts[i] = { x: cx + dx * scale, y: cy + dy * scale, z: 0 }; };
  set(0, 0, 0);
  set(5, -0.07, -0.18);
  set(9, 0.0, -0.20);
  set(13, 0.06, -0.18);
  set(17, 0.12, -0.15);
  set(3, -0.12, -0.16);
  if (extended.includes(4)) set(4, -0.22, -0.24);
  else set(4, 0.02, -0.15);
  const fingers = [
    [6, 8, -0.08],
    [10, 12, 0.0],
    [14, 16, 0.07],
    [18, 20, 0.14],
  ];
  for (const [pip, tip, bx] of fingers) {
    set(pip, bx, -0.32);
    if (extended.includes(tip)) set(tip, bx * 1.1, -0.48);
    else set(tip, bx * 0.9, -0.22);
  }
  return { landmarks: pts };
}

describe('createHandTracker', () => {
  it('emits 5 simultaneous fingertip drops per open hand and 10 for two hands when stationary', () => {
    const tracker = createHandTracker();
    const one = tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.35 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    expect(one.drops).toHaveLength(5);
    expect(one.drops.map((d) => d.key)).toEqual(['h:0:4', 'h:0:8', 'h:0:12', 'h:0:16', 'h:0:20']);
    expect(one.indicators).toHaveLength(5);
    expect(one.indicators.every((ind) => ind.kind === 'finger')).toBe(true);

    const two = tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.35 }), makeHand({ cx: 0.65 })] },
      CAMERA, 16 / 9, POOL, 0, 1033,
    );
    expect(two.drops).toHaveLength(10);
    expect(two.indicators).toHaveLength(10);
  });

  it('switches an open palm to a single wide palm sweep drop when moving fast', () => {
    const tracker = createHandTracker();
    tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.35 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    const swept = tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.55 })] },
      CAMERA, 16 / 9, POOL, 0, 1050,
    );
    expect(swept.drops).toHaveLength(1);
    expect(swept.drops[0].key).toBe('h:0:palm');
    expect(swept.drops[0].radius).toBeCloseTo(PALM.radius, 5);
    expect(swept.indicators).toHaveLength(1);
    expect(swept.indicators[0].kind).toBe('palm');
  });

  it('triggers a one-shot plunge splash with cooldown and also splashes on open-to-fist close', () => {
    const tracker = createHandTracker();
    // Initial fist at scale 0.5
    tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.5 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    // Rapid Z-plunge forward (scale jumps 0.5 -> 0.72 in 50ms => growth rate ~8.8/s)
    const plunged = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.72 })] },
      CAMERA, 16 / 9, POOL, 0, 1050,
    );
    expect(plunged.drops.some((d) => d.key === 'h:0:splash' && d.radius === SPLASH.radius)).toBe(true);
    expect(plunged.drops.find((d) => d.key === 'h:0:splash').strength).toBeLessThanOrEqual(SPLASH.strength);
    expect(plunged.indicators.some((ind) => ind.kind === 'splash')).toBe(true);

    // Another plunge 50ms later is blocked by cooldown
    const blocked = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.95 })] },
      CAMERA, 16 / 9, POOL, 0, 1100,
    );
    expect(blocked.drops.some((d) => d.key === 'h:0:splash')).toBe(false);

    // After cooldown expires, open-to-fist snap triggers a splash
    tracker.update(
      { fresh: true, hands: [makeHand({ extended: [4, 8, 12, 16, 20], scale: 0.7 })] },
      CAMERA, 16 / 9, POOL, 0, 1500,
    );
    const snapped = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.7 })] },
      CAMERA, 16 / 9, POOL, 0, 1600,
    );
    expect(snapped.drops.some((d) => d.key === 'h:0:splash')).toBe(true);
  });

  it('never produces NaN on duplicate frames or dt <= 0 and does not re-fire splashes', () => {
    const tracker = createHandTracker();
    tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.5 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    const plunge = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.75 })] },
      CAMERA, 16 / 9, POOL, 0, 1050,
    );
    expect(plunge.drops.some((d) => d.key === 'h:0:splash')).toBe(true);

    // Cached non-fresh frame right after plunge must NOT re-fire splash
    const cached = tracker.update(
      { fresh: false, hands: [makeHand({ extended: [], scale: 0.75 })] },
      CAMERA, 16 / 9, POOL, 0, 1066,
    );
    expect(cached.drops.some((d) => d.key === 'h:0:splash')).toBe(false);

    // Non-increasing timestamp (dt <= 0) must stay finite
    const sameTs = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [8], cx: 0.6 })] },
      CAMERA, 16 / 9, POOL, 0, 1066,
    );
    for (const d of sameTs.drops) {
      expect(Number.isFinite(d.strength)).toBe(true);
      expect(Number.isFinite(d.u)).toBe(true);
    }
  });

  it('resets state when a hand leaves the frame so re-entry causes no false splash or spike', () => {
    const tracker = createHandTracker();
    tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], cx: 0.25, scale: 0.4 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    // Hand leaves frame
    const gone = tracker.update(
      { fresh: true, hands: [] },
      CAMERA, 16 / 9, POOL, 0, 1050,
    );
    expect(gone.drops).toEqual([]);
    expect(gone.indicators).toEqual([]);

    // Hand re-enters elsewhere with much larger scale: must NOT trigger plunge splash
    const reentered = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], cx: 0.75, scale: 0.85 })] },
      CAMERA, 16 / 9, POOL, 0, 1100,
    );
    expect(reentered.drops.some((d) => d.key === 'h:0:splash')).toBe(false);
  });

  it('preserves per-hand identity when hand 0 leaves or two hands swap array order', () => {
    const tracker = createHandTracker();
    const leftOpen = makeHand({ extended: [4, 8, 12, 16, 20], cx: 0.25, scale: 0.55 });
    const rightFist = makeHand({ extended: [], cx: 0.75, scale: 0.75 });
    tracker.update({ fresh: true, hands: [leftOpen, rightFist] }, CAMERA, 16 / 9, POOL, 0, 1000);

    // Hand 0 leaves; only rightFist remains (now at index 0) -> must NOT inherit leftOpen's state or splash
    const onlyRight = tracker.update({ fresh: true, hands: [rightFist] }, CAMERA, 16 / 9, POOL, 0, 1050);
    expect(onlyRight.drops.some((d) => d.key.endsWith(':splash'))).toBe(false);

    // Two stationary open hands swap array order between frames -> must NOT trigger false palm sweep
    const tracker2 = createHandTracker();
    const hLeft = makeHand({ extended: [4, 8, 12, 16, 20], cx: 0.30, scale: 0.65 });
    const hRight = makeHand({ extended: [4, 8, 12, 16, 20], cx: 0.70, scale: 0.65 });
    tracker2.update({ fresh: true, hands: [hLeft, hRight] }, CAMERA, 16 / 9, POOL, 0, 2000);
    const swapped = tracker2.update({ fresh: true, hands: [hRight, hLeft] }, CAMERA, 16 / 9, POOL, 0, 2033);
    expect(swapped.drops.some((d) => d.key.endsWith(':palm'))).toBe(false);
    expect(swapped.drops).toHaveLength(10);
  });

  it('triggers a fist-close splash across multi-frame open -> fingers -> fist transition', () => {
    const tracker = createHandTracker();
    tracker.update(
      { fresh: true, hands: [makeHand({ extended: [4, 8, 12, 16, 20], scale: 0.7 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    // Intermediate closing frame (2 fingers still partially extended)
    tracker.update(
      { fresh: true, hands: [makeHand({ extended: [8, 12], scale: 0.7 })] },
      CAMERA, 16 / 9, POOL, 0, 1060,
    );
    // Fully closed fist 60ms later -> should trigger splash
    const closed = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.7 })] },
      CAMERA, 16 / 9, POOL, 0, 1120,
    );
    expect(closed.drops.some((d) => d.key.endsWith(':splash'))).toBe(true);

    // Holding fist on next frame must NOT re-trigger splash
    const held = tracker.update(
      { fresh: true, hands: [makeHand({ extended: [], scale: 0.7 })] },
      CAMERA, 16 / 9, POOL, 0, 1180,
    );
    expect(held.drops.some((d) => d.key.endsWith(':splash'))).toBe(false);
  });

  it('triggers a clap shockwave when two hands meet rapidly and respects clap cooldown', () => {
    const tracker = createHandTracker();
    tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.34 }), makeHand({ cx: 0.66 })] },
      CAMERA, 16 / 9, POOL, 0, 1000,
    );
    const clapped = tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.47 }), makeHand({ cx: 0.53 })] },
      CAMERA, 16 / 9, POOL, 0, 1100,
    );
    const clapDrop = clapped.drops.find((d) => d.key === 'h:clap');
    expect(clapDrop).toBeDefined();
    expect(clapDrop.radius).toBeCloseTo(CLAP.radius, 5);
    expect(clapDrop.strength).toBeCloseTo(CLAP.strength, 5);
    expect(clapped.indicators.some((ind) => ind.kind === 'clap')).toBe(true);
    expect(clapped.gestureLabel).toBe('Clap Shockwave');

    // Immediate next frame while hands stay close must NOT re-trigger clap
    const heldClose = tracker.update(
      { fresh: true, hands: [makeHand({ cx: 0.48 }), makeHand({ cx: 0.52 })] },
      CAMERA, 16 / 9, POOL, 0, 1160,
    );
    expect(heldClose.drops.some((d) => d.key === 'h:clap')).toBe(false);
  });

  it('clears hands, drops, and HUD markers when the camera frame stops advancing', () => {
    const tracker = createHandTracker();
    const hand = makeHand({ extended: [4, 8, 12, 16, 20], cx: 0.5 });
    const live = tracker.update({ fresh: true, hands: [hand] }, CAMERA, 16 / 9, POOL, 0, 1000);
    expect(live.drops.length).toBeGreaterThan(0);

    // Short gap between camera frames keeps gentle steady contact
    const brief = tracker.update({ fresh: false, hands: [hand] }, CAMERA, 16 / 9, POOL, 0, 1100);
    expect(brief.drops.length).toBeGreaterThan(0);

    // Frozen stream: no fresh frame for longer than the stale window -> everything cleared
    const frozen = tracker.update({ fresh: false, hands: [hand] }, CAMERA, 16 / 9, POOL, 0, 2200);
    expect(frozen.drops).toEqual([]);
    expect(frozen.indicators).toEqual([]);
    expect(frozen.gestureLabel).toBe('');

    // Stream resumes: tracker works again without stale state
    const resumed = tracker.update({ fresh: true, hands: [hand] }, CAMERA, 16 / 9, POOL, 0, 2300);
    expect(resumed.drops.length).toBeGreaterThan(0);
    expect(resumed.drops.some((d) => d.key.endsWith(':splash'))).toBe(false);
  });

  it('supports runtime mirrorX and plunge sensitivity options plus gesture labels', () => {
    const tMirrored = createHandTracker();
    const tUnmirrored = createHandTracker();
    const hand = makeHand({ extended: [8], cx: 0.25 });
    const a = tMirrored.update({ fresh: true, hands: [hand] }, CAMERA, 16 / 9, POOL, 0, 1000, { mirrorX: true });
    const b = tUnmirrored.update({ fresh: true, hands: [hand] }, CAMERA, 16 / 9, POOL, 0, 1000, { mirrorX: false });
    expect(a.drops[0].u).toBeGreaterThan(0.5);
    expect(b.drops[0].u).toBeLessThan(0.5);
    expect(a.indicators[0].screenX).toBeCloseTo(1 - b.indicators[0].screenX, 5);
    expect(a.gestureLabel).toBe('1 Finger');

    // Moderate growth rate (~1.3/s): triggers on high sensitivity (0.68x), ignored on low sensitivity (1.35x)
    const tHigh = createHandTracker();
    const tLow = createHandTracker();
    tHigh.update({ fresh: true, hands: [makeHand({ extended: [], scale: 0.60 })] }, CAMERA, 16 / 9, POOL, 0, 1000, { plungeRateMultiplier: 0.68 });
    tLow.update({ fresh: true, hands: [makeHand({ extended: [], scale: 0.60 })] }, CAMERA, 16 / 9, POOL, 0, 1000, { plungeRateMultiplier: 1.35 });
    const resHigh = tHigh.update({ fresh: true, hands: [makeHand({ extended: [], scale: 0.68 })] }, CAMERA, 16 / 9, POOL, 0, 1100, { plungeRateMultiplier: 0.68 });
    const resLow = tLow.update({ fresh: true, hands: [makeHand({ extended: [], scale: 0.68 })] }, CAMERA, 16 / 9, POOL, 0, 1100, { plungeRateMultiplier: 1.35 });
    expect(resHigh.drops.some((d) => d.key.endsWith(':splash'))).toBe(true);
    expect(resLow.drops.some((d) => d.key.endsWith(':splash'))).toBe(false);
  });
});
