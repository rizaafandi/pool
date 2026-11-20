export function createControlsMenu({
  toggleButton = null,
  drawer = null,
  groups = [],
  onLayoutChange = null,
} = {}) {
  let drawerOpen = false;
  const groupMap = new Map();

  for (const g of groups) {
    if (!g || !g.id) continue;
    const expanded = g.defaultExpanded !== undefined ? Boolean(g.defaultExpanded) : true;
    groupMap.set(g.id, {
      id: g.id,
      container: g.container || null,
      header: g.header || null,
      summaryEl: g.summaryEl || null,
      expanded,
      lastSummary: null,
    });
  }

  function notifyLayout() {
    if (typeof onLayoutChange === 'function') {
      onLayoutChange();
    }
  }

  function syncDrawerDom() {
    if (drawer && drawer.classList) {
      drawer.classList.toggle('open', drawerOpen);
    }
    if (toggleButton) {
      if (toggleButton.classList) {
        toggleButton.classList.toggle('active', drawerOpen);
      }
      if (typeof toggleButton.setAttribute === 'function') {
        toggleButton.setAttribute('aria-expanded', String(drawerOpen));
      }
    }
  }

  function syncGroupDom(entry) {
    if (!entry) return;
    if (entry.container && entry.container.classList) {
      entry.container.classList.toggle('collapsed', !entry.expanded);
    }
    if (entry.header && typeof entry.header.setAttribute === 'function') {
      entry.header.setAttribute('aria-expanded', String(entry.expanded));
    }
  }

  syncDrawerDom();
  for (const entry of groupMap.values()) {
    syncGroupDom(entry);
  }

  return {
    isDrawerOpen() {
      return drawerOpen;
    },

    setDrawerOpen(next) {
      const val = Boolean(next);
      if (val === drawerOpen) return drawerOpen;
      drawerOpen = val;
      syncDrawerDom();
      notifyLayout();
      return drawerOpen;
    },

    toggleDrawer() {
      return this.setDrawerOpen(!drawerOpen);
    },

    isGroupExpanded(groupId) {
      const entry = groupMap.get(groupId);
      return entry ? entry.expanded : false;
    },

    setGroupExpanded(groupId, next) {
      const entry = groupMap.get(groupId);
      if (!entry) return false;
      const val = Boolean(next);
      if (val === entry.expanded) return entry.expanded;
      entry.expanded = val;
      syncGroupDom(entry);
      notifyLayout();
      return entry.expanded;
    },

    toggleGroup(groupId) {
      const entry = groupMap.get(groupId);
      if (!entry) return false;
      return this.setGroupExpanded(groupId, !entry.expanded);
    },

    setGroupSummary(groupId, text) {
      const entry = groupMap.get(groupId);
      if (!entry || !entry.summaryEl) return false;
      const next = text || '';
      if (entry.lastSummary === next) return false;
      entry.lastSummary = next;
      entry.summaryEl.textContent = next;
      return true;
    },
  };
}
