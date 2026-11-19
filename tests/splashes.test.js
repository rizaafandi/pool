import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/config.js';
import { createSplashes } from '../src/sim/splashes.js';

describe('createSplashes', () => {
  it('spawns 3D projected tap, fast-sweep, and burst splashes that expire cleanly', () => {
    let seed = 11;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const splashes = createSplashes({ rng });

    // Slow sweep below threshold does not spawn spray
    splashes.spawnSweep(0, 0, 1, 0, 0.2, 0);
    expect(splashes.step(1 / 60, CAMERA, 16 / 9)).toHaveLength(0);

    // Tap and fast sweep spawn 3D-projected splashes with beads and perspective ringAspect
    splashes.spawnTap(0, 0.08, 0.9, 0);
    splashes.spawnSweep(0.2, 0.0, 1, 0.2, 1.4, 0);
    splashes.spawnBurst(-0.2, 0.1, 1.3, 0);

    const frame = splashes.step(0.05, CAMERA, 16 / 9);
    expect(frame.length).toBe(3);
    for (const s of frame) {
      expect(s.showRing).toBe(false);
      expect(s.ringAspect).toBeGreaterThan(0.7);
      expect(s.ringAspect).toBeLessThanOrEqual(1.0);
      expect(s.beads.length).toBeGreaterThan(0);
      expect(s.beads[0].screenX).toBeGreaterThan(0);
      expect(s.beads[0].screenX).toBeLessThan(1);
    }

    // After >0.6s, all splashes expire
    let finalFrame = frame;
    for (let i = 0; i < 20; i++) {
      finalFrame = splashes.step(0.05, CAMERA, 16 / 9);
    }
    expect(finalFrame).toHaveLength(0);
  });
});
