import { describe, expect, it } from 'vitest';
import { KOI, POOL } from '../src/config.js';
import { createKoi, MAX_KOI } from '../src/sim/koi.js';

describe('createKoi', () => {
  it('initializes default koi school within underwater depth and pool bounds', () => {
    const koi = createKoi();
    expect(koi.isEnabled()).toBe(true);
    const list = koi.list();
    expect(list.length).toBe(KOI.count);
    for (const f of list) {
      expect(f.y).toBeLessThan(0);
      expect(f.y).toBeGreaterThan(POOL.floorY);
      expect(Math.abs(f.x)).toBeLessThanOrEqual(KOI.boundsX);
      expect(f.z).toBeGreaterThanOrEqual(KOI.minZ);
      expect(f.z).toBeLessThanOrEqual(KOI.maxZ);
    }
  });

  it('advances swimming position, tail phase, and keeps fish inside bounds over time', () => {
    const koi = createKoi({ count: 4 });
    const before = koi.list();
    let packed = null;
    for (let i = 0; i < 180; i++) {
      packed = koi.step(1 / 60);
    }
    const after = koi.list();
    expect(packed.count).toBe(4);
    expect(packed.pos.length).toBe(MAX_KOI * 4);
    expect(packed.meta.length).toBe(MAX_KOI * 4);

    for (let i = 0; i < after.length; i++) {
      const dist = Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z);
      expect(dist).toBeGreaterThan(0.05);
      expect(after[i].phase).not.toBe(before[i].phase);
      expect(Math.abs(after[i].x)).toBeLessThanOrEqual(KOI.boundsX * 1.25 + 1e-4);
      expect(after[i].z).toBeGreaterThanOrEqual(KOI.minZ - 0.23);
      expect(after[i].z).toBeLessThanOrEqual(KOI.maxZ + 0.23);
    }
  });

  it('darts away from nearby water disturbances', () => {
    const koi = createKoi({ count: 2 });
    const target = koi.list()[0];
    const baseSpeed = target.speed;

    koi.reactToDisturbance(target.x + 0.08, target.z, 1.2);
    const startled = koi.list()[0];
    expect(startled.speed).toBeGreaterThan(baseSpeed * 1.4);
    expect(startled.dartTimer).toBeGreaterThan(0.5);
  });

  it('returns zero packed count when toggled off and resumes when toggled on', () => {
    const koi = createKoi({ count: 3 });
    expect(koi.toggle()).toBe(false);
    expect(koi.step(1 / 60).count).toBe(0);
    expect(koi.toggle()).toBe(true);
    expect(koi.step(1 / 60).count).toBe(3);
  });
});
