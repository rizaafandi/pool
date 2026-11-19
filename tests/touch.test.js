import { describe, expect, it } from 'vitest';
import { CAMERA, DROP, MIRROR_X, PALM, POOL, SPLASH, SWELL_TIME_SCALE, WAVES } from '../src/config.js';
import {
  classifyHand,
  extendedFingertips,
  fingertipHit,
  handSpan,
  impulseStrength,
  isFist,
  isOpenPalm,
  isTouching,
  ndcWaterHit,
  palmCenter,
  palmImpulseStrength,
  planarSpeed,
  plungeStrength,
} from '../src/input/touch.js';
import { lookAt, multiply, perspective, transformPoint } from '../src/math.js';
import { gerstnerAt } from '../src/sim/gerstner.js';

function blank() {
  return Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
}

function pointing() {
  const pts = blank();
  pts[8] = { x: 0.5, y: 0.3 };
  pts[6] = { x: 0.5, y: 0.55 };
  pts[12] = { x: 0.58, y: 0.62 };
  pts[16] = { x: 0.64, y: 0.66 };
  pts[20] = { x: 0.7, y: 0.7 };
  pts[4] = { x: 0.3, y: 0.6 };
  return pts;
}

function openPalm() {
  const pts = blank();
  pts[8] = { x: 0.42, y: 0.28 };
  pts[6] = { x: 0.44, y: 0.45 };
  pts[12] = { x: 0.5, y: 0.25 };
  pts[16] = { x: 0.58, y: 0.28 };
  pts[20] = { x: 0.66, y: 0.34 };
  pts[4] = { x: 0.32, y: 0.4 };
  return pts;
}

function fist() {
  const pts = blank();
  pts[0] = { x: 0.5, y: 0.8 };
  pts[8] = { x: 0.48, y: 0.64 };
  pts[6] = { x: 0.49, y: 0.7 };
  pts[12] = { x: 0.52, y: 0.63 };
  pts[16] = { x: 0.56, y: 0.65 };
  pts[20] = { x: 0.6, y: 0.68 };
  pts[4] = { x: 0.46, y: 0.66 };
  return pts;
}

function pinch() {
  const pts = blank();
  pts[0] = { x: 0.5, y: 0.85 };
  pts[8] = { x: 0.48, y: 0.48 };
  pts[4] = { x: 0.51, y: 0.5 };
  pts[6] = { x: 0.49, y: 0.6 };
  pts[12] = { x: 0.58, y: 0.66 };
  pts[16] = { x: 0.64, y: 0.7 };
  pts[20] = { x: 0.7, y: 0.74 };
  return pts;
}

describe('isTouching', () => {
  it('accepts a pointed finger and a pinch, and rejects an open palm and a fist', () => {
    expect(isTouching(pointing())).toBe(true);
    expect(isTouching(pinch())).toBe(true);
    expect(isTouching(openPalm())).toBe(false);
    expect(isTouching(fist())).toBe(false);
  });
});

describe('fingertipHit', () => {
  it('mirrors x so the left of the raw frame lands on the right of the pool', () => {
    expect(MIRROR_X).toBe(true);
    const left = fingertipHit({ x: 0.2, y: 0.5 }, CAMERA, 16 / 9, POOL);
    const right = fingertipHit({ x: 0.8, y: 0.5 }, CAMERA, 16 / 9, POOL);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left.x).toBeGreaterThan(right.x);
    expect(left.u).toBeGreaterThan(0.5);
    expect(right.u).toBeLessThan(0.5);
  });

  it('returns null when the hit is outside the pool square', () => {
    const tiny = { halfExtent: 0.05 };
    expect(fingertipHit({ x: 0.5, y: 0.5 }, CAMERA, 16 / 9, tiny)).toBeNull();
  });

  it('lands the ripple on the displaced Gerstner surface right under the touch point', () => {
    const aspect = 16 / 9;
    const mvp = multiply(
      perspective(CAMERA.fovY, aspect, CAMERA.near, CAMERA.far),
      lookAt(CAMERA.eye, CAMERA.target, [0, 1, 0]),
    );

    function renderedSwellY(x, z, swellTime) {
      let ax = x;
      let az = z;
      for (let i = 0; i < 12; i++) {
        const g = gerstnerAt(ax, az, swellTime, WAVES);
        ax = x - g.ox;
        az = z - g.oz;
      }
      return gerstnerAt(ax, az, swellTime, WAVES).oy;
    }

    for (const seconds of [0, 1, 2, 5]) {
      const swellTime = seconds * SWELL_TIME_SCALE;
      for (const [ndcX, ndcY] of [[0, 0], [-0.5, 0.4], [0.6, -0.5]]) {
        const hit = ndcWaterHit(ndcX, ndcY, CAMERA, aspect, POOL, swellTime, WAVES);
        expect(hit).not.toBeNull();
        const y = renderedSwellY(hit.x, hit.z, swellTime);
        const clip = transformPoint(mvp, [hit.x, y, hit.z]);
        expect(clip[0] / clip[3]).toBeCloseTo(ndcX, 3);
        expect(clip[1] / clip[3]).toBeCloseTo(ndcY, 3);
      }

      const landmark = { x: 0.3, y: 0.4 };
      const tip = fingertipHit(landmark, CAMERA, aspect, POOL, swellTime, WAVES);
      expect(tip).not.toBeNull();
      const tipY = renderedSwellY(tip.x, tip.z, swellTime);
      const tipClip = transformPoint(mvp, [tip.x, tipY, tip.z]);
      const expectedNdcX = (MIRROR_X ? 1 - landmark.x : landmark.x) * 2 - 1;
      const expectedNdcY = 1 - landmark.y * 2;
      expect(tipClip[0] / tipClip[3]).toBeCloseTo(expectedNdcX, 3);
      expect(tipClip[1] / tipClip[3]).toBeCloseTo(expectedNdcY, 3);
    }
  });
});

describe('impulse', () => {
  it('presses harder as the fingertip moves, and the extra force saturates', () => {
    expect(impulseStrength(0)).toBeCloseTo(DROP.baseStrength, 5);
    expect(impulseStrength(1)).toBeCloseTo(DROP.baseStrength - DROP.speedScale, 5);
    expect(impulseStrength(100)).toBeCloseTo(DROP.baseStrength - DROP.maxSpeed * DROP.speedScale, 5);
    expect(planarSpeed({ x: 0, z: 0 }, { x: 0.3, z: 0.4 }, 0.5)).toBeCloseTo(1, 5);
    expect(planarSpeed(null, { x: 0, z: 0 }, 0.5)).toBe(0);
  });
});

function fullHand({ extended = [4, 8, 12, 16, 20], cx = 0.5, cy = 0.8, scale = 1 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i, dx, dy) => { pts[i] = { x: cx + dx * scale, y: cy + dy * scale, z: 0 }; };
  // Wrist & MCPs
  set(0, 0, 0);
  set(5, -0.07, -0.18);
  set(9, 0.0, -0.20);
  set(13, 0.06, -0.18);
  set(17, 0.12, -0.15);
  // Thumb IP (3) and tip (4)
  set(3, -0.12, -0.16);
  if (extended.includes(4)) set(4, -0.22, -0.24);
  else set(4, 0.02, -0.15);
  // Four fingers: [pip, tip, baseX]
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
  return pts;
}

describe('multi-finger, palm, fist, and plunge gestures', () => {
  it('detects open palm and fist cleanly without false positives', () => {
    const open = fullHand({ extended: [4, 8, 12, 16, 20] });
    const closed = fullHand({ extended: [] });
    const point = fullHand({ extended: [8] });
    expect(isOpenPalm(open)).toBe(true);
    expect(isOpenPalm(closed)).toBe(false);
    expect(isOpenPalm(point)).toBe(false);
    expect(isFist(closed)).toBe(true);
    expect(isFist(open)).toBe(false);
    expect(isFist(point)).toBe(false);
  });

  it('returns all extended fingertips for 0, 1, 3, and 5 extended fingers', () => {
    expect(extendedFingertips(fullHand({ extended: [] })).map((t) => t.id)).toEqual([]);
    expect(extendedFingertips(fullHand({ extended: [8] })).map((t) => t.id)).toEqual([8]);
    expect(extendedFingertips(fullHand({ extended: [8, 12, 16] })).map((t) => t.id)).toEqual([8, 12, 16]);
    expect(extendedFingertips(fullHand({ extended: [4, 8, 12, 16, 20] })).map((t) => t.id)).toEqual([4, 8, 12, 16, 20]);
  });

  it('computes palm center and hand span', () => {
    const h = fullHand({ scale: 1 });
    expect(handSpan(h)).toBeCloseTo(0.20, 5);
    const center = palmCenter(h);
    expect(center.x).toBeCloseTo(0.5 + (-0.07 + 0 + 0.06 + 0.12) / 5, 5);
    expect(center.y).toBeCloseTo(0.8 + (-0.18 - 0.20 - 0.18 - 0.15) / 5, 5);
  });

  it('computes plungeStrength only for valid positive growth above threshold', () => {
    expect(plungeStrength(0.2, 0.3, 0)).toBe(0);
    expect(plungeStrength(0, 0.3, 0.05)).toBe(0);
    expect(plungeStrength(0.2, 0.18, 0.05)).toBe(0);
    expect(plungeStrength(0.2, 0.205, 0.05)).toBe(0);
    const fast = plungeStrength(0.2, 0.24, 0.05); // rate = 4.0/s
    expect(fast).toBeLessThanOrEqual(SPLASH.strength);
    const saturated = plungeStrength(0.2, 0.5, 0.05);
    expect(saturated).toBeCloseTo(SPLASH.strength * 1.35, 5);
    expect(palmImpulseStrength(0)).toBeCloseTo(PALM.strength, 5);
    expect(palmImpulseStrength(100)).toBeCloseTo(PALM.strength - PALM.maxSpeed * PALM.speedScale, 5);
  });

  it('classifies hand poses into fist, pinch, open, fingers, and idle', () => {
    expect(classifyHand(fullHand({ extended: [] })).mode).toBe('fist');
    expect(classifyHand(pinch()).mode).toBe('pinch');
    expect(classifyHand(fullHand({ extended: [4, 8, 12, 16, 20] })).mode).toBe('open');
    expect(classifyHand(fullHand({ extended: [8, 12, 16] })).mode).toBe('fingers');
    expect(classifyHand(fullHand({ extended: [8, 12, 16] })).tips.map((t) => t.id)).toEqual([8, 12, 16]);
  });

  it('classifies a closed fist with thumb resting near curled index tip as fist, not pinch', () => {
    const tightFist = fullHand({ extended: [] });
    // Place thumb tip right beside curled index tip (gap ~0.015), with middle tip > 2.5*gap away
    tightFist[4] = { x: tightFist[8].x - 0.015, y: tightFist[8].y, z: 0 };
    expect(classifyHand(tightFist).mode).toBe('fist');
  });
});
