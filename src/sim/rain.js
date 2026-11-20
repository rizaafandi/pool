import { RAIN, WAVES } from '../config.js';
import { ndcWaterHit } from '../input/touch.js';
import {
  lookAt,
  multiply,
  ndcToRay,
  perspective,
  rayPlaneY,
  transformPoint,
} from '../math.js';
import { gerstnerHeightAt } from './gerstner.js';

const BEAD_GRAVITY = 2.4;

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

function projectSegment(mvp, head, tail, minW = 0.08) {
  let cHead = transformPoint(mvp, head);
  let cTail = transformPoint(mvp, tail);
  if (cHead[3] <= minW && cTail[3] <= minW) return null;

  if (cTail[3] <= minW) {
    const t = (minW - cHead[3]) / (cTail[3] - cHead[3]);
    cTail = [
      cHead[0] + (cTail[0] - cHead[0]) * t,
      cHead[1] + (cTail[1] - cHead[1]) * t,
      cHead[2] + (cTail[2] - cHead[2]) * t,
      minW,
    ];
  } else if (cHead[3] <= minW) {
    const t = (minW - cTail[3]) / (cHead[3] - cTail[3]);
    cHead = [
      cTail[0] + (cHead[0] - cTail[0]) * t,
      cTail[1] + (cHead[1] - cTail[1]) * t,
      cTail[2] + (cHead[2] - cTail[2]) * t,
      minW,
    ];
  }

  const hx = (cHead[0] / cHead[3] + 1) * 0.5;
  const hy = (1 - cHead[1] / cHead[3]) * 0.5;
  const tx = (cTail[0] / cTail[3] + 1) * 0.5;
  const ty = (1 - cTail[1] / cTail[3]) * 0.5;

  if (
    (hx < -0.25 && tx < -0.25) || (hx > 1.25 && tx > 1.25)
    || (hy < -0.25 && ty < -0.25) || (hy > 1.25 && ty > 1.25)
  ) {
    return null;
  }

  return {
    x: hx,
    y: hy,
    dx: hx - tx,
    dy: hy - ty,
    depthW: cHead[3],
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

const IDLE_RAIN_FRAME = Object.freeze({
  drops: Object.freeze([]),
  thunder: null,
  visuals: Object.freeze({
    streaks: Object.freeze([]),
    splashes: Object.freeze([]),
    intensity: 0,
    lightning: Object.freeze({ intensity: 0, x: 0.5, y: 0.1 }),
  }),
});

export function createRain({ rng = Math.random } = {}) {
  let enabled = false;
  let nextDropAt = -Infinity;
  let nextLightningAt = null;
  let activeLightning = null;
  let pendingThunder = null;
  let serial = 0;
  let ambientAlpha = 0;
  const fallingDrops = [];
  const splashes = [];
  const ambientDrops = [];

  function scheduleNext(nowMs) {
    const span = RAIN.maxIntervalMs - RAIN.minIntervalMs;
    nextDropAt = nowMs + RAIN.minIntervalMs + rng() * span;
  }

  function scheduleNextLightning(nowMs, isFirst = false) {
    const minMs = isFirst ? (RAIN.firstThunderMinMs ?? 2200) : (RAIN.minThunderIntervalMs ?? 7500);
    const maxMs = isFirst ? (RAIN.firstThunderMaxMs ?? 4800) : (RAIN.maxThunderIntervalMs ?? 16500);
    nextLightningAt = nowMs + minMs + rng() * Math.max(0, maxMs - minMs);
  }

  function lightningEnvelope(age, duration, strength) {
    const p = age / Math.max(0.05, duration);
    if (p < 0 || p >= 1) return 0;
    const pulse1 = Math.exp(-Math.pow((p - 0.08) / 0.055, 2)) * 0.72;
    const pulse2 = Math.exp(-Math.pow((p - 0.28) / 0.11, 2));
    const tail = p > 0.28 ? Math.exp(-(p - 0.28) * 5.2) * 0.32 : 0;
    return Math.min(1, Math.max(pulse1, pulse2, tail)) * strength;
  }

  function makeAmbientDrop(camera, aspect, randomHeight = true) {
    const ndcX = (rng() * 2.10) - 1.05;
    const ndcY = (rng() * 2.10) - 1.02;
    const ray = ndcToRay(ndcX, ndcY, camera, aspect);
    const hit = rayPlaneY(ray.origin, ray.dir, 0);
    const tx = hit ? hit[0] : (rng() * 2.4 - 1.2);
    const tz = hit ? hit[2] : (rng() * 1.4 - 0.7);
    const depth = 0.35 + rng() * 0.65;
    const startHeight = 0.95 + rng() * 0.35;
    return {
      tx,
      tz,
      startHeight,
      h: randomHeight ? rng() * startHeight : startHeight,
      depth,
      speed: 2.1 + depth * 1.4 + rng() * 0.4,
      length: 0.12 + depth * 0.12,
      width: 1.05 + depth * 1.0,
      alpha: 0.36 + depth * 0.42,
    };
  }

  function ensureAmbientPool(camera, aspect) {
    const targetCount = RAIN.ambientStreaks || 28;
    while (ambientDrops.length < targetCount) {
      ambientDrops.push(makeAmbientDrop(camera, aspect, true));
    }
  }

  function spawnFallingDrop(camera, aspect, pool, swellTime) {
    const ndcX = (rng() * 1.76) - 0.88;
    const ndcY = (rng() * 1.76) - 0.88;
    const hit = ndcWaterHit(ndcX, ndcY, camera, aspect, pool, swellTime, WAVES);
    if (!hit) return;

    const duration = RAIN.minFallDuration + rng() * (RAIN.maxFallDuration - RAIN.minFallDuration);
    const radius = RAIN.minRadius + rng() * (RAIN.maxRadius - RAIN.minRadius);
    const strength = RAIN.minStrength + rng() * (RAIN.maxStrength - RAIN.minStrength);
    const sizeNorm = (radius - RAIN.minRadius) / Math.max(1e-5, RAIN.maxRadius - RAIN.minRadius);

    fallingDrops.push({
      targetX: hit.x,
      targetZ: hit.z,
      u: hit.u,
      v: hit.v,
      startHeight: 0.95 + rng() * 0.32,
      age: 0,
      duration,
      radius,
      strength,
      intensity: 0.55 + sizeNorm * 0.65,
      length: 0.14 + sizeNorm * 0.10,
      width: 1.2 + sizeNorm * 0.75,
    });
  }

  function spawnSplash(x, y, z, intensity) {
    const beadCount = 4 + Math.floor(rng() * 2);
    const beads = [];
    for (let i = 0; i < beadCount; i++) {
      const theta = ((i + 0.5) / beadCount) * Math.PI * 2 + (rng() - 0.5) * 0.6;
      const vr = (0.12 + rng() * 0.10) * intensity;
      beads.push({
        vx: Math.cos(theta) * vr,
        vy: (0.34 + rng() * 0.24) * intensity,
        vz: Math.sin(theta) * vr,
        size: 1.15 + rng() * 1.1,
      });
    }
    splashes.push({
      x,
      y,
      z,
      age: 0,
      duration: RAIN.splashDuration || 0.38,
      scale: 0.78 + intensity * 0.45,
      beads,
    });
  }

  return {
    isEnabled() {
      return enabled;
    },

    setEnabled(next) {
      const wasEnabled = enabled;
      enabled = Boolean(next);
      if (enabled && !wasEnabled) {
        nextDropAt = -Infinity;
        nextLightningAt = null;
      } else if (!enabled) {
        nextLightningAt = null;
        pendingThunder = null;
      }
    },

    toggle() {
      const next = !enabled;
      enabled = next;
      if (enabled) {
        nextDropAt = -Infinity;
        nextLightningAt = null;
      } else {
        nextLightningAt = null;
        pendingThunder = null;
      }
      return enabled;
    },

    sample(camera, aspect, pool, swellTime, nowMs) {
      if (!enabled || nowMs < nextDropAt) return null;
      scheduleNext(nowMs);
      const ndcX = (rng() * 1.72) - 0.86;
      const ndcY = (rng() * 1.72) - 0.86;
      const hit = ndcWaterHit(ndcX, ndcY, camera, aspect, pool, swellTime, WAVES);
      if (!hit) return null;
      const radius = RAIN.minRadius + rng() * (RAIN.maxRadius - RAIN.minRadius);
      const strength = RAIN.minStrength + rng() * (RAIN.maxStrength - RAIN.minStrength);
      serial = (serial + 1) % 8;
      return {
        key: `rain:${serial}`,
        x: hit.x,
        z: hit.z,
        u: hit.u,
        v: hit.v,
        radius,
        strength,
        screenX: (ndcX + 1) * 0.5,
        screenY: (1 - ndcY) * 0.5,
      };
    },

    step(dt, nowMs, camera, aspect, pool, swellTime, mvpOverride = null) {
      if (
        !enabled
        && ambientAlpha === 0
        && fallingDrops.length === 0
        && splashes.length === 0
        && !activeLightning
        && !pendingThunder
      ) {
        return IDLE_RAIN_FRAME;
      }

      const safeDt = Math.min(0.05, Math.max(0, dt || 0));
      const fadeRate = enabled ? 3.2 : 2.6;
      ambientAlpha += ((enabled ? 1 : 0) - ambientAlpha) * Math.min(1, safeDt * fadeRate);
      if (!enabled && ambientAlpha < 0.005) ambientAlpha = 0;

      const mvp = mvpOverride || buildMvp(camera, aspect);
      const windX = RAIN.windX ?? -0.06;
      const windZ = RAIN.windZ ?? 0.02;

      if (enabled) {
        ensureAmbientPool(camera, aspect);
        // Catch up cleanly on activation by spawning at most 2 drops per frame
        let spawned = 0;
        while (nowMs >= nextDropAt && spawned < 2) {
          spawnFallingDrop(camera, aspect, pool, swellTime);
          scheduleNext(nowMs + spawned * 35);
          spawned += 1;
        }
        if (nextLightningAt === null) {
          scheduleNextLightning(nowMs, true);
        } else if (nowMs >= nextLightningAt) {
          const distance = 0.2 + rng() * 0.8;
          activeLightning = {
            age: 0,
            duration: 0.44 + rng() * 0.14,
            x: 0.15 + rng() * 0.70,
            y: rng() * 0.22,
            strength: Math.min(1, 0.65 + (1 - distance) * 0.35),
          };
          pendingThunder = {
            fireAt: nowMs + 240 + distance * 1250,
            intensity: Math.min(1.1, 0.55 + (1 - distance) * 0.55),
            distance,
          };
          scheduleNextLightning(nowMs, false);
        }
      }

      let lightning = { intensity: 0, x: 0.5, y: 0.1 };
      if (activeLightning) {
        activeLightning.age += safeDt;
        const flashIntensity = lightningEnvelope(
          activeLightning.age,
          activeLightning.duration,
          activeLightning.strength,
        );
        if (activeLightning.age >= activeLightning.duration) {
          activeLightning = null;
        } else {
          lightning = {
            intensity: flashIntensity,
            x: activeLightning.x,
            y: activeLightning.y,
          };
        }
      }

      let thunder = null;
      if (enabled && pendingThunder && nowMs >= pendingThunder.fireAt) {
        thunder = {
          intensity: pendingThunder.intensity,
          distance: pendingThunder.distance,
        };
        pendingThunder = null;
      }

      const streaks = [];

      // Advance 3D ambient rain streaks aligned with the pool camera frustum
      if (ambientAlpha > 0.005) {
        for (let i = 0; i < ambientDrops.length; i++) {
          const d = ambientDrops[i];
          d.h -= d.speed * safeDt;
          if (d.h <= 0) {
            if (enabled) {
              ambientDrops[i] = makeAmbientDrop(camera, aspect, false);
            }
            continue;
          }
          const head = [d.tx - windX * d.h, d.h, d.tz - windZ * d.h];
          const tailH = d.h + d.length;
          const tail = [d.tx - windX * tailH, tailH, d.tz - windZ * tailH];
          const seg = projectSegment(mvp, head, tail);
          if (!seg) continue;

          const topFade = Math.min(1, (d.startHeight - d.h) / 0.18);
          const bottomFade = Math.min(1, d.h / 0.12);
          const depthScale = Math.min(1.6, Math.max(0.7, 1.5 / Math.max(0.4, seg.depthW)));
          streaks.push({
            x: seg.x,
            y: seg.y,
            dx: seg.dx,
            dy: seg.dy,
            width: d.width * depthScale,
            alpha: d.alpha * ambientAlpha * topFade * bottomFade,
            isPrimary: false,
          });
        }
      }

      // Advance 3D targeted raindrops and emit pool ripples + splashes on exact impact
      const drops = [];
      for (let i = fallingDrops.length - 1; i >= 0; i--) {
        const d = fallingDrops[i];
        d.age += safeDt;
        const t = Math.min(1, d.age / Math.max(0.01, d.duration));
        const yWater = gerstnerHeightAt(d.targetX, d.targetZ, swellTime, WAVES);

        if (t >= 1) {
          fallingDrops.splice(i, 1);
          const proj = projectPoint(mvp, [d.targetX, yWater, d.targetZ]);
          serial = (serial + 1) % 8;
          drops.push({
            key: `rain:${serial}`,
            x: d.targetX,
            z: d.targetZ,
            u: d.u,
            v: d.v,
            radius: d.radius,
            strength: d.strength,
            intensity: d.intensity,
            screenX: proj ? proj.x : 0.5,
            screenY: proj ? proj.y : 0.5,
          });
          spawnSplash(d.targetX, yWater, d.targetZ, d.intensity);
        } else {
          const h = d.startHeight * (1 - t);
          const head = [d.targetX - windX * h, yWater + h, d.targetZ - windZ * h];
          const tailH = h + d.length;
          const tail = [d.targetX - windX * tailH, yWater + tailH, d.targetZ - windZ * tailH];
          const seg = projectSegment(mvp, head, tail);
          if (!seg) continue;

          const entryFade = Math.min(1, t / 0.18);
          const depthScale = Math.min(1.6, Math.max(0.75, 1.5 / Math.max(0.4, seg.depthW)));
          streaks.push({
            x: seg.x,
            y: seg.y,
            dx: seg.dx,
            dy: seg.dy,
            width: d.width * depthScale,
            alpha: (0.45 + 0.45 * t) * entryFade * Math.max(ambientAlpha, 0.35),
            isPrimary: true,
          });
        }
      }

      // Advance active 3D impact splashes
      const activeSplashes = [];
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.age += safeDt;
        if (s.age >= s.duration) {
          splashes.splice(i, 1);
          continue;
        }
        const ringProj = computeRingProjection(mvp, [s.x, s.y, s.z], aspect);
        if (!ringProj) continue;

        const projectedBeads = [];
        for (const b of s.beads) {
          const by = s.y + b.vy * s.age - 0.5 * BEAD_GRAVITY * s.age * s.age;
          if (by < s.y - 0.02) continue;
          const bx = s.x + b.vx * s.age;
          const bz = s.z + b.vz * s.age;
          const bp = projectPoint(mvp, [bx, by, bz]);
          if (!bp) continue;
          projectedBeads.push({
            screenX: bp.x,
            screenY: bp.y,
            size: b.size * Math.min(1.4, Math.max(0.7, 1.55 / Math.max(0.5, bp.w))),
          });
        }

        activeSplashes.push({
          screenX: ringProj.screenX,
          screenY: ringProj.screenY,
          ringAspect: ringProj.ringAspect,
          progress: s.age / s.duration,
          age: s.age,
          scale: s.scale * ringProj.depthScale,
          beads: projectedBeads,
        });
      }

      return {
        drops,
        thunder,
        visuals: {
          streaks,
          splashes: activeSplashes,
          intensity: ambientAlpha,
          lightning,
        },
      };
    },
  };
}
