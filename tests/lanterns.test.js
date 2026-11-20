import { describe, expect, it } from 'vitest';
import { CAMERA, LANTERNS } from '../src/config.js';
import { createLanterns, MAX_LANTERNS, projectLantern } from '../src/sim/lanterns.js';

describe('createLanterns', () => {
  it('starts empty by default and adds lanterns one by one up to MAX_LANTERNS', () => {
    const lanterns = createLanterns();
    expect(lanterns.isEnabled()).toBe(false);
    expect(lanterns.pack().count).toBe(0);

    const first = lanterns.addRandom();
    expect(lanterns.isEnabled()).toBe(true);
    expect(lanterns.list()).toHaveLength(1);
    expect(lanterns.pack().count).toBe(1);
    expect(first.strength).toBeLessThan(0);

    lanterns.addRandom();
    expect(lanterns.list()).toHaveLength(2);
    expect(lanterns.pack().data.length).toBe(MAX_LANTERNS * 4);
  });

  it('caps total lanterns at maxCount by evicting the oldest non-grabbed lantern', () => {
    const lanterns = createLanterns({ maxCount: 2 });
    const first = lanterns.addLantern({ x: -0.3, z: 0.0 });
    const second = lanterns.addLantern({ x: 0.3, z: 0.0 });
    const third = lanterns.addLantern({ x: 0.0, z: 0.25 });

    const ids = lanterns.list().map((l) => l.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids).toContain(third.id);
  });

  it('drifts smoothly, fades appear to 1, flickers within bounds, and responds to water impulses', () => {
    const lanterns = createLanterns({ count: 3 });
    const added = lanterns.addLantern({ x: 0.0, z: 0.0 });
    expect(added.appear).toBeLessThan(1);

    const before = lanterns.list()[0];
    lanterns.applyImpulse(before.x - 0.12, before.z, 0.05, -0.09);
    let packed = null;
    for (let i = 0; i < 60; i++) {
      packed = lanterns.step(1 / 60, i * 0.02);
    }

    const afterList = lanterns.list();
    const after = afterList[0];
    expect(after.x).toBeGreaterThan(before.x);
    expect(Math.abs(after.x)).toBeLessThanOrEqual(LANTERNS.boundsX);
    expect(after.z).toBeGreaterThanOrEqual(LANTERNS.minZ);
    expect(after.z).toBeLessThanOrEqual(LANTERNS.maxZ);
    expect(after.flicker).toBeGreaterThanOrEqual(0.8);
    expect(after.flicker).toBeLessThanOrEqual(1.2);
    expect(afterList[afterList.length - 1].appear).toBe(1);
    expect(packed.count).toBe(4);
  });

  it('projects visible floating lantern onto screen coordinates', () => {
    const lanterns = createLanterns({ count: 1 });
    const projected = projectLantern(lanterns.list()[0], CAMERA, 16 / 10, 1280, 800, 0.5);
    expect(projected).not.toBeNull();
    expect(projected.x).toBeGreaterThan(0);
    expect(projected.x).toBeLessThan(1280);
    expect(projected.y).toBeGreaterThan(0);
    expect(projected.y).toBeLessThan(800);
    expect(projected.sizePx).toBeGreaterThanOrEqual(12);
  });
});
