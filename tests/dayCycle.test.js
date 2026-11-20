import { describe, expect, it } from 'vitest';
import { createDayCycle, sunDirFromNdc } from '../src/sim/dayCycle.js';

describe('createDayCycle', () => {
  it('advances smoothly across themes with normalized celestial sunDir', () => {
    const cycle = createDayCycle({ cycleSeconds: 16, enabled: true });
    const seen = new Set();

    for (let i = 0; i < 160; i++) {
      const sample = cycle.step(0.1);
      seen.add(sample.nearestThemeId);
      const len = Math.hypot(...sample.theme.sunDir);
      expect(len).toBeCloseTo(1, 4);
      expect(sample.theme.sunDir[1]).toBeGreaterThan(0.35);
      expect(sample.theme.petalColor).toMatch(/^rgba\(/);
    }

    expect(seen.has('sunlit')).toBe(true);
    expect(seen.has('sunset')).toBe(true);
    expect(seen.has('night')).toBe(true);
    expect(seen.has('biolum')).toBe(true);
  });

  it('anchors cycle start to the current theme when toggled on', () => {
    const cycle = createDayCycle({ cycleSeconds: 40 });
    expect(cycle.isEnabled()).toBe(false);
    cycle.toggle('night');
    expect(cycle.isEnabled()).toBe(true);
    expect(cycle.getProgress()).toBeCloseTo(0.5, 4);
  });
});

describe('sunDirFromNdc', () => {
  it('returns unit vectors staying comfortably above the horizon', () => {
    for (const [x, y] of [[0, 0], [-1, 1], [1, -1], [0.5, -0.3]]) {
      const dir = sunDirFromNdc(x, y);
      expect(Math.hypot(...dir)).toBeCloseTo(1, 5);
      expect(dir[1]).toBeGreaterThanOrEqual(0.36);
    }
  });
});
