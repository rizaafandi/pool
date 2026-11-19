import { describe, expect, it } from 'vitest';
import { FINGER_TIPS, PALM, SIM, SPLASH } from '../src/config.js';
import { addDrop, dropProfile, stepHeightfield } from '../src/sim/heightfield.js';

describe('dropProfile', () => {
  it('is 1 at the center, 0 at the radius, and 0 outside', () => {
    expect(dropProfile(0, 0.02)).toBeCloseTo(1, 5);
    expect(dropProfile(0.02, 0.02)).toBeCloseTo(0, 5);
    expect(dropProfile(0.03, 0.02)).toBe(0);
  });
});

describe('stepHeightfield', () => {
  it('spreads a raised center into its neighbors and holds the border at 0', () => {
    const size = 5;
    const height = new Float32Array(size * size);
    const velocity = new Float32Array(size * size);
    height[12] = 1;
    const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
    expect(next.height[12]).toBeCloseTo(-0.99, 5);
    expect(next.velocity[12]).toBeCloseTo(-1.99, 5);
    expect(next.height[11]).toBeCloseTo(0.4975, 5);
    expect(next.height[2]).toBe(0);
    expect(next.velocity[2]).toBe(0);
  });

  it('damps velocity when the neighborhood is flat', () => {
    const size = 5;
    const height = new Float32Array(size * size);
    const velocity = new Float32Array(size * size);
    velocity[12] = 1;
    const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
    expect(next.velocity[12]).toBeCloseTo(0.995, 5);
    expect(next.height[12]).toBeCloseTo(0.995, 5);
  });

  it('stays finite for 300 steps after a hard drop', () => {
    const size = 64;
    let height = new Float32Array(size * size);
    let velocity = new Float32Array(size * size);
    height = addDrop(height, size, 0.5, 0.5, 0.08, -0.2);
    for (let i = 0; i < 300; i++) {
      const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
      height = next.height;
      velocity = next.velocity;
    }
    let maxAbs = 0;
    for (const value of height) {
      expect(Number.isFinite(value)).toBe(true);
      maxAbs = Math.max(maxAbs, Math.abs(value));
    }
    expect(maxAbs).toBeLessThan(1);
  });
});

describe('addDrop', () => {
  it('changes the center cell and leaves a far cell and the border alone', () => {
    const size = 32;
    const height = new Float32Array(size * size);
    const next = addDrop(height, size, 0.5, 0.5, 0.05, -0.04);
    const center = 16 * size + 16;
    expect(next[center]).toBeLessThan(-0.02);
    expect(next[0]).toBe(0);
    expect(next[size * size - 1]).toBe(0);
    expect(next[1]).toBe(0);
  });

  it('constructively amplifies when two drops collide at the midpoint', () => {
    const size = 64;
    const run = (drops) => {
      let height = new Float32Array(size * size);
      let velocity = new Float32Array(size * size);
      for (const [u, v] of drops) {
        height = addDrop(height, size, u, v, 0.06, -0.055);
      }
      const mid = 32 * size + 32;
      let peak = 0;
      for (let i = 0; i < 30; i++) {
        const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
        height = next.height;
        velocity = next.velocity;
        peak = Math.max(peak, Math.abs(height[mid]));
      }
      return peak;
    };
    const singlePeak = run([[0.38, 0.5]]);
    const collidedPeak = run([[0.38, 0.5], [0.62, 0.5]]);
    expect(collidedPeak).toBeGreaterThan(singlePeak * 1.7);
  });
});

describe('multi-drop capacity constants', () => {
  it('supports at least 10 simultaneous fingertips plus pointer headroom', () => {
    expect(SIM.maxDrops).toBe(12);
    expect(FINGER_TIPS).toEqual([4, 8, 12, 16, 20]);
    expect(PALM.radius).toBeGreaterThan(0.04);
    expect(PALM.sweepSpeed).toBeGreaterThan(PALM.minSpeed);
    expect(SPLASH.strength).toBeLessThan(-0.08);
    expect(SPLASH.cooldownMs).toBeGreaterThanOrEqual(300);
  });

  it('stays finite and bounded when 10 simultaneous drops are stamped', () => {
    const size = 64;
    let height = new Float32Array(size * size);
    let velocity = new Float32Array(size * size);
    for (let i = 0; i < 10; i++) {
      height = addDrop(height, size, 0.2 + i * 0.06, 0.5, 0.022, -0.042);
    }
    for (let step = 0; step < 120; step++) {
      const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
      height = next.height;
      velocity = next.velocity;
    }
    for (const value of height) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(1);
    }
  });
});