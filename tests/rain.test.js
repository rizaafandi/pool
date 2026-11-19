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
});
