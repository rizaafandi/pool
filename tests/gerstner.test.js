import { describe, expect, it } from 'vitest';
import { WAVES } from '../src/config.js';
import { gerstnerAt } from '../src/sim/gerstner.js';

function referenceHeight(x, z, time, waves) {
  let y = 0;
  for (const w of waves) {
    const len = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / len;
    const dz = w.dirZ / len;
    const k = (Math.PI * 2) / w.wavelength;
    const speed = Math.sqrt(9.8 / k);
    const a = w.steepness / k;
    const f = k * (dx * x + dz * z - speed * time) + w.phase;
    y += a * Math.sin(f);
  }
  return y;
}

describe('gerstnerAt', () => {
  it('matches the closed-form height at the origin and at a later time', () => {
    const a = gerstnerAt(0, 0, 0, WAVES);
    const b = gerstnerAt(1.2, -0.4, 0.75, WAVES);
    expect(a.oy).toBeCloseTo(referenceHeight(0, 0, 0, WAVES), 5);
    expect(b.oy).toBeCloseTo(referenceHeight(1.2, -0.4, 0.75, WAVES), 5);
  });

  it('moves between t = 0 and t = 0.4', () => {
    const a = gerstnerAt(0.3, 0.2, 0, WAVES);
    const b = gerstnerAt(0.3, 0.2, 0.4, WAVES);
    expect(Math.abs(a.oy - b.oy)).toBeGreaterThan(0.002);
  });

  it('returns an upward unit normal', () => {
    const g = gerstnerAt(0.4, -0.7, 0.2, WAVES);
    const length = Math.hypot(g.normal[0], g.normal[1], g.normal[2]);
    expect(length).toBeCloseTo(1, 5);
    expect(g.normal[1]).toBeGreaterThan(0.8);
  });
});