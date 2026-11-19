import { createWaterAudio } from './audio/waterAudio.js';
import {
  CAMERA,
  DROP,
  MIRROR_X,
  POOL,
  SENSITIVITY_LEVELS,
  SIM,
  SWELL_TIME_SCALE,
  THEME_ORDER,
  THEMES,
  VIEW,
  WAVES,
} from './config.js';
import { createHands } from './input/hands.js';
import { createHandTracker } from './input/handTracker.js';
import { impulseStrength, ndcWaterHit, planarSpeed } from './input/touch.js';
import { createRenderer } from './render/renderer.js';
import { createAdaptiveQuality } from './perf/adaptiveQuality.js';
import { createFloaters, projectFloater } from './sim/floaters.js';
import { createRain } from './sim/rain.js';
import { createButtonReflectionTracker, themeCssVars } from './ui/buttonReflections.js';
import { createOverlay } from './ui/overlay.js';

const canvas = document.querySelector('#pool');
const hudCanvas = document.querySelector('#hud');
const video = document.querySelector('#cam');
const toggleButton = document.querySelector('#cam-toggle');
const gestureBadge = document.querySelector('#gesture-badge');
const mirrorButton = document.querySelector('#mirror-toggle');
const sensitivityButton = document.querySelector('#sens-toggle');
const rainButton = document.querySelector('#rain-toggle');
const petalsButton = document.querySelector('#petals-toggle');
const soundButton = document.querySelector('#sound-toggle');
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
const reflectiveUiElements = [
  ...themeButtons,
  rainButton,
  petalsButton,
  soundButton,
  mirrorButton,
  sensitivityButton,
  toggleButton,
  gestureBadge,
  button,
].filter(Boolean);
const handTracker = createHandTracker();
const audio = createWaterAudio();
const floaters = createFloaters();
const rain = createRain();
const quality = createAdaptiveQuality();

let hands = null;
let mirrorX = MIRROR_X;
let sensitivityIdx = 1; // Med
let currentThemeId = 'sunlit';
let cssWidth = window.innerWidth;
let cssHeight = window.innerHeight;
const activePointers = new Map();
const pendingDrops = new Map();
let currentSwellTime = 0;

function applyThemeCssVars(theme) {
  const vars = themeCssVars(theme);
  const rootStyle = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) {
    rootStyle.setProperty(key, value);
  }
}

function setTheme(themeId) {
  if (!THEMES[themeId]) return;
  currentThemeId = themeId;
  renderer.setTheme(themeId);
  applyThemeCssVars(THEMES[themeId]);
  for (const btn of themeButtons) {
    const active = btn.dataset.theme === themeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
}

applyThemeCssVars(THEMES[currentThemeId]);

function syncToggleButton(btn, active, label) {
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', String(active));
  if (label !== undefined) btn.textContent = label;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, VIEW.maxDpr);
  const rect = canvas.getBoundingClientRect();
  cssWidth = rect.width || window.innerWidth;
  cssHeight = rect.height || window.innerHeight;
  // Adaptive quality scales only the WebGL backing store; HUD stays crisp at full dpr.
  const renderDpr = dpr * quality.scale();
  canvas.width = Math.max(1, Math.floor(cssWidth * renderDpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * renderDpr));
  renderer.resize();
  overlay.resize(cssWidth, cssHeight, dpr);
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
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
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

canvas.addEventListener('pointerdown', (event) => {
  audio.unlock();
  const now = performance.now();
  const hit = eventHit(event);
  activePointers.set(event.pointerId, { hit, time: now });
  if (hit) {
    stamp(hit, 0, `p:${event.pointerId}`, 0.95);
    audio.playDrop(0.85, now);
  }
});
canvas.addEventListener('pointermove', (event) => {
  const prev = activePointers.get(event.pointerId);
  if (!prev) return;
  const now = performance.now();
  const hit = eventHit(event);
  if (hit) {
    const distMoved = prev.hit ? Math.hypot(hit.x - prev.hit.x, hit.z - prev.hit.z) : 1;
    if (distMoved > 0.022) {
      const dt = Math.max(0.02, (now - prev.time) / 1000);
      const speed = Math.min(planarSpeed(prev.hit, hit, dt), 0.8);
      stamp(hit, speed * 0.35, `p:${event.pointerId}`, 0.28);
      if (speed > 0.35) audio.playSweep(speed, now);
      activePointers.set(event.pointerId, { hit, time: now });
    }
  }
});
window.addEventListener('pointerup', (event) => {
  activePointers.delete(event.pointerId);
});
window.addEventListener('pointercancel', (event) => {
  activePointers.delete(event.pointerId);
});

function rippleUnderElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const cRect = canvas.getBoundingClientRect();
  if (!cRect.width || !cRect.height) return;
  const bRect = el.getBoundingClientRect();
  const cx = bRect.left + bRect.width * 0.5;
  const cy = bRect.top + bRect.height * 0.5;
  const ndcX = ((cx - cRect.left) / cRect.width) * 2 - 1;
  const ndcY = 1 - ((cy - cRect.top) / cRect.height) * 2;
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
  audio.setRainActive(active);
  if (fromButton && rainButton) rippleUnderElement(rainButton);
}

if (rainButton) {
  rainButton.addEventListener('click', () => {
    toggleRain(true);
  });
}

if (petalsButton) {
  petalsButton.addEventListener('click', () => {
    audio.unlock();
    syncToggleButton(petalsButton, floaters.toggle());
    rippleUnderElement(petalsButton);
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
    rippleUnderElement(mirrorButton);
  });
}

if (sensitivityButton) {
  sensitivityButton.addEventListener('click', () => {
    sensitivityIdx = (sensitivityIdx + 1) % SENSITIVITY_LEVELS.length;
    overlay.setSensitivityLabel(SENSITIVITY_LEVELS[sensitivityIdx].label);
    rippleUnderElement(sensitivityButton);
  });
}

if (toggleButton) {
  toggleButton.addEventListener('click', () => {
    overlay.toggle();
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
    syncToggleButton(petalsButton, floaters.toggle());
  } else if (key === 'm') {
    const muted = audio.toggleMute();
    syncToggleButton(soundButton, !muted, muted ? 'Sound: Off' : 'Sound');
  } else if (key === 'c' && hands) {
    overlay.toggle();
  }
});

button.addEventListener('click', async () => {
  audio.unlock();
  if (!window.isSecureContext) {
    button.textContent = 'Open this page on localhost.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Starting the camera…';
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    hands = await createHands(video);
    gate.classList.add('hidden');
    overlay.setCameraActive(true);
    overlay.setMirrored(mirrorX);
    overlay.setSensitivityLabel(SENSITIVITY_LEVELS[sensitivityIdx].label);
  } catch (error) {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    }
    button.disabled = false;
    button.textContent = 'Camera blocked. Click and drag the water instead.';
  }
});

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
  currentSwellTime = elapsedSeconds * SWELL_TIME_SCALE;
  const aspect = canvas.width / canvas.height;

  // Visible falling raindrops, impact splashes, ripples & raindrop sound effects
  const rainFrame = rain.step(dt, now, CAMERA, aspect, POOL, currentSwellTime);
  for (const rainDrop of rainFrame.drops) {
    queueDrop(rainDrop.key, rainDrop);
    audio.playRainDrop(rainDrop.intensity || 0.7, now);
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
      if (drop.kind === 'clap') audio.playClap(now);
      else if (drop.kind === 'splash') audio.playSplash(1.0, now);
      else if (drop.kind === 'palm') audio.playSweep(drop.speed || 1.0, now);
      else if (sample && sample.fresh && drop.kind === 'finger') {
        audio.playDrop(Math.min(1, 0.45 + (drop.speed || 0) * 0.3), now);
      }
    }
    indicators = tracked.indicators;
    overlay.setGestureLabel(tracked.gestureLabel);
  }

  // Fixed-step heightfield simulation + floating blossoms physics
  accumulator += dt;
  let steps = 0;
  while (accumulator >= SIM.stepSeconds && steps < SIM.maxStepsPerFrame) {
    renderer.step(pendingDrops.size > 0 ? Array.from(pendingDrops.values()) : null);
    pendingDrops.clear();
    floaters.step(SIM.stepSeconds, currentSwellTime, WAVES);
    accumulator -= SIM.stepSeconds;
    steps += 1;
  }

  const uiPills = buttonReflections.collect(
    reflectiveUiElements,
    canvas.getBoundingClientRect(),
    canvas.width,
    canvas.height,
    dt,
  );
  renderer.draw(elapsedSeconds, uiPills);

  // Project visible floating blossoms onto HUD canvas
  const projectedFloaters = [];
  if (floaters.isEnabled()) {
    const mvp = renderer.getMvp();
    for (const item of floaters.list()) {
      const p = projectFloater(item, CAMERA, aspect, cssWidth, cssHeight, currentSwellTime, WAVES, mvp);
      if (p) projectedFloaters.push(p);
    }
  }
  overlay.draw(indicators, now, {
    floaters: projectedFloaters,
    rain: rainFrame.visuals,
    theme: THEMES[currentThemeId],
    occluders: uiPills.cssPills,
  });

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
