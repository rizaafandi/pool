import { describe, expect, it } from 'vitest';
import { CAMERA, DROP, MIRROR_X, POOL } from '../src/config.js';
import { fingertipHit, impulseStrength, isTouching, planarSpeed } from '../src/input/touch.js';

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
