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
  windAngle: -0.15,
  minFallDuration: 0.22,
  maxFallDuration: 0.36,
  splashDuration: 0.44,
};

export const FLOATERS = {
  count: 7,
  boundsX: 0.95,
  minZ: -0.65,
  maxZ: 0.68,
  drag: 0.96,
  pushRadius: 0.55,
  pushGain: 4.2,
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
    tileDark: [0.025, 0.15, 0.58],
    tileMid: [0.055, 0.28, 0.80],
    tileBright: [0.09, 0.42, 0.90],
    groutCol: [0.22, 0.54, 0.86],
    skyDeep: [0.015, 0.08, 0.50],
    skyMid: [0.06, 0.27, 0.90],
    skyBright: [0.38, 0.90, 1.0],
    causticTint: [0.24, 0.82, 1.0],
    shaftStrength: 0.14,
    biolum: 0.0,
    nightGlow: 0.0,
    petalColor: 'rgba(255, 245, 250, 0.92)',
    petalCore: 'rgba(255, 210, 110, 0.95)',
    rainRgb: [224, 246, 255],
    rainTipRgb: [255, 255, 255],
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    sunDir: unit(0.45, 0.56, 0.69),
    sunColor: [1.0, 0.72, 0.36],
    sunIntensity: 1.85,
    tileDark: [0.07, 0.09, 0.34],
    tileMid: [0.16, 0.18, 0.52],
    tileBright: [0.32, 0.26, 0.60],
    groutCol: [0.46, 0.38, 0.62],
    skyDeep: [0.08, 0.06, 0.30],
    skyMid: [0.36, 0.18, 0.52],
    skyBright: [1.0, 0.62, 0.38],
    causticTint: [1.0, 0.68, 0.42],
    shaftStrength: 0.22,
    biolum: 0.0,
    nightGlow: 0.0,
    petalColor: 'rgba(255, 232, 220, 0.92)',
    petalCore: 'rgba(255, 165, 80, 0.95)',
    rainRgb: [255, 228, 212],
    rainTipRgb: [255, 246, 228],
  },
  night: {
    id: 'night',
    label: 'Night',
    sunDir: unit(-0.18, 0.88, 0.44),
    sunColor: [0.76, 0.88, 1.0],
    sunIntensity: 1.15,
    tileDark: [0.01, 0.07, 0.24],
    tileMid: [0.02, 0.18, 0.44],
    tileBright: [0.05, 0.36, 0.64],
    groutCol: [0.14, 0.44, 0.68],
    skyDeep: [0.006, 0.022, 0.12],
    skyMid: [0.02, 0.08, 0.28],
    skyBright: [0.22, 0.56, 0.84],
    causticTint: [0.16, 0.78, 0.96],
    shaftStrength: 0.06,
    biolum: 0.0,
    nightGlow: 0.85,
    petalColor: 'rgba(205, 236, 255, 0.88)',
    petalCore: 'rgba(130, 225, 255, 0.92)',
    rainRgb: [190, 230, 255],
    rainTipRgb: [235, 248, 255],
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
    petalColor: 'rgba(170, 250, 255, 0.92)',
    petalCore: 'rgba(90, 240, 255, 1.0)',
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