import { CAMERA, DROP, POOL, SIM, VIEW } from './config.js';
import { ndcToRay, rayPlaneY } from './math.js';
import { createRenderer } from './render/renderer.js';

const canvas = document.querySelector('#pool');
const button = document.querySelector('#start');
button.textContent = 'Click and drag the water';

let renderer;
try {
  renderer = createRenderer(canvas);
} catch (error) {
  button.textContent = error.message || String(error);
  throw error;
}
let pointerDown = false;
let pendingDrop = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, VIEW.maxDpr);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  renderer.resize();
}

function dropAt(event) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
  const ray = ndcToRay(ndcX, ndcY, CAMERA, rect.width / rect.height);
  const hit = rayPlaneY(ray.origin, ray.dir, 0);
  if (!hit) return;
  if (Math.abs(hit[0]) > POOL.halfExtent || Math.abs(hit[2]) > POOL.halfExtent) return;
  pendingDrop = {
    u: hit[0] / (2 * POOL.halfExtent) + 0.5,
    v: hit[2] / (2 * POOL.halfExtent) + 0.5,
    radius: DROP.radius,
    strength: DROP.baseStrength,
  };
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

resize();
window.addEventListener('resize', resize);

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= SIM.stepSeconds && steps < SIM.maxStepsPerFrame) {
    renderer.step(pendingDrop);
    pendingDrop = null;
    accumulator -= SIM.stepSeconds;
    steps += 1;
  }
  renderer.draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);