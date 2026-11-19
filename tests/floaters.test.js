import { describe, expect, it } from 'vitest';
import { CAMERA, FLOATERS, POOL, WAVES } from '../src/config.js';
import { createFloaters, projectFloater } from '../src/sim/floaters.js';

describe('createFloaters', () => {
  it('spawns the configured number of floaters inside the visible pool bounds', () => {
    const floaters = createFloaters();
    const items = floaters.list();
    expect(items).toHaveLength(FLOATERS.count);
    for (const item of items) {
      expect(Math.abs(item.x)).toBeLessThanOrEqual(FLOATERS.boundsX);
      expect(item.z).toBeGreaterThanOrEqual(FLOATERS.minZ);
      expect(item.z).toBeLessThanOrEqual(FLOATERS.maxZ);
    }
  });

  it('pushes nearby floaters radially outward when an impulse lands near them', () => {
    const floaters = createFloaters({ count: 1, positions: [[0.2, 0.0]] });
    const beforeX = floaters.list()[0].x;
    // Drop to the left of the floater -> pushes it toward +X
    floaters.applyImpulse(0.0, 0.0, 0.05, -0.08);
    floaters.step(0.05, 0, WAVES);
    const after = floaters.list()[0];
    expect(after.vx).toBeGreaterThan(0);
    expect(after.x).toBeGreaterThan(beforeX);
  });

  it('keeps floaters finite and inside soft bounds over many steps', () => {
    const floaters = createFloaters();
    floaters.applyImpulse(0, 0, 0.085, -0.15);
    for (let i = 0; i < 200; i++) {
      floaters.step(1 / 60, i * 0.01, WAVES);
    }
    for (const item of floaters.list()) {
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.z)).toBe(true);
      expect(Math.abs(item.x)).toBeLessThanOrEqual(POOL.halfExtent);
      expect(Math.abs(item.z)).toBeLessThanOrEqual(POOL.halfExtent);
    }
  });

  it('projects a world floater onto screen coordinates with positive scale', () => {
    const projected = projectFloater(
      { x: 0, z: 0.08, size: 0.055, angle: 0.3 },
      CAMERA,
      16 / 9,
      1280,
      720,
      0,
      WAVES,
    );
    expect(projected).not.toBeNull();
    expect(projected.x).toBeGreaterThan(500);
    expect(projected.x).toBeLessThan(780);
    expect(projected.y).toBeGreaterThan(240);
    expect(projected.y).toBeLessThan(480);
    expect(projected.radiusPx).toBeGreaterThan(8);
  });
});
