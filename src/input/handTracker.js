import { CLAP, DROP, MIRROR_X, PALM, SPLASH, WAVES } from '../config.js';
import {
  classifyHand,
  fingertipHit,
  impulseStrength,
  palmImpulseStrength,
  planarSpeed,
  plungeStrength,
} from './touch.js';

const MATCH_MAX_DIST = 0.25;
const FIST_CLOSE_WINDOW_MS = 350;
const STALE_FRAME_MS = 600;

function screenPoint(landmark, mirrorX) {
  return {
    screenX: mirrorX ? 1 - landmark.x : landmark.x,
    screenY: landmark.y,
  };
}

function makeSlot() {
  return {
    lastTime: null,
    lastMode: null,
    lastOpenAt: -Infinity,
    lastSpan: 0,
    lastPalm: null,
    lastPalmHit: null,
    lastSplashAt: -Infinity,
    tipHits: new Map(),
    steadyDrops: [],
    steadyIndicators: [],
  };
}

function matchSlots(prevSlots, classified) {
  const assigned = new Array(classified.length).fill(null);
  const usedPrev = new Set();
  const pairs = [];
  for (let i = 0; i < classified.length; i++) {
    const c = classified[i];
    if (!c) continue;
    for (let j = 0; j < prevSlots.length; j++) {
      const s = prevSlots[j];
      if (!s || !s.lastPalm) continue;
      const d = Math.hypot(c.palm.x - s.lastPalm.x, c.palm.y - s.lastPalm.y);
      if (d <= MATCH_MAX_DIST) pairs.push({ i, j, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { i, j } of pairs) {
    if (assigned[i] || usedPrev.has(j)) continue;
    assigned[i] = prevSlots[j];
    usedPrev.add(j);
  }
  for (let i = 0; i < classified.length; i++) {
    if (!assigned[i]) assigned[i] = makeSlot();
  }
  return assigned;
}

export function createHandTracker() {
  let slots = [];
  let prevPairDist = null;
  let prevPairAt = null;
  let lastClapAt = -Infinity;
  let lastFreshAt = -Infinity;
  let cachedGestureLabel = '';

  return {
    update(sample, camera, aspect, pool, swellTime, nowMs, options = {}) {
      const mirrorX = options.mirrorX !== undefined ? options.mirrorX : MIRROR_X;
      const plungeRateMultiplier = options.plungeRateMultiplier !== undefined ? options.plungeRateMultiplier : 1;

      if (!sample || !Array.isArray(sample.hands)) {
        slots = [];
        prevPairDist = null;
        prevPairAt = null;
        cachedGestureLabel = '';
        return { drops: [], indicators: [], gestureLabel: '' };
      }

      if (!sample.fresh) {
        if (nowMs - lastFreshAt > STALE_FRAME_MS) {
          // Camera stream froze or ended: drop all contacts and HUD markers.
          slots = [];
          prevPairDist = null;
          prevPairAt = null;
          cachedGestureLabel = '';
          return { drops: [], indicators: [], gestureLabel: '' };
        }
        const drops = [];
        const indicators = [];
        for (const slot of slots) {
          for (const d of slot.steadyDrops) drops.push(d);
          for (const ind of slot.steadyIndicators) indicators.push(ind);
        }
        return { drops, indicators, gestureLabel: cachedGestureLabel };
      }
      lastFreshAt = nowMs;

      const classified = sample.hands.map((entry) => (
        entry && entry.landmarks ? classifyHand(entry.landmarks) : null
      ));
      slots = matchSlots(slots, classified);
      const drops = [];
      const indicators = [];
      let gestureLabel = '';
      let labelPriority = 0;

      const setLabel = (label, priority) => {
        if (priority > labelPriority) {
          labelPriority = priority;
          gestureLabel = label;
        }
      };

      // Check 2-hand clap shockwave when two hands converge rapidly
      if (classified.length >= 2 && classified[0] && classified[1]) {
        const p0 = classified[0].palm;
        const p1 = classified[1].palm;
        const pairDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
        const pairDt = prevPairAt !== null && nowMs > prevPairAt ? (nowMs - prevPairAt) / 1000 : 0;
        const closingSpeed = prevPairDist !== null && pairDt > 0
          ? (prevPairDist - pairDist) / pairDt
          : 0;
        const clapReady = nowMs - lastClapAt >= CLAP.cooldownMs;
        if (
          clapReady
          && prevPairDist !== null
          && prevPairDist > CLAP.maxDist
          && pairDist <= CLAP.maxDist
          && closingSpeed >= CLAP.minClosingSpeed
        ) {
          const midPalm = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5, z: 0 };
          const midHit = fingertipHit(midPalm, camera, aspect, pool, swellTime, WAVES, mirrorX);
          if (midHit) {
            drops.push({
              key: 'h:clap',
              x: midHit.x,
              z: midHit.z,
              u: midHit.u,
              v: midHit.v,
              radius: CLAP.radius,
              strength: CLAP.strength,
              kind: 'clap',
            });
            indicators.push({
              key: 'h:clap',
              ...screenPoint(midPalm, mirrorX),
              kind: 'clap',
              radiusPx: 38,
            });
            lastClapAt = nowMs;
            setLabel('Clap Shockwave', 5);
          }
        }
        prevPairDist = pairDist;
        prevPairAt = nowMs;
      } else {
        prevPairDist = null;
        prevPairAt = null;
      }

      for (let i = 0; i < classified.length; i++) {
        const slot = slots[i];
        const info = classified[i];
        slot.steadyDrops = [];
        slot.steadyIndicators = [];
        if (!info) {
          slots[i] = makeSlot();
          continue;
        }

        const { mode, tips, palm, span } = info;
        const hasPrev = slot.lastTime !== null;
        const dt = hasPrev && nowMs > slot.lastTime ? (nowMs - slot.lastTime) / 1000 : 0;
        const palmHit = fingertipHit(palm, camera, aspect, pool, swellTime, WAVES, mirrorX);

        // Check one-shot splash triggers (Z-plunge or multi-frame open-to-fist close)
        const cooldownReady = nowMs - slot.lastSplashAt >= SPLASH.cooldownMs;
        let splashed = false;
        if (hasPrev && cooldownReady && palmHit) {
          const plunge = (mode === 'fist' || mode === 'open')
            ? plungeStrength(slot.lastSpan, span, dt, plungeRateMultiplier)
            : 0;
          const fistClose = mode === 'fist'
            && slot.lastMode !== 'fist'
            && (nowMs - slot.lastOpenAt <= FIST_CLOSE_WINDOW_MS);
          if (plunge < 0 || fistClose) {
            const strength = plunge < 0 ? plunge : SPLASH.strength;
            const splashDrop = {
              key: `h:${i}:splash`,
              x: palmHit.x,
              z: palmHit.z,
              u: palmHit.u,
              v: palmHit.v,
              radius: SPLASH.radius,
              strength,
              kind: 'splash',
            };
            const splashInd = {
              key: `h:${i}:splash`,
              ...screenPoint(palm, mirrorX),
              kind: 'splash',
              radiusPx: 28,
            };
            drops.push(splashDrop);
            indicators.push(splashInd);
            slot.lastSplashAt = nowMs;
            slot.lastOpenAt = -Infinity;
            splashed = true;
            setLabel('Splash!', 4);
          }
        }

        const nextTipHits = new Map();
        const palmSpeed = planarSpeed(slot.lastPalmHit, palmHit, dt);

        if (mode === 'open' && palmSpeed >= PALM.sweepSpeed && palmHit) {
          const palmDrop = {
            key: `h:${i}:palm`,
            x: palmHit.x,
            z: palmHit.z,
            u: palmHit.u,
            v: palmHit.v,
            radius: PALM.radius,
            strength: palmImpulseStrength(palmSpeed),
            kind: 'palm',
            speed: palmSpeed,
          };
          const palmInd = {
            key: `h:${i}:palm`,
            ...screenPoint(palm, mirrorX),
            kind: 'palm',
            radiusPx: 30,
          };
          drops.push(palmDrop);
          indicators.push(palmInd);
          slot.steadyIndicators.push(palmInd);
          setLabel('Palm Sweep', 3);
        } else if (mode === 'open' || mode === 'fingers' || mode === 'pinch') {
          const multi = tips.length > 1;
          for (const tip of tips) {
            const hit = fingertipHit(tip.landmark, camera, aspect, pool, swellTime, WAVES, mirrorX);
            if (!hit) continue;
            const prevTip = slot.tipHits.get(tip.id) || null;
            const speed = planarSpeed(prevTip, hit, dt);
            const scale = multi ? 0.34 : (prevTip ? 0.50 : 0.95);
            const drop = {
              key: `h:${i}:${tip.id}`,
              x: hit.x,
              z: hit.z,
              u: hit.u,
              v: hit.v,
              radius: DROP.radius,
              strength: impulseStrength(speed) * scale,
              kind: 'finger',
              speed,
            };
            const ind = {
              key: `h:${i}:${tip.id}`,
              ...screenPoint(tip.landmark, mirrorX),
              kind: 'finger',
              radiusPx: 11,
            };
            drops.push(drop);
            indicators.push(ind);
            slot.steadyDrops.push({ ...drop, strength: drop.strength * 0.65 });
            slot.steadyIndicators.push(ind);
            nextTipHits.set(tip.id, hit);
          }
          if (mode === 'pinch') {
            setLabel('Pinch', 2);
          } else {
            setLabel(tips.length === 1 ? '1 Finger' : `${tips.length} Fingers`, 2);
          }
        } else if (mode === 'fist' && !splashed && palmHit) {
          const fistInd = {
            key: `h:${i}:fist`,
            ...screenPoint(palm, mirrorX),
            kind: 'palm',
            radiusPx: 18,
          };
          indicators.push(fistInd);
          slot.steadyIndicators.push(fistInd);
          setLabel('Fist', 1);
        }

        if (mode === 'open') slot.lastOpenAt = nowMs;
        slot.lastTime = nowMs;
        slot.lastMode = mode;
        slot.lastSpan = span;
        slot.lastPalm = palm;
        slot.lastPalmHit = palmHit;
        slot.tipHits = nextTipHits;
      }

      cachedGestureLabel = gestureLabel;
      return { drops, indicators, gestureLabel };
    },
  };
}
