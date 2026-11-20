import { describe, expect, it } from 'vitest';
import { pickFloatingObject } from '../src/input/grab.js';
import { resolveBuoyantCollisions } from '../src/sim/buoyantCollisions.js';

describe('pickFloatingObject', () => {
  const lanterns = [
    { id: 0, x: 300, y: 260, sizePx: 34 },
    { id: 1, x: 520, y: 310, sizePx: 38 },
  ];
  const floaters = [
    { id: 10, x: 305, y: 255, radiusPx: 18, altitude: 0 },
    { id: 11, x: 700, y: 400, radiusPx: 16, altitude: 0 },
    { id: 12, x: 820, y: 200, radiusPx: 20, altitude: 0.45 }, // airborne
  ];

  it('picks a water lantern ahead of a nearby floater', () => {
    const pick = pickFloatingObject(302, 252, lanterns, floaters);
    expect(pick).toEqual({ type: 'lantern', id: 0 });
  });

  it('picks a resting floater when clicking directly on it', () => {
    const pick = pickFloatingObject(706, 404, lanterns, floaters);
    expect(pick).toEqual({ type: 'floater', id: 11 });
  });

  it('ignores airborne falling petals', () => {
    const pick = pickFloatingObject(820, 200, lanterns, floaters);
    expect(pick).toBeNull();
  });

  it('returns null on open water so water sound & ripples trigger normally', () => {
    const pick = pickFloatingObject(100, 100, lanterns, floaters);
    expect(pick).toBeNull();
  });
});

describe('grabbed object collision authority', () => {
  it('keeps a grabbed object anchored under the pointer while smoothly pushing other objects aside', () => {
    const heldPetal = {
      id: 1, kind: 'blossom', x: 0.0, z: 0.0, vx: 0.3, vz: 0, spin: 0, size: 0.05, altitude: 0, falling: false, grabbed: true,
    };
    const otherLantern = {
      id: 0, x: 0.05, z: 0.0, vx: 0, vz: 0, spin: 0, size: 0.08, grabbed: false,
    };

    const hits = resolveBuoyantCollisions([heldPetal], [otherLantern]);
    expect(hits).toBe(1);
    // Held object stays locked to the user's cursor, while the collided object moves out of the way
    expect(heldPetal.x).toBe(0);
    expect(otherLantern.x).toBeGreaterThan(0.14);
  });
});
