import { describe, expect, it } from 'vitest';
import { CAMERA, POOL, SUN_DIR, WAVES } from '../src/config.js';
import { frustumCornersOnY, lookAt, transformPoint } from '../src/math.js';

describe('camera framing', () => {
  it('keeps every frustum corner on the water plane inside the pool', () => {
    for (const aspect of [0.5, 9 / 16, 1, 16 / 9, 2]) {
      const hits = frustumCornersOnY(CAMERA, aspect, 0);
      expect(hits).toHaveLength(4);
      for (const hit of hits) {
        expect(Math.abs(hit[0])).toBeLessThanOrEqual(POOL.halfExtent);
        expect(Math.abs(hit[2])).toBeLessThanOrEqual(POOL.halfExtent);
        expect(hit[1]).toBeCloseTo(0, 5);
      }
    }
  });

  it('puts the look-at target on the view -Z axis', () => {
    const view = lookAt(CAMERA.eye, CAMERA.target, [0, 1, 0]);
    const p = transformPoint(view, CAMERA.target);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(0, 5);
    expect(p[2]).toBeLessThan(0);
  });
});

describe('locked look constants', () => {
  it('uses four gentle waves and a unit sun', () => {
    expect(WAVES).toHaveLength(4);
    const steep = WAVES.reduce((sum, wave) => sum + wave.steepness, 0);
    expect(steep).toBeCloseTo(0.53, 5);
    expect(steep).toBeLessThan(1);
    const sunLength = Math.hypot(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
    expect(sunLength).toBeCloseTo(1, 5);
    expect(SUN_DIR[1]).toBeGreaterThan(0.8);
  });
});