const DEFAULT_LEVELS = [1, 0.8, 0.65, 0.5];

export function createAdaptiveQuality({
  levels = DEFAULT_LEVELS,
  slowFrameMs = 28,
  fastFrameMs = 19,
  hitchMs = 250,
  slowFramesToDowngrade = 45,
  fastFramesToUpgrade = 480,
} = {}) {
  let index = 0;
  let lastMs = null;
  let slowStreak = 0;
  let fastStreak = 0;

  return {
    scale() {
      return levels[index];
    },

    // Returns the new scale when the level changes, otherwise null.
    update(nowMs) {
      if (lastMs === null) {
        lastMs = nowMs;
        return null;
      }
      const frameMs = nowMs - lastMs;
      lastMs = nowMs;
      if (!(frameMs > 0) || frameMs > hitchMs) {
        // Tab switch / debugger pause: not evidence about GPU speed.
        slowStreak = 0;
        fastStreak = 0;
        return null;
      }
      if (frameMs >= slowFrameMs) {
        slowStreak += 1;
        fastStreak = 0;
        if (slowStreak >= slowFramesToDowngrade && index < levels.length - 1) {
          index += 1;
          slowStreak = 0;
          return levels[index];
        }
      } else if (frameMs <= fastFrameMs) {
        fastStreak += 1;
        slowStreak = 0;
        if (fastStreak >= fastFramesToUpgrade && index > 0) {
          index -= 1;
          fastStreak = 0;
          return levels[index];
        }
      } else {
        slowStreak = 0;
        fastStreak = 0;
      }
      return null;
    },
  };
}
