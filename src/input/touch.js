import { DROP, MIRROR_X } from '../config.js';
import { ndcToRay, rayPlaneY } from '../math.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

export function fingertipHit(landmark, camera, aspect, pool) {
  const screenX = MIRROR_X ? 1 - landmark.x : landmark.x;
  const ndcX = screenX * 2 - 1;
  const ndcY = 1 - landmark.y * 2;
  const ray = ndcToRay(ndcX, ndcY, camera, aspect);
  const hit = rayPlaneY(ray.origin, ray.dir, 0);
  if (!hit) return null;
  if (Math.abs(hit[0]) > pool.halfExtent || Math.abs(hit[2]) > pool.halfExtent) return null;
  return {
    x: hit[0],
    z: hit[2],
    u: hit[0] / (2 * pool.halfExtent) + 0.5,
    v: hit[2] / (2 * pool.halfExtent) + 0.5,
  };
}

export function planarSpeed(previous, next, dt) {
  if (!previous || !next || !(dt > 0)) return 0;
  return Math.hypot(next.x - previous.x, next.z - previous.z) / dt;
}

export function impulseStrength(speed) {
  const extra = Math.min(Math.max(speed, 0), DROP.maxSpeed) * DROP.speedScale;
  return DROP.baseStrength - extra;
}
