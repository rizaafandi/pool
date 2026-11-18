import { CAMERA, DROP, POOL, SIM, VIEW } from './config.js';
import { createHands } from './input/hands.js';
import { impulseStrength, planarSpeed } from './input/touch.js';
import { ndcToRay, rayPlaneY } from './math.js';
import { createRenderer } from './render/renderer.js';

const canvas = document.querySelector('#pool');
const video = document.querySelector('#cam');
const gate = document.querySelector('#gate');
const button = document.querySelector('#start');

let renderer;
try {
  renderer = createRenderer(canvas);
} catch (error) {
  button.textContent = error.message || String(error);
  throw error;
}

let hands = null;
let pointerDown = false;
let pendingDrop = null;
let previousHit = null;
let lastSampleAt = performance.now();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, VIEW.maxDpr);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  renderer.resize();
}

function stamp(hit, speed) {
  pendingDrop = {
    u: hit.u,
    v: hit.v,
    radius: DROP.radius,
    strength: impulseStrength(speed),
  };
}

function dropAt(event) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
  const ray = ndcToRay(ndcX, ndcY, CAMERA, rect.width / rect.height);
  const hit = rayPlaneY(ray.origin, ray.dir, 0);
  if (!hit) return;
  if (Math.abs(hit[0]) > POOL.halfExtent || Math.abs(hit[2]) > POOL.halfExtent) return;
  stamp({
    x: hit[0],
    z: hit[2],
    u: hit[0] / (2 * POOL.halfExtent) + 0.5,
    v: hit[2] / (2 * POOL.halfExtent) + 0.5,
  }, 0);
}

canvas.addEventListener('pointerdown', (event) => {
  pointerDown = true;
  dropAt(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (pointerDown) dropAt(event);
});
window.addEventListener('pointerup', () => {
  pointerDown = false;
});

button.addEventListener('click', async () => {
  if (!window.isSecureContext) {
    button.textContent = 'Open this page on localhost.';
    return;
  }
  button.textContent = 'Starting the camera…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    hands = await createHands(video);
    gate.classList.add('hidden');
  } catch (error) {
    button.textContent = 'Camera blocked. Click and drag the water instead.';
  }
});

resize();
window.addEventListener('resize', resize);

let last = performance.now();
let accumulator = 0;
const start = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (hands) {
    const aspect = canvas.width / canvas.height;
    const sample = hands.sample(CAMERA, aspect, POOL);
    const sampleDt = Math.max(0.001, (now - lastSampleAt) / 1000);
    if (sample && sample.touching && sample.hit) {
      const speed = planarSpeed(previousHit, sample.hit, sampleDt);
      stamp(sample.hit, speed);
      previousHit = sample.hit;
      lastSampleAt = now;
    } else if (!sample || !sample.touching) {
      previousHit = null;
    }
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= SIM.stepSeconds && steps < SIM.maxStepsPerFrame) {
    renderer.step(pendingDrop);
    pendingDrop = null;
    accumulator -= SIM.stepSeconds;
    steps += 1;
  }
  renderer.draw((now - start) / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
