import { describe, expect, it } from 'vitest';
import { CAMERA, SWELL_TIME_SCALE, WAVES } from '../src/config.js';
import { ndcToRay } from '../src/math.js';
import { gerstnerAt, gerstnerHeightAt, rayGerstnerSurface } from '../src/sim/gerstner.js';

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

describe('rayGerstnerSurface', () => {
  it('finds a point on the ray that matches the displaced Gerstner height', () => {
    const swellTime = 1.5 * SWELL_TIME_SCALE;
    const ray = ndcToRay(0.25, -0.35, CAMERA, 16 / 9);
    const hit = rayGerstnerSurface(ray.origin, ray.dir, swellTime, WAVES);
    expect(hit).not.toBeNull();
    expect(hit[1]).toBeCloseTo(gerstnerHeightAt(hit[0], hit[2], swellTime, WAVES), 4);
    const t = (hit[1] - ray.origin[1]) / ray.dir[1];
    expect(t).toBeGreaterThan(0);
    expect(ray.origin[0] + ray.dir[0] * t).toBeCloseTo(hit[0], 5);
    expect(ray.origin[2] + ray.dir[2] * t).toBeCloseTo(hit[2], 5);
  });

  it('falls back to y = 0 when there are no waves', () => {
    const ray = ndcToRay(0, 0, CAMERA, 16 / 9);
    const hit = rayGerstnerSurface(ray.origin, ray.dir, 0, []);
    expect(hit).not.toBeNull();
    expect(hit[1]).toBeCloseTo(0, 5);
  });
});