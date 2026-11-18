# Realistic Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat caustic shader with one fullscreen page of a sunlit pool that keeps moving on its own, and that a fingertip from the webcam can press and drag.

**Architecture:** The surface is the sum of two height fields. Four Gerstner waves are a function of time, so the pool never goes still. A 256×256 GPU height field, stepped with the discrete wave equation, carries the ripples a touch creates; those ripples travel and bounce off the hidden pool walls. The pixel shader refracts the view ray down to a pool floor, absorbs red light along that path, reflects a sky with Fresnel, and adds a sun glint. A second pass projects the water mesh along the refracted sunlight and stores brightness as area-in over area-out (Evan Wallace's caustic method, original code). The webcam runs MediaPipe HandLandmarker. A pointed index finger, or a thumb-index pinch, unprojects landmark 8 through the camera onto the plane y = 0 and stamps a dent into the height field. The hand is a pointer, not a simulated solid.

**Tech Stack:** Vite 8.3.8, Vitest 5.1.1, WebGL2, `@mediapipe/tasks-vision` 1.2.3. No Three.js, no React.

## Global Constraints

- One fullscreen canvas. After the camera starts, the page shows only water: no panel, no sliders, no visible video.
- WebGL2 plus `EXT_color_buffer_float`. If either is missing, write the error into `#start` and do not start the loop.
- Dependencies are exactly `vite@8.3.8`, `vitest@5.1.1`, `@mediapipe/tasks-vision@1.2.3`.
- Wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm`
- Model: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- Simulation: size 256, `waveSpeed` 0.5, `damping` 0.995, fixed step 1/60 second, at most 3 steps per displayed frame.
- Pool half extent 3 m (the water covers x and z in [-3, 3]). Floor at y = -0.75.
- Camera eye `(0, 0.72, 1.15)`, target `(0, 0, 0.05)`, vertical fov 42°, near 0.05, far 30.
- Water IOR 1.333, Fresnel F0 0.02, absorption per meter `(0.45, 0.12, 0.08)`.
- Sun direction is `normalize(0.35, 0.86, 0.37)`. Sun color `(1.0, 0.98, 0.92)`, intensity 1.4.
- Exactly four Gerstner waves, the array in `src/config.js`. Sum of steepness is 0.53, which must stay below 1.
- One hand. Contact is a pointed index finger or a thumb-index pinch. The contact point is landmark 8 (index fingertip).
- `MIRROR_X` is true: screen x = `1 - landmark.x`, so a hand moving left moves the ripple left.
- Device pixel ratio cap 1.5. Caustic map 1024×1024. Water mesh 200×200 segments.
- The height field cannot splash, spray, or fold over. Do not add particles or a hand mesh.
- Do not copy Evan Wallace's shader source. The steps below are the implementation.
- This repo's shell is PowerShell. Commit with `git commit -m "message"`.

## Research notes

The file `index.html` today draws a fullscreen quad. Voronoi edges plus fbm warping imitate caustic lines, and a noise term imitates glints. Nothing in that shader is a surface, so a finger has nowhere to push, and the light does not pass through a wave. Keep none of that shader.

Rejected alternatives:

- Gerstner waves alone look alive and are cheap, but a touch cannot leave a ring. They stay as the ambient swell only.
- An FFT ocean looks like open sea, costs a lot, and is a poor fit for a pool you poke.
- A Three.js port of the 2011 WebGL Water demo renders a pool you orbit, with a ball. The target picture is a close frame filled with water. Raw WebGL2 keeps the render targets obvious.

Webcam depth is not a distance you can trust. MediaPipe image landmark `z` is relative to the wrist, and world landmarks are a hand-sized coordinate frame with Y pointing down. "Touch" is therefore a pose, not a z threshold. Canned gesture names (`Pointing_Up`, and so on) flicker and are not used. The 21 landmarks are.

A single webcam frame is what the model reads. `detectForVideo` is synchronous. Call it from the animation frame only when `video.currentTime` changes, and pass a strictly increasing timestamp.

## File map

- `index.html` — canvas, hidden `<video>`, one button. Replaces the current shader page.
- `package.json`, `vite.config.js`, `.gitignore` — Vite and Vitest.
- `src/config.js` — every locked constant.
- `src/math.js` — vectors, matrices, rays, frustum hits on y = 0.
- `src/sim/heightfield.js` — CPU wave step and drop stamp. The GPU shader copies these formulas.
- `src/sim/gerstner.js` — CPU Gerstner displacement and normal. The GLSL function copies this formula.
- `src/input/touch.js` — pointing, pinching, mirrored fingertip ray, impulse strength.
- `src/input/hands.js` — MediaPipe wrapper.
- `src/gl.js` — context, shader program, float framebuffer.
- `src/render/shaders.js` — all GLSL.
- `src/render/mesh.js` — grid positions and indices, no GL.
- `src/render/renderer.js` — sim pass, caustic pass, water pass.
- `src/main.js` — resize, clock, mouse, camera button, frame loop.
- `tests/*.test.js` — Vitest, node environment. Shaders are not executed in Vitest. Each visual task has a browser check.

---

### Task 1: Scaffold, constants, and camera math

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `src/config.js`, `src/math.js`, `src/gl.js`, `src/main.js`, `tests/math.test.js`
- Modify: `index.html` (replace the whole file)
- Test: `tests/math.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `POOL`, `CAMERA`, `SIM`, `WAVES`, `SUN_DIR`, `SUN_COLOR`, `SUN_INTENSITY`, `WATER`, `DROP`, `HAND`, `MIRROR_X`, `VIEW` from `src/config.js`
  - `sub`, `add`, `scale`, `dot`, `cross`, `norm`, `lookAt`, `perspective`, `multiply`, `transformPoint`, `cameraBasis`, `ndcToRay`, `rayPlaneY`, `frustumCornersOnY` from `src/math.js`
  - `createGL(canvas)` from `src/gl.js` throws `Error` with a readable message

- [ ] **Step 1: Write the failing test**

Create `tests/math.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { CAMERA, POOL, SUN_DIR, WAVES } from '../src/config.js';
import { frustumCornersOnY, lookAt, transformPoint } from '../src/math.js';

describe('camera framing', () => {
  it('keeps every frustum corner on the water plane inside the pool', () => {
    for (const aspect of [0.5, 9 / 16, 1, 16 / 9, 2]) {
      const hits = frustumCornersOnY(CAMERA, aspect, 0);
      expect(hits).toHaveLength(4);
      for (const hit of hits) {
        expect(Math.abs(hit[0])).toBeLessThanOrEqual(POOL.halfExtent);
        expect(Math.abs(hit[2])).toBeLessThanOrEqual(POOL.halfExtent);
        expect(hit[1]).toBeCloseTo(0, 5);
      }
    }
  });

  it('puts the look-at target on the view -Z axis', () => {
    const view = lookAt(CAMERA.eye, CAMERA.target, [0, 1, 0]);
    const p = transformPoint(view, CAMERA.target);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(0, 5);
    expect(p[2]).toBeLessThan(0);
  });
});

describe('locked look constants', () => {
  it('uses four gentle waves and a unit sun', () => {
    expect(WAVES).toHaveLength(4);
    const steep = WAVES.reduce((sum, wave) => sum + wave.steepness, 0);
    expect(steep).toBeCloseTo(0.53, 5);
    expect(steep).toBeLessThan(1);
    const sunLength = Math.hypot(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
    expect(sunLength).toBeCloseTo(1, 5);
    expect(SUN_DIR[1]).toBeGreaterThan(0.8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/math.test.js`

Expected: FAIL, cannot find `../src/config.js`

- [ ] **Step 3: Write the scaffold and the math**

`package.json`:

```json
{
  "name": "water-caustics",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "8.3.8",
    "vitest": "5.1.1"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "1.2.3"
  }
}
```

`vite.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

`.gitignore`:

```
node_modules
dist
```

`src/config.js`:

```javascript
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
```

`src/math.js`:

```javascript
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function norm(a) {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function lookAt(eye, target, up) {
  const f = norm(sub(target, eye));
  const s = norm(cross(f, up));
  const u = cross(s, f);
  return new Float32Array([
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -dot(s, eye), -dot(u, eye), dot(f, eye), 1,
  ]);
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) * nf;
  o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}

export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function transformPoint(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x, y, z, w];
}

export function cameraBasis(camera) {
  const forward = norm(sub(camera.target, camera.eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { forward, right, up };
}

export function ndcToRay(ndcX, ndcY, camera, aspect) {
  const { forward, right, up } = cameraBasis(camera);
  const tan = Math.tan(camera.fovY / 2);
  const dir = norm(add(
    forward,
    add(scale(right, ndcX * tan * aspect), scale(up, ndcY * tan)),
  ));
  return { origin: camera.eye.slice(), dir };
}

export function rayPlaneY(origin, dir, y) {
  if (dir[1] >= -1e-6) return null;
  const t = (y - origin[1]) / dir[1];
  if (t < 0) return null;
  return [
    origin[0] + dir[0] * t,
    y,
    origin[2] + dir[2] * t,
  ];
}

export function frustumCornersOnY(camera, aspect, y) {
  const hits = [];
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const ray = ndcToRay(sx, sy, camera, aspect);
      const hit = rayPlaneY(ray.origin, ray.dir, y);
      if (!hit) return null;
      hits.push(hit);
    }
  }
  return hits;
}
```

`src/gl.js`:

```javascript
export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('This browser has no WebGL2.');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('This browser cannot render floating-point buffers.');
  }
  return gl;
}

export function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'shader compile failed';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

export function program(gl, vsSource, fsSource) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
  }
  return p;
}
```

Replace `index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pool</title>
  <style>
    html, body { margin: 0; height: 100%; background: #042033; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #gate {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif;
    }
    #gate button {
      background: transparent; color: white;
      border: 1px solid rgba(255,255,255,0.75);
      padding: 0.8rem 1.2rem; font-size: 1rem;
      border-radius: 999px; cursor: pointer;
    }
    #gate.hidden { display: none; }
    video {
      position: fixed; width: 1px; height: 1px;
      opacity: 0; pointer-events: none;
    }
  </style>
</head>
<body>
  <canvas id="pool"></canvas>
  <video id="cam" playsinline autoplay muted></video>
  <div id="gate"><button id="start" type="button">Touch the water</button></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

`src/main.js`:

```javascript
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
```

- [ ] **Step 4: Install and run the tests**

Run: `npm install`

Run: `npx vitest run tests/math.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 5: Confirm the page clears**

Run: `npm run dev`

Open the printed local URL. The page is a flat dark blue with the button "Touch the water" centered. The button does nothing yet. Stop the server after looking.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vite.config.js .gitignore index.html src/config.js src/math.js src/gl.js src/main.js tests/math.test.js
git commit -m "feat: scaffold the pool page and lock the camera framing"
```

---

### Task 2: Height field that can be touched with the mouse

**Files:**
- Create: `src/sim/heightfield.js`, `src/render/shaders.js`, `src/render/renderer.js`, `tests/heightfield.test.js`
- Modify: `src/gl.js`, `src/main.js`
- Test: `tests/heightfield.test.js`

**Interfaces:**
- Consumes: `SIM` from `src/config.js`; `createGL`, `program` from `src/gl.js`
- Produces:
  - `stepHeightfield(height, velocity, size, waveSpeed, damping) -> { height: Float32Array, velocity: Float32Array }`
  - `dropProfile(distance, radius) -> number` in `[0, 1]`
  - `addDrop(height, size, u, v, radius, strength) -> Float32Array`
  - `makeFloatTarget(gl, size, filter) -> { tex, fb, size }`
  - `createRenderer(canvas) -> { step(drop|null), draw(), resize() }`
  - `drop` is `{ u, v, radius, strength }` with `u` and `v` in 0..1, or `null`

- [ ] **Step 1: Write the failing test**

Create `tests/heightfield.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { SIM } from '../src/config.js';
import { addDrop, dropProfile, stepHeightfield } from '../src/sim/heightfield.js';

describe('dropProfile', () => {
  it('is 1 at the center, 0 at the radius, and 0 outside', () => {
    expect(dropProfile(0, 0.02)).toBeCloseTo(1, 5);
    expect(dropProfile(0.02, 0.02)).toBeCloseTo(0, 5);
    expect(dropProfile(0.03, 0.02)).toBe(0);
  });
});

describe('stepHeightfield', () => {
  it('spreads a raised center into its neighbors and holds the border at 0', () => {
    const size = 5;
    const height = new Float32Array(size * size);
    const velocity = new Float32Array(size * size);
    height[12] = 1;
    const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
    expect(next.height[12]).toBeCloseTo(-0.99, 5);
    expect(next.velocity[12]).toBeCloseTo(-1.99, 5);
    expect(next.height[11]).toBeCloseTo(0.4975, 5);
    expect(next.height[2]).toBe(0);
    expect(next.velocity[2]).toBe(0);
  });

  it('damps velocity when the neighborhood is flat', () => {
    const size = 5;
    const height = new Float32Array(size * size);
    const velocity = new Float32Array(size * size);
    velocity[12] = 1;
    const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
    expect(next.velocity[12]).toBeCloseTo(0.995, 5);
    expect(next.height[12]).toBeCloseTo(0.995, 5);
  });

  it('stays finite for 300 steps after a hard drop', () => {
    const size = 64;
    let height = new Float32Array(size * size);
    let velocity = new Float32Array(size * size);
    height = addDrop(height, size, 0.5, 0.5, 0.08, -0.2);
    for (let i = 0; i < 300; i++) {
      const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
      height = next.height;
      velocity = next.velocity;
    }
    let maxAbs = 0;
    for (const value of height) {
      expect(Number.isFinite(value)).toBe(true);
      maxAbs = Math.max(maxAbs, Math.abs(value));
    }
    expect(maxAbs).toBeLessThan(1);
  });
});

describe('addDrop', () => {
  it('changes the center cell and leaves a far cell and the border alone', () => {
    const size = 32;
    const height = new Float32Array(size * size);
    const next = addDrop(height, size, 0.5, 0.5, 0.05, -0.04);
    const center = 16 * size + 16;
    expect(next[center]).toBeLessThan(-0.03);
    expect(next[0]).toBe(0);
    expect(next[size * size - 1]).toBe(0);
    expect(next[1]).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/heightfield.test.js`

Expected: FAIL, cannot find `../src/sim/heightfield.js`

- [ ] **Step 3: Implement the CPU field, the update shader, and a debug view**

`src/sim/heightfield.js`:

```javascript
export function dropProfile(distance, radius) {
  if (!(radius > 0) || distance >= radius) return 0;
  const mask = 1 - distance / radius;
  return 0.5 - Math.cos(mask * Math.PI) * 0.5;
}

export function stepHeightfield(height, velocity, size, waveSpeed, damping) {
  const nextH = new Float32Array(size * size);
  const nextV = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) continue;
      const sum = height[i - 1] + height[i + 1] + height[i - size] + height[i + size];
      let v = velocity[i] + (sum - 4 * height[i]) * waveSpeed;
      v *= damping;
      nextH[i] = height[i] + v;
      nextV[i] = v;
    }
  }
  return { height: nextH, velocity: nextV };
}

export function addDrop(height, size, u, v, radius, strength) {
  const next = new Float32Array(height);
  const cx = u * (size - 1);
  const cy = v * (size - 1);
  const reach = Math.ceil(radius * (size - 1));
  const y0 = Math.max(1, Math.floor(cy - reach));
  const y1 = Math.min(size - 2, Math.ceil(cy + reach));
  const x0 = Math.max(1, Math.floor(cx - reach));
  const x1 = Math.min(size - 2, Math.ceil(cx + reach));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const distance = Math.hypot(x - cx, y - cy) / (size - 1);
      next[y * size + x] += dropProfile(distance, radius) * strength;
    }
  }
  return next;
}
```

Append to `src/gl.js`:

```javascript
export function makeFloatTarget(gl, size, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0,
    gl.RGBA, gl.HALF_FLOAT, null,
  );
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('Floating-point framebuffer is incomplete.');
  }
  return { tex, fb, size };
}
```

Create `src/render/shaders.js` with the debug shaders. Task 4 replaces the file body and keeps `QUAD_VS` and `UPDATE_FS`.

```javascript
export const QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const UPDATE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform float u_waveSpeed;
uniform float u_damping;
uniform vec2 u_dropCenter;
uniform float u_dropRadius;
uniform float u_dropStrength;
uniform float u_texel;

void main() {
  vec4 s = texture(u_state, v_uv);
  float h = s.r;
  float left = texture(u_state, v_uv + vec2(-u_texel, 0.0)).r;
  float right = texture(u_state, v_uv + vec2(u_texel, 0.0)).r;
  float down = texture(u_state, v_uv + vec2(0.0, -u_texel)).r;
  float up = texture(u_state, v_uv + vec2(0.0, u_texel)).r;
  float velocity = s.g + ((left + right + down + up) - 4.0 * h) * u_waveSpeed;
  velocity *= u_damping;
  h += velocity;

  if (u_dropStrength != 0.0) {
    float dist = length(v_uv - u_dropCenter);
    float mask = clamp(1.0 - dist / u_dropRadius, 0.0, 1.0);
    float drop = 0.5 - cos(mask * 3.14159265) * 0.5;
    h += drop * u_dropStrength;
  }

  vec2 inside = step(vec2(u_texel), v_uv) * step(v_uv, vec2(1.0 - u_texel));
  float border = inside.x * inside.y;
  outColor = vec4(h * border, velocity * border, 0.0, 1.0);
}
`;

export const DEBUG_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
void main() {
  float h = texture(u_state, v_uv).r;
  float shade = clamp(0.5 + h * 6.0, 0.0, 1.0);
  outColor = vec4(shade * 0.4, shade * 0.75, shade, 1.0);
}
`;
```

The update shader is the GPU copy of `stepHeightfield` followed by `addDrop`. The cosine drop is `dropProfile`. The border is forced to 0 last, matching the CPU loops that skip x = 0, y = 0, x = size - 1, and y = size - 1.

Create `src/render/renderer.js`:

```javascript
import { SIM } from '../config.js';
import { createGL, makeFloatTarget, program } from '../gl.js';
import { DEBUG_FS, QUAD_VS, UPDATE_FS } from './shaders.js';

function quad(gl) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  return buffer;
}

export function createRenderer(canvas) {
  const gl = createGL(canvas);
  const nearest = gl.NEAREST;
  let read = makeFloatTarget(gl, SIM.size, nearest);
  let write = makeFloatTarget(gl, SIM.size, nearest);
  const positions = quad(gl);
  const updateProg = program(gl, QUAD_VS, UPDATE_FS);
  const debugProg = program(gl, QUAD_VS, DEBUG_FS);

  function clearTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.size, target.size);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  clearTarget(read);
  clearTarget(write);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  function bindQuad(prog) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    const loc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  return {
    step(drop) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
      gl.viewport(0, 0, SIM.size, SIM.size);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      bindQuad(updateProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(updateProg, 'u_state'), 0);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_waveSpeed'), SIM.waveSpeed);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_damping'), SIM.damping);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_texel'), 1 / SIM.size);
      const active = drop && drop.strength !== 0;
      gl.uniform2f(
        gl.getUniformLocation(updateProg, 'u_dropCenter'),
        active ? drop.u : 0,
        active ? drop.v : 0,
      );
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropRadius'), active ? drop.radius : 1);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropStrength'), active ? drop.strength : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const swap = read;
      read = write;
      write = swap;
    },
    draw() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST);
      bindQuad(debugProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(debugProg, 'u_state'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    resize() {},
  };
}
```

Replace `src/main.js` with:

```javascript
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/heightfield.test.js tests/math.test.js`

Expected: PASS

- [ ] **Step 5: Confirm ripples in the browser**

Run: `npm run dev`

The page is a flat blue field. Press and drag. A bright ring must appear under the pointer and expand, then fade. Dragging leaves a trail. Rings that reach the edge bounce back rather than leaving the square. If the picture stays flat, the update shader is not swapping the two float targets.

- [ ] **Step 6: Commit**

```powershell
git add src/sim/heightfield.js src/gl.js src/render/shaders.js src/render/renderer.js src/main.js tests/heightfield.test.js
git commit -m "feat: simulate pool ripples on the GPU and poke them with the pointer"
```

---

### Task 3: Ambient Gerstner swell

**Files:**
- Create: `src/sim/gerstner.js`, `tests/gerstner.test.js`
- Test: `tests/gerstner.test.js`

**Interfaces:**
- Consumes: `WAVES` from `src/config.js`
- Produces: `gerstnerAt(x, z, time, waves) -> { ox, oy, oz, normal: [x, y, z] }`
  - World position of the swell is `(x + ox, oy, z + oz)`.
  - `normal` is unit length and points generally upward.

- [ ] **Step 1: Write the failing test**

Create `tests/gerstner.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { WAVES } from '../src/config.js';
import { gerstnerAt } from '../src/sim/gerstner.js';

function referenceHeight(x, z, time, waves) {
  let y = 0;
  for (const w of waves) {
    const len = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / len;
    const dz = w.dirZ / len;
    const k = (Math.PI * 2) / w.wavelength;
    const speed = Math.sqrt(9.8 / k);
    const a = w.steepness / k;
    const f = k * (dx * x + dz * z - speed * time) + w.phase;
    y += a * Math.sin(f);
  }
  return y;
}

describe('gerstnerAt', () => {
  it('matches the closed-form height at the origin and at a later time', () => {
    const a = gerstnerAt(0, 0, 0, WAVES);
    const b = gerstnerAt(1.2, -0.4, 0.75, WAVES);
    expect(a.oy).toBeCloseTo(referenceHeight(0, 0, 0, WAVES), 5);
    expect(b.oy).toBeCloseTo(referenceHeight(1.2, -0.4, 0.75, WAVES), 5);
  });

  it('moves between t = 0 and t = 0.4', () => {
    const a = gerstnerAt(0.3, 0.2, 0, WAVES);
    const b = gerstnerAt(0.3, 0.2, 0.4, WAVES);
    expect(Math.abs(a.oy - b.oy)).toBeGreaterThan(0.002);
  });

  it('returns an upward unit normal', () => {
    const g = gerstnerAt(0.4, -0.7, 0.2, WAVES);
    const length = Math.hypot(g.normal[0], g.normal[1], g.normal[2]);
    expect(length).toBeCloseTo(1, 5);
    expect(g.normal[1]).toBeGreaterThan(0.8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/gerstner.test.js`

Expected: FAIL, cannot find `../src/sim/gerstner.js`

- [ ] **Step 3: Implement Gerstner**

`src/sim/gerstner.js`:

```javascript
export function gerstnerAt(x, z, time, waves) {
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let tx = 1;
  let ty = 0;
  let tz = 0;
  let bx = 0;
  let by = 0;
  let bz = 1;
  for (const w of waves) {
    const len = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / len;
    const dz = w.dirZ / len;
    const k = (Math.PI * 2) / w.wavelength;
    const speed = Math.sqrt(9.8 / k);
    const a = w.steepness / k;
    const f = k * (dx * x + dz * z - speed * time) + w.phase;
    const s = Math.sin(f);
    const c = Math.cos(f);
    ox += dx * a * c;
    oy += a * s;
    oz += dz * a * c;
    tx += -dx * dx * (w.steepness * s);
    ty += dx * (w.steepness * c);
    tz += -dx * dz * (w.steepness * s);
    bx += -dx * dz * (w.steepness * s);
    by += dz * (w.steepness * c);
    bz += -dz * dz * (w.steepness * s);
  }
  const nx = by * tz - bz * ty;
  const ny = bz * tx - bx * tz;
  const nz = bx * ty - by * tx;
  const inv = 1 / Math.hypot(nx, ny, nz);
  return { ox, oy, oz, normal: [nx * inv, ny * inv, nz * inv] };
}
```

The GLSL added in Task 4 must use this same expansion: horizontal offset `(dx, dz) * a * cos(f)`, height `a * sin(f)`, tangent and binormal derivatives as written, normal `cross(binormal, tangent)`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/gerstner.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/gerstner.js tests/gerstner.test.js
git commit -m "feat: add the ambient Gerstner swell used by the water surface"
```

---

### Task 4: Shade the surface so it reads as a pool

**Files:**
- Create: `src/render/mesh.js`, `tests/mesh.test.js`
- Modify: `src/render/shaders.js` (replace), `src/render/renderer.js` (replace)
- Test: `tests/mesh.test.js`

**Interfaces:**
- Consumes: `gerstnerAt` formula (copied into GLSL, not imported), `createGrid` from `src/render/mesh.js`, `WAVES`, `POOL`, `CAMERA`, `WATER`, `SUN_DIR`, `SUN_COLOR`, `SUN_INTENSITY`, `SIM`, `VIEW` 
- Produces: `createGrid(segments, half) -> { positions: Float32Array, indices: Uint32Array }` where `positions` is pairs of x, z. `createRenderer` now draws the shaded mesh. `step(drop)` is unchanged. `resize()` rebuilds the view-projection matrix.

- [ ] **Step 1: Write the failing test**

Create `tests/mesh.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { createGrid } from '../src/render/mesh.js';

describe('createGrid', () => {
  it('covers the pool square and builds six indices per cell', () => {
    const segments = 2;
    const half = 3;
    const { positions, indices } = createGrid(segments, half);
    expect(positions).toHaveLength(3 * 3 * 2);
    expect(indices).toHaveLength(2 * 2 * 6);
    expect(positions[0]).toBe(-3);
    expect(positions[1]).toBe(-3);
    expect(positions[positions.length - 2]).toBe(3);
    expect(positions[positions.length - 1]).toBe(3);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(3);
    expect(indices[2]).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mesh.test.js`

Expected: FAIL, cannot find `../src/render/mesh.js`

- [ ] **Step 3: Add the grid, the water shader, and the shaded renderer**

`src/render/mesh.js`:

```javascript
export function createGrid(segments, half) {
  const n = segments + 1;
  const positions = new Float32Array(n * n * 2);
  const indices = new Uint32Array(segments * segments * 6);
  let p = 0;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      positions[p++] = -half + (x / segments) * (2 * half);
      positions[p++] = -half + (z / segments) * (2 * half);
    }
  }
  let i = 0;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const a = z * n + x;
      indices[i++] = a;
      indices[i++] = a + n;
      indices[i++] = a + 1;
      indices[i++] = a + 1;
      indices[i++] = a + n;
      indices[i++] = a + n + 1;
    }
  }
  return { positions, indices };
}
```

Replace `src/render/shaders.js` with the update shaders from Task 2 plus the water shaders. Keep `QUAD_VS`, `UPDATE_FS`. Delete `DEBUG_FS`.

```javascript
export const QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const UPDATE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform float u_waveSpeed;
uniform float u_damping;
uniform vec2 u_dropCenter;
uniform float u_dropRadius;
uniform float u_dropStrength;
uniform float u_texel;

void main() {
  vec4 s = texture(u_state, v_uv);
  float h = s.r;
  float left = texture(u_state, v_uv + vec2(-u_texel, 0.0)).r;
  float right = texture(u_state, v_uv + vec2(u_texel, 0.0)).r;
  float down = texture(u_state, v_uv + vec2(0.0, -u_texel)).r;
  float up = texture(u_state, v_uv + vec2(0.0, u_texel)).r;
  float velocity = s.g + ((left + right + down + up) - 4.0 * h) * u_waveSpeed;
  velocity *= u_damping;
  h += velocity;

  if (u_dropStrength != 0.0) {
    float dist = length(v_uv - u_dropCenter);
    float mask = clamp(1.0 - dist / u_dropRadius, 0.0, 1.0);
    float drop = 0.5 - cos(mask * 3.14159265) * 0.5;
    h += drop * u_dropStrength;
  }

  vec2 inside = step(vec2(u_texel), v_uv) * step(v_uv, vec2(1.0 - u_texel));
  float border = inside.x * inside.y;
  outColor = vec4(h * border, velocity * border, 0.0, 1.0);
}
`;

export const GERSTNER_FN = `
vec3 gerstner(vec2 xz, out vec2 horizontal, out float height) {
  horizontal = vec2(0.0);
  height = 0.0;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    if (i >= u_waveCount) break;
    vec2 dir = u_waves[i].xy;
    float wavelength = u_waves[i].z;
    float steepness = u_waves[i].w;
    float len = length(dir);
    dir = len > 0.0 ? dir / len : vec2(1.0, 0.0);
    float k = 6.28318530718 / wavelength;
    float speed = sqrt(9.8 / k);
    float a = steepness / k;
    float f = k * (dot(dir, xz) - speed * u_time) + u_phases[i];
    float s = sin(f);
    float c = cos(f);
    horizontal.x += dir.x * a * c;
    height += a * s;
    horizontal.y += dir.y * a * c;
    tangent.x += -dir.x * dir.x * steepness * s;
    tangent.y += dir.x * steepness * c;
    tangent.z += -dir.x * dir.y * steepness * s;
    binormal.x += -dir.x * dir.y * steepness * s;
    binormal.y += dir.y * steepness * c;
    binormal.z += -dir.y * dir.y * steepness * s;
  }
  return normalize(cross(binormal, tangent));
}
`;

const WAVE_UNIFORMS = `
uniform float u_time;
uniform int u_waveCount;
uniform vec4 u_waves[4];
uniform float u_phases[4];
`;

export const WATER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_xz;
uniform sampler2D u_sim;
uniform mat4 u_mvp;
uniform float u_half;
uniform float u_texel;
uniform float u_worldDx;
${WAVE_UNIFORMS}
${GERSTNER_FN}
out vec3 v_world;
out vec3 v_normal;

void main() {
  vec2 horizontal;
  float swell;
  vec3 swellNormal = gerstner(a_xz, horizontal, swell);
  vec2 xz = a_xz + horizontal;
  vec2 uv = vec2(xz.x / (2.0 * u_half) + 0.5, xz.y / (2.0 * u_half) + 0.5);
  float simH = texture(u_sim, uv).r;
  float hL = texture(u_sim, uv + vec2(-u_texel, 0.0)).r;
  float hR = texture(u_sim, uv + vec2(u_texel, 0.0)).r;
  float hD = texture(u_sim, uv + vec2(0.0, -u_texel)).r;
  float hU = texture(u_sim, uv + vec2(0.0, u_texel)).r;
  vec3 simN = normalize(vec3(hL - hR, 2.0 * u_worldDx, hD - hU));
  vec2 slope = vec2(-simN.x / simN.y, -simN.z / simN.y)
    + vec2(-swellNormal.x / swellNormal.y, -swellNormal.z / swellNormal.y);
  v_normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  v_world = vec3(xz.x, simH + swell, xz.y);
  gl_Position = u_mvp * vec4(v_world, 1.0);
}
`;

export const WATER_FS = `#version 300 es
precision highp float;
in vec3 v_world;
in vec3 v_normal;
out vec4 outColor;

uniform vec3 u_camera;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;
uniform float u_floorY;
uniform float u_half;
uniform float u_f0;
uniform float u_ior;
uniform vec3 u_absorption;
uniform sampler2D u_caustic;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 floorColor(vec2 xz) {
  vec2 uv = clamp(xz / (2.0 * u_half) + 0.5, 0.0, 1.0);
  vec3 caustic = texture(u_caustic, uv).rgb;
  float grain = valueNoise(xz * 1.7);
  vec3 albedo = mix(vec3(0.03, 0.20, 0.40), vec3(0.08, 0.36, 0.55), grain);
  vec2 tile = abs(fract(xz * 0.45) - 0.5);
  float grout = smoothstep(0.015, 0.035, min(tile.x, tile.y));
  albedo *= mix(0.94, 1.0, grout);
  return albedo * (0.40 + caustic);
}

vec3 skyColor(vec3 r) {
  float h = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.55, 0.74, 0.84), vec3(0.16, 0.40, 0.70), pow(h, 0.65));
  float sun = pow(max(dot(normalize(r), u_sunDir), 0.0), 400.0);
  return col + u_sunColor * sun * 2.0;
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_camera - v_world);
  vec3 L = normalize(u_sunDir);
  float NoV = max(dot(N, V), 0.0);
  float fresnel = u_f0 + (1.0 - u_f0) * pow(1.0 - NoV, 5.0);
  vec3 reflected = skyColor(reflect(-V, N));

  vec3 I = refract(-V, N, 1.0 / u_ior);
  vec3 through;
  if (I.y < -0.001) {
    float t = (u_floorY - v_world.y) / I.y;
    vec3 hit = v_world + I * t;
    float path = length(hit - v_world);
    through = floorColor(hit.xz) * exp(-u_absorption * path);
  } else {
    through = vec3(0.02, 0.12, 0.22);
  }

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 180.0);
  vec3 col = mix(through, reflected, fresnel) + u_sunColor * spec * fresnel * u_sunIntensity;
  col = col / (col + vec3(0.85));
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  outColor = vec4(col, 1.0);
}
`;
```

Replace `src/render/renderer.js` with a renderer that still steps the height field and now draws the mesh. Until Task 5, `u_caustic` is a 1×1 texture filled with 0.55, so the floor is lit but has no focused web.

```javascript
import {
  CAMERA, POOL, SIM, SUN_COLOR, SUN_DIR, SUN_INTENSITY, VIEW, WATER, WAVES,
} from '../config.js';
import { createGL, makeFloatTarget, program } from '../gl.js';
import { lookAt, multiply, perspective } from '../math.js';
import { createGrid } from './mesh.js';
import { QUAD_VS, UPDATE_FS, WATER_FS, WATER_VS } from './shaders.js';

function uploadWaves(gl, prog) {
  const packed = new Float32Array(16);
  const phases = new Float32Array(4);
  for (let i = 0; i < WAVES.length; i++) {
    packed[i * 4] = WAVES[i].dirX;
    packed[i * 4 + 1] = WAVES[i].dirZ;
    packed[i * 4 + 2] = WAVES[i].wavelength;
    packed[i * 4 + 3] = WAVES[i].steepness;
    phases[i] = WAVES[i].phase;
  }
  gl.uniform1i(gl.getUniformLocation(prog, 'u_waveCount'), WAVES.length);
  gl.uniform4fv(gl.getUniformLocation(prog, 'u_waves'), packed);
  gl.uniform1fv(gl.getUniformLocation(prog, 'u_phases'), phases);
}

export function createRenderer(canvas) {
  const gl = createGL(canvas);
  let read = makeFloatTarget(gl, SIM.size, gl.NEAREST);
  let write = makeFloatTarget(gl, SIM.size, gl.NEAREST);
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const grid = createGrid(VIEW.meshSegments, POOL.halfExtent);
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, grid.positions, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW);

  const fill = new Uint8Array([140, 140, 140, 255]);
  const flatLight = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, flatLight);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, fill);

  const updateProg = program(gl, QUAD_VS, UPDATE_FS);
  const waterProg = program(gl, WATER_VS, WATER_FS);
  let mvp = new Float32Array(16);

  function clearTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.size, target.size);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  clearTarget(read);
  clearTarget(write);

  function rebuildCamera() {
    const aspect = canvas.width / canvas.height;
    const view = lookAt(CAMERA.eye, CAMERA.target, [0, 1, 0]);
    const proj = perspective(CAMERA.fovY, aspect, CAMERA.near, CAMERA.far);
    mvp = multiply(proj, view);
  }
  rebuildCamera();

  return {
    step(drop) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
      gl.viewport(0, 0, SIM.size, SIM.size);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(updateProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      const loc = gl.getAttribLocation(updateProg, 'a_position');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(updateProg, 'u_state'), 0);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_waveSpeed'), SIM.waveSpeed);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_damping'), SIM.damping);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_texel'), 1 / SIM.size);
      const active = drop && drop.strength !== 0;
      gl.uniform2f(gl.getUniformLocation(updateProg, 'u_dropCenter'), active ? drop.u : 0, active ? drop.v : 0);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropRadius'), active ? drop.radius : 1);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropStrength'), active ? drop.strength : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const swap = read;
      read = write;
      write = swap;
    },
    draw(timeSeconds) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.02, 0.15, 0.28, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(waterProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      const loc = gl.getAttribLocation(waterProg, 'a_xz');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(waterProg, 'u_sim'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, flatLight);
      gl.uniform1i(gl.getUniformLocation(waterProg, 'u_caustic'), 1);
      gl.uniformMatrix4fv(gl.getUniformLocation(waterProg, 'u_mvp'), false, mvp);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_time'), timeSeconds);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_half'), POOL.halfExtent);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_texel'), 1 / SIM.size);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_worldDx'), (2 * POOL.halfExtent) / SIM.size);
      uploadWaves(gl, waterProg);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_camera'), CAMERA.eye);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_sunDir'), SUN_DIR);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_sunColor'), SUN_COLOR);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_sunIntensity'), SUN_INTENSITY);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_floorY'), POOL.floorY);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_f0'), WATER.f0);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_ior'), WATER.ior);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_absorption'), WATER.absorption);
      gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);
    },
    resize() {
      rebuildCamera();
    },
  };
}
```

In `src/main.js`, change `renderer.draw()` to `renderer.draw((now - start) / 1000)` and add `const start = performance.now();` next to `let last`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`

Expected: PASS, all existing tests plus the mesh test.

- [ ] **Step 5: Confirm the pool in the browser**

Run: `npm run dev`

The frame is filled with blue water. It is already moving before any click: broad swells, a brighter sky reflection toward the far side of the view, and thin sun streaks that slide along the crests. Click-drag dents the surface and a ring travels out and reflects from the unseen walls. The pool edges and the sky itself stay outside the frame. A flat gray sheet, a black screen, or a shader error in the button text means the water program did not link; the thrown log is the thing to fix, not a new shading idea.

- [ ] **Step 6: Commit**

```powershell
git add src/render/mesh.js src/render/shaders.js src/render/renderer.js src/main.js tests/mesh.test.js
git commit -m "feat: shade the pool with refraction, fresnel, and sun glints"
```

---

### Task 5: Caustics on the pool floor

**Files:**
- Modify: `src/render/shaders.js`, `src/render/renderer.js`
- Test: manual, in the browser. The area ratio is a GPU derivative; Vitest does not run it.

**Interfaces:**
- Consumes: `GERSTNER_FN`, the water mesh, `u_caustic` sampler already declared in `WATER_FS`
- Produces: caustic shaders `CAUSTIC_VS` and `CAUSTIC_FS`. `createRenderer` renders them into a 1024 float target and binds that target to `u_caustic` instead of the 1×1 texture.

- [ ] **Step 1: Write the caustic shaders**

Append to `src/render/shaders.js`:

```javascript
export const CAUSTIC_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_xz;
uniform sampler2D u_sim;
uniform float u_half;
uniform float u_texel;
uniform float u_worldDx;
uniform float u_floorY;
uniform float u_ior;
uniform vec3 u_sunDir;
${WAVE_UNIFORMS}
${GERSTNER_FN}
out vec3 v_oldHit;
out vec3 v_newHit;
out float v_path;
out float v_valid;

void main() {
  vec2 horizontal;
  float swell;
  vec3 swellNormal = gerstner(a_xz, horizontal, swell);
  vec2 xz = a_xz + horizontal;
  vec2 uv = vec2(xz.x / (2.0 * u_half) + 0.5, xz.y / (2.0 * u_half) + 0.5);
  float simH = texture(u_sim, uv).r;
  float hL = texture(u_sim, uv + vec2(-u_texel, 0.0)).r;
  float hR = texture(u_sim, uv + vec2(u_texel, 0.0)).r;
  float hD = texture(u_sim, uv + vec2(0.0, -u_texel)).r;
  float hU = texture(u_sim, uv + vec2(0.0, u_texel)).r;
  vec3 simN = normalize(vec3(hL - hR, 2.0 * u_worldDx, hD - hU));
  vec2 slope = vec2(-simN.x / simN.y, -simN.z / simN.y)
    + vec2(-swellNormal.x / swellNormal.y, -swellNormal.z / swellNormal.y);
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 P = vec3(xz.x, simH + swell, xz.y);

  vec3 I = refract(-normalize(u_sunDir), normal, 1.0 / u_ior);
  vec3 Iflat = refract(-normalize(u_sunDir), vec3(0.0, 1.0, 0.0), 1.0 / u_ior);
  if (I.y >= -0.001 || Iflat.y >= -0.001) {
    v_valid = 0.0;
    v_oldHit = vec3(0.0);
    v_newHit = vec3(0.0);
    v_path = 0.0;
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  float t = (u_floorY - P.y) / I.y;
  vec3 hit = P + I * t;
  float tFlat = (u_floorY - 0.0) / Iflat.y;
  v_oldHit = vec3(a_xz.x, u_floorY, a_xz.y) + Iflat * tFlat;
  v_newHit = hit;
  v_path = length(hit - P);
  v_valid = 1.0;
  gl_Position = vec4(hit.x / u_half, hit.z / u_half, 0.0, 1.0);
}
`;

export const CAUSTIC_FS = `#version 300 es
precision highp float;
in vec3 v_oldHit;
in vec3 v_newHit;
in float v_path;
in float v_valid;
out vec4 outColor;
uniform vec3 u_absorption;

void main() {
  if (v_valid < 0.5) discard;
  float oldArea = length(cross(dFdx(v_oldHit), dFdy(v_oldHit)));
  float newArea = length(cross(dFdx(v_newHit), dFdy(v_newHit)));
  float intensity = clamp(oldArea / max(newArea, 1e-5), 0.0, 3.0);
  vec3 tint = vec3(0.75, 0.92, 1.0) * intensity * exp(-u_absorption * v_path);
  outColor = vec4(tint, 1.0);
}
`;
```

`WAVE_UNIFORMS` and `GERSTNER_FN` are module consts. `CAUSTIC_VS` is a template string, so those interpolations work. `WATER_VS` already interpolates them the same way.

- [ ] **Step 2: Render the caustic pass**

In `createRenderer`:

- `const linearFloat = Boolean(gl.getExtension('OES_texture_float_linear'));`
- `const caustic = makeFloatTarget(gl, VIEW.causticSize, linearFloat ? gl.LINEAR : gl.NEAREST);`
- `const causticProg = program(gl, CAUSTIC_VS, CAUSTIC_FS);`
- Delete the 1×1 `flatLight` texture.

At the start of `draw(timeSeconds)`, before the screen pass:

```javascript
gl.bindFramebuffer(gl.FRAMEBUFFER, caustic.fb);
gl.viewport(0, 0, caustic.size, caustic.size);
gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE);
gl.clearColor(0, 0, 0, 1);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(causticProg);
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
const causticLoc = gl.getAttribLocation(causticProg, 'a_xz');
gl.enableVertexAttribArray(causticLoc);
gl.vertexAttribPointer(causticLoc, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, read.tex);
gl.uniform1i(gl.getUniformLocation(causticProg, 'u_sim'), 0);
gl.uniform1f(gl.getUniformLocation(causticProg, 'u_time'), timeSeconds);
gl.uniform1f(gl.getUniformLocation(causticProg, 'u_half'), POOL.halfExtent);
gl.uniform1f(gl.getUniformLocation(causticProg, 'u_texel'), 1 / SIM.size);
gl.uniform1f(gl.getUniformLocation(causticProg, 'u_worldDx'), (2 * POOL.halfExtent) / SIM.size);
gl.uniform1f(gl.getUniformLocation(causticProg, 'u_floorY'), POOL.floorY);
gl.uniform1f(gl.getUniformLocation(causticProg, 'u_ior'), WATER.ior);
gl.uniform3fv(gl.getUniformLocation(causticProg, 'u_sunDir'), SUN_DIR);
gl.uniform3fv(gl.getUniformLocation(causticProg, 'u_absorption'), WATER.absorption);
uploadWaves(gl, causticProg);
gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);
gl.disable(gl.BLEND);
```

In the water pass, bind `caustic.tex` on texture unit 1 instead of `flatLight`.

- [ ] **Step 3: Run the unit tests**

Run: `npx vitest run`

Expected: PASS. This task adds no new unit test.

- [ ] **Step 4: Confirm caustics in the browser**

Run: `npm run dev`

Through the water, the floor carries a moving web of bright lines, the same family of light as the reference photo. Dragging a finger-sized dent (the mouse) bends that web; a new ring of light travels with the ripple. The web is not a frozen texture and not a solid white floor. If the floor goes black, `I.y` is not negative or the caustic target is not the texture the water shader samples. If the floor is solid white, the intensity clamp is being skipped and the additive pass is overflowing; the clamp in `CAUSTIC_FS` is `0..3`.

- [ ] **Step 5: Commit**

```powershell
git add src/render/shaders.js src/render/renderer.js
git commit -m "feat: project sunlight through the waves onto the pool floor"
```

---

### Task 6: Touch the pool with a hand from the webcam

**Files:**
- Create: `src/input/touch.js`, `src/input/hands.js`, `tests/touch.test.js`
- Modify: `src/main.js`
- Test: `tests/touch.test.js`

**Interfaces:**
- Consumes: `CAMERA`, `POOL`, `DROP`, `HAND`, `MIRROR_X`, `ndcToRay`, `rayPlaneY`
- Produces:
  - `isTouching(landmarks) -> boolean`. `landmarks` is 21 objects `{x, y}` in normalized image space, y down.
  - `fingertipHit(landmark, camera, aspect, pool) -> { x, z, u, v } | null`
  - `impulseStrength(speed) -> number`
  - `planarSpeed(previous, next, dt) -> number` with points `{x, z}`
  - `createHands(video) -> Promise<{ sample(camera, aspect, pool) -> { touching, hit } | null }>`
  - `sample` returns the latest result, and it returns that same object again on frames where the video clock did not advance.

- [ ] **Step 1: Write the failing test**

Create `tests/touch.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { CAMERA, DROP, MIRROR_X, POOL } from '../src/config.js';
import { fingertipHit, impulseStrength, isTouching, planarSpeed } from '../src/input/touch.js';

function blank() {
  return Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
}

function pointing() {
  const pts = blank();
  pts[8] = { x: 0.5, y: 0.3 };
  pts[6] = { x: 0.5, y: 0.55 };
  pts[12] = { x: 0.58, y: 0.62 };
  pts[16] = { x: 0.64, y: 0.66 };
  pts[20] = { x: 0.7, y: 0.7 };
  pts[4] = { x: 0.3, y: 0.6 };
  return pts;
}

function openPalm() {
  const pts = blank();
  pts[8] = { x: 0.42, y: 0.28 };
  pts[6] = { x: 0.44, y: 0.45 };
  pts[12] = { x: 0.5, y: 0.25 };
  pts[16] = { x: 0.58, y: 0.28 };
  pts[20] = { x: 0.66, y: 0.34 };
  pts[4] = { x: 0.32, y: 0.4 };
  return pts;
}

function fist() {
  const pts = blank();
  pts[0] = { x: 0.5, y: 0.8 };
  pts[8] = { x: 0.48, y: 0.64 };
  pts[6] = { x: 0.49, y: 0.7 };
  pts[12] = { x: 0.52, y: 0.63 };
  pts[16] = { x: 0.56, y: 0.65 };
  pts[20] = { x: 0.6, y: 0.68 };
  pts[4] = { x: 0.46, y: 0.66 };
  return pts;
}

function pinch() {
  const pts = blank();
  pts[0] = { x: 0.5, y: 0.85 };
  pts[8] = { x: 0.48, y: 0.48 };
  pts[4] = { x: 0.51, y: 0.5 };
  pts[6] = { x: 0.49, y: 0.6 };
  pts[12] = { x: 0.58, y: 0.66 };
  pts[16] = { x: 0.64, y: 0.7 };
  pts[20] = { x: 0.7, y: 0.74 };
  return pts;
}

describe('isTouching', () => {
  it('accepts a pointed finger and a pinch, and rejects an open palm and a fist', () => {
    expect(isTouching(pointing())).toBe(true);
    expect(isTouching(pinch())).toBe(true);
    expect(isTouching(openPalm())).toBe(false);
    expect(isTouching(fist())).toBe(false);
  });
});

describe('fingertipHit', () => {
  it('mirrors x so the left of the raw frame lands on the right of the pool', () => {
    expect(MIRROR_X).toBe(true);
    const left = fingertipHit({ x: 0.2, y: 0.5 }, CAMERA, 16 / 9, POOL);
    const right = fingertipHit({ x: 0.8, y: 0.5 }, CAMERA, 16 / 9, POOL);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left.x).toBeGreaterThan(right.x);
    expect(left.u).toBeGreaterThan(0.5);
    expect(right.u).toBeLessThan(0.5);
  });

  it('returns null when the hit is outside the pool square', () => {
    const tiny = { halfExtent: 0.05 };
    expect(fingertipHit({ x: 0.5, y: 0.5 }, CAMERA, 16 / 9, tiny)).toBeNull();
  });
});

describe('impulse', () => {
  it('presses harder as the fingertip moves, and the extra force saturates', () => {
    expect(impulseStrength(0)).toBeCloseTo(DROP.baseStrength, 5);
    expect(impulseStrength(1)).toBeCloseTo(DROP.baseStrength - DROP.speedScale, 5);
    expect(impulseStrength(100)).toBeCloseTo(DROP.baseStrength - DROP.maxSpeed * DROP.speedScale, 5);
    expect(planarSpeed({ x: 0, z: 0 }, { x: 0.3, z: 0.4 }, 0.5)).toBeCloseTo(1, 5);
    expect(planarSpeed(null, { x: 0, z: 0 }, 0.5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/touch.test.js`

Expected: FAIL, cannot find `../src/input/touch.js`

- [ ] **Step 3: Implement pose, mapping, and the MediaPipe wrapper**

`src/input/touch.js`:

```javascript
import { DROP, MIRROR_X } from '../config.js';
import { ndcToRay, rayPlaneY } from '../math.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isPointing(landmarks) {
  const wrist = landmarks[0];
  const indexReach = dist(landmarks[8], wrist);
  const indexPip = dist(landmarks[6], wrist);
  if (!(indexReach > indexPip * 1.15)) return false;
  return dist(landmarks[12], wrist) < indexReach * 0.75
    && dist(landmarks[16], wrist) < indexReach * 0.72
    && dist(landmarks[20], wrist) < indexReach * 0.70;
}

export function isPinching(landmarks) {
  const gap = dist(landmarks[4], landmarks[8]);
  const middleAway = dist(landmarks[12], landmarks[8]);
  return gap < 0.06 && middleAway > gap * 2.5 && dist(landmarks[8], landmarks[0]) > 0.1;
}

export function isTouching(landmarks) {
  return isPointing(landmarks) || isPinching(landmarks);
}

export function fingertipHit(landmark, camera, aspect, pool) {
  const screenX = MIRROR_X ? 1 - landmark.x : landmark.x;
  const ndcX = screenX * 2 - 1;
  const ndcY = 1 - landmark.y * 2;
  const ray = ndcToRay(ndcX, ndcY, camera, aspect);
  const hit = rayPlaneY(ray.origin, ray.dir, 0);
  if (!hit) return null;
  if (Math.abs(hit[0]) > pool.halfExtent || Math.abs(hit[2]) > pool.halfExtent) return null;
  return {
    x: hit[0],
    z: hit[2],
    u: hit[0] / (2 * pool.halfExtent) + 0.5,
    v: hit[2] / (2 * pool.halfExtent) + 0.5,
  };
}

export function planarSpeed(previous, next, dt) {
  if (!previous || !next || !(dt > 0)) return 0;
  return Math.hypot(next.x - previous.x, next.z - previous.z) / dt;
}

export function impulseStrength(speed) {
  const extra = Math.min(Math.max(speed, 0), DROP.maxSpeed) * DROP.speedScale;
  return DROP.baseStrength - extra;
}
```

`src/input/hands.js`:

```javascript
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HAND } from '../config.js';
import { fingertipHit, isTouching } from './touch.js';

async function landmarker(fileset, delegate) {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: HAND.model,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: HAND.numHands,
  });
}

export async function createHands(video) {
  const fileset = await FilesetResolver.forVisionTasks(HAND.wasmBase);
  let detector;
  try {
    detector = await landmarker(fileset, 'GPU');
  } catch {
    detector = await landmarker(fileset, 'CPU');
  }
  let lastVideoTime = -1;
  let lastStamp = 0;
  let cached = null;

  return {
    sample(camera, aspect, pool) {
      if (video.readyState < 2) return null;
      if (video.currentTime === lastVideoTime) return cached;
      lastVideoTime = video.currentTime;
      let stamp = performance.now();
      if (stamp <= lastStamp) stamp = lastStamp + 1;
      lastStamp = stamp;
      const result = detector.detectForVideo(video, stamp);
      const landmarks = result.landmarks && result.landmarks[0];
      if (!landmarks) {
        cached = null;
        return null;
      }
      cached = {
        touching: isTouching(landmarks),
        hit: fingertipHit(landmarks[8], camera, aspect, pool),
      };
      return cached;
    },
  };
}
```

`createHands` tries the GPU delegate first. If that throws, it creates the landmarker again with the CPU delegate. MediaPipe uses its own context. `#pool` stays the water context.

- [ ] **Step 4: Run the touch tests**

Run: `npx vitest run tests/touch.test.js`

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the camera button and the finger into the frame loop**

Replace `src/main.js` with:

```javascript
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
```

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`

Expected: PASS

- [ ] **Step 7: Confirm the hand in the browser**

Run: `npm run dev` and open the local URL (the camera API refuses a `file://` page).

1. Before clicking, the water is already swelling, with sun streaks and a moving caustic web. Dragging the mouse still dents it.
2. Click "Touch the water", allow the camera. The button disappears. The video element stays invisible.
3. Hold up one index finger, other fingers curled. Move it. A dent and a ripple follow the finger, left when the hand moves left.
4. Open the palm. The dent stops following. Pinch thumb to index. The dent follows again.
5. Deny the camera. The button reads "Camera blocked. Click and drag the water instead." and the mouse still works.
6. Resize the window. The frame stays filled with water, with no pool rim entering the picture.

If the ripple moves the wrong way horizontally, the bug is `MIRROR_X`, not the ray math. The test in this task locks `MIRROR_X` true and locks left-raw to right-pool.

- [ ] **Step 8: Commit**

```powershell
git add src/input/touch.js src/input/hands.js src/main.js tests/touch.test.js
git commit -m "feat: press the pool with a fingertip from the webcam"
```

---

## Self-review

Spec coverage:

- Frame filled with moving pool water, shade and light included: Tasks 3, 4, and 5. Gerstner keeps it moving with no input. Refraction, absorption, Fresnel, and the sun glint are the shade. Caustics are the light web in the reference photo.
- A finger can touch it: Task 6, with the mouse on the same stamp path from Task 2 so the simulation is checkable before the camera works.
- One page: Task 1 replaces `index.html`.
- The old Voronoi shader is not extended. It cannot carry a touch.

Placeholder scan: no deferred steps. The caustic pass has a browser check because the area ratio uses fragment derivatives, which Vitest cannot execute. The GPU update shader names the CPU function it copies.

Type consistency: `step(drop)` takes `{ u, v, radius, strength }`. `fingertipHit` returns `{ x, z, u, v }`. `impulseStrength` is the only producer of `strength`. `createRenderer(canvas)` is the only renderer entry. Wave uniforms are `u_waves[4]` and `u_phases[4]`, fed by `uploadWaves` from `WAVES`.
