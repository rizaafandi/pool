import { describe, expect, it } from 'vitest';
import { createAdaptiveQuality } from '../src/perf/adaptiveQuality.js';

function feed(q, frameMs, count, start = 0) {
  let t = start;
  let change = null;
  for (let i = 0; i < count; i++) {
    t += frameMs;
    const res = q.update(t);
    if (res) change = res;
  }
  return { change, t };
}

describe('createAdaptiveQuality', () => {
  it('starts at full quality and stays there at a healthy 60 fps', () => {
    const q = createAdaptiveQuality();
    expect(q.scale()).toBe(1);
    const { change } = feed(q, 16.7, 300);
    expect(change).toBeNull();
    expect(q.scale()).toBe(1);
  });

  it('steps resolution scale down after sustained slow frames and never below the minimum', () => {
    const q = createAdaptiveQuality();
    const first = feed(q, 40, 90);
    expect(first.change).not.toBeNull();
    expect(q.scale()).toBeLessThan(1);
    feed(q, 40, 600, first.t);
    expect(q.scale()).toBeGreaterThanOrEqual(0.5);
  });

  it('ignores a single long hitch (tab switch) instead of downgrading', () => {
    const q = createAdaptiveQuality();
    feed(q, 16.7, 60);
    const res = q.update(60 * 16.7 + 3000);
    expect(res).toBeNull();
    expect(q.scale()).toBe(1);
  });

  it('recovers quality only after a long healthy stretch', () => {
    const q = createAdaptiveQuality();
    const slow = feed(q, 40, 90);
    const lowered = q.scale();
    expect(lowered).toBeLessThan(1);
    const fast = feed(q, 10, 700, slow.t);
    expect(fast.change).not.toBeNull();
    expect(q.scale()).toBeGreaterThan(lowered);
  });
});
