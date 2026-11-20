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

const DEFAULT_KINDS = [
  'blossom',
  'petal',
  'leaf',
  'blossom',
  'petal',
  'partial',
  'leaf',
];

function pickRandomKind(rng) {
  const r = rng();
  if (r < 0.36) return 'petal';
  if (r < 0.64) return 'leaf';
  if (r < 0.82) return 'partial';
  return 'blossom';
}

function petalCountForKind(kind, rng) {
  if (kind === 'blossom') return 5;
  if (kind === 'partial') return rng() < 0.55 ? 2 : 3;
  return 1;
}

export function createFloaters({
  count = FLOATERS.count,
  positions = DEFAULT_POSITIONS,
  rng = Math.random,
} = {}) {
  let enabled = true;
  let nextId = 0;
  const items = [];
  for (let i = 0; i < count; i++) {
    const pos = positions[i % positions.length];
    const kind = DEFAULT_KINDS[i % DEFAULT_KINDS.length];
    items.push({
      id: nextId++,
      kind,
      x: pos[0],
      z: pos[1],
      vx: 0,
      vz: 0,
      altitude: 0,
      falling: false,
      fallSpeed: 0,
      swayPhase: 0,
      swayFreq: 0,
      swayAmp: 0,
      swayAngle: 0,
      flutterTilt: 0,
      angle: i * 1.15,
      spin: (i % 2 === 0 ? 1 : -1) * 0.12,
      size: 0.042 + (i % 3) * 0.008,
      petals: kind === 'blossom' ? 5 : (kind === 'partial' ? 3 : 1),
    });
  }

  function spawnDroppedPetal(options = {}) {
    enabled = true;

    const kind = options.kind || pickRandomKind(rng);
    const isLight = kind === 'petal' || kind === 'leaf';
    const x = options.x !== undefined
      ? options.x
      : (rng() * 2 - 1) * (FLOATERS.boundsX * 0.76);
    const z = options.z !== undefined
      ? options.z
      : (FLOATERS.minZ * 0.68) + rng() * (FLOATERS.maxZ * 0.62 - FLOATERS.minZ * 0.68);
    const altitude = options.altitude !== undefined
      ? Math.max(0.05, options.altitude)
      : FLOATERS.dropHeightMin + rng() * (FLOATERS.dropHeightMax - FLOATERS.dropHeightMin);
    const baseFallSpeed = FLOATERS.fallSpeedMin + rng() * (FLOATERS.fallSpeedMax - FLOATERS.fallSpeedMin);
    const fallSpeed = options.fallSpeed !== undefined
      ? options.fallSpeed
      : baseFallSpeed * (isLight ? 0.84 : 1.0);
    const size = options.size !== undefined
      ? options.size
      : (kind === 'leaf' ? 0.046 + rng() * 0.020 : 0.040 + rng() * 0.018);
    const petals = options.petals !== undefined
      ? options.petals
      : petalCountForKind(kind, rng);

    const petal = {
      id: nextId++,
      kind,
      x,
      z,
      vx: 0,
      vz: 0,
      altitude,
      falling: true,
      fallSpeed,
      swayPhase: rng() * Math.PI * 2,
      swayFreq: FLOATERS.swayFreqMin + rng() * (FLOATERS.swayFreqMax - FLOATERS.swayFreqMin),
      swayAmp: FLOATERS.swayAmp * (0.75 + rng() * 0.5) * (isLight ? 1.25 : 1.0),
      swayAngle: rng() * Math.PI * 2,
      flutterTilt: 0,
      angle: rng() * Math.PI * 2,
      spin: (rng() < 0.5 ? -1 : 1) * (isLight ? 0.8 + rng() * 0.75 : 0.5 + rng() * 0.5),
      size,
      petals,
    };
    items.push(petal);
    return petal;
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

    bodies() {
      return items;
    },

    dropPetal(options = {}) {
      return spawnDroppedPetal(options);
    },

    dropRandom() {
      const dropCount = rng() < 0.38 ? 2 : 1;
      const first = spawnDroppedPetal();
      if (dropCount === 1) return [first];

      const offsetX = (rng() * 2 - 1) * 0.22;
      const offsetZ = (rng() * 2 - 1) * 0.16;
      const secondX = Math.max(-FLOATERS.boundsX * 0.82, Math.min(FLOATERS.boundsX * 0.82, first.x + offsetX));
      const secondZ = Math.max(FLOATERS.minZ * 0.78, Math.min(FLOATERS.maxZ * 0.72, first.z + offsetZ));
      const second = spawnDroppedPetal({
        x: secondX,
        z: secondZ,
        altitude: first.altitude + 0.14 + rng() * 0.18,
      });
      return [first, second];
    },

    applyImpulse(worldX, worldZ, radiusUv, strength) {
      if (!enabled) return;
      const worldRadius = Math.max(FLOATERS.pushRadius, radiusUv * 2 * POOL.halfExtent * 3.5);
      const power = Math.abs(strength) * FLOATERS.pushGain;
      for (const item of items) {
        if (item.falling || item.altitude > 0 || item.grabbed) continue;
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
      const landed = [];
      if (!enabled || !(dt > 0)) return landed;
      const drag = Math.pow(FLOATERS.drag, dt * 60);
      for (const item of items) {
        if (item.falling) {
          item.swayPhase += item.swayFreq * dt;
          const swaySpeed = Math.cos(item.swayPhase) * item.swayAmp;
          const driftX = Math.cos(item.swayAngle) * swaySpeed;
          const driftZ = Math.sin(item.swayAngle) * swaySpeed;
          item.x = Math.max(-POOL.halfExtent + 0.1, Math.min(POOL.halfExtent - 0.1, item.x + driftX * dt));
          item.z = Math.max(-POOL.halfExtent + 0.1, Math.min(POOL.halfExtent - 0.1, item.z + driftZ * dt));
          item.angle += item.spin * dt;
          item.flutterTilt = Math.sin(item.swayPhase) * 0.42;
          item.altitude -= item.fallSpeed * dt;

          if (item.altitude <= 0) {
            item.altitude = 0;
            item.falling = false;
            item.flutterTilt = 0;
            item.vx = driftX * 0.35;
            item.vz = driftZ * 0.35;
            item.spin *= 0.45;
            landed.push({
              id: item.id,
              x: item.x,
              z: item.z,
              u: item.x / (2 * POOL.halfExtent) + 0.5,
              v: item.z / (2 * POOL.halfExtent) + 0.5,
              radius: 0.018,
              strength: -0.016,
              size: item.size,
            });
          }
          continue;
        }

        if (item.grabbed) {
          item.spin *= drag;
          item.angle += item.spin * dt;
          continue;
        }

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
      return landed;
    },
  };
}

export function projectFloater(
  item,
  camera,
  aspect,
  cssWidth,
  cssHeight,
  swellTime,
  waves = WAVES,
  mvp = null,
  sunDir = null,
) {
  const matrix = mvp || multiply(
    perspective(camera.fovY, aspect, camera.near, camera.far),
    lookAt(camera.eye, camera.target, [0, 1, 0]),
  );
  const altitude = Math.max(0, item.altitude || 0);
  const yWater = gerstnerHeightAt(item.x, item.z, swellTime, waves);
  const y = yWater + altitude;
  const g = gerstnerAt(item.x, item.z, swellTime, waves);
  const clip = transformPoint(matrix, [item.x, y, item.z]);
  if (clip[3] <= 0.01) return null;
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  if (Math.abs(ndcX) > 1.25 || Math.abs(ndcY) > 1.35) return null;

  const x = (ndcX * 0.5 + 0.5) * cssWidth;
  const screenY = (0.5 - ndcY * 0.5) * cssHeight;
  const focalPx = (cssHeight * 0.5) / Math.tan(camera.fovY * 0.5);
  const radiusPx = Math.max(5, (item.size * focalPx) / clip[3]);

  // Compute local perspective foreshortening of the horizontal plane at this blossom
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

  let shadowX;
  let shadowY;
  let shadowRadiusPx;
  let shadowAlpha;
  if (altitude > 0.001) {
    const sDir = Array.isArray(sunDir) ? sunDir : [0.22, 0.86, 0.46];
    const sunY = Math.max(0.35, sDir[1]);
    const sx = item.x - (sDir[0] / sunY) * altitude;
    const sz = item.z - (sDir[2] / sunY) * altitude;
    const sy = gerstnerHeightAt(sx, sz, swellTime, waves);
    const clipShadow = transformPoint(matrix, [sx, sy, sz]);
    if (clipShadow[3] > 0.01) {
      const sNdcX = clipShadow[0] / clipShadow[3];
      const sNdcY = clipShadow[1] / clipShadow[3];
      shadowX = (sNdcX * 0.5 + 0.5) * cssWidth;
      shadowY = (0.5 - sNdcY * 0.5) * cssHeight;
      shadowRadiusPx = Math.max(4, (item.size * focalPx) / clipShadow[3]) * (1 + altitude * 0.14);
      shadowAlpha = 0.22 / (1 + altitude * 0.75);
    }
  }

  return {
    id: item.id,
    kind: item.kind || 'blossom',
    seed: item.id !== undefined ? (item.id * 1.6180339) % 10 : 0.37,
    x,
    y: screenY,
    radiusPx,
    angle: item.angle,
    petals: item.petals || 5,
    bob: y,
    altitude,
    flutterTilt: item.flutterTilt || 0,
    aspectY,
    tiltX: altitude > 0 ? 0 : g.normal[0],
    tiltZ: altitude > 0 ? 0 : g.normal[2],
    shadowX,
    shadowY,
    shadowRadiusPx,
    shadowAlpha,
    grabbed: Boolean(item.grabbed),
  };
}
