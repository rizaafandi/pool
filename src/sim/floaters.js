import { FLOATERS, POOL, WAVES } from '../config.js';
import { lookAt, multiply, perspective, transformPoint } from '../math.js';
import { gerstnerAt, gerstnerHeightAt } from './gerstner.js';

const DEFAULT_POSITIONS = [
  [-0.58, -0.32],
  [0.52, -0.36],
  [-0.24, 0.16],
  [0.36, 0.10],
  [-0.68, 0.34],
  [0.64, 0.38],
  [0.02, -0.18],
];

export function createFloaters({
  count = FLOATERS.count,
  positions = DEFAULT_POSITIONS,
} = {}) {
  let enabled = true;
  const items = [];
  for (let i = 0; i < count; i++) {
    const pos = positions[i % positions.length];
    items.push({
      id: i,
      x: pos[0],
      z: pos[1],
      vx: 0,
      vz: 0,
      angle: i * 1.15,
      spin: (i % 2 === 0 ? 1 : -1) * 0.12,
      size: 0.042 + (i % 3) * 0.008,
      petals: 5,
    });
  }

  return {
    isEnabled() {
      return enabled;
    },

    setEnabled(next) {
      enabled = Boolean(next);
    },

    toggle() {
      enabled = !enabled;
      return enabled;
    },

    list() {
      return items;
    },

    applyImpulse(worldX, worldZ, radiusUv, strength) {
      if (!enabled) return;
      const worldRadius = Math.max(FLOATERS.pushRadius, radiusUv * 2 * POOL.halfExtent * 3.5);
      const power = Math.abs(strength) * FLOATERS.pushGain;
      for (const item of items) {
        const dx = item.x - worldX;
        const dz = item.z - worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist >= worldRadius) continue;
        const falloff = 1 - dist / worldRadius;
        const force = falloff * falloff * power;
        const nx = dist > 1e-4 ? dx / dist : Math.cos(item.angle);
        const nz = dist > 1e-4 ? dz / dist : Math.sin(item.angle);
        item.vx += nx * force;
        item.vz += nz * force;
        item.spin += (nx * 0.6 - nz * 0.6) * force * 3.2;
      }
    },

    step(dt, swellTime, waves = WAVES) {
      if (!enabled || !(dt > 0)) return;
      const drag = Math.pow(FLOATERS.drag, dt * 60);
      for (const item of items) {
        // Gentle drift from ambient Gerstner slope
        const g = gerstnerAt(item.x, item.z, swellTime, waves);
        item.vx += g.normal[0] * 0.22 * dt;
        item.vz += g.normal[2] * 0.22 * dt;

        // Soft boundary centering keeps floaters gracefully in view
        if (item.x > FLOATERS.boundsX) item.vx -= (item.x - FLOATERS.boundsX) * 1.4 * dt;
        if (item.x < -FLOATERS.boundsX) item.vx -= (item.x + FLOATERS.boundsX) * 1.4 * dt;
        if (item.z > FLOATERS.maxZ) item.vz -= (item.z - FLOATERS.maxZ) * 1.4 * dt;
        if (item.z < FLOATERS.minZ) item.vz -= (item.z - FLOATERS.minZ) * 1.4 * dt;

        item.vx *= drag;
        item.vz *= drag;
        item.spin *= drag;

        item.x = Math.max(-POOL.halfExtent + 0.1, Math.min(POOL.halfExtent - 0.1, item.x + item.vx * dt));
        item.z = Math.max(-POOL.halfExtent + 0.1, Math.min(POOL.halfExtent - 0.1, item.z + item.vz * dt));
        item.angle += item.spin * dt;
      }
    },
  };
}

export function projectFloater(item, camera, aspect, cssWidth, cssHeight, swellTime, waves = WAVES, mvp = null) {
  const matrix = mvp || multiply(
    perspective(camera.fovY, aspect, camera.near, camera.far),
    lookAt(camera.eye, camera.target, [0, 1, 0]),
  );
  const y = gerstnerHeightAt(item.x, item.z, swellTime, waves);
  const g = gerstnerAt(item.x, item.z, swellTime, waves);
  const clip = transformPoint(matrix, [item.x, y, item.z]);
  if (clip[3] <= 0.01) return null;
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) return null;

  const x = (ndcX * 0.5 + 0.5) * cssWidth;
  const screenY = (0.5 - ndcY * 0.5) * cssHeight;
  const focalPx = (cssHeight * 0.5) / Math.tan(camera.fovY * 0.5);
  const radiusPx = Math.max(5, (item.size * focalPx) / clip[3]);

  // Compute local perspective foreshortening of the horizontal pool plane at this blossom
  const eps = 0.05;
  const clipX = transformPoint(matrix, [item.x + eps, y, item.z]);
  const clipZ = transformPoint(matrix, [item.x, y, item.z + eps]);
  let aspectY = 0.85;
  if (clipX[3] > 0.01 && clipZ[3] > 0.01) {
    const pxX = ((clipX[0] / clipX[3]) * 0.5 + 0.5) * cssWidth;
    const pyX = (0.5 - (clipX[1] / clipX[3]) * 0.5) * cssHeight;
    const pxZ = ((clipZ[0] / clipZ[3]) * 0.5 + 0.5) * cssWidth;
    const pyZ = (0.5 - (clipZ[1] / clipZ[3]) * 0.5) * cssHeight;
    const rx = Math.hypot(pxX - x, pyX - screenY);
    const rz = Math.hypot(pxZ - x, pyZ - screenY);
    if (rx > 1e-4) {
      aspectY = Math.min(1.0, Math.max(0.55, rz / rx));
    }
  }

  return {
    x,
    y: screenY,
    radiusPx,
    angle: item.angle,
    petals: item.petals || 5,
    bob: y,
    aspectY,
    tiltX: g.normal[0],
    tiltZ: g.normal[2],
  };
}
