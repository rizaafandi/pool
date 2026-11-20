import { DAY_CYCLE, THEME_ORDER, THEMES } from '../config.js';
import { norm } from '../math.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec3(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function parseRgba(str) {
  const m = typeof str === 'string' && str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return [255, 255, 255, 1];
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
}

function lerpRgba(aStr, bStr, t) {
  const a = parseRgba(aStr);
  const b = parseRgba(bStr);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  const al = lerp(a[3], b[3], t).toFixed(3);
  return `rgba(${r}, ${g}, ${bl}, ${al})`;
}

function lerpRgbArray(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function sunDirFromNdc(ndcX, ndcY) {
  const clampedX = Math.max(-1, Math.min(1, ndcX));
  const clampedY = Math.max(-1, Math.min(1, ndcY));
  const sx = clampedX * 0.85;
  const sz = -clampedY * 0.82;
  const horiz2 = sx * sx + sz * sz;
  const sy = Math.max(0.36, Math.sqrt(Math.max(0.13, 1.0 - horiz2 * 0.55)));
  return norm([sx, sy, sz]);
}

export function interpolateTheme(a, b, rawT, arcAngle = null) {
  const t = smoothstep01(rawT);
  let sunDir = norm(lerpVec3(a.sunDir, b.sunDir, t));
  if (arcAngle !== null) {
    // Smooth celestial arc sweeping across the sky so caustics & shadows glide organically
    const arcX = Math.sin(arcAngle) * 0.62;
    const arcZ = 0.28 + Math.cos(arcAngle) * 0.34;
    const arcY = 0.58 + 0.30 * (0.5 + 0.5 * Math.cos(arcAngle * 2.0));
    sunDir = norm([
      lerp(sunDir[0], arcX, 0.65),
      lerp(sunDir[1], arcY, 0.65),
      lerp(sunDir[2], arcZ, 0.65),
    ]);
  }
  return {
    id: t < 0.5 ? a.id : b.id,
    label: t < 0.5 ? a.label : b.label,
    sunDir,
    sunColor: lerpVec3(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    tileDark: lerpVec3(a.tileDark, b.tileDark, t),
    tileMid: lerpVec3(a.tileMid, b.tileMid, t),
    tileBright: lerpVec3(a.tileBright, b.tileBright, t),
    groutCol: lerpVec3(a.groutCol, b.groutCol, t),
    skyDeep: lerpVec3(a.skyDeep, b.skyDeep, t),
    skyMid: lerpVec3(a.skyMid, b.skyMid, t),
    skyBright: lerpVec3(a.skyBright, b.skyBright, t),
    causticTint: lerpVec3(a.causticTint, b.causticTint, t),
    shaftStrength: lerp(a.shaftStrength, b.shaftStrength, t),
    biolum: lerp(a.biolum, b.biolum, t),
    nightGlow: lerp(a.nightGlow, b.nightGlow, t),
    petalBase: lerpRgba(a.petalBase, b.petalBase, t),
    petalMid: lerpRgba(a.petalMid, b.petalMid, t),
    petalColor: lerpRgba(a.petalColor, b.petalColor, t),
    petalEdge: lerpRgba(a.petalEdge, b.petalEdge, t),
    petalVein: lerpRgba(a.petalVein, b.petalVein, t),
    petalCore: lerpRgba(a.petalCore, b.petalCore, t),
    petalStamen: lerpRgba(a.petalStamen, b.petalStamen, t),
    leafBase: lerpRgba(a.leafBase, b.leafBase, t),
    leafMid: lerpRgba(a.leafMid, b.leafMid, t),
    leafEdge: lerpRgba(a.leafEdge, b.leafEdge, t),
    leafVein: lerpRgba(a.leafVein, b.leafVein, t),
    rainRgb: lerpRgbArray(a.rainRgb, b.rainRgb, t),
    rainTipRgb: lerpRgbArray(a.rainTipRgb, b.rainTipRgb, t),
  };
}

export function createDayCycle(options = {}) {
  const cycleSeconds = Math.max(4, options.cycleSeconds || DAY_CYCLE.cycleSeconds);
  let enabled = Boolean(options.enabled);
  let progress = typeof options.initialProgress === 'number' ? ((options.initialProgress % 1) + 1) % 1 : 0;

  function sampleAt(p) {
    const n = THEME_ORDER.length;
    const scaled = (((p % 1) + 1) % 1) * n;
    const idxA = Math.floor(scaled) % n;
    const idxB = (idxA + 1) % n;
    const frac = scaled - Math.floor(scaled);
    const themeA = THEMES[THEME_ORDER[idxA]];
    const themeB = THEMES[THEME_ORDER[idxB]];
    const arcAngle = p * Math.PI * 2;
    const theme = interpolateTheme(themeA, themeB, frac, arcAngle);
    return {
      progress: ((p % 1) + 1) % 1,
      nearestThemeId: theme.id,
      theme,
    };
  }

  return {
    isEnabled() {
      return enabled;
    },

    setEnabled(next, fromThemeId = null) {
      enabled = Boolean(next);
      if (enabled && fromThemeId) {
        const idx = THEME_ORDER.indexOf(fromThemeId);
        if (idx >= 0) progress = idx / THEME_ORDER.length;
      }
      return enabled;
    },

    toggle(fromThemeId = null) {
      return this.setEnabled(!enabled, fromThemeId);
    },

    getProgress() {
      return progress;
    },

    setProgress(p) {
      progress = ((p % 1) + 1) % 1;
      return sampleAt(progress);
    },

    step(dtSeconds) {
      if (enabled && dtSeconds > 0) {
        progress = (progress + Math.min(0.1, dtSeconds) / cycleSeconds) % 1;
      }
      return sampleAt(progress);
    },
  };
}
