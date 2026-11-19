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

  it('drops a petal from above the pool, ignores water impulses mid-air, then lands and lays on the water', () => {
    const floaters = createFloaters({ count: 0, rng: () => 0.5 });
    const petal = floaters.dropPetal({ x: 0.1, z: 0.05, altitude: 0.6, fallSpeed: 0.5 });

    expect(floaters.list()).toHaveLength(1);
    expect(petal.falling).toBe(true);
    expect(petal.altitude).toBeCloseTo(0.6, 5);

    // Water impulse while airborne should not impart horizontal water velocity
    floaters.applyImpulse(0.0, 0.05, 0.05, -0.1);
    expect(petal.vx).toBe(0);
    expect(petal.vz).toBe(0);

    // Step through the fall until touchdown
    let landedEvents = [];
    for (let i = 0; i < 120; i++) {
      const landed = floaters.step(1 / 60, i * 0.01, WAVES);
      if (landed.length > 0) landedEvents.push(...landed);
    }

    expect(landedEvents).toHaveLength(1);
    expect(landedEvents[0].strength).toBeLessThan(0);
    expect(petal.falling).toBe(false);
    expect(petal.altitude).toBe(0);
    expect(petal.flutterTilt).toBe(0);

    // Once laying on the water, water impulses push the petal
    const beforeVx = petal.vx;
    floaters.applyImpulse(petal.x - 0.15, petal.z, 0.05, -0.08);
    expect(petal.vx).toBeGreaterThan(beforeVx);
  });

  it('caps total petals at maxCount by evicting the oldest resting petal first', () => {
    const floaters = createFloaters({ count: 2, maxCount: 3, rng: () => 0.5 });
    const firstId = floaters.list()[0].id;
    const dropped1 = floaters.dropPetal({ x: 0, z: 0, altitude: 0.8 });
    const dropped2 = floaters.dropPetal({ x: 0.2, z: 0.1, altitude: 0.8 });

    const ids = floaters.list().map((p) => p.id);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(firstId);
    expect(ids).toContain(dropped1.id);
    expect(ids).toContain(dropped2.id);
  });

  it('projects an airborne petal with a separate water-surface shadow that converges upon landing', () => {
    const airborne = projectFloater(
      { x: 0, z: 0.08, size: 0.055, angle: 0.3, altitude: 0.5, flutterTilt: 0.2 },
      CAMERA,
      16 / 9,
      1280,
      720,
      0,
      WAVES,
    );
    const resting = projectFloater(
      { x: 0, z: 0.08, size: 0.055, angle: 0.3, altitude: 0, flutterTilt: 0 },
      CAMERA,
      16 / 9,
      1280,
      720,
      0,
      WAVES,
    );

    expect(airborne).not.toBeNull();
    expect(resting).not.toBeNull();
    expect(airborne.y).toBeLessThan(resting.y);
    expect(airborne.shadowX).toBeTypeOf('number');
    expect(airborne.shadowY).toBeTypeOf('number');
    expect(airborne.shadowY).toBeGreaterThan(airborne.y);
    expect(airborne.shadowAlpha).toBeLessThan(0.22);
    expect(resting.shadowX).toBeUndefined();
  });

  it('drops random botanical varieties (petal, leaf, partial, blossom) and 1 or 2 pieces per dropRandom', () => {
    let idx = 0;
    const seq = [0.1, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const floatersPair = createFloaters({ count: 0, rng: () => seq[idx++ % seq.length] });
    const pair = floatersPair.dropRandom();
    expect(pair).toHaveLength(2);
    expect(pair[1].altitude).toBeGreaterThan(pair[0].altitude);

    const kinds = new Set();
    let r = 0.05;
    const floatersMix = createFloaters({
      count: 0,
      maxCount: 40,
      rng: () => {
        r = (r + 0.13) % 1;
        return r;
      },
    });
    for (let i = 0; i < 20; i++) {
      const dropped = floatersMix.dropPetal();
      kinds.add(dropped.kind);
    }
    expect(kinds.has('petal')).toBe(true);
    expect(kinds.has('leaf')).toBe(true);
    expect(kinds.has('partial')).toBe(true);
    expect(kinds.has('blossom')).toBe(true);
  });
});
