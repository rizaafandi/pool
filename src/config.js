function unit(x, y, z) {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

export const POOL = {
  halfExtent: 3,
  floorY: -0.75,
};

export const CAMERA = {
  eye: [0, 0.72, 1.15],
  target: [0, 0, 0.05],
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
};

export const WAVES = [
  { dirX: 1.0, dirZ: 0.25, wavelength: 2.2, steepness: 0.18, phase: 0.0 },
  { dirX: 0.15, dirZ: 1.0, wavelength: 1.3, steepness: 0.15, phase: 1.7 },
  { dirX: -0.6, dirZ: 0.55, wavelength: 0.7, steepness: 0.12, phase: 2.4 },
  { dirX: 0.8, dirZ: -0.6, wavelength: 0.28, steepness: 0.08, phase: 0.4 },
];

export const SUN_DIR = unit(0.35, 0.86, 0.37);
export const SUN_COLOR = [1.0, 0.98, 0.92];
export const SUN_INTENSITY = 1.4;

export const WATER = {
  ior: 1.333,
  f0: 0.02,
  absorption: [0.45, 0.12, 0.08],
};

export const DROP = {
  radius: 0.02,
  baseStrength: -0.03,
  speedScale: 0.02,
  maxSpeed: 2,
};

export const HAND = {
  wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  numHands: 1,
};

export const MIRROR_X = true;

export const VIEW = {
  maxDpr: 1.5,
  causticSize: 1024,
  meshSegments: 200,
};