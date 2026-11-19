import { RAIN, WAVES } from '../config.js';
import { ndcWaterHit } from '../input/touch.js';

export function createRain({ rng = Math.random } = {}) {
  let enabled = false;
  let nextDropAt = -Infinity;
  let serial = 0;
  let ambientAlpha = 0;
  const fallingDrops = [];
  const splashes = [];
  const ambientDrops = [];

  function scheduleNext(nowMs) {
    const span = RAIN.maxIntervalMs - RAIN.minIntervalMs;
    nextDropAt = nowMs + RAIN.minIntervalMs + rng() * span;
  }

  function makeAmbientDrop(randomY = true) {
    const depth = 0.35 + rng() * 0.65;
    return {
      x: rng() * 1.18 - 0.04,
      y: randomY ? rng() * 1.15 - 0.15 : -0.05 - rng() * 0.2,
      depth,
      speed: 1.55 + depth * 1.35 + rng() * 0.35,
      length: 0.042 + depth * 0.052,
      width: 1.15 + depth * 1.25,
      alpha: 0.38 + depth * 0.44,
    };
  }

  function ensureAmbientPool() {
    const targetCount = RAIN.ambientStreaks || 28;
    while (ambientDrops.length < targetCount) {
      ambientDrops.push(makeAmbientDrop(true));
    }
  }

  function spawnFallingDrop() {
    const ndcX = (rng() * 1.76) - 0.88;
    const ndcY = (rng() * 1.76) - 0.88;
    const targetX = (ndcX + 1) * 0.5;
    const targetY = (1 - ndcY) * 0.5;
    const fallDist = 0.34 + rng() * 0.30;
    const wind = RAIN.windAngle || -0.14;
    const duration = RAIN.minFallDuration + rng() * (RAIN.maxFallDuration - RAIN.minFallDuration);
    const radius = RAIN.minRadius + rng() * (RAIN.maxRadius - RAIN.minRadius);
    const strength = RAIN.minStrength + rng() * (RAIN.maxStrength - RAIN.minStrength);
    const sizeNorm = (radius - RAIN.minRadius) / Math.max(1e-5, RAIN.maxRadius - RAIN.minRadius);
    fallingDrops.push({
      ndcX,
      ndcY,
      targetX,
      targetY,
      startX: targetX - fallDist * wind,
      startY: targetY - fallDist,
      age: 0,
      duration,
      radius,
      strength,
      intensity: 0.55 + sizeNorm * 0.65,
      length: 0.05 + sizeNorm * 0.035,
      width: 1.3 + sizeNorm * 0.85,
    });
  }

  function spawnSplash(screenX, screenY, intensity) {
    const beadCount = 4 + Math.floor(rng() * 2);
    const beads = [];
    for (let i = 0; i < beadCount; i++) {
      const spread = ((i + 0.5) / beadCount - 0.5) * 2 + (rng() - 0.5) * 0.35;
      beads.push({
        vx: spread * (28 + rng() * 22) * intensity,
        vy: -(34 + rng() * 32) * intensity,
        size: 1.2 + rng() * 1.2,
      });
    }
    splashes.push({
      screenX,
      screenY,
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
      enabled = Boolean(next);
      if (enabled) {
        nextDropAt = -Infinity;
        ensureAmbientPool();
      }
    },

    toggle() {
      enabled = !enabled;
      if (enabled) {
        nextDropAt = -Infinity;
        ensureAmbientPool();
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

    step(dt, nowMs, camera, aspect, pool, swellTime) {
      const safeDt = Math.min(0.05, Math.max(0, dt || 0));
      const fadeRate = enabled ? 3.2 : 2.6;
      ambientAlpha += ((enabled ? 1 : 0) - ambientAlpha) * Math.min(1, safeDt * fadeRate);
      if (!enabled && ambientAlpha < 0.005) ambientAlpha = 0;

      if (enabled) {
        ensureAmbientPool();
        // Catch up cleanly on activation by spawning at most 2 drops per frame
        let spawned = 0;
        while (nowMs >= nextDropAt && spawned < 2) {
          spawnFallingDrop();
          scheduleNext(nowMs + spawned * 35);
          spawned += 1;
        }
      }

      const wind = RAIN.windAngle || -0.14;
      const streaks = [];

      // Advance ambient parallax rain streaks
      if (ambientAlpha > 0.005) {
        for (let i = 0; i < ambientDrops.length; i++) {
          const d = ambientDrops[i];
          d.y += d.speed * safeDt;
          d.x += d.speed * wind * safeDt;
          if (d.y - d.length > 1.05 || d.x < -0.15 || d.x > 1.2) {
            if (enabled) {
              ambientDrops[i] = makeAmbientDrop(false);
            }
            continue;
          }
          streaks.push({
            x: d.x,
            y: d.y,
            dx: d.length * wind,
            dy: d.length,
            width: d.width,
            alpha: d.alpha * ambientAlpha,
            isPrimary: false,
          });
        }
      }

      // Advance targeted raindrops and emit pool ripples + splashes on exact impact
      const drops = [];
      for (let i = fallingDrops.length - 1; i >= 0; i--) {
        const d = fallingDrops[i];
        d.age += safeDt;
        const t = Math.min(1, d.age / Math.max(0.01, d.duration));
        const eased = t * (0.62 + 0.38 * t);
        const curX = d.startX + (d.targetX - d.startX) * eased;
        const curY = d.startY + (d.targetY - d.startY) * eased;

        if (t >= 1) {
          fallingDrops.splice(i, 1);
          const hit = ndcWaterHit(d.ndcX, d.ndcY, camera, aspect, pool, swellTime, WAVES);
          if (hit) {
            serial = (serial + 1) % 8;
            drops.push({
              key: `rain:${serial}`,
              x: hit.x,
              z: hit.z,
              u: hit.u,
              v: hit.v,
              radius: d.radius,
              strength: d.strength,
              intensity: d.intensity,
              screenX: d.targetX,
              screenY: d.targetY,
            });
          }
          spawnSplash(d.targetX, d.targetY, d.intensity);
        } else {
          streaks.push({
            x: curX,
            y: curY,
            dx: d.length * wind,
            dy: d.length,
            width: d.width,
            alpha: (0.45 + 0.45 * t) * Math.max(ambientAlpha, 0.35),
            isPrimary: true,
          });
        }
      }

      // Advance active impact splashes
      const activeSplashes = [];
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.age += safeDt;
        if (s.age >= s.duration) {
          splashes.splice(i, 1);
          continue;
        }
        activeSplashes.push({
          screenX: s.screenX,
          screenY: s.screenY,
          progress: s.age / s.duration,
          age: s.age,
          scale: s.scale,
          beads: s.beads,
        });
      }

      return {
        drops,
        visuals: {
          streaks,
          splashes: activeSplashes,
          intensity: ambientAlpha,
        },
      };
    },
  };
}
