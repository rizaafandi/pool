import { DROP, FINGER_TIPS, MIRROR_X, PALM, SPLASH, WAVES } from '../config.js';
import { ndcToRay, rayPlaneY } from '../math.js';
import { rayGerstnerSurface } from '../sim/gerstner.js';

const FINGER_PAIRS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];
const PALM_INDICES = [0, 5, 9, 13, 17];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isThumbExtended(landmarks) {
  const pinkyMcp = landmarks[17];
  return dist(landmarks[4], pinkyMcp) > dist(landmarks[3], pinkyMcp) * 1.12;
}

function isFingerExtended(landmarks, tip, pip) {
  const wrist = landmarks[0];
  return dist(landmarks[tip], wrist) > dist(landmarks[pip], wrist) * 1.12;
}

export function isPointing(landmarks) {
  const wrist = landmarks[0];
  const indexReach = dist(landmarks[8], wrist);
  const indexPip = dist(landmarks[6], wrist);
  if (!(indexReach > indexPip * 1.15)) return false;
  return dist(landmarks[12], wrist) < indexReach * 0.75
    && dist(landmarks[16], wrist) < indexReach * 0.72
    && dist(landmarks[20], wrist) < indexReach * 0.70;
}

export function isPinching(landmarks) {
  const gap = dist(landmarks[4], landmarks[8]);
  const middleAway = dist(landmarks[12], landmarks[8]);
  return gap < 0.06 && middleAway > gap * 2.5 && dist(landmarks[8], landmarks[0]) > 0.1;
}

export function isTouching(landmarks) {
  return isPointing(landmarks) || isPinching(landmarks);
}

export function isOpenPalm(landmarks) {
  if (!isThumbExtended(landmarks)) return false;
  return FINGER_PAIRS.every(([tip, pip]) => isFingerExtended(landmarks, tip, pip));
}

export function isFist(landmarks) {
  const wrist = landmarks[0];
  return FINGER_PAIRS.every(([tip, pip]) => dist(landmarks[tip], wrist) <= dist(landmarks[pip], wrist) * 1.05);
}

export function handSpan(landmarks) {
  return dist(landmarks[0], landmarks[9]);
}

export function palmCenter(landmarks) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const idx of PALM_INDICES) {
    x += landmarks[idx].x;
    y += landmarks[idx].y;
    z += landmarks[idx].z || 0;
  }
  const n = PALM_INDICES.length;
  return { x: x / n, y: y / n, z: z / n };
}

export function extendedFingertips(landmarks) {
  const tips = [];
  for (const id of FINGER_TIPS) {
    if (id === 4) {
      if (isThumbExtended(landmarks)) tips.push({ id, landmark: landmarks[id] });
    } else {
      const pair = FINGER_PAIRS.find(([tip]) => tip === id);
      if (pair && isFingerExtended(landmarks, pair[0], pair[1])) {
        tips.push({ id, landmark: landmarks[id] });
      }
    }
  }
  return tips;
}

export function ndcWaterHit(ndcX, ndcY, camera, aspect, pool, swellTime = null, waves = WAVES) {
  const ray = ndcToRay(ndcX, ndcY, camera, aspect);
  const hit = swellTime == null
    ? rayPlaneY(ray.origin, ray.dir, 0)
    : rayGerstnerSurface(ray.origin, ray.dir, swellTime, waves);
  if (!hit) return null;
  if (Math.abs(hit[0]) > pool.halfExtent || Math.abs(hit[2]) > pool.halfExtent) return null;
  return {
    x: hit[0],
    z: hit[2],
    u: hit[0] / (2 * pool.halfExtent) + 0.5,
    v: hit[2] / (2 * pool.halfExtent) + 0.5,
  };
}

export function fingertipHit(landmark, camera, aspect, pool, swellTime = null, waves = WAVES, mirrorX = MIRROR_X) {
  const screenX = mirrorX ? 1 - landmark.x : landmark.x;
  const ndcX = screenX * 2 - 1;
  const ndcY = 1 - landmark.y * 2;
  return ndcWaterHit(ndcX, ndcY, camera, aspect, pool, swellTime, waves);
}

export function planarSpeed(previous, next, dt) {
  if (!previous || !next || !(dt > 0)) return 0;
  return Math.hypot(next.x - previous.x, next.z - previous.z) / dt;
}

export function impulseStrength(speed) {
  const extra = Math.min(Math.max(speed, 0), DROP.maxSpeed) * DROP.speedScale;
  return DROP.baseStrength - extra;
}

export function palmImpulseStrength(speed) {
  const extra = Math.min(Math.max(speed, 0), PALM.maxSpeed) * PALM.speedScale;
  return PALM.strength - extra;
}

export function plungeStrength(prevSpan, nextSpan, dt, rateMultiplier = 1) {
  if (!(prevSpan > 1e-4) || !Number.isFinite(nextSpan) || !(dt > 0)) return 0;
  const minRate = SPLASH.minGrowthRate * Math.max(0.2, rateMultiplier);
  const maxRate = SPLASH.maxGrowthRate * Math.max(0.2, rateMultiplier);
  const rate = (nextSpan - prevSpan) / (prevSpan * dt);
  if (rate < minRate) return 0;
  const t = Math.min(1, (rate - minRate) / Math.max(1e-4, maxRate - minRate));
  return SPLASH.strength * (1 + 0.35 * t);
}

export function classifyHand(landmarks) {
  const palm = palmCenter(landmarks);
  const span = handSpan(landmarks);
  if (isFist(landmarks)) {
    return { mode: 'fist', tips: [], palm, span };
  }
  if (isPinching(landmarks)) {
    return { mode: 'pinch', tips: [{ id: 8, landmark: landmarks[8] }], palm, span };
  }
  const tips = extendedFingertips(landmarks);
  if (isOpenPalm(landmarks)) {
    return { mode: 'open', tips, palm, span };
  }
  if (tips.length > 0) {
    return { mode: 'fingers', tips, palm, span };
  }
  return { mode: 'idle', tips: [], palm, span };
}
