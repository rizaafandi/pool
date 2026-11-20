import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/config.js';
import {
  createButtonReflectionTracker,
  MAX_UI_PILLS,
  themeCssVars,
} from '../src/ui/buttonReflections.js';

function makeElement({
  id = '',
  classes = [],
  rect = { left: 20, top: 14, width: 80, height: 28 },
  hovered = false,
  hiddenAncestor = false,
  dataset = {},
} = {}) {
  const set = new Set(classes);
  return {
    id,
    dataset,
    classList: {
      contains: (c) => set.has(c),
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
    },
    closest: (selector) => (selector === '.hidden' && hiddenAncestor ? {} : null),
    matches: (selector) => selector === ':hover' && hovered,
    getBoundingClientRect: () => rect,
  };
}

describe('createButtonReflectionTracker', () => {
  const canvasRect = { left: 0, top: 0, width: 1000, height: 600 };

  it('maps visible button rects into WebGL bottom-left framebuffer coordinates with DPR scaling', () => {
    const tracker = createButtonReflectionTracker();
    const btn = makeElement({
      classes: ['pill', 'active'],
      rect: { left: 100, top: 40, width: 80, height: 30 },
      hovered: true,
    });

    const out = tracker.collect([btn], canvasRect, 1500, 900, 1 / 60);
    expect(out.count).toBe(1);
    // scaleX = 1.5, scaleY = 1.5
    // CSS center = (140, 55) -> GL center = (210, 900 - 82.5 = 817.5)
    expect(out.rects[0]).toBeCloseTo(210, 4);
    expect(out.rects[1]).toBeCloseTo(817.5, 4);
    expect(out.rects[2]).toBeCloseTo(60, 4);
    expect(out.rects[3]).toBeCloseTo(22.5, 4);
    expect(out.meta[0]).toBeCloseTo(1, 4); // active
    expect(out.meta[1]).toBeCloseTo(1, 4); // hover
    expect(out.meta[2]).toBeCloseTo(22.5, 4); // pill radius = min(halfW, halfH)
    expect(out.meta[3]).toBe(0); // standard pill kind
    expect(out.cssPills).toEqual([{ x: 100, y: 40, width: 80, height: 30, radius: 15 }]);
  });

  it('skips hidden elements, hidden ancestors, zero-size elements, and offscreen elements', () => {
    const tracker = createButtonReflectionTracker();
    const visibleHero = makeElement({
      id: 'start',
      rect: { left: 400, top: 280, width: 180, height: 48 },
    });
    const hiddenSelf = makeElement({ classes: ['hidden'] });
    const hiddenParent = makeElement({ id: 'start', hiddenAncestor: true });
    const collapsed = makeElement({ rect: { left: 10, top: 10, width: 0, height: 0 } });
    const offscreen = makeElement({ rect: { left: 1200, top: 10, width: 60, height: 24 } });
    const badge = makeElement({
      id: 'gesture-badge',
      rect: { left: 820, top: 420, width: 140, height: 26 },
    });

    const out = tracker.collect(
      [visibleHero, hiddenSelf, hiddenParent, collapsed, offscreen, badge],
      canvasRect,
      1000,
      600,
      1 / 60,
    );
    expect(out.count).toBe(2);
    expect(out.meta[3]).toBe(1); // hero start button kind
    expect(out.meta[7]).toBe(2); // gesture badge kind
  });

  it('smoothly interpolates active and hover transitions across frames', () => {
    const tracker = createButtonReflectionTracker();
    let hovered = false;
    const btn = makeElement({
      classes: ['pill'],
      rect: { left: 20, top: 14, width: 70, height: 28 },
    });
    btn.matches = (sel) => sel === ':hover' && hovered;

    const first = tracker.collect([btn], canvasRect, 1000, 600, 1 / 60);
    expect(first.meta[0]).toBe(0);
    expect(first.meta[1]).toBe(0);

    btn.classList.add('active');
    hovered = true;
    const mid = tracker.collect([btn], canvasRect, 1000, 600, 0.05);
    expect(mid.meta[0]).toBeGreaterThan(0.3);
    expect(mid.meta[0]).toBeLessThan(0.95);
    expect(mid.meta[1]).toBeGreaterThan(0.3);
    expect(mid.meta[1]).toBeLessThan(0.95);
  });

  it('caps collected pills at MAX_UI_PILLS', () => {
    const tracker = createButtonReflectionTracker();
    const many = Array.from({ length: MAX_UI_PILLS + 5 }, (_, i) => makeElement({
      rect: { left: 10 + i * 20, top: 10, width: 40, height: 24 },
    }));
    const out = tracker.collect(many, canvasRect, 1000, 600, 1 / 60);
    expect(out.count).toBe(MAX_UI_PILLS);
    expect(out.cssPills.length).toBe(MAX_UI_PILLS);
  });

  it('respects custom data-glass-radius and clamps it to half the shortest edge', () => {
    const tracker = createButtonReflectionTracker();
    const segmented = makeElement({
      classes: ['theme-group'],
      rect: { left: 16, top: 16, width: 320, height: 36 },
      dataset: { glassRadius: '12' },
    });
    const clamped = makeElement({
      classes: ['pill'],
      rect: { left: 360, top: 16, width: 80, height: 36 },
      dataset: { glassRadius: '999' },
    });

    const out = tracker.collect([segmented, clamped], canvasRect, 1500, 900, 1 / 60);
    expect(out.count).toBe(2);
    expect(out.cssPills[0].radius).toBe(12);
    expect(out.meta[2]).toBeCloseTo(18, 4); // 12 * 1.5 DPR
    expect(out.cssPills[1].radius).toBe(18); // clamped to height / 2
    expect(out.meta[6]).toBeCloseTo(27, 4); // 18 * 1.5 DPR
  });

  it('caches getBoundingClientRect across frames until invalidate() is called', () => {
    const tracker = createButtonReflectionTracker();
    let reads = 0;
    let rect = { left: 20, top: 14, width: 80, height: 32 };
    const btn = makeElement({ classes: ['pill'] });
    btn.getBoundingClientRect = () => {
      reads += 1;
      return rect;
    };

    const f1 = tracker.collect([btn], canvasRect, 1000, 600, 1 / 60);
    const f2 = tracker.collect([btn], canvasRect, 1000, 600, 1 / 60);
    const f3 = tracker.collect([btn], canvasRect, 1000, 600, 1 / 60);
    expect(reads).toBe(1);
    expect(f1.cssPills[0].width).toBe(80);
    expect(f2.cssPills[0].width).toBe(80);
    expect(f3.cssPills[0].width).toBe(80);

    // Changing rect without invalidate keeps cached geometry; invalidate refreshes it
    rect = { left: 40, top: 14, width: 120, height: 32 };
    tracker.invalidate();
    const f4 = tracker.collect([btn], canvasRect, 1000, 600, 1 / 60);
    expect(reads).toBe(2);
    expect(f4.cssPills[0].x).toBe(40);
    expect(f4.cssPills[0].width).toBe(120);
  });
});

describe('themeCssVars', () => {
  it('derives distinct theme-matching CSS variables for every pool mood', () => {
    const sunlit = themeCssVars(THEMES.sunlit);
    const sunset = themeCssVars(THEMES.sunset);
    const biolum = themeCssVars(THEMES.biolum);
    expect(sunlit['--ui-divider']).toMatch(/^rgba\(/);
    expect(sunset['--ui-divider']).not.toBe(sunlit['--ui-divider']);
    expect(biolum['--ui-focus']).not.toBe(sunset['--ui-focus']);
  });
});
