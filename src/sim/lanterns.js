import { LANTERNS, POOL, WAVES } from '../config.js';
import { lookAt, multiply, perspective, transformPoint } from '../math.js';
import { gerstnerAt, gerstnerHeightAt } from './gerstner.js';

export const MAX_LANTERNS = LANTERNS.maxCount;

const DEFAULT_LANTERN_PRESETS = [
  { x: -0.52, z: -0.24, angle: 0.24, size: 0.080, warmHue: 0.0 },
  { x: 0.46, z: -0.16, angle: -0.36, size: 0.075, warmHue: 0.35 },
  { x: -0.18, z: 0.28, angle: 0.46, size: 0.084, warmHue: 0.7 },
  { x: 0.56, z: 0.34, angle: -0.20, size: 0.074, warmHue: 0.18 },
  { x: -0.68, z: 0.22, angle: 0.14, size: 0.078, warmHue: 0.52 },
  { x: 0.12, z: -0.38, angle: -0.44, size: 0.076, warmHue: 0.85 },
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createLanterns(options = {}) {
  const maxCount = clamp(
    options.maxCount !== undefined ? Math.floor(options.maxCount) : MAX_LANTERNS,
    1,
    MAX_LANTERNS,
  );
  const initialCount = clamp(
    options.count !== undefined ? Math.floor(options.count) : 0,
    0,
    maxCount,
  );
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
  let elapsed = 0;
  let nextId = 0;

  const items = [];
  for (let i = 0; i < initialCount; i++) {
    const p = DEFAULT_LANTERN_PRESETS[i % DEFAULT_LANTERN_PRESETS.length];
    items.push({
      id: nextId++,
      x: p.x,
      z: p.z,
      vx: 0,
      vz: 0,
      angle: p.angle,
      spin: (i % 2 === 0 ? 1 : -1) * 0.04,
      size: p.size,
      phase: i * 1.91 + 0.3,
      warmHue: p.warmHue,
      flicker: 1.0,
      appear: 1.0,
      grabbed: false,
    });
  }

  const data = new Float32Array(MAX_LANTERNS * 4);

  function spawnLantern(opts = {}, avoidBodies = []) {
    enabled = true;
    if (items.length >= maxCount) {
      const evictIdx = items.findIndex((item) => !item.grabbed);
      if (evictIdx >= 0) {
        items.splice(evictIdx, 1);
      } else {
        items.shift();
      }
    }

    const size = opts.size !== undefined ? opts.size : 0.074 + rng() * 0.012;
    let x = opts.x;
    let z = opts.z;

    if (x === undefined || z === undefined) {
      let bestX = (rng() * 2 - 1) * (LANTERNS.boundsX * 0.76);
      let bestZ = LANTERNS.minZ * 0.72 + rng() * (LANTERNS.maxZ * 0.72 - LANTERNS.minZ * 0.72);
      let bestClearance = -1;
      const obstacles = [...items, ...(Array.isArray(avoidBodies) ? avoidBodies : [])];

      for (let attempt = 0; attempt < 14; attempt++) {
        const cx = (rng() * 2 - 1) * (LANTERNS.boundsX * 0.76);
        const cz = LANTERNS.minZ * 0.72 + rng() * (LANTERNS.maxZ * 0.72 - LANTERNS.minZ * 0.72);
        let minDist = Infinity;
        for (const ob of obstacles) {
          if (!ob || ob.falling || (ob.altitude || 0) > 0.001) continue;
          const d = Math.hypot(cx - ob.x, cz - ob.z);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestClearance) {
          bestClearance = minDist;
          bestX = cx;
          bestZ = cz;
        }
        if (minDist > 0.34) break;
      }

      if (x === undefined) x = bestX;
      if (z === undefined) z = bestZ;
    }

    const lantern = {
      id: nextId++,
      x: clamp(x, -LANTERNS.boundsX, LANTERNS.boundsX),
      z: clamp(z, LANTERNS.minZ, LANTERNS.maxZ),
      vx: 0,
      vz: 0,
      angle: opts.angle !== undefined ? opts.angle : (rng() * 2 - 1) * Math.PI,
      spin: (rng() < 0.5 ? -1 : 1) * (0.04 + rng() * 0.06),
      size,
      phase: rng() * Math.PI * 2,
      warmHue: rng(),
      flicker: 1.0,
      appear: opts.immediate ? 1.0 : 0.05,
      grabbed: false,
    };
    items.push(lantern);
    return {
      ...lantern,
      u: lantern.x / (2 * POOL.halfExtent) + 0.5,
      v: lantern.z / (2 * POOL.halfExtent) + 0.5,
      radius: 0.030,
      strength: -0.024,
    };
  }

  function pack() {
    if (!enabled || items.length === 0) {
      return { count: 0, data };
    }
    const n = Math.min(items.length, MAX_LANTERNS);
    for (let i = 0; i < n; i++) {
      const l = items[i];
      const base = i * 4;
      data[base] = l.x;
      data[base + 1] = l.z;
      data[base + 2] = l.flicker * clamp(l.appear, 0, 1);
      data[base + 3] = l.phase;
    }
    return { count: n, data };
  }

  return {
    isEnabled() {
      return enabled && items.length > 0;
    },

    setEnabled(next) {
      enabled = Boolean(next);
      return enabled;
    },

    clear() {
      items.length = 0;
    },

    addLantern(opts = {}, avoidBodies = []) {
      return spawnLantern(opts, avoidBodies);
    },

    addRandom(avoidBodies = []) {
      return spawnLantern({}, avoidBodies);
    },

    list() {
      return items.map((l) => ({ ...l }));
    },

    bodies() {
      return items;
    },

    applyImpulse(worldX, worldZ, radius = 0.04, strength = -0.05) {
      if (!enabled || items.length === 0 || !Number.isFinite(worldX) || !Number.isFinite(worldZ)) return;
      const mag = Math.min(1.8, Math.abs(strength) * 14 + radius * 1.5);
      for (const l of items) {
        if (l.grabbed) continue;
        const dx = l.x - worldX;
        const dz = l.z - worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist > LANTERNS.pushRadius) continue;
        const falloff = 1 - dist / LANTERNS.pushRadius;
        const push = falloff * falloff * mag * LANTERNS.pushGain * 0.055;
        if (dist > 0.002) {
          l.vx += (dx / dist) * push;
          l.vz += (dz / dist) * push;
          l.spin += ((dx * 0.6 - dz * 0.4) / dist) * push * 1.2;
        } else {
          l.vx += push * 0.5;
          l.vz -= push * 0.5;
        }
      }
    },

    step(dtSeconds, swellTime = 0, waves = WAVES, windScale = 1.0) {
      if (!enabled || items.length === 0) return pack();
      const dt = clamp(dtSeconds || 0, 0, 0.05);
      if (dt <= 0) return pack();
      elapsed += dt;

      const damp = Math.pow(LANTERNS.drag, dt * 60);
      const driftGain = 0.022 * Math.max(0.2, windScale);

      for (let i = 0; i < items.length; i++) {
        const l = items[i];
        // Smooth appear fade-in when newly placed onto the water
        if (l.appear < 1) {
          l.appear = Math.min(1, l.appear + dt * 3.2);
        }

        // Multi-harmonic organic candle flame flicker always runs
        const f1 = Math.sin(elapsed * 5.3 + l.phase * 3.1);
        const f2 = Math.sin(elapsed * 11.7 + l.phase * 5.7) * 0.5;
        const f3 = Math.cos(elapsed * 19.1 + l.phase * 2.3) * 0.25;
        l.flicker = clamp(1.0 + (f1 + f2 + f3) * 0.085, 0.82, 1.18);

        if (l.grabbed) {
          l.spin *= Math.pow(0.92, dt * 60);
          l.angle += l.spin * dt;
          continue;
        }

        const g = gerstnerAt(l.x, l.z, swellTime, waves);

        // Gentle floating drift along water slope + subtle ambient breeze
        l.vx += (-g.normal[0] * 0.24 + Math.cos(elapsed * 0.25 + l.phase) * driftGain) * dt;
        l.vz += (-g.normal[2] * 0.24 + Math.sin(elapsed * 0.21 + l.phase * 1.3) * driftGain) * dt;

        // Soft separation so lanterns drift around one another naturally
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const other = items[j];
          const dx = l.x - other.x;
          const dz = l.z - other.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.001 && dist < LANTERNS.separationRadius) {
            const sep = (1 - dist / LANTERNS.separationRadius) * 0.14 * dt / dist;
            l.vx += dx * sep;
            l.vz += dz * sep;
          }
        }

        // Soft restoring force near pool edges
        if (Math.abs(l.x) > LANTERNS.boundsX * 0.85) {
          l.vx -= Math.sign(l.x) * (Math.abs(l.x) - LANTERNS.boundsX * 0.85) * 0.8 * dt;
        }
        if (l.z < LANTERNS.minZ * 0.85) {
          l.vz += (LANTERNS.minZ * 0.85 - l.z) * 0.8 * dt;
        } else if (l.z > LANTERNS.maxZ * 0.85) {
          l.vz -= (l.z - LANTERNS.maxZ * 0.85) * 0.8 * dt;
        }

        l.vx *= damp;
        l.vz *= damp;
        l.x = clamp(l.x + l.vx * dt, -LANTERNS.boundsX, LANTERNS.boundsX);
        l.z = clamp(l.z + l.vz * dt, LANTERNS.minZ, LANTERNS.maxZ);

        l.spin *= Math.pow(0.95, dt * 60);
        l.spin = clamp(l.spin, -0.8, 0.8);
        l.angle += (l.spin + Math.sin(elapsed * 0.4 + l.phase) * 0.03) * dt;
      }

      return pack();
    },

    pack,
  };
}

export function projectLantern(
  item,
  camera,
  aspect,
  cssWidth,
  cssHeight,
  swellTime,
  waves = WAVES,
  mvp = null,
  swellScale = 1.0,
) {
  const matrix = mvp || multiply(
    perspective(camera.fovY, aspect, camera.near, camera.far),
    lookAt(camera.eye, camera.target, [0, 1, 0]),
  );
  const yWater = gerstnerHeightAt(item.x, item.z, swellTime, waves) * swellScale;
  const g = gerstnerAt(item.x, item.z, swellTime, waves);
  const clip = transformPoint(matrix, [item.x, yWater, item.z]);
  if (clip[3] <= 0.01) return null;
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  if (Math.abs(ndcX) > 1.25 || Math.abs(ndcY) > 1.35) return null;

  const x = (ndcX * 0.5 + 0.5) * cssWidth;
  const screenY = (0.5 - ndcY * 0.5) * cssHeight;
  const focalPx = (cssHeight * 0.5) / Math.tan(camera.fovY * 0.5);
  const sizePx = Math.max(12, (item.size * focalPx) / clip[3]);

  const eps = 0.05;
  const clipX = transformPoint(matrix, [item.x + eps, yWater, item.z]);
  const clipZ = transformPoint(matrix, [item.x, yWater, item.z + eps]);
  let aspectY = 0.78;
  if (clipX[3] > 0.01 && clipZ[3] > 0.01) {
    const pxX = ((clipX[0] / clipX[3]) * 0.5 + 0.5) * cssWidth;
    const pyX = (0.5 - (clipX[1] / clipX[3]) * 0.5) * cssHeight;
    const pxZ = ((clipZ[0] / clipZ[3]) * 0.5 + 0.5) * cssWidth;
    const pyZ = (0.5 - (clipZ[1] / clipZ[3]) * 0.5) * cssHeight;
    const rx = Math.hypot(pxX - x, pyX - screenY);
    const rz = Math.hypot(pxZ - x, pyZ - screenY);
    if (rx > 1e-4) {
      aspectY = clamp(rz / rx, 0.52, 0.96);
    }
  }

  return {
    id: item.id,
    x,
    y: screenY,
    depth: clip[3],
    sizePx,
    angle: item.angle,
    aspectY,
    tiltX: g.normal[0] * swellScale,
    tiltZ: g.normal[2] * swellScale,
    flicker: item.flicker,
    phase: item.phase,
    warmHue: item.warmHue,
    appear: item.appear !== undefined ? item.appear : 1.0,
    grabbed: Boolean(item.grabbed),
  };
}
