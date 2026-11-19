import { WAVES } from '../config.js';
import {
  lookAt,
  multiply,
  perspective,
  transformPoint,
} from '../math.js';
import { gerstnerHeightAt } from './gerstner.js';

const BEAD_GRAVITY = 2.6;
const MAX_SPLASHES = 28;

function buildMvp(camera, aspect) {
  return multiply(
    perspective(camera.fovY, aspect, camera.near, camera.far),
    lookAt(camera.eye, camera.target, [0, 1, 0]),
  );
}

function projectPoint(mvp, point, minW = 0.05) {
  const clip = transformPoint(mvp, point);
  if (clip[3] <= minW) return null;
  const invW = 1 / clip[3];
  return {
    x: (clip[0] * invW + 1) * 0.5,
    y: (1 - clip[1] * invW) * 0.5,
    w: clip[3],
  };
}

function computeRingProjection(mvp, point, aspect) {
  const center = projectPoint(mvp, point);
  if (!center) return null;
  const eps = 0.05;
  const px = projectPoint(mvp, [point[0] + eps, point[1], point[2]]);
  const pz = projectPoint(mvp, [point[0], point[1], point[2] + eps]);
  let ringAspect = 0.88;
  if (px && pz) {
    const rx = Math.hypot((px.x - center.x) * aspect, px.y - center.y);
    const rz = Math.hypot((pz.x - center.x) * aspect, pz.y - center.y);
    if (rx > 1e-5) {
      ringAspect = Math.min(1, Math.max(0.45, rz / rx));
    }
  }
  const depthScale = Math.min(1.4, Math.max(0.65, 1.55 / Math.max(0.5, center.w)));
  return {
    screenX: center.x,
    screenY: center.y,
    ringAspect,
    depthScale,
  };
}

export function createSplashes({ rng = Math.random } = {}) {
  const active = [];

  function pushSplash(entry) {
    if (active.length >= MAX_SPLASHES) {
      active.shift();
    }
    active.push(entry);
  }

  return {
    spawnTap(x, z, intensity = 0.85, swellTime = 0) {
      const y = gerstnerHeightAt(x, z, swellTime, WAVES);
      const amp = Math.min(1.5, Math.max(0.4, intensity));
      const count = 5 + Math.floor(rng() * 3);
      const beads = [];
      for (let i = 0; i < count; i++) {
        const theta = ((i + 0.5) / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
        const vr = (0.16 + rng() * 0.14) * amp;
        beads.push({
          vx: Math.cos(theta) * vr,
          vy: (0.42 + rng() * 0.28) * amp,
          vz: Math.sin(theta) * vr,
          size: 1.25 + rng() * 1.25,
        });
      }
      pushSplash({
        x,
        y,
        z,
        age: 0,
        duration: 0.36,
        scale: 0.75 + amp * 0.32,
        showRing: false,
        beads,
      });
    },

    spawnSweep(x, z, dirX, dirZ, speed, swellTime = 0) {
      if (!(speed > 0.35)) return;
      const y = gerstnerHeightAt(x, z, swellTime, WAVES);
      const normLen = Math.hypot(dirX, dirZ) || 1;
      const fx = dirX / normLen;
      const fz = dirZ / normLen;
      const sx = -fz;
      const sz = fx;
      const amp = Math.min(1.5, Math.max(0.45, speed * 0.62));
      const count = Math.min(7, 2 + Math.floor(speed * 2.5));
      const beads = [];
      for (let i = 0; i < count; i++) {
        const side = (i % 2 === 0 ? 1 : -1) * (0.45 + rng() * 0.75);
        const forward = 0.25 + rng() * 0.65;
        const vScale = (0.18 + rng() * 0.16) * amp;
        beads.push({
          vx: (fx * forward + sx * side) * vScale,
          vy: (0.30 + rng() * 0.28) * amp,
          vz: (fz * forward + sz * side) * vScale,
          size: 0.95 + rng() * 1.15,
        });
      }
      pushSplash({
        x,
        y,
        z,
        age: 0,
        duration: 0.30 + Math.min(0.16, speed * 0.07),
        scale: 0.60 + Math.min(0.65, speed * 0.28),
        showRing: false,
        beads,
      });
    },

    spawnBurst(x, z, intensity = 1.25, swellTime = 0) {
      const y = gerstnerHeightAt(x, z, swellTime, WAVES);
      const amp = Math.min(1.8, Math.max(0.6, intensity));
      const count = 8 + Math.floor(rng() * 4);
      const beads = [];
      for (let i = 0; i < count; i++) {
        const theta = ((i + 0.5) / count) * Math.PI * 2 + (rng() - 0.5) * 0.45;
        const vr = (0.20 + rng() * 0.20) * amp;
        beads.push({
          vx: Math.cos(theta) * vr,
          vy: (0.46 + rng() * 0.32) * amp,
          vz: Math.sin(theta) * vr,
          size: 1.2 + rng() * 1.3,
        });
      }
      pushSplash({
        x,
        y,
        z,
        age: 0,
        duration: 0.46,
        scale: 1.0 + amp * 0.35,
        showRing: false,
        beads,
      });
    },

    step(dt, camera, aspect, mvp = null) {
      const safeDt = Math.min(0.05, Math.max(0, dt || 0));
      if (active.length === 0) return [];
      const matrix = mvp || buildMvp(camera, aspect);
      const out = [];

      for (let i = active.length - 1; i >= 0; i--) {
        const s = active[i];
        s.age += safeDt;
        if (s.age >= s.duration) {
          active.splice(i, 1);
          continue;
        }
        const ringProj = computeRingProjection(matrix, [s.x, s.y, s.z], aspect);
        if (!ringProj) continue;

        const projectedBeads = [];
        for (const b of s.beads) {
          const by = s.y + b.vy * s.age - 0.5 * BEAD_GRAVITY * s.age * s.age;
          if (by < s.y - 0.02) continue;
          const bx = s.x + b.vx * s.age;
          const bz = s.z + b.vz * s.age;
          const bp = projectPoint(matrix, [bx, by, bz]);
          if (!bp) continue;
          projectedBeads.push({
            screenX: bp.x,
            screenY: bp.y,
            size: b.size * Math.min(1.45, Math.max(0.7, 1.55 / Math.max(0.5, bp.w))),
          });
        }

        out.push({
          screenX: ringProj.screenX,
          screenY: ringProj.screenY,
          ringAspect: ringProj.ringAspect,
          showRing: s.showRing !== false,
          progress: s.age / s.duration,
          age: s.age,
          scale: s.scale * ringProj.depthScale,
          beads: projectedBeads,
        });
      }
      return out;
    },
  };
}
