import { KOI } from '../config.js';

export const MAX_KOI = KOI.maxCount;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const DEFAULT_PRESETS = [
  // 0: Platinum White, 1: Kohaku (White/Orange), 2: Yamabuki Gold, 3: Showa (Orange/Black/White)
  { x: -0.78, z: -0.44, y: -0.13, heading: -2.35, length: 0.34, variant: 0, seed: 0.14 },
  { x: -0.16, z: -0.42, y: -0.12, heading: 2.92, length: 0.35, variant: 1, seed: 0.27 },
  { x: 0.66, z: -0.36, y: -0.15, heading: 0.14, length: 0.34, variant: 2, seed: 0.41 },
  { x: -0.46, z: -0.08, y: -0.16, heading: 0.92, length: 0.32, variant: 0, seed: 0.58 },
  { x: -0.10, z: 0.04, y: -0.18, heading: 1.24, length: 0.33, variant: 2, seed: 0.73 },
  { x: 0.32, z: -0.02, y: -0.14, heading: 2.38, length: 0.31, variant: 1, seed: 0.62 },
  { x: -0.66, z: 0.34, y: -0.12, heading: 3.10, length: 0.35, variant: 1, seed: 0.85 },
  { x: -0.18, z: 0.44, y: -0.15, heading: 1.58, length: 0.30, variant: 3, seed: 0.33 },
  { x: 0.52, z: 0.42, y: -0.13, heading: 0.68, length: 0.36, variant: 3, seed: 0.79 },
  { x: 0.78, z: 0.06, y: -0.17, heading: 0.52, length: 0.33, variant: 0, seed: 0.21 },
  { x: 0.46, z: 0.16, y: -0.19, heading: 1.56, length: 0.31, variant: 2, seed: 0.49 },
  { x: -0.94, z: 0.26, y: -0.16, heading: -1.52, length: 0.34, variant: 2, seed: 0.91 },
];

export function createKoi(options = {}) {
  const count = clamp(
    options.count !== undefined ? Math.floor(options.count) : KOI.count,
    0,
    MAX_KOI,
  );
  let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
  let elapsed = 0;

  const fish = [];
  for (let i = 0; i < count; i++) {
    const p = DEFAULT_PRESETS[i % DEFAULT_PRESETS.length];
    fish.push({
      id: i,
      x: p.x,
      y: p.y,
      z: p.z,
      baseY: p.y,
      targetY: p.y,
      heading: p.heading,
      bend: 0,
      speed: KOI.cruiseSpeed * (0.9 + (i % 3) * 0.08),
      baseSpeed: KOI.cruiseSpeed * (0.9 + (i % 3) * 0.08),
      length: p.length,
      phase: i * 1.73,
      variant: p.variant,
      seed: p.seed,
      dartTimer: 0,
      wanderOffset: i * 2.13 + 0.4,
    });
  }

  let interest = null;
  const pos = new Float32Array(MAX_KOI * 4);
  const meta = new Float32Array(MAX_KOI * 4);

  function pack() {
    if (!enabled || fish.length === 0) {
      return { count: 0, pos, meta };
    }
    const n = Math.min(fish.length, MAX_KOI);
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      const base = i * 4;
      pos[base] = f.x;
      pos[base + 1] = f.y;
      pos[base + 2] = f.z;
      pos[base + 3] = f.heading;

      meta[base] = f.length;
      meta[base + 1] = f.phase;
      meta[base + 2] = f.bend;
      meta[base + 3] = f.variant + f.seed * 0.92;
    }
    return { count: n, pos, meta };
  }

  return {
    isEnabled() {
      return enabled;
    },

    setEnabled(next) {
      enabled = Boolean(next);
      return enabled;
    },

    toggle() {
      enabled = !enabled;
      return enabled;
    },

    list() {
      return fish.map((f) => ({ ...f }));
    },

    setInterest(worldX, worldZ, active = true) {
      if (!active || !Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
        interest = null;
        return;
      }
      interest = { x: worldX, z: worldZ };
    },

    reactToDisturbance(worldX, worldZ, strength = 1.0) {
      if (!enabled || !Number.isFinite(worldX) || !Number.isFinite(worldZ)) return;
      const intensity = clamp(Math.abs(strength), 0.1, 2.0);
      if (intensity < 0.32) return;

      for (const f of fish) {
        const dx = f.x - worldX;
        const dz = f.z - worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist > KOI.fleeRadius) continue;

        const prox = 1 - dist / KOI.fleeRadius;
        const awayAngle = dist > 0.001 ? Math.atan2(dz, dx) : f.heading + Math.PI;
        const turn = wrapAngle(awayAngle - f.heading);
        f.heading = wrapAngle(f.heading + turn * (0.45 + prox * 0.45));
        const burst = KOI.cruiseSpeed + (KOI.dartSpeed - KOI.cruiseSpeed) * clamp(prox * intensity, 0.25, 1.0);
        f.speed = Math.max(f.speed, burst);
        f.dartTimer = Math.max(f.dartTimer, 0.55 + prox * 0.65);
        f.targetY = clamp(f.baseY - 0.05 * prox, KOI.minY, KOI.maxY);
      }
    },

    step(dtSeconds) {
      if (!enabled) return pack();
      const dt = clamp(dtSeconds || 0, 0, 0.05);
      if (dt <= 0) return pack();
      elapsed += dt;

      const centerZ = (KOI.minZ + KOI.maxZ) * 0.5;
      const halfZ = (KOI.maxZ - KOI.minZ) * 0.5;
      const halfX = KOI.boundsX;

      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        const prevHeading = f.heading;

        // Gentle organic wandering angle
        const wander = Math.sin(elapsed * 0.55 + f.wanderOffset) * 0.42
          + Math.sin(elapsed * 0.23 + f.wanderOffset * 1.9) * 0.28;
        let desiredTurn = wander * 0.85;

        // Soft elliptical boundary steering so fish curve gracefully inside the pool view
        const nx = f.x / Math.max(0.1, halfX);
        const nz = (f.z - centerZ) / Math.max(0.1, halfZ);
        const edgeDist = Math.hypot(nx, nz);
        if (edgeDist > 0.72) {
          const toCenter = Math.atan2(centerZ - f.z, -f.x);
          const edgePull = clamp((edgeDist - 0.72) / 0.35, 0, 1.6);
          desiredTurn += wrapAngle(toCenter - f.heading) * (1.85 * edgePull);
        }

        // Separation from neighboring koi
        let sepX = 0;
        let sepZ = 0;
        for (let j = 0; j < fish.length; j++) {
          if (i === j) continue;
          const other = fish[j];
          const dx = f.x - other.x;
          const dz = f.z - other.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.001 && dist < KOI.separationRadius) {
            const push = (1 - dist / KOI.separationRadius) / dist;
            sepX += dx * push;
            sepZ += dz * push;
          }
        }
        if (sepX !== 0 || sepZ !== 0) {
          const sepAngle = Math.atan2(sepZ, sepX);
          desiredTurn += wrapAngle(sepAngle - f.heading) * 1.5;
        }

        // Calm curiosity toward resting pointer/hand if not darting
        if (interest && f.dartTimer <= 0.05) {
          const dx = interest.x - f.x;
          const dz = interest.z - f.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.22 && dist < KOI.attractRadius) {
            const toInterest = Math.atan2(dz, dx);
            desiredTurn += wrapAngle(toInterest - f.heading) * 0.85;
            f.targetY = clamp(f.baseY + 0.03, KOI.minY, KOI.maxY);
          }
        }

        const maxTurnRate = f.dartTimer > 0 ? 4.2 : 1.95;
        const turnDelta = clamp(desiredTurn * dt, -maxTurnRate * dt, maxTurnRate * dt);
        f.heading = wrapAngle(f.heading + turnDelta);

        // Smooth body bend proportional to angular velocity for realistic curved swimming
        const angVel = wrapAngle(f.heading - prevHeading) / dt;
        const targetBend = clamp(angVel * 0.16, -0.34, 0.34);
        f.bend += (targetBend - f.bend) * Math.min(1, dt * 6.5);

        // Speed & depth relaxation
        if (f.dartTimer > 0) {
          f.dartTimer = Math.max(0, f.dartTimer - dt);
        } else {
          const cruisePulse = f.baseSpeed * (0.92 + 0.16 * Math.sin(elapsed * 0.9 + f.wanderOffset));
          f.speed += (cruisePulse - f.speed) * Math.min(1, dt * 2.2);
          f.targetY = clamp(
            f.baseY + Math.sin(elapsed * 0.4 + f.wanderOffset) * 0.025,
            KOI.minY,
            KOI.maxY,
          );
        }
        f.y += (f.targetY - f.y) * Math.min(1, dt * 1.8);

        // Advance forward along heading
        f.x += Math.cos(f.heading) * f.speed * dt;
        f.z += Math.sin(f.heading) * f.speed * dt;

        // Hard safety clamp well outside soft turn zone
        f.x = clamp(f.x, -halfX * 1.25, halfX * 1.25);
        f.z = clamp(f.z, KOI.minZ - 0.22, KOI.maxZ + 0.22);

        // Tail-beat phase speeds up during darts
        const beatRate = 4.6 + (f.speed / Math.max(0.05, KOI.cruiseSpeed)) * 3.8;
        f.phase = (f.phase + beatRate * dt) % (Math.PI * 200);
      }

      return pack();
    },

    pack,
  };
}
