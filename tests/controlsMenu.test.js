import { describe, expect, it } from 'vitest';
import { createControlsMenu } from '../src/ui/controlsMenu.js';

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => (
      force === undefined
        ? (set.has(c) ? (set.delete(c), false) : (set.add(c), true))
        : (force ? (set.add(c), true) : (set.delete(c), false))
    ),
    contains: (c) => set.has(c),
  };
}

function makeEl(initialClasses = []) {
  const attrs = {};
  return {
    classList: makeClassList(initialClasses),
    attrs,
    textContent: '',
    setAttribute(k, v) {
      attrs[k] = v;
    },
  };
}

describe('createControlsMenu', () => {
  it('starts collapsed and toggles the expandable drawer with aria-expanded and layout notifications', () => {
    const toggleButton = makeEl(['pill']);
    const drawer = makeEl();
    let layoutChanges = 0;

    const menu = createControlsMenu({
      toggleButton,
      drawer,
      onLayoutChange: () => {
        layoutChanges += 1;
      },
    });

    expect(menu.isDrawerOpen()).toBe(false);
    expect(drawer.classList.contains('open')).toBe(false);
    expect(toggleButton.attrs['aria-expanded']).toBe('false');
    expect(layoutChanges).toBe(0);

    expect(menu.toggleDrawer()).toBe(true);
    expect(drawer.classList.contains('open')).toBe(true);
    expect(toggleButton.classList.contains('active')).toBe(true);
    expect(toggleButton.attrs['aria-expanded']).toBe('true');
    expect(layoutChanges).toBe(1);

    // Setting same state is a no-op
    expect(menu.setDrawerOpen(true)).toBe(true);
    expect(layoutChanges).toBe(1);

    expect(menu.setDrawerOpen(false)).toBe(false);
    expect(drawer.classList.contains('open')).toBe(false);
    expect(toggleButton.classList.contains('active')).toBe(false);
    expect(toggleButton.attrs['aria-expanded']).toBe('false');
    expect(layoutChanges).toBe(2);
  });

  it('expands and collapses individual button groups independently and updates summaries only on change', () => {
    const lightingContainer = makeEl(['ctrl-group']);
    const lightingHeader = makeEl(['group-header']);
    const lightingSummary = makeEl(['group-summary']);
    const pondContainer = makeEl(['ctrl-group']);
    const pondHeader = makeEl(['group-header']);
    let layoutChanges = 0;

    const menu = createControlsMenu({
      groups: [
        {
          id: 'lighting',
          container: lightingContainer,
          header: lightingHeader,
          summaryEl: lightingSummary,
          defaultExpanded: true,
        },
        {
          id: 'pond',
          container: pondContainer,
          header: pondHeader,
          defaultExpanded: false,
        },
      ],
      onLayoutChange: () => {
        layoutChanges += 1;
      },
    });

    expect(menu.isGroupExpanded('lighting')).toBe(true);
    expect(lightingContainer.classList.contains('collapsed')).toBe(false);
    expect(lightingHeader.attrs['aria-expanded']).toBe('true');

    expect(menu.isGroupExpanded('pond')).toBe(false);
    expect(pondContainer.classList.contains('collapsed')).toBe(true);
    expect(pondHeader.attrs['aria-expanded']).toBe('false');

    expect(menu.toggleGroup('lighting')).toBe(false);
    expect(lightingContainer.classList.contains('collapsed')).toBe(true);
    expect(lightingHeader.attrs['aria-expanded']).toBe('false');
    expect(layoutChanges).toBe(1);

    expect(menu.toggleGroup('pond')).toBe(true);
    expect(pondContainer.classList.contains('collapsed')).toBe(false);
    expect(pondHeader.attrs['aria-expanded']).toBe('true');
    expect(layoutChanges).toBe(2);

    expect(menu.setGroupSummary('lighting', 'Sunset')).toBe(true);
    expect(lightingSummary.textContent).toBe('Sunset');
    expect(menu.setGroupSummary('lighting', 'Sunset')).toBe(false);
  });
});
