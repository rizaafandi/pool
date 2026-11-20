function unit(x, y, z) {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

export const POOL = {
  halfExtent: 3,
  floorY: -0.42,
};

export const CAMERA = {
  eye: [0, 1.45, 0.65],
  target: [0, 0, 0.08],
  fovY: 42 * Math.PI / 180,
  near: 0.05,
  far: 30,
};

export const SIM = {
  size: 256,
  waveSpeed: 0.5,
  damping: 0.995,
  maxStepsPerFrame: 3,
  stepSeconds: 1 / 60,
  maxDrops: 12,
};

export const WAVES = [
  { dirX: 0.92, dirZ: 0.39, wavelength: 1.15, steepness: 0.18, phase: 0.0 },
  { dirX: -0.35, dirZ: 0.94, wavelength: 0.85, steepness: 0.15, phase: 1.7 },
  { dirX: -0.88, dirZ: -0.47, wavelength: 0.62, steepness: 0.12, phase: 2.9 },
  { dirX: 0.42, dirZ: -0.91, wavelength: 0.44, steepness: 0.08, phase: 0.8 },
];

// Ambient swell only. Touch ripples keep the simulation clock.
export const SWELL_TIME_SCALE = 0.4;

export const SUN_DIR = unit(0.22, 0.86, 0.46);
export const SUN_COLOR = [1.0, 0.97, 0.88];
export const SUN_INTENSITY = 1.55;

export const WATER = {
  ior: 1.333,
  f0: 0.02,
  absorption: [0.45, 0.12, 0.08],
};

export const DROP = {
  radius: 0.022,
  baseStrength: -0.042,
  speedScale: 0.018,
  maxSpeed: 2,
};

export const FINGER_TIPS = [4, 8, 12, 16, 20];

export const PALM = {
  radius: 0.055,
  strength: -0.026,
  speedScale: 0.012,
  maxSpeed: 2.5,
  sweepSpeed: 0.45,
  minSpeed: 0.08,
};

export const SPLASH = {
  radius: 0.048,
  strength: -0.105,
  minGrowthRate: 1.6,
  maxGrowthRate: 4.5,
  cooldownMs: 450,
};

export const CLAP = {
  maxDist: 0.14,
  minClosingSpeed: 0.45,
  radius: 0.085,
  strength: -0.135,
  cooldownMs: 700,
};

export const RAIN = {
  minIntervalMs: 85,
  maxIntervalMs: 190,
  minRadius: 0.014,
  maxRadius: 0.024,
  minStrength: -0.022,
  maxStrength: -0.038,
  ambientStreaks: 48,
  windX: -0.06,
  windZ: 0.02,
  minFallDuration: 0.22,
  maxFallDuration: 0.36,
  splashDuration: 0.44,
  firstThunderMinMs: 2200,
  firstThunderMaxMs: 4800,
  minThunderIntervalMs: 7500,
  maxThunderIntervalMs: 16500,
};

export const FLOATERS = {
  count: 7,
  maxCount: 28,
  boundsX: 0.95,
  minZ: -0.65,
  maxZ: 0.68,
  drag: 0.96,
  pushRadius: 0.55,
  pushGain: 4.2,
  dropHeightMin: 0.72,
  dropHeightMax: 0.98,
  fallSpeedMin: 0.40,
  fallSpeedMax: 0.54,
  swayAmp: 0.14,
  swayFreqMin: 2.2,
  swayFreqMax: 3.4,
};

export const KOI = {
  maxCount: 12,
  count: 9,
  boundsX: 1.18,
  minZ: -0.76,
  maxZ: 0.78,
  minY: -0.22,
  maxY: -0.10,
  cruiseSpeed: 0.18,
  dartSpeed: 0.68,
  fleeRadius: 0.72,
  attractRadius: 0.85,
  separationRadius: 0.28,
};

export const LANTERNS = {
  maxCount: 6,
  count: 4,
  boundsX: 0.96,
  minZ: -0.60,
  maxZ: 0.62,
  drag: 0.965,
  pushRadius: 0.58,
  pushGain: 3.0,
  separationRadius: 0.34,
};

export const POOL_BEDS = {
  tiles: { id: 'tiles', label: 'Tiles', weights: [1, 0, 0] },
  pebbles: { id: 'pebbles', label: 'Pebbles', weights: [0, 1, 0] },
  sand: { id: 'sand', label: 'Sand', weights: [0, 0, 1] },
};

export const POOL_BED_ORDER = ['tiles', 'pebbles', 'sand'];

export const WATER_CONDITIONS = {
  calm: {
    id: 'calm',
    label: 'Calm',
    swellAmp: 0.16,
    swellSpeed: 0.55,
    organicSlope: 0.26,
    damping: 0.9965,
    waveSpeed: 0.48,
    windDrift: 0.25,
  },
  breeze: {
    id: 'breeze',
    label: 'Breeze',
    swellAmp: 1.0,
    swellSpeed: 1.0,
    organicSlope: 1.0,
    damping: 0.995,
    waveSpeed: 0.50,
    windDrift: 1.0,
  },
  storm: {
    id: 'storm',
    label: 'Storm',
    swellAmp: 1.72,
    swellSpeed: 1.52,
    organicSlope: 1.55,
    damping: 0.992,
    waveSpeed: 0.56,
    windDrift: 2.15,
  },
};

export const WATER_CONDITION_ORDER = ['calm', 'breeze', 'storm'];

export const DAY_CYCLE = {
  cycleSeconds: 48,
};

export const SENSITIVITY_LEVELS = [
  { id: 'low', label: 'Splash: Low', rateMultiplier: 1.35 },
  { id: 'med', label: 'Splash: Med', rateMultiplier: 1.0 },
  { id: 'high', label: 'Splash: High', rateMultiplier: 0.68 },
];

export const THEMES = {
  sunlit: {
    id: 'sunlit',
    label: 'Sunlit',
    sunDir: SUN_DIR,
    sunColor: SUN_COLOR,
    sunIntensity: SUN_INTENSITY,
    tileDark: [0.03, 0.22, 0.48],
    tileMid: [0.05, 0.34, 0.66],
    tileBright: [0.09, 0.46, 0.78],
    groutCol: [0.18, 0.44, 0.64],
    skyDeep: [0.03, 0.16, 0.46],
    skyMid: [0.12, 0.42, 0.82],
    skyBright: [0.46, 0.76, 0.96],
    causticTint: [0.48, 0.90, 1.0],
    shaftStrength: 0.08,
    biolum: 0.0,
    nightGlow: 0.0,
    petalBase: 'rgba(248, 212, 146, 0.93)',
    petalMid: 'rgba(252, 236, 240, 0.94)',
    petalColor: 'rgba(254, 245, 248, 0.93)',
    petalEdge: 'rgba(245, 198, 212, 0.86)',
    petalVein: 'rgba(212, 148, 168, 0.24)',
    petalCore: 'rgba(238, 174, 58, 0.95)',
    petalStamen: 'rgba(248, 216, 122, 0.92)',
    leafBase: 'rgba(48, 96, 56, 0.94)',
    leafMid: 'rgba(68, 124, 68, 0.93)',
    leafEdge: 'rgba(104, 152, 86, 0.88)',
    leafVein: 'rgba(168, 202, 134, 0.34)',
    rainRgb: [224, 246, 255],
    rainTipRgb: [255, 255, 255],
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    sunDir: unit(0.58, 0.42, 0.70),
    sunColor: [1.0, 0.34, 0.05],
    sunIntensity: 1.72,
    tileDark: [0.14, 0.026, 0.008],
    tileMid: [0.34, 0.066, 0.014],
    tileBright: [0.60, 0.125, 0.024],
    groutCol: [0.46, 0.095, 0.022],
    skyDeep: [0.22, 0.036, 0.010],
    skyMid: [0.70, 0.135, 0.020],
    skyBright: [1.0, 0.34, 0.045],
    causticTint: [1.0, 0.30, 0.04],
    shaftStrength: 0.28,
    biolum: 0.0,
    nightGlow: 0.0,
    petalBase: 'rgba(255, 162, 74, 0.94)',
    petalMid: 'rgba(255, 212, 168, 0.95)',
    petalColor: 'rgba(255, 228, 198, 0.94)',
    petalEdge: 'rgba(255, 152, 86, 0.88)',
    petalVein: 'rgba(214, 108, 48, 0.26)',
    petalCore: 'rgba(245, 126, 36, 0.96)',
    petalStamen: 'rgba(255, 196, 92, 0.95)',
    leafBase: 'rgba(82, 74, 34, 0.95)',
    leafMid: 'rgba(126, 104, 42, 0.94)',
    leafEdge: 'rgba(182, 134, 52, 0.90)',
    leafVein: 'rgba(236, 186, 98, 0.34)',
    rainRgb: [255, 214, 174],
    rainTipRgb: [255, 240, 212],
  },
  night: {
    id: 'night',
    label: 'Night',
    sunDir: unit(-0.22, 0.78, 0.58),
    sunColor: [0.40, 0.54, 0.78],
    sunIntensity: 0.34,
    tileDark: [0.002, 0.006, 0.016],
    tileMid: [0.005, 0.014, 0.036],
    tileBright: [0.010, 0.026, 0.064],
    groutCol: [0.008, 0.019, 0.044],
    skyDeep: [0.001, 0.003, 0.010],
    skyMid: [0.004, 0.011, 0.030],
    skyBright: [0.018, 0.042, 0.090],
    causticTint: [0.04, 0.12, 0.24],
    shaftStrength: 0.015,
    biolum: 0.0,
    nightGlow: 0.92,
    petalBase: 'rgba(66, 86, 114, 0.88)',
    petalMid: 'rgba(92, 116, 148, 0.88)',
    petalColor: 'rgba(112, 138, 170, 0.86)',
    petalEdge: 'rgba(72, 96, 128, 0.80)',
    petalVein: 'rgba(48, 68, 96, 0.28)',
    petalCore: 'rgba(74, 102, 138, 0.90)',
    petalStamen: 'rgba(112, 142, 176, 0.86)',
    leafBase: 'rgba(14, 34, 44, 0.92)',
    leafMid: 'rgba(22, 50, 62, 0.90)',
    leafEdge: 'rgba(36, 72, 84, 0.86)',
    leafVein: 'rgba(76, 112, 126, 0.26)',
    rainRgb: [110, 148, 192],
    rainTipRgb: [165, 202, 238],
  },
  biolum: {
    id: 'biolum',
    label: 'Biolum',
    sunDir: unit(0.10, 0.90, 0.42),
    sunColor: [0.38, 0.96, 1.0],
    sunIntensity: 0.95,
    tileDark: [0.005, 0.02, 0.10],
    tileMid: [0.01, 0.05, 0.18],
    tileBright: [0.02, 0.10, 0.28],
    groutCol: [0.04, 0.16, 0.34],
    skyDeep: [0.004, 0.012, 0.07],
    skyMid: [0.012, 0.045, 0.18],
    skyBright: [0.08, 0.34, 0.64],
    causticTint: [0.14, 0.95, 1.0],
    shaftStrength: 0.03,
    biolum: 1.0,
    nightGlow: 0.35,
    petalBase: 'rgba(74, 238, 255, 0.92)',
    petalMid: 'rgba(156, 248, 255, 0.93)',
    petalColor: 'rgba(204, 252, 255, 0.92)',
    petalEdge: 'rgba(98, 226, 255, 0.86)',
    petalVein: 'rgba(56, 212, 238, 0.28)',
    petalCore: 'rgba(84, 244, 255, 0.98)',
    petalStamen: 'rgba(214, 255, 255, 0.96)',
    leafBase: 'rgba(18, 86, 102, 0.92)',
    leafMid: 'rgba(32, 132, 148, 0.90)',
    leafEdge: 'rgba(72, 198, 212, 0.86)',
    leafVein: 'rgba(128, 246, 255, 0.42)',
    rainRgb: [130, 244, 255],
    rainTipRgb: [220, 255, 255],
  },
};

export const THEME_ORDER = ['sunlit', 'sunset', 'night', 'biolum'];

export const HAND = {
  wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  numHands: 2,
};

export const MIRROR_X = true;

export const VIEW = {
  maxDpr: 1.5,
  causticSize: 1024,
  meshSegments: 200,
};