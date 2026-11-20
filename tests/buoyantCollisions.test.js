import { describe, expect, it } from 'vitest';
import {
  floaterCollisionRadius,
  lanternCollisionRadius,
  resolveBuoyantCollisions,
} from '../src/sim/buoyantCollisions.js';
import { createFloaters } from '../src/sim/floaters.js';
import { createLanterns } from '../src/sim/lanterns.js';

describe('resolveBuoyantCollisions', () => {
  it('separates overlapping floaters cleanly and imparts gentle buoyant bounce', () => {
    const a = { id: 1, kind: 'blossom', x: 0.0, z: 0.0, vx: 0.25, vz: 0.04, spin: 0, size: 0.05, altitude: 0, falling: false };
    const b = { id: 2, kind: 'leaf', x: 0.04, z: 0.0, vx: -0.20, vz: -0.04, spin: 0, size: 0.05, altitude: 0, falling: false };

    const hits = resolveBuoyantCollisions([a, b], []);
    expect(hits).toBe(1);

    const minDist = floaterCollisionRadius(a) + floaterCollisionRadius(b);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    expect(dist).toBeGreaterThanOrEqual(minDist - 1e-4);
    expect(a.vx).toBeLessThan(0.25);
    expect(b.vx).toBeGreaterThan(-0.20);
    expect(Math.abs(a.spin) + Math.abs(b.spin)).toBeGreaterThan(0);
  });

  it('deflects a light petal around a heavy floating lantern using realistic mass ratios', () => {
    const petal = { id: 1, kind: 'petal', x: 0.06, z: 0.0, vx: -0.15, vz: 0.0, spin: 0, size: 0.045, altitude: 0, falling: false };
    const lantern = { id: 0, x: 0.0, z: 0.0, vx: 0.0, vz: 0.0, spin: 0, size: 0.080 };

    const hits = resolveBuoyantCollisions([petal], [lantern]);
    expect(hits).toBe(1);

    const minDist = floaterCollisionRadius(petal) + lanternCollisionRadius(lantern);
    const dist = Math.hypot(petal.x - lantern.x, petal.z - lantern.z);
    expect(dist).toBeGreaterThanOrEqual(minDist - 1e-4);
    // Lightweight petal absorbs most of the displacement, heavy wooden raft barely shifts
    expect(Math.abs(petal.x - 0.06)).toBeGreaterThan(Math.abs(lantern.x) * 4);
  });

  it('ignores airborne falling petals until they land on the water surface', () => {
    const falling = { id: 1, kind: 'petal', x: 0.0, z: 0.0, vx: 0, vz: 0, spin: 0, size: 0.05, altitude: 0.4, falling: true };
    const lantern = { id: 0, x: 0.0, z: 0.0, vx: 0, vz: 0, spin: 0, size: 0.08 };

    const hits = resolveBuoyantCollisions([falling], [lantern]);
    expect(hits).toBe(0);
    expect(falling.x).toBe(0);
    expect(lantern.x).toBe(0);
  });

  it('separates coincident lanterns cleanly with finite coordinates', () => {
    const l1 = { id: 0, x: 0.1, z: 0.1, vx: 0, vz: 0, spin: 0, size: 0.08 };
    const l2 = { id: 1, x: 0.1, z: 0.1, vx: 0, vz: 0, spin: 0, size: 0.08 };

    const hits = resolveBuoyantCollisions([], [l1, l2]);
    expect(hits).toBe(1);
    expect(Number.isFinite(l1.x)).toBe(true);
    expect(Number.isFinite(l2.x)).toBe(true);
    const dist = Math.hypot(l2.x - l1.x, l2.z - l1.z);
    expect(dist).toBeGreaterThanOrEqual(lanternCollisionRadius(l1) + lanternCollisionRadius(l2) - 1e-4);
  });

  it('eliminates all overlaps across the full default school of floaters and lanterns', () => {
    const floaters = createFloaters();
    const lanterns = createLanterns({ count: 4 });

    resolveBuoyantCollisions(floaters.bodies(), lanterns.bodies(), { iterations: 6 });

    const all = [
      ...floaters.bodies().map((f) => ({ x: f.x, z: f.z, r: floaterCollisionRadius(f) })),
      ...lanterns.bodies().map((l) => ({ x: l.x, z: l.z, r: lanternCollisionRadius(l) })),
    ];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dist = Math.hypot(all[j].x - all[i].x, all[j].z - all[i].z);
        expect(dist).toBeGreaterThanOrEqual(all[i].r + all[j].r - 1e-3);
      }
    }
  });
});
