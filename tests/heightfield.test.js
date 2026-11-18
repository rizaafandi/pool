import { describe, expect, it } from 'vitest';
import { SIM } from '../src/config.js';
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
});