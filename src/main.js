import { VIEW } from './config.js';
import { createGL } from './gl.js';

const canvas = document.querySelector('#pool');
const button = document.querySelector('#start');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, VIEW.maxDpr);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
}

function showError(error) {
  button.textContent = error.message || String(error);
}

try {
  resize();
  const gl = createGL(canvas);
  window.addEventListener('resize', () => {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
  });
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.15, 0.28, 1);
  const frame = () => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (error) {
  showError(error);
}