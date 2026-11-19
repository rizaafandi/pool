# Webcam Hand Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand webcam hand control from single-fingertip pointing/pinching to four rich interactions: open-palm wide wave sweeps, fist/Z-plunge big splashes, simultaneous 5-fingertip multi-touch per hand (up to 10 fingertips across 2 hands), and a toggleable mirrored camera preview with on-screen fingertip indicators.

**Architecture:** Pure gesture geometry and classification live in `src/input/touch.js`, while per-hand temporal state (per-finger speed, palm-sweep switching, plunge/fist-close splash cooldowns, and frame-exit resets) lives in a new testable `src/input/handTracker.js`. The GPU height-field drop buffer expands from 8 to 12 slots in `src/render/shaders.js` and `src/render/renderer.js` so two full 5-finger hands plus pointer input stamp simultaneously without dropping contacts. A lightweight 2D HUD canvas and toggleable mirrored PiP `<video>` preview in `src/ui/overlay.js` and `index.html` visualize active contacts without adding dependencies.

**Tech Stack:** Vite 8.3.8, Vitest 5.1.1 (Node environment), WebGL2, Canvas 2D, `@mediapipe/tasks-vision` 1.2.3. No new dependencies.

**Spec:** User-requested 4 webcam interaction features built on the existing `realistic-pool` branch:
1. Open palm gesture for sweeping/pushing wide waves.
2. Fist / fast Z-depth plunge gesture for big splashes.
3. All 5 fingertips simultaneously per hand (up to 10 fingertips across 2 hands).
4. Mirrored camera preview (PiP) and on-screen fingertip position indicator overlay.

## Global Constraints

- Keep existing dependencies exact (`vite@8.3.8`, `vitest@5.1.1`, `@mediapipe/tasks-vision@1.2.3`); add zero new packages.
- Keep all 20 existing tests in `tests/*.test.js` passing (including `WAVES` length 4 with steepness sum `0.53`, `SUN_DIR` unit vector with `y > 0.8`, `SIM.waveSpeed = 0.5`, `SIM.damping = 0.995`, and `MIRROR_X = true`).
- Preserve existing mouse/touch pointer alignment (`rayGerstnerSurface`) and translucent sunlit pool shading (dragging or holding multiple fingers must not cause whiteout).
- Do not rely on MediaPipe's raw `landmark.z` alone for depth triggers; use apparent hand scale (`handSpan = dist(wrist, middleMCP)`) growth rate so plunge detection works reliably on standard 2D webcams.
- All HUD/overlay layers must use `pointer-events: none` (except the tiny preview toggle button) so mouse/touch clicks always pass straight through to `#pool`.
- Shell is PowerShell; commit with `git commit -m "message"`.

## Review Focus

1. **Duplicate video frames or `dt <= 0`:** Cached MediaPipe frames (`fresh === false`) or zero/negative `dt` must never produce `NaN`/`Infinity` speeds or re-fire a one-shot plunge splash.
2. **10 simultaneous fingertips (2 hands × 5 fingers) + pointer input:** All 10 contacts must fit in `SIM.maxDrops = 12` without dropping fingers 9–10 or exceeding simulation height clamps.
3. **Plunge / fist-close jitter:** Holding a fist near the camera or jittering around the scale-growth threshold must respect `SPLASH.cooldownMs = 450` per hand instead of firing splashes every frame.
4. **Stationary vs swept open palm:** Holding an open palm still or gently wiggling fingers (`speed < PALM.sweepSpeed`) should stamp individual fingertips cleanly without triggering a broad palm wake or whiteout; only deliberate sweeps (`speed >= PALM.sweepSpeed`) switch to wide palm mode.
5. **Hand leaving and re-entering the frame:** When a hand disappears from `result.landmarks`, its temporal state (`previousContacts`, `previousSpan`, `previousMode`) must reset immediately so re-entering elsewhere causes no teleportation speed spike, false splash, or lingering HUD marker.

## File Map

- `src/config.js` — add `SIM.maxDrops = 12`, `FINGER_TIPS`, `PALM`, and `SPLASH` tuning constants.
- `src/render/shaders.js` — expand `UPDATE_FS` drop uniform array from `u_drops[8]` to `u_drops[12]`.
- `src/render/renderer.js` — expand packed drop buffer to `Float32Array(SIM.maxDrops * 4)` and cap loop at `SIM.maxDrops`.
- `src/input/touch.js` — add pure geometry/gesture helpers: `isOpenPalm`, `isFist`, `handSpan`, `palmCenter`, `extendedFingertips`, `plungeStrength`, `classifyHand`.
- `src/input/handTracker.js` (new) — pure stateful multi-hand tracker turning MediaPipe hand frames into `{ drops, indicators }` with per-finger velocity, palm-sweep switching, plunge/fist-close splash cooldowns, and disappearance resets.
- `src/input/hands.js` — return raw `landmarks` per detected hand alongside `fresh` so `handTracker` can classify gestures and project contacts cleanly.
- `src/ui/overlay.js` (new) — 2D HUD renderer for fingertip rings, palm sweep halo, and splash ring pulses, plus PiP visibility toggle controller.
- `index.html` — add fullscreen `#hud` overlay canvas, mirrored bottom-right `#cam` PiP preview styling, and `#cam-toggle` button.
- `src/main.js` — wire `createHandTracker()`, `createOverlay()`, `SIM.maxDrops`, and `#cam-toggle` (`C` hotkey).
- `tests/heightfield.test.js`, `tests/touch.test.js`, `tests/handTracker.test.js` (new), `tests/overlay.test.js` (new) — Vitest unit tests.

---

### Task 1: Expand drop capacity to 12 and add gesture config constants

**Files:**
- Modify: `src/config.js:19-60`
- Modify: `src/render/shaders.js:10-68`
- Modify: `src/render/renderer.js:65-108`
- Modify: `src/main.js:35-45`
- Test: `tests/heightfield.test.js`

**Interfaces:**
- Consumes: existing `SIM`, `DROP` in `src/config.js`
- Produces:
  - `SIM.maxDrops` (`12`) in `src/config.js`
  - `FINGER_TIPS` (`[4, 8, 12, 16, 20]`) in `src/config.js`
  - `PALM` (`{ radius: 0.055, strength: -0.026, speedScale: 0.012, maxSpeed: 2.5, sweepSpeed: 0.45, minSpeed: 0.08 }`) in `src/config.js`
  - `SPLASH` (`{ radius: 0.048, strength: -0.105, minGrowthRate: 1.6, maxGrowthRate: 4.5, cooldownMs: 450 }`) in `src/config.js`
  - `UPDATE_FS` supporting `uniform vec4 u_drops[12];` and `renderer.step(drops)` uploading up to `SIM.maxDrops` entries

- [ ] **Step 1: Write the failing test**

Add to `tests/heightfield.test.js`:

```js
import { FINGER_TIPS, PALM, SIM, SPLASH } from '../src/config.js';

describe('multi-drop capacity constants', () => {
  it('supports at least 10 simultaneous fingertips plus pointer headroom', () => {
    expect(SIM.maxDrops).toBe(12);
    expect(FINGER_TIPS).toEqual([4, 8, 12, 16, 20]);
    expect(PALM.radius).toBeGreaterThan(0.04);
    expect(PALM.sweepSpeed).toBeGreaterThan(PALM.minSpeed);
    expect(SPLASH.strength).toBeLessThan(-0.08);
    expect(SPLASH.cooldownMs).toBeGreaterThanOrEqual(300);
  });

  it('stays finite and bounded when 10 simultaneous drops are stamped', () => {
    const size = 64;
    let height = new Float32Array(size * size);
    let velocity = new Float32Array(size * size);
    for (let i = 0; i < 10; i++) {
      height = addDrop(height, size, 0.2 + i * 0.06, 0.5, 0.022, -0.042);
    }
    for (let step = 0; step < 120; step++) {
      const next = stepHeightfield(height, velocity, size, SIM.waveSpeed, SIM.damping);
      height = next.height;
      velocity = next.velocity;
    }
    for (const value of height) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/heightfield.test.js`
Expected: FAIL because `SIM.maxDrops`, `FINGER_TIPS`, `PALM`, and `SPLASH` are undefined.

- [ ] **Step 3: Add constants and expand GPU drop capacity to 12**

1. In `src/config.js`, add `maxDrops: 12` to `SIM` and export `FINGER_TIPS`, `PALM`, and `SPLASH` with the exact values from Interfaces.
2. In `src/render/shaders.js`, update `UPDATE_FS` from `uniform vec4 u_drops[8];` and `for (int i = 0; i < 8; i++)` to `uniform vec4 u_drops[12];` and `for (int i = 0; i < 12; i++)`.
3. In `src/render/renderer.js`, change `packedDrops` to `new Float32Array(SIM.maxDrops * 4)` and loop guard to `count < SIM.maxDrops`.
4. In `src/main.js`, replace hardcoded `8` in `stamp()` with `SIM.maxDrops`.

- [ ] **Step 4: Run test suite to verify it passes**

Run: `npm test`
Expected: PASS (all existing tests + 2 new tests in `tests/heightfield.test.js`).

- [ ] **Step 5: Commit**

```powershell
git add src/config.js src/render/shaders.js src/render/renderer.js src/main.js tests/heightfield.test.js
git commit -m "feat: expand drop buffer to 12 slots and add hand gesture constants"
```

---

### Task 2: Pure multi-finger, open-palm, fist, and plunge-splash detectors

**Files:**
- Modify: `src/input/touch.js:1-59`
- Test: `tests/touch.test.js`

**Interfaces:**
- Consumes: `DROP`, `FINGER_TIPS`, `MIRROR_X`, `PALM`, `SPLASH`, `WAVES` from `src/config.js`
- Produces (all exported from `src/input/touch.js`):
  - `isOpenPalm(landmarks) -> boolean`
  - `isFist(landmarks) -> boolean`
  - `handSpan(landmarks) -> number`
  - `palmCenter(landmarks) -> { x: number, y: number, z: number }`
  - `extendedFingertips(landmarks) -> Array<{ id: number, landmark: { x, y, z? } }>` (subset of `[4, 8, 12, 16, 20]`)
  - `plungeStrength(prevSpan, nextSpan, dt) -> number` (`0` if not plunging or invalid `dt`/`prevSpan`, else negative strength in `[SPLASH.strength * 1.35, SPLASH.strength]`)
  - `palmImpulseStrength(speed) -> number`
  - `classifyHand(landmarks) -> { mode: 'fist' | 'pinch' | 'open' | 'fingers' | 'idle', tips: Array<{ id, landmark }>, palm: { x, y, z }, span: number }`
  - Existing exports (`isPointing`, `isPinching`, `isTouching`, `ndcWaterHit`, `fingertipHit`, `planarSpeed`, `impulseStrength`) remain backward-compatible.

- [ ] **Step 1: Write the failing tests**

Add fixture helpers and tests in `tests/touch.test.js` covering:
- `isOpenPalm`: true for 5-finger open palm (extending all 5 tips including thumb `4` far from pinky MCP `17`), false for pointing, pinch, and fist.
- `isFist`: true for curled fist (`8, 12, 16, 20` inside PIP reach `* 1.05`), false for open palm, pointing, and pinch.
- `extendedFingertips`:
  - open palm returns all 5 ids `[4, 8, 12, 16, 20]`;
  - pointing returns `[8]` (thumb tucked near pinky MCP `17`);
  - 3-finger pose returns `[8, 12, 16]`;
  - fist returns `[]`.
- `palmCenter` & `handSpan`: returns average of landmarks `[0, 5, 9, 13, 17]` and `hypot(lm[9] - lm[0])`.
- `plungeStrength`:
  - returns `0` for `dt <= 0`, `prevSpan <= 0`, shrinking span, or slow growth below `SPLASH.minGrowthRate`;
  - returns negative strength `<= SPLASH.strength` when growth rate exceeds `SPLASH.minGrowthRate`, saturating at `SPLASH.maxGrowthRate`.
- `classifyHand`: returns `'fist'`, `'pinch'`, `'open'` (5 fingers extended), `'fingers'` (1–4 fingers extended), or `'idle'` for each pose.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/touch.test.js`
Expected: FAIL with missing exports (`isOpenPalm`, `isFist`, `extendedFingertips`, `plungeStrength`, `classifyHand`).

- [ ] **Step 3: Implement gesture helpers in `src/input/touch.js`**

Implement each exported function cleanly:
- Finger extension rule for `[8, 12, 16, 20]` with PIPs `[6, 10, 14, 18]`: `dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.12`.
- Thumb extension rule (`4`): `dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.12` (distance from pinky MCP `17` avoids false positives when thumb crosses palm).
- `isOpenPalm(landmarks)`: all 4 fingers (`8, 12, 16, 20`) extended and thumb extended.
- `isFist(landmarks)`: all 4 fingers curled (`dist(lm[tip], wrist) <= dist(lm[pip], wrist) * 1.05`).
- `handSpan(landmarks)`: `dist(landmarks[0], landmarks[9])`.
- `palmCenter(landmarks)`: mean `x`, `y`, `z || 0` of landmarks `[0, 5, 9, 13, 17]`.
- `plungeStrength(prevSpan, nextSpan, dt)`: if `!(prevSpan > 1e-4) || !(dt > 0)` return `0`; `rate = (nextSpan - prevSpan) / (prevSpan * dt)`; if `rate < SPLASH.minGrowthRate` return `0`; scale linearly from `SPLASH.strength` at `minGrowthRate` up to `SPLASH.strength * 1.35` at `maxGrowthRate`.
- `palmImpulseStrength(speed)`: `PALM.strength - Math.min(Math.max(speed, 0), PALM.maxSpeed) * PALM.speedScale`.
- `classifyHand(landmarks)`: priority order `isFist -> 'fist'`, `isPinching -> 'pinch'` (tips `[landmarks[8]]`), `isOpenPalm -> 'open'` (all 5 tips), `tips.length > 0 -> 'fingers'`, else `'idle'`.
- Keep existing `isPointing`, `isPinching`, `isTouching` untouched so existing tests pass unchanged.

- [ ] **Step 4: Run test suite to verify it passes**

Run: `npx vitest run tests/touch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/input/touch.js tests/touch.test.js
git commit -m "feat: add multi-finger, open-palm, fist, and plunge-splash detectors"
```

---

### Task 3: Stateful multi-hand tracker (`handTracker.js`) & `hands.js` update

**Files:**
- Create: `src/input/handTracker.js`
- Modify: `src/input/hands.js:28-48`
- Test: `tests/handTracker.test.js`

**Interfaces:**
- Consumes: `DROP`, `MIRROR_X`, `PALM`, `SPLASH`, `WAVES` from `src/config.js`; `classifyHand`, `fingertipHit`, `impulseStrength`, `palmImpulseStrength`, `planarSpeed`, `plungeStrength` from `src/input/touch.js`.
- Produces:
  - `createHandTracker()` in `src/input/handTracker.js` returning:
    `update(sample, camera, aspect, pool, swellTime, nowMs) -> { drops: Array<{ key, u, v, radius, strength }>, indicators: Array<{ key, screenX, screenY, kind: 'finger' | 'palm' | 'splash', radiusPx: number }> }`
    where `sample` is `{ fresh: boolean, hands: Array<{ landmarks }> }` (or `null`).
  - `createHands(video).sample()` in `src/input/hands.js` returning `{ fresh: boolean, hands: Array<{ landmarks }> }` (or `null` when `video.readyState < 2`).

- [ ] **Step 1: Write the failing tests in `tests/handTracker.test.js`**

Write tests covering every core behavior AND all 5 Review Focus edge cases:
1. **5 fingertips simultaneously (1 hand) & 10 fingertips (2 hands):** stationary or slow-moving open palm (`speed < PALM.sweepSpeed`) emits 5 distinct drops (`h:0:4`, `h:0:8`, `h:0:12`, `h:0:16`, `h:0:20`) and 5 `'finger'` indicators per hand; 2 open hands emit 10 drops simultaneously.
2. **Open palm fast sweep:** moving an open palm across the pool with `speed >= PALM.sweepSpeed` switches from 5 small drops to 1 wide palm drop (`key: 'h:0:palm'`, `radius: PALM.radius`) and 1 `'palm'` indicator; stationary open palm never emits a palm sweep drop.
3. **Fist Z-plunge & fist-close splash with cooldown:**
   - rapid `handSpan` growth exceeding `SPLASH.minGrowthRate` emits a big splash drop (`radius: SPLASH.radius`, `strength <= SPLASH.strength`) and a `'splash'` indicator;
   - a second plunge within `SPLASH.cooldownMs` (450 ms) is suppressed (no splash spam);
   - after `SPLASH.cooldownMs`, plunging again triggers a new splash;
   - snapping from `'open'` palm to `'fist'` also triggers a single splash drop at `palmCenter` (respecting cooldown).
4. **Duplicate / non-fresh video frames (`fresh: false`) & `dt <= 0`:**
   - never produces `NaN`/`Infinity` drop strengths;
   - never re-fires a one-shot splash on cached frames;
   - maintains gentle steady fingertip pressure (`scale = 0.4`) only for active `'fingers'`/`'pinch'` contacts.
5. **Hand disappearing and re-entering frame:**
   - passing `hands: []` clears that hand's tracker slot and returns `indicators: []`;
   - re-entering 50 ms later at the opposite side of the screen with a larger span does NOT compute a huge teleportation speed or fire a false plunge splash.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/handTracker.test.js`
Expected: FAIL with module `src/input/handTracker.js` not found.

- [ ] **Step 3: Implement `src/input/handTracker.js` and update `src/input/hands.js`**

1. Create `src/input/handTracker.js` with `createHandTracker()`:
   - Maintain an array of per-hand slots `{ lastTime, lastMode, lastSpan, lastPalmHit, lastSplashAt, tipHits: Map<id, hit>, cachedDrops, cachedIndicators }`.
   - On `fresh === true`:
     - Reset any slot index `>= sample.hands.length`.
     - For each hand, call `classifyHand(landmarks)` and compute `dt = slot.lastTime != null ? (nowMs - slot.lastTime) / 1000 : 0`.
     - Check splash triggers when `nowMs - slot.lastSplashAt >= SPLASH.cooldownMs`:
       - Fist-close (`slot.lastMode === 'open' && mode === 'fist'`) or Z-plunge (`plungeStrength(slot.lastSpan, span, dt) < 0` for `'fist'` or `'open'`).
       - If triggered and `palmHit` is inside pool, emit `{ key: 'h:'+i+':splash', u, v, radius: SPLASH.radius, strength }` and `'splash'` indicator, update `slot.lastSplashAt = nowMs`.
     - For `'open'`: compute palm speed from `slot.lastPalmHit`; if `speed >= PALM.sweepSpeed`, emit 1 wide palm drop (`PALM.radius`, `palmImpulseStrength(speed)`) and `'palm'` indicator; else fall through to per-fingertip mode for all 5 tips (with gentle continuous drag scale `0.32` per finger when > 1 finger is active so 5–10 fingers never cause whiteout!).
     - For `'fingers'` / `'pinch'`: project each active tip with `fingertipHit(..., swellTime, WAVES)`, compute per-tip speed from `slot.tipHits.get(id)`, emit drop + `'finger'` indicator (`screenX = MIRROR_X ? 1 - lm.x : lm.x`, `screenY = lm.y`).
   - On `fresh === false`: return gentle steady cached fingertip drops (no splash re-trigger!) and current `cachedIndicators`.
2. Update `src/input/hands.js` so `sample()` no longer needs camera/aspect/pool/swellTime (or keeps optional args unused for compatibility) and returns `{ fresh, hands: list.map((landmarks) => ({ landmarks })) }`.

- [ ] **Step 4: Run test suite to verify it passes**

Run: `npm test`
Expected: PASS (all unit tests including `tests/handTracker.test.js`).

- [ ] **Step 5: Commit**

```powershell
git add src/input/handTracker.js src/input/hands.js tests/handTracker.test.js
git commit -m "feat: add multi-hand tracker for 5-finger, palm sweep, and plunge splash"
```

---

### Task 4: Camera PiP preview & HUD fingertip indicator overlay

**Files:**
- Create: `src/ui/overlay.js`
- Modify: `index.html:1-36`
- Test: `tests/overlay.test.js`

**Interfaces:**
- Consumes: `indicators` array from `handTracker.update()` (`{ key, screenX, screenY, kind: 'finger' | 'palm' | 'splash', radiusPx }`)
- Produces:
  - `indicatorScreenPoint(indicator, width, height) -> { x: number, y: number }` (exported pure helper in `src/ui/overlay.js`)
  - `createOverlay({ hudCanvas, video, toggleButton })` in `src/ui/overlay.js` returning:
    - `resize(width, height, dpr) -> void`
    - `setCameraActive(active: boolean) -> void`
    - `setVisible(visible: boolean) -> void`
    - `toggle() -> boolean` (returns new visibility state)
    - `draw(indicators, nowMs) -> void`

- [ ] **Step 1: Write the failing tests in `tests/overlay.test.js`**

Test pure logic with lightweight mock canvas/DOM elements (Node environment):
1. `indicatorScreenPoint({ screenX: 0.25, screenY: 0.6 }, 1000, 800)` returns `{ x: 250, y: 480 }`, clamping out-of-range coordinates to `[0, width]` / `[0, height]`.
2. `createOverlay` toggle behavior:
   - starts hidden until `setCameraActive(true)` is called;
   - `setCameraActive(true)` reveals the PiP preview and `#cam-toggle` button;
   - `toggle()` flips visibility (`true -> false -> true`), toggles `hidden` class on `video`, updates button `aria-pressed` and label, and skips drawing HUD rings when hidden;
   - `draw(indicators, nowMs)` clears the canvas each frame, draws rings for `'finger'`, larger halo for `'palm'`, and expanding fading ring pulse for `'splash'` over 350 ms even after the one-shot splash indicator leaves `indicators`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/overlay.test.js`
Expected: FAIL with module `src/ui/overlay.js` not found.

- [ ] **Step 3: Implement `src/ui/overlay.js` and update `index.html`**

1. In `index.html`:
   - Add `<canvas id="hud" aria-hidden="true"></canvas>` positioned `fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2;`.
   - Style `#cam` as a subtle mirrored bottom-right PiP preview when active (`position: fixed; right: 16px; bottom: 16px; width: 160px; height: 120px; object-fit: cover; border-radius: 12px; border: 1px solid rgba(180, 235, 255, 0.45); box-shadow: 0 8px 24px rgba(2, 18, 56, 0.35); transform: scaleX(-1); pointer-events: none; z-index: 3;`) and hidden via `.hidden { display: none; }` until camera starts or when toggled off.
   - Add `<button id="cam-toggle" type="button" class="hidden" aria-pressed="true">Hide camera</button>` positioned unobtrusively above the PiP (`right: 16px; bottom: 144px; z-index: 4;`).
2. Create `src/ui/overlay.js` implementing `indicatorScreenPoint` and `createOverlay`:
   - Draw translucent aqua/white rings on `hudCanvas` (`2d` context): crisp thin ring for `'finger'`, broad soft halo for `'palm'`, and expanding fading pulse rings tracked briefly (~350 ms) for `'splash'`.
   - Guard against `ctx === null` so headless/mock environments never throw.

- [ ] **Step 4: Run test suite to verify it passes**

Run: `npx vitest run tests/overlay.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add index.html src/ui/overlay.js tests/overlay.test.js
git commit -m "feat: add mirrored camera PiP preview and fingertip HUD overlay"
```

---

### Task 5: Wire `handTracker` and `overlay` into `src/main.js` & verify end-to-end

**Files:**
- Modify: `src/main.js:1-165`
- Test: `npm test`, `npx vite build`, live browser verification on `http://localhost:5173/`

**Interfaces:**
- Consumes: `createHandTracker` from `src/input/handTracker.js`, `createOverlay` from `src/ui/overlay.js`, `createHands` from `src/input/hands.js`.
- Produces: Complete fullscreen app with mouse multi-touch + 2-hand 5-finger/palm/plunge-splash webcam control + toggleable PiP & HUD (`#cam-toggle` button and `C` key).

- [ ] **Step 1: Wire `handTracker` and `overlay` in `src/main.js`**

Update `src/main.js`:
1. Query `#hud` and `#cam-toggle`, instantiate `overlay = createOverlay({ hudCanvas, video, toggleButton })` and `handTracker = createHandTracker()`.
2. In `resize()`, also call `overlay.resize(width, height, dpr)`.
3. On camera start success, call `overlay.setCameraActive(true)`.
4. Wire `#cam-toggle` click and `keydown` for `c`/`C` (when camera is active) to call `overlay.toggle()`.
5. Add a small helper `queueDrop(key, drop)` (enforcing `SIM.maxDrops` eviction) used by both `stamp()` (pointer input) and hand drops so custom `radius`/`strength` from palm sweeps and plunge splashes are preserved verbatim.
6. In `frame(now)`:
   - When `hands` is ready, call `const sample = hands.sample();` and `const { drops, indicators } = handTracker.update(sample, CAMERA, aspect, POOL, currentSwellTime, now);`.
   - Enqueue every drop in `drops` via `queueDrop(drop.key, drop)`, and call `overlay.draw(indicators, now)`.
   - When `hands` is not active, call `overlay.draw([], now)` (no-op when hidden).
   - Keep all mouse/pointer multi-touch handlers unchanged.

- [ ] **Step 2: Run full test suite & production build**

Run: `npm test`
Expected: All test files pass (0 failures).

Run: `npx vite build`
Expected: Clean Vite production bundle build with 0 errors.

- [ ] **Step 3: Live browser verification**

Start `npx vite --port 5173 --strictPort`, load `http://localhost:5173/`, and verify:
- 0 console errors.
- `#hud` does not block `#start` button or mouse clicks/drags on `#pool`.
- `#cam` PiP and `#cam-toggle` stay hidden before camera permission is granted.
- Clicking and sweeping the mouse still produces clean, aligned ripples with zero whiteout or grid artifacts.

- [ ] **Step 4: Commit**

```powershell
git add src/main.js
git commit -m "feat: wire multi-finger, palm sweep, plunge splash, and HUD overlay in main loop"
```
