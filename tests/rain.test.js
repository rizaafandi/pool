import { describe, expect, it } from 'vitest';
import { CAMERA, POOL, RAIN } from '../src/config.js';
import { createRain } from '../src/sim/rain.js';

describe('createRain', () => {
  it('emits nothing while disabled and emits valid pool drops when enabled', () => {
    let seed = 0.5;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const rain = createRain({ rng });
    expect(rain.isEnabled()).toBe(false);
    expect(rain.sample(CAMERA, 16 / 9, POOL, 0, 1000)).toBeNull();

    rain.setEnabled(true);
    expect(rain.isEnabled()).toBe(true);
    const first = rain.sample(CAMERA, 16 / 9, POOL, 0, 1000);
    expect(first).not.toBeNull();
    expect(first.u).toBeGreaterThan(0);
    expect(first.u).toBeLessThan(1);
    expect(first.v).toBeGreaterThan(0);
    expect(first.v).toBeLessThan(1);
    expect(first.radius).toBeGreaterThanOrEqual(RAIN.minRadius);
    expect(first.radius).toBeLessThanOrEqual(RAIN.maxRadius);
    expect(first.strength).toBeLessThanOrEqual(RAIN.minStrength);
    expect(first.strength).toBeGreaterThanOrEqual(RAIN.maxStrength);

    // Immediately after first drop, waits until interval elapses
    expect(rain.sample(CAMERA, 16 / 9, POOL, 0, 1050)).toBeNull();
    // After maxIntervalMs, emits another drop
    const second = rain.sample(CAMERA, 16 / 9, POOL, 0, 1700);
    expect(second).not.toBeNull();
  });

  it('animates falling rain streaks and emits pool drops + impact splashes upon landing', () => {
    let seed = 17;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const rain = createRain({ rng });
    rain.setEnabled(true);

    // First frame produces falling rain streaks before impact
    const initial = rain.step(1 / 60, 1000, CAMERA, 16 / 9, POOL, 0);
    expect(initial.visuals.streaks.length).toBeGreaterThan(0);

    // Stepping ~0.5s causes targeted raindrops to hit the pool and spawn splashes + water drops
    let totalDrops = 0;
    let sawSplash = false;
    for (let i = 1; i <= 35; i++) {
      const frame = rain.step(1 / 60, 1000 + i * 16, CAMERA, 16 / 9, POOL, i * 0.01);
      totalDrops += frame.drops.length;
      if (frame.visuals.splashes.length > 0) sawSplash = true;
    }
    expect(totalDrops).toBeGreaterThan(0);
    expect(sawSplash).toBe(true);

    // Turning rain off fades streaks smoothly to zero over ~2 seconds
    rain.setEnabled(false);
    let lastFrame;
    for (let i = 1; i <= 150; i++) {
      lastFrame = rain.step(0.04, 2000 + i * 40, CAMERA, 16 / 9, POOL, 0);
    }
    expect(lastFrame.visuals.intensity).toBe(0);
    expect(lastFrame.visuals.streaks.length).toBe(0);
    expect(lastFrame.visuals.splashes.length).toBe(0);
  });

  it('aligns falling rain streak angles and splash foreshortening with the 3D pool camera perspective', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const rain = createRain({ rng });
    rain.setEnabled(true);

    const aspect = 16 / 9;
    const leftStreaks = [];
    const rightStreaks = [];
    const splashes = [];

    for (let i = 0; i < 40; i++) {
      const frame = rain.step(1 / 60, 1000 + i * 16, CAMERA, aspect, POOL, i * 0.01);
      for (const s of frame.visuals.streaks) {
        if (s.dy <= 1e-4) continue;
        if (s.x < 0.25) leftStreaks.push(s);
        if (s.x > 0.75) rightStreaks.push(s);
      }
      for (const sp of frame.visuals.splashes) {
        splashes.push(sp);
      }
    }

    expect(leftStreaks.length).toBeGreaterThan(0);
    expect(rightStreaks.length).toBeGreaterThan(0);
    // In steep downward pool perspective, left-side rain converges down-right (dx > 0)
    // and right-side rain converges down-left (dx < 0) toward the vertical vanishing point.
    const avgLeftDx = leftStreaks.reduce((sum, s) => sum + s.dx, 0) / leftStreaks.length;
    const avgRightDx = rightStreaks.reduce((sum, s) => sum + s.dx, 0) / rightStreaks.length;
    expect(avgLeftDx).toBeGreaterThan(0);
    expect(avgRightDx).toBeLessThan(0);

    // Surface splash rings should match the steep downward camera (~68 deg -> aspect > 0.7)
    expect(splashes.length).toBeGreaterThan(0);
    for (const sp of splashes) {
      expect(sp.ringAspect).toBeGreaterThan(0.7);
      expect(sp.ringAspect).toBeLessThanOrEqual(1.0);
    }
  });

  it('triggers periodic lightning flashes followed by delayed thunder when rain is enabled', () => {
    let seed = 99;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const rain = createRain({ rng });
    rain.setEnabled(true);

    let firstFlashAt = null;
    let firstThunderAt = null;
    let maxFlash = 0;

    // Step 12 seconds in 50ms increments
    for (let i = 0; i <= 240; i++) {
      const nowMs = 1000 + i * 50;
      const frame = rain.step(0.05, nowMs, CAMERA, 16 / 9, POOL, i * 0.02);
      const flash = frame.visuals.lightning ? frame.visuals.lightning.intensity : 0;
      if (flash > maxFlash) maxFlash = flash;
      if (flash > 0.1 && firstFlashAt === null) firstFlashAt = nowMs;
      if (frame.thunder && firstThunderAt === null) firstThunderAt = nowMs;
    }

    expect(firstFlashAt).not.toBeNull();
    expect(maxFlash).toBeGreaterThan(0.4);
    expect(firstThunderAt).not.toBeNull();
    // Thunder arrives after the lightning flash (speed-of-sound delay)
    expect(firstThunderAt).toBeGreaterThan(firstFlashAt);

    // Disabling rain prevents further thunder triggers
    rain.setEnabled(false);
    let thunderAfterDisable = 0;
    for (let i = 1; i <= 240; i++) {
      const frame = rain.step(0.05, 15000 + i * 50, CAMERA, 16 / 9, POOL, 0);
      if (frame.thunder) thunderAfterDisable += 1;
    }
    expect(thunderAfterDisable).toBe(0);
  });
});
