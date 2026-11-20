import { createWaterAudio } from './audio/waterAudio.js';
import {
  CAMERA,
  DROP,
  MIRROR_X,
  POOL,
  POOL_BED_ORDER,
  POOL_BEDS,
  SENSITIVITY_LEVELS,
  SIM,
  SWELL_TIME_SCALE,
  THEME_ORDER,
  THEMES,
  VIEW,
  WATER_CONDITION_ORDER,
  WATER_CONDITIONS,
  WAVES,
} from './config.js';
import { createHandTracker } from './input/handTracker.js';
import { pickFloatingObject } from './input/grab.js';
import { impulseStrength, ndcWaterHit, planarSpeed } from './input/touch.js';
import { createRenderer } from './render/renderer.js';
import { createAdaptiveQuality } from './perf/adaptiveQuality.js';
import { createDayCycle, sunDirFromNdc } from './sim/dayCycle.js';
import { resolveBuoyantCollisions } from './sim/buoyantCollisions.js';
import { createFloaters, projectFloater } from './sim/floaters.js';
import { createKoi } from './sim/koi.js';
import { createLanterns, projectLantern } from './sim/lanterns.js';
import { createRain } from './sim/rain.js';
import { createSplashes } from './sim/splashes.js';
import { createButtonReflectionTracker, themeCssVars } from './ui/buttonReflections.js';
import { createControlsMenu } from './ui/controlsMenu.js';
import { createOverlay } from './ui/overlay.js';

const canvas = document.querySelector('#pool');
const hudCanvas = document.querySelector('#hud');
const video = document.querySelector('#cam');
const toggleButton = document.querySelector('#cam-toggle');
const gestureBadge = document.querySelector('#gesture-badge');
const mirrorButton = document.querySelector('#mirror-toggle');
const sensitivityButton = document.querySelector('#sens-toggle');
const controlsToggle = document.querySelector('#controls-toggle');
const controlsDrawer = document.querySelector('#controls-drawer');
const groupLighting = document.querySelector('#group-lighting');
const groupPond = document.querySelector('#group-pond');
const groupAtmosphere = document.querySelector('#group-atmosphere');
const rainButton = document.querySelector('#rain-toggle');
const petalsButton = document.querySelector('#petals-toggle');
const lanternButton = document.querySelector('#lantern-toggle');
const koiButton = document.querySelector('#koi-toggle');
const bedButton = document.querySelector('#bed-toggle');
const waterButton = document.querySelector('#water-toggle');
const soundButton = document.querySelector('#sound-toggle');
const cycleButton = document.querySelector('#cycle-toggle');
const zenButton = document.querySelector('#zen-toggle');
const zenExitButton = document.querySelector('#zen-exit');
const themeButtons = Array.from(document.querySelectorAll('[data-theme]'));
const gate = document.querySelector('#gate');
const button = document.querySelector('#start');

let renderer;
try {
  renderer = createRenderer(canvas);
  document.body.classList.add('water-glass-ready');
} catch (error) {
  button.textContent = error.message || String(error);
  throw error;
}

const overlay = createOverlay({
  hudCanvas,
  video,
  toggleButton,
  gestureBadge,
  mirrorButton,
  sensitivityButton,
});
const buttonReflections = createButtonReflectionTracker();
const mobileLayoutMq = typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 960px)')
  : null;

const controlsMenu = createControlsMenu({
  toggleButton: controlsToggle,
  drawer: controlsDrawer,
  groups: [
    {
      id: 'lighting',
      container: groupLighting,
      header: document.querySelector('[data-group-toggle="lighting"]'),
      summaryEl: document.querySelector('[data-group-summary="lighting"]'),
      defaultExpanded: true,
    },
    {
      id: 'pond',
      container: groupPond,
      header: document.querySelector('[data-group-toggle="pond"]'),
      summaryEl: document.querySelector('[data-group-summary="pond"]'),
      defaultExpanded: true,
    },
    {
      id: 'atmosphere',
      container: groupAtmosphere,
      header: document.querySelector('[data-group-toggle="atmosphere"]'),
      summaryEl: document.querySelector('[data-group-summary="atmosphere"]'),
      defaultExpanded: true,
    },
  ],
  onLayoutChange: () => buttonReflections.invalidate(),
});

const desktopReflectiveElements = [
  groupLighting,
  groupPond,
  groupAtmosphere,
  zenButton,
  mirrorButton,
  sensitivityButton,
  toggleButton,
  gestureBadge,
  button,
].filter(Boolean);

const mobileClosedReflectiveElements = [
  controlsToggle,
  zenButton,
  mirrorButton,
  sensitivityButton,
  toggleButton,
  gestureBadge,
  button,
].filter(Boolean);

const mobileOpenReflectiveElements = [
  controlsToggle,
  controlsDrawer,
  zenButton,
  mirrorButton,
  sensitivityButton,
  toggleButton,
  gestureBadge,
  button,
].filter(Boolean);

function getReflectiveUiElements() {
  if (zenMode) return [];
  const isMobile = mobileLayoutMq ? mobileLayoutMq.matches : cssWidth <= 960;
  if (isMobile) {
    return controlsMenu.isDrawerOpen() ? mobileOpenReflectiveElements : mobileClosedReflectiveElements;
  }
  return desktopReflectiveElements;
}
const handTracker = createHandTracker();
const audio = createWaterAudio();
const floaters = createFloaters();
const koi = createKoi();
const lanterns = createLanterns();
const dayCycle = createDayCycle();
const rain = createRain();
const splashes = createSplashes();
const quality = createAdaptiveQuality();

let hands = null;
let mirrorX = MIRROR_X;
let sensitivityIdx = 1; // Med
let currentThemeId = 'sunlit';
let bedIdx = 0; // Tiles
let waterCondIdx = 1; // Breeze
let zenMode = false;
let lightDragPointerId = null;
let lastCssVarSyncAt = 0;
let stormGustCooldown = 0;
let cssWidth = window.innerWidth;
let cssHeight = window.innerHeight;
let canvasRect = { left: 0, top: 0, width: cssWidth, height: cssHeight };
const activePointers = new Map();
const grabbedPointers = new Map();
const pendingDrops = new Map();
let lastProjectedFloaters = [];
let lastProjectedLanterns = [];
let currentSwellTime = 0;

function applyThemeCssVars(theme) {
  const vars = themeCssVars(theme);
  const rootStyle = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) {
    rootStyle.setProperty(key, value);
  }
}

function syncGroupSummaries() {
  const themeLabel = THEMES[currentThemeId] ? THEMES[currentThemeId].label : 'Sunlit';
  controlsMenu.setGroupSummary('lighting', dayCycle.isEnabled() ? `Cycle · ${themeLabel}` : themeLabel);

  const pondParts = [];
  if (koi.isEnabled()) pondParts.push('Koi');
  const lanternCount = lanterns.list().length;
  if (lanternCount > 0) pondParts.push(`${lanternCount} lantern${lanternCount > 1 ? 's' : ''}`);
  controlsMenu.setGroupSummary('pond', pondParts.length > 0 ? pondParts.join(' · ') : 'Still');

  const bedLabel = POOL_BEDS[POOL_BED_ORDER[bedIdx]].label;
  const waterLabel = WATER_CONDITIONS[WATER_CONDITION_ORDER[waterCondIdx]].label;
  const atmoParts = [bedLabel, waterLabel];
  if (rain.isEnabled()) atmoParts.unshift('Rain');
  controlsMenu.setGroupSummary('atmosphere', atmoParts.join(' · '));
}

function syncThemeButtons(themeId, cycleActive = false) {
  for (const btn of themeButtons) {
    const active = !cycleActive && btn.dataset.theme === themeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
  syncToggleButton(cycleButton, cycleActive);
  syncGroupSummaries();
}

function setTheme(themeId, immediate = false) {
  if (!THEMES[themeId]) return;
  currentThemeId = themeId;
  dayCycle.setEnabled(false);
  renderer.setCustomSunDir(null);
  renderer.setTheme(themeId, immediate);
  applyThemeCssVars(THEMES[themeId]);
  syncThemeButtons(themeId, false);
}

function setPoolBed(bedId, immediate = false) {
  const idx = POOL_BED_ORDER.indexOf(bedId);
  if (idx < 0) return;
  bedIdx = idx;
  const bed = POOL_BEDS[bedId];
  renderer.setBed(bedId, immediate);
  syncToggleButton(bedButton, bedId !== 'tiles', bed.label);
  syncGroupSummaries();
}

function setWaterCondition(condId, immediate = false) {
  const idx = WATER_CONDITION_ORDER.indexOf(condId);
  if (idx < 0) return;
  waterCondIdx = idx;
  const cond = WATER_CONDITIONS[condId];
  renderer.setWaterCondition(condId, immediate);
  syncToggleButton(waterButton, condId !== 'breeze', cond.label);
  syncGroupSummaries();
}

function setZenMode(next) {
  zenMode = Boolean(next);
  if (zenMode) controlsMenu.setDrawerOpen(false);
  document.body.classList.toggle('zen-mode', zenMode);
  if (!zenMode) document.body.classList.remove('zen-peek');
  syncToggleButton(zenButton, zenMode);
  buttonReflections.invalidate();
}

applyThemeCssVars(THEMES[currentThemeId]);
syncGroupSummaries();

function syncToggleButton(btn, active, label) {
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', String(active));
  if (label !== undefined) {
    const labelEl = typeof btn.querySelector === 'function' ? btn.querySelector('.btn-label') : null;
    if (labelEl) {
      if (labelEl.textContent !== label) {
        labelEl.textContent = label;
        buttonReflections.invalidate();
      }
    } else if (btn.textContent !== label) {
      btn.textContent = label;
      buttonReflections.invalidate();
    }
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, VIEW.maxDpr);
  const rect = canvas.getBoundingClientRect();
  cssWidth = rect.width || window.innerWidth;
  cssHeight = rect.height || window.innerHeight;
  canvasRect = {
    left: rect.left || 0,
    top: rect.top || 0,
    width: cssWidth,
    height: cssHeight,
  };
  // Adaptive quality scales only the WebGL backing store; HUD stays crisp at full dpr.
  const renderDpr = dpr * quality.scale();
  canvas.width = Math.max(1, Math.floor(cssWidth * renderDpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * renderDpr));
  renderer.resize();
  overlay.resize(cssWidth, cssHeight, dpr);
  buttonReflections.invalidate();
}

if (typeof ResizeObserver === 'function') {
  const uiLayoutObserver = new ResizeObserver(() => {
    buttonReflections.invalidate();
  });
  const topBar = document.querySelector('.top-bar');
  const camControls = document.querySelector('#cam-controls');
  if (topBar) uiLayoutObserver.observe(topBar);
  if (controlsDrawer) uiLayoutObserver.observe(controlsDrawer);
  if (camControls) uiLayoutObserver.observe(camControls);
}
if (mobileLayoutMq && typeof mobileLayoutMq.addEventListener === 'function') {
  mobileLayoutMq.addEventListener('change', () => {
    if (!mobileLayoutMq.matches) controlsMenu.setDrawerOpen(false);
    buttonReflections.invalidate();
  });
}
if (controlsToggle) {
  controlsToggle.addEventListener('click', () => {
    audio.unlock();
    controlsMenu.toggleDrawer();
    rippleUnderElement(controlsToggle);
  });
}
for (const headerBtn of document.querySelectorAll('[data-group-toggle]')) {
  headerBtn.addEventListener('click', () => {
    controlsMenu.toggleGroup(headerBtn.dataset.groupToggle);
  });
}
if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
  document.fonts.ready.then(() => buttonReflections.invalidate());
}

function queueDrop(key, drop) {
  if (!pendingDrops.has(key) && pendingDrops.size >= SIM.maxDrops) {
    const oldest = pendingDrops.keys().next().value;
    pendingDrops.delete(oldest);
  }
  pendingDrops.set(key, {
    u: drop.u,
    v: drop.v,
    radius: drop.radius,
    strength: drop.strength,
  });
  const worldX = drop.x !== undefined ? drop.x : (drop.u - 0.5) * 2 * POOL.halfExtent;
  const worldZ = drop.z !== undefined ? drop.z : (drop.v - 0.5) * 2 * POOL.halfExtent;
  floaters.applyImpulse(worldX, worldZ, drop.radius, drop.strength);
  lanterns.applyImpulse(worldX, worldZ, drop.radius, drop.strength);
}

function stamp(hit, speed, key = 'default', scale = 1) {
  queueDrop(key, {
    x: hit.x,
    z: hit.z,
    u: hit.u,
    v: hit.v,
    radius: DROP.radius,
    strength: impulseStrength(speed) * scale,
  });
}

function eventHit(event) {
  const ndcX = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - canvasRect.top) / canvasRect.height) * 2;
  return ndcWaterHit(
    ndcX,
    ndcY,
    CAMERA,
    canvas.width / canvas.height,
    POOL,
    currentSwellTime,
    WAVES,
  );
}

function aimLightFromEvent(event) {
  if (!canvasRect.width || !canvasRect.height) return;
  const ndcX = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - canvasRect.top) / canvasRect.height) * 2;
  renderer.setCustomSunDir(sunDirFromNdc(ndcX, ndcY));
}

function findFloatingBody(pick) {
  if (!pick) return null;
  if (pick.type === 'lantern' && lanterns.isEnabled()) {
    return lanterns.bodies().find((l) => l.id === pick.id) || null;
  }
  if (pick.type === 'floater' && floaters.isEnabled()) {
    return floaters.bodies().find((f) => f.id === pick.id && !f.falling && (f.altitude || 0) <= 0.001) || null;
  }
  return null;
}

function updateGrabCursor(canGrab) {
  const isGrabbing = grabbedPointers.size > 0;
  canvas.classList.toggle('is-grabbing', isGrabbing);
  canvas.classList.toggle('can-grab', !isGrabbing && Boolean(canGrab));
}

function releaseGrab(pointerId) {
  const grab = grabbedPointers.get(pointerId);
  if (!grab) return false;
  grab.body.grabbed = false;
  grab.body.vx = Math.max(-1.4, Math.min(1.4, (grab.vx || 0) * 0.55));
  grab.body.vz = Math.max(-1.4, Math.min(1.4, (grab.vz || 0) * 0.55));
  grabbedPointers.delete(pointerId);
  updateGrabCursor(false);
  return true;
}

canvas.addEventListener('pointerdown', (event) => {
  if (controlsMenu.isDrawerOpen()) {
    controlsMenu.setDrawerOpen(false);
  }
  if (event.altKey) {
    lightDragPointerId = event.pointerId;
    dayCycle.setEnabled(false);
    syncThemeButtons(currentThemeId, false);
    aimLightFromEvent(event);
    return;
  }

  const screenX = event.clientX - canvasRect.left;
  const screenY = event.clientY - canvasRect.top;
  const pick = pickFloatingObject(screenX, screenY, lastProjectedLanterns, lastProjectedFloaters);
  const body = findFloatingBody(pick);
  const hit = eventHit(event);

  if (body && hit) {
    // Enter silent Grab Mode: do NOT trigger water audio, splash, or koi startle
    body.grabbed = true;
    body.vx = 0;
    body.vz = 0;
    body.spin *= 0.25;
    grabbedPointers.set(event.pointerId, {
      type: pick.type,
      body,
      offsetX: hit.x - body.x,
      offsetZ: hit.z - body.z,
      prevX: body.x,
      prevZ: body.z,
      prevTime: performance.now(),
      vx: 0,
      vz: 0,
    });
    if (typeof canvas.setPointerCapture === 'function') {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on synthetic events
      }
    }
    updateGrabCursor(false);
    return;
  }

  audio.unlock();
  const now = performance.now();
  activePointers.set(event.pointerId, { hit, time: now, lastSprayAt: 0 });
  if (hit) {
    const pan = Math.max(-0.85, Math.min(0.85, hit.x / 1.15));
    stamp(hit, 0, `p:${event.pointerId}`, 0.95);
    splashes.spawnTap(hit.x, hit.z, 0.85, currentSwellTime);
    koi.reactToDisturbance(hit.x, hit.z, 0.9);
    audio.playDrop(0.85, now, pan);
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (lightDragPointerId === event.pointerId) {
    aimLightFromEvent(event);
    return;
  }

  const grab = grabbedPointers.get(event.pointerId);
  if (grab) {
    const hit = eventHit(event);
    if (hit) {
      const now = performance.now();
      const dt = Math.max(0.012, (now - grab.prevTime) / 1000);
      const maxX = grab.type === 'lantern' ? 0.96 : POOL.halfExtent - 0.12;
      const minZ = grab.type === 'lantern' ? -0.60 : -(POOL.halfExtent - 0.12);
      const maxZ = grab.type === 'lantern' ? 0.62 : POOL.halfExtent - 0.12;
      const nextX = Math.max(-maxX, Math.min(maxX, hit.x - grab.offsetX));
      const nextZ = Math.max(minZ, Math.min(maxZ, hit.z - grab.offsetZ));
      const dx = nextX - grab.prevX;
      const dz = nextZ - grab.prevZ;
      const moved = Math.hypot(dx, dz);

      grab.vx = grab.vx * 0.45 + (dx / dt) * 0.55;
      grab.vz = grab.vz * 0.45 + (dz / dt) * 0.55;
      grab.body.x = nextX;
      grab.body.z = nextZ;
      grab.body.vx = grab.vx;
      grab.body.vz = grab.vz;
      if (moved > 0.004) {
        grab.body.spin = Math.max(-1.6, Math.min(1.6, (dx * 0.8 - dz * 0.8) / dt * 0.14));
      }

      // Silent glassy wake ripple behind the dragged object (zero water sound)
      if (moved > 0.025) {
        const dragSpeed = Math.min(1.6, moved / dt);
        stamp(
          {
            x: nextX,
            z: nextZ,
            u: nextX / (2 * POOL.halfExtent) + 0.5,
            v: nextZ / (2 * POOL.halfExtent) + 0.5,
          },
          dragSpeed * 0.25,
          `grab:${event.pointerId}`,
          grab.type === 'lantern' ? 0.34 : 0.20,
        );
      }

      grab.prevX = nextX;
      grab.prevZ = nextZ;
      grab.prevTime = now;
    }
    return;
  }

  const prev = activePointers.get(event.pointerId);
  if (!prev) {
    if (event.pointerType === 'mouse') {
      const hoverPick = pickFloatingObject(
        event.clientX - canvasRect.left,
        event.clientY - canvasRect.top,
        lastProjectedLanterns,
        lastProjectedFloaters,
      );
      updateGrabCursor(Boolean(hoverPick));
      if (!hoverPick) {
        const hoverHit = eventHit(event);
        if (hoverHit) koi.setInterest(hoverHit.x, hoverHit.z, true);
      }
    }
    return;
  }
  const now = performance.now();
  const hit = eventHit(event);
  if (hit) {
    const dx = prev.hit ? hit.x - prev.hit.x : 0;
    const dz = prev.hit ? hit.z - prev.hit.z : 0;
    const distMoved = prev.hit ? Math.hypot(dx, dz) : 1;
    if (distMoved > 0.022) {
      const dt = Math.max(0.016, (now - prev.time) / 1000);
      const speed = Math.min(planarSpeed(prev.hit, hit, dt), 2.0);
      // Interpolate gentle wake stamps along fast drags so ripples stay glassy and continuous
      const subSteps = prev.hit ? Math.min(4, Math.max(1, Math.ceil(distMoved / 0.045))) : 1;
      const wakeScale = Math.min(0.34, 0.22 + speed * 0.06) / subSteps;
      for (let s = 1; s <= subSteps; s++) {
        const frac = s / subSteps;
        const ix = prev.hit ? prev.hit.x + dx * frac : hit.x;
        const iz = prev.hit ? prev.hit.z + dz * frac : hit.z;
        const interpHit = {
          x: ix,
          z: iz,
          u: ix / (2 * POOL.halfExtent) + 0.5,
          v: iz / (2 * POOL.halfExtent) + 0.5,
        };
        stamp(interpHit, speed * 0.35, `p:${event.pointerId}:${s}`, wakeScale);
      }
      let lastSprayAt = prev.lastSprayAt || 0;
      if (speed > 0.42 && now - lastSprayAt >= 48) {
        splashes.spawnSweep(hit.x, hit.z, dx, dz, speed, currentSwellTime);
        lastSprayAt = now;
      }
      if (speed > 0.35) koi.reactToDisturbance(hit.x, hit.z, Math.min(1.4, speed));
      if (speed > 0.08) {
        const pan = Math.max(-0.85, Math.min(0.85, hit.x / 1.15));
        audio.playSweep(speed, now, pan);
      }
      activePointers.set(event.pointerId, { hit, time: now, lastSprayAt });
    }
  }
});
canvas.addEventListener('pointerleave', () => {
  koi.setInterest(0, 0, false);
  updateGrabCursor(false);
});
window.addEventListener('pointerup', (event) => {
  if (lightDragPointerId === event.pointerId) lightDragPointerId = null;
  releaseGrab(event.pointerId);
  activePointers.delete(event.pointerId);
});
window.addEventListener('pointercancel', (event) => {
  if (lightDragPointerId === event.pointerId) lightDragPointerId = null;
  releaseGrab(event.pointerId);
  activePointers.delete(event.pointerId);
});
window.addEventListener('pointermove', (event) => {
  if (!zenMode) return;
  const nearTop = event.clientY <= 64;
  document.body.classList.toggle('zen-peek', nearTop);
});

function rippleUnderElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  if (!canvasRect.width || !canvasRect.height) return;
  const bRect = el.getBoundingClientRect();
  const cx = bRect.left + bRect.width * 0.5;
  const cy = bRect.top + bRect.height * 0.5;
  const ndcX = ((cx - canvasRect.left) / canvasRect.width) * 2 - 1;
  const ndcY = 1 - ((cy - canvasRect.top) / canvasRect.height) * 2;
  const hit = ndcWaterHit(
    ndcX,
    ndcY,
    CAMERA,
    canvas.width / canvas.height,
    POOL,
    currentSwellTime,
    WAVES,
  );
  if (hit) {
    stamp(hit, 0.15, `ui:${el.id || el.dataset.theme || 'btn'}`, 0.65);
  }
}

for (const btn of themeButtons) {
  btn.addEventListener('click', () => {
    audio.unlock();
    setTheme(btn.dataset.theme);
    rippleUnderElement(btn);
  });
}

function toggleRain(fromButton = false) {
  audio.unlock();
  const active = rain.toggle();
  syncToggleButton(rainButton, active);
  syncGroupSummaries();
  audio.setRainActive(active);
  if (fromButton && rainButton) rippleUnderElement(rainButton);
}

if (rainButton) {
  rainButton.addEventListener('click', () => {
    toggleRain(true);
  });
}

function dropPetal(fromButton = false) {
  audio.unlock();
  floaters.dropRandom();
  if (fromButton && petalsButton) rippleUnderElement(petalsButton);
}

if (petalsButton) {
  petalsButton.addEventListener('click', () => {
    dropPetal(true);
  });
}

function toggleKoi(fromButton = false) {
  audio.unlock();
  const active = koi.toggle();
  syncToggleButton(koiButton, active);
  syncGroupSummaries();
  if (fromButton && koiButton) rippleUnderElement(koiButton);
}

if (koiButton) {
  koiButton.addEventListener('click', () => {
    toggleKoi(true);
  });
}

function placeLantern(fromButton = false) {
  audio.unlock();
  const placed = lanterns.addRandom(floaters.isEnabled() ? floaters.bodies() : []);
  resolveBuoyantCollisions(
    floaters.isEnabled() ? floaters.bodies() : [],
    lanterns.bodies(),
    { iterations: 4 },
  );
  if (placed) {
    queueDrop(`lantern:${placed.id}`, placed);
    const pan = Math.max(-0.85, Math.min(0.85, placed.x / 1.15));
    audio.playDrop(0.32, performance.now(), pan);
    syncGroupSummaries();
  }
  if (fromButton && lanternButton) rippleUnderElement(lanternButton);
}

if (lanternButton) {
  lanternButton.addEventListener('click', () => {
    placeLantern(true);
  });
}

function toggleCycle(fromButton = false) {
  audio.unlock();
  const active = dayCycle.toggle(currentThemeId);
  if (active) renderer.setCustomSunDir(null);
  syncThemeButtons(currentThemeId, active);
  if (fromButton && cycleButton) rippleUnderElement(cycleButton);
}

if (cycleButton) {
  cycleButton.addEventListener('click', () => {
    toggleCycle(true);
  });
}

function cyclePoolBed(fromButton = false) {
  audio.unlock();
  const nextId = POOL_BED_ORDER[(bedIdx + 1) % POOL_BED_ORDER.length];
  setPoolBed(nextId);
  if (fromButton && bedButton) rippleUnderElement(bedButton);
}

if (bedButton) {
  bedButton.addEventListener('click', () => {
    cyclePoolBed(true);
  });
}

function cycleWaterCondition(fromButton = false) {
  audio.unlock();
  const nextId = WATER_CONDITION_ORDER[(waterCondIdx + 1) % WATER_CONDITION_ORDER.length];
  setWaterCondition(nextId);
  if (fromButton && waterButton) rippleUnderElement(waterButton);
}

if (waterButton) {
  waterButton.addEventListener('click', () => {
    cycleWaterCondition(true);
  });
}

if (zenButton) {
  zenButton.addEventListener('click', () => {
    setZenMode(!zenMode);
  });
}

if (zenExitButton) {
  zenExitButton.addEventListener('click', () => {
    setZenMode(false);
  });
}

if (soundButton) {
  soundButton.addEventListener('click', () => {
    const muted = audio.toggleMute();
    syncToggleButton(soundButton, !muted, muted ? 'Sound: Off' : 'Sound');
    rippleUnderElement(soundButton);
  });
}

if (mirrorButton) {
  mirrorButton.addEventListener('click', () => {
    mirrorX = !mirrorX;
    overlay.setMirrored(mirrorX);
    buttonReflections.invalidate();
    rippleUnderElement(mirrorButton);
  });
}

if (sensitivityButton) {
  sensitivityButton.addEventListener('click', () => {
    sensitivityIdx = (sensitivityIdx + 1) % SENSITIVITY_LEVELS.length;
    overlay.setSensitivityLabel(SENSITIVITY_LEVELS[sensitivityIdx].label);
    buttonReflections.invalidate();
    rippleUnderElement(sensitivityButton);
  });
}

if (toggleButton) {
  toggleButton.addEventListener('click', () => {
    overlay.toggle();
    buttonReflections.invalidate();
    rippleUnderElement(toggleButton);
  });
}

window.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key >= '1' && key <= '4') {
    const themeId = THEME_ORDER[Number(key) - 1];
    if (themeId) setTheme(themeId);
  } else if (key === 'r') {
    toggleRain(false);
  } else if (key === 'p') {
    dropPetal(false);
  } else if (key === 'l') {
    placeLantern(false);
  } else if (key === 'k') {
    toggleKoi(false);
  } else if (key === 'b') {
    cyclePoolBed(false);
  } else if (key === 'w') {
    cycleWaterCondition(false);
  } else if (key === 't') {
    toggleCycle(false);
  } else if (key === 'h') {
    setZenMode(!zenMode);
  } else if (key === 'escape') {
    if (zenMode) {
      setZenMode(false);
    } else if (controlsMenu.isDrawerOpen()) {
      controlsMenu.setDrawerOpen(false);
    }
  } else if (key === 'm') {
    const muted = audio.toggleMute();
    syncToggleButton(soundButton, !muted, muted ? 'Sound: Off' : 'Sound');
  } else if (key === 'c' && hands) {
    overlay.toggle();
    buttonReflections.invalidate();
  }
});

button.addEventListener('click', async () => {
  audio.unlock();
  if (!window.isSecureContext) {
    button.textContent = 'Open this page on localhost.';
    buttonReflections.invalidate();
    return;
  }
  button.disabled = true;
  button.textContent = 'Starting the camera…';
  buttonReflections.invalidate();
  let stream = null;
  try {
    const [mediaStream, handsModule] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      }),
      import('./input/hands.js'),
    ]);
    stream = mediaStream;
    video.srcObject = stream;
    await video.play();
    hands = await handsModule.createHands(video);
    gate.classList.add('hidden');
    overlay.setCameraActive(true);
    overlay.setMirrored(mirrorX);
    overlay.setSensitivityLabel(SENSITIVITY_LEVELS[sensitivityIdx].label);
    buttonReflections.invalidate();
  } catch (error) {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    }
    button.disabled = false;
    button.textContent = 'Camera blocked. Click and drag the water instead.';
    buttonReflections.invalidate();
  }
});

// Optional URL parameters for sharing or testing specific pool presets
if (typeof window !== 'undefined' && window.location && window.location.search) {
  const params = new URLSearchParams(window.location.search);
  const qTheme = params.get('theme');
  if (qTheme && THEMES[qTheme]) setTheme(qTheme, true);
  const qBed = params.get('bed');
  if (qBed && POOL_BEDS[qBed]) setPoolBed(qBed, true);
  const qWater = params.get('water');
  if (qWater && WATER_CONDITIONS[qWater]) setWaterCondition(qWater, true);
  const qLanterns = params.get('lanterns');
  if (qLanterns === 'true' || qLanterns === '1') {
    for (let i = 0; i < 4; i++) {
      lanterns.addLantern({ immediate: true }, floaters.bodies());
    }
  } else if (qLanterns) {
    const n = Math.min(6, Math.max(0, Number.parseInt(qLanterns, 10) || 0));
    for (let i = 0; i < n; i++) {
      lanterns.addLantern({ immediate: true }, floaters.bodies());
    }
  }
  if (params.get('koi') === '0' || params.get('koi') === 'false') {
    koi.setEnabled(false);
    syncToggleButton(koiButton, false);
  }
  if (params.get('cycle') === '1' || params.get('cycle') === 'true') {
    dayCycle.setEnabled(true, currentThemeId);
    syncThemeButtons(currentThemeId, true);
  }
  if (params.get('zen') === '1' || params.get('zen') === 'true') {
    setZenMode(true);
  }
  syncGroupSummaries();
}

resolveBuoyantCollisions(
  floaters.isEnabled() ? floaters.bodies() : [],
  lanterns.isEnabled() ? lanterns.bodies() : [],
  { iterations: 6 },
);

resize();
window.addEventListener('resize', resize);

let last = performance.now();
let accumulator = 0;
const start = performance.now();

function frame(now) {
  if (quality.update(now) !== null) resize();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const elapsedSeconds = Math.max(0, (now - start) / 1000);
  const waterCond = WATER_CONDITIONS[WATER_CONDITION_ORDER[waterCondIdx]];
  currentSwellTime += dt * SWELL_TIME_SCALE * waterCond.swellSpeed;
  const aspect = canvas.width / canvas.height;

  // Smooth daylight / time-of-day cycle
  let hudTheme = THEMES[currentThemeId];
  if (dayCycle.isEnabled()) {
    const cycleSample = dayCycle.step(dt);
    hudTheme = cycleSample.theme;
    if (cycleSample.nearestThemeId !== currentThemeId) {
      currentThemeId = cycleSample.nearestThemeId;
      syncGroupSummaries();
    }
    renderer.setCustomTheme(cycleSample.theme);
    if (now - lastCssVarSyncAt > 180) {
      applyThemeCssVars(cycleSample.theme);
      lastCssVarSyncAt = now;
    }
  } else {
    const liveSunDir = renderer.getActiveTheme().sunDir;
    hudTheme = { ...THEMES[currentThemeId], sunDir: liveSunDir };
  }

  // Subtle ambient wind-gust ripples during Storm preset
  if (waterCond.id === 'storm') {
    stormGustCooldown -= dt;
    if (stormGustCooldown <= 0) {
      stormGustCooldown = 0.28 + Math.random() * 0.32;
      const gx = (Math.random() * 2 - 1) * 1.1;
      const gz = (Math.random() * 2 - 1) * 0.72;
      queueDrop(`gust:${Math.floor(now)}`, {
        x: gx,
        z: gz,
        u: gx / (2 * POOL.halfExtent) + 0.5,
        v: gz / (2 * POOL.halfExtent) + 0.5,
        radius: 0.026,
        strength: -0.022,
      });
    }
  }

  // Visible falling raindrops, impact splashes, ripples & raindrop/thunder sound effects
  const mvp = renderer.getMvp();
  const rainFrame = rain.step(dt, now, CAMERA, aspect, POOL, currentSwellTime, mvp);
  for (const rainDrop of rainFrame.drops) {
    queueDrop(rainDrop.key, rainDrop);
    audio.playRainDrop(rainDrop.intensity || 0.7, now);
  }
  if (rainFrame.thunder) {
    audio.playThunder(rainFrame.thunder.intensity, now);
  }

  // Webcam multi-hand gestures (5-finger, palm sweep, plunge/fist splash, 2-hand clap)
  let indicators = [];
  if (hands) {
    const sample = hands.sample();
    const tracked = handTracker.update(sample, CAMERA, aspect, POOL, currentSwellTime, now, {
      mirrorX,
      plungeRateMultiplier: SENSITIVITY_LEVELS[sensitivityIdx].rateMultiplier,
    });
    for (const drop of tracked.drops) {
      queueDrop(drop.key, drop);
      if (drop.kind === 'clap') {
        audio.playClap(now);
        splashes.spawnBurst(drop.x, drop.z, 1.55, currentSwellTime);
        koi.reactToDisturbance(drop.x, drop.z, 1.8);
      } else if (drop.kind === 'splash') {
        audio.playSplash(1.0, now);
        splashes.spawnBurst(drop.x, drop.z, 1.15, currentSwellTime);
        koi.reactToDisturbance(drop.x, drop.z, 1.3);
      } else if (drop.kind === 'palm') {
        const pan = Math.max(-0.85, Math.min(0.85, (drop.x || 0) / 1.15));
        audio.playSweep(drop.speed || 1.0, now, pan);
      } else if (sample && sample.fresh && drop.kind === 'finger') {
        const pan = Math.max(-0.85, Math.min(0.85, (drop.x || 0) / 1.15));
        audio.playDrop(Math.min(1, 0.45 + (drop.speed || 0) * 0.3), now, pan);
      }
    }
    indicators = tracked.indicators;
    if (overlay.setGestureLabel(tracked.gestureLabel)) {
      buttonReflections.invalidate();
    }
  }

  // Fixed-step heightfield simulation + floating blossoms & water lanterns physics
  accumulator += dt;
  let steps = 0;
  const landedPetals = [];
  while (accumulator >= SIM.stepSeconds && steps < SIM.maxStepsPerFrame) {
    renderer.step(pendingDrops.size > 0 ? Array.from(pendingDrops.values()) : null);
    pendingDrops.clear();
    const landed = floaters.step(SIM.stepSeconds, currentSwellTime, WAVES);
    if (landed.length > 0) landedPetals.push(...landed);
    lanterns.step(SIM.stepSeconds, currentSwellTime, WAVES, waterCond.windDrift);
    resolveBuoyantCollisions(
      floaters.isEnabled() ? floaters.bodies() : [],
      lanterns.isEnabled() ? lanterns.bodies() : [],
    );
    accumulator -= SIM.stepSeconds;
    steps += 1;
  }
  for (const petal of landedPetals) {
    queueDrop(`petal:${petal.id}`, petal);
    audio.playDrop(0.28, now);
  }

  const uiPills = buttonReflections.collect(
    getReflectiveUiElements(),
    canvasRect,
    canvas.width,
    canvas.height,
    dt,
  );
  const koiData = koi.step(dt);
  const lanternData = lanterns.pack();
  const lightningIntensity = rainFrame.visuals.lightning ? rainFrame.visuals.lightning.intensity : 0;
  const rainIntensity = rainFrame.visuals.intensity || 0;
  renderer.draw(
    elapsedSeconds,
    uiPills,
    lightningIntensity,
    rainIntensity,
    koiData,
    lanternData,
    currentSwellTime,
  );

  // Project visible floating blossoms, water lanterns and interactive water splashes onto HUD canvas
  const swellScale = renderer.getSwellScale();
  const interactionSplashes = splashes.step(dt, CAMERA, aspect, mvp);
  const projectedFloaters = [];
  if (floaters.isEnabled()) {
    for (const item of floaters.list()) {
      const p = projectFloater(
        item,
        CAMERA,
        aspect,
        cssWidth,
        cssHeight,
        currentSwellTime,
        WAVES,
        mvp,
        hudTheme ? hudTheme.sunDir : null,
      );
      if (p) projectedFloaters.push(p);
    }
    projectedFloaters.sort((a, b) => (a.altitude || 0) - (b.altitude || 0));
  }
  const projectedLanterns = [];
  if (lanterns.isEnabled()) {
    for (const item of lanterns.list()) {
      const p = projectLantern(
        item,
        CAMERA,
        aspect,
        cssWidth,
        cssHeight,
        currentSwellTime,
        WAVES,
        mvp,
        swellScale,
      );
      if (p) projectedLanterns.push(p);
    }
    projectedLanterns.sort((a, b) => b.depth - a.depth);
  }
  lastProjectedFloaters = projectedFloaters;
  lastProjectedLanterns = projectedLanterns;
  overlay.draw(indicators, now, {
    floaters: projectedFloaters,
    lanterns: projectedLanterns,
    rain: rainFrame.visuals,
    splashes: interactionSplashes,
    theme: hudTheme,
    occluders: uiPills.cssPills,
  });

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
