# Water Caustics Pool

An interactive real-time WebGL2 swimming pool & water caustics simulation featuring physically based surface ripples, underwater caustic light webs, floating blossoms, rainfall with surface splash crowns, procedural Web Audio synthesis, live water-reflective liquid-glass UI pills, and MediaPipe webcam hand-gesture interaction.

---

## Features

- **Real-Time WebGL2 Water & Caustics**
  - **256×256 floating-point heightfield** wave solver with an isotropic 9-point Laplacian, soft-limiting (`tanh`), and C2-continuous bicubic B-spline sampling with analytical surface slopes.
  - **Ambient Gerstner swell** layered with interactive ripples and organic high-frequency liquid micro-undulations.
  - **Two-pass caustic & refraction pipeline**: refracted sunlight ray-cast through the displaced water mesh onto a procedural ceramic mosaic tile floor with Fresnel sky reflection, Beer-Lambert water absorption, volumetric sunbeams, and filmic tone mapping.
- **4 Mood Themes** (with smooth real-time uniform & UI interpolation)
  - **Sunlit** (`1`) — Bright turquoise mosaic tiles, warm daylight sun sparkles, and crisp caustic ribbons.
  - **Sunset** (`2`) — Golden-amber sky reflection, violet-indigo deep water, and warm diagonal light shafts.
  - **Night** (`3`) — Deep midnight pool illuminated by an underwater central lamp glow and silver moonlight.
  - **Biolum** (`4`) — Dark abyssal water where active ripples, wakes, and collisions glow vivid neon aqua-cyan.
- **Water-Reflective Liquid-Glass UI (`UI_GLASS_FS`)**
  - Every toolbar pill, status badge, and action button renders as a curved 3D liquid-glass lozenge in a dedicated WebGL2 composite pass.
  - Real-time **inverted mirror reflection** of the water directly beneath each button, curved lens refraction with subtle chromatic rim dispersion, upward caustic bounce lighting, Fresnel rim highlights, and responsive mobile-friendly layout wrapping.
  - Clicking any UI button sends a gentle ripple into the water directly beneath it.
- **Interactive Rain Mode (`R`)**
  - Parallax diagonal falling raindrops with optical refraction edges and glistening teardrop tips.
  - Synchronized surface impact: when a targeted raindrop reaches the water surface, it triggers a 3D heightfield ripple, a perspective-foreshortened surface splash crown with airborne water beads, and a synthesized droplet plink sound.
  - Continuous pink-filtered ambient rainfall soundscape that fades in and out smoothly.
- **Floating Blossoms (`P`)**
  - 3D-projected floating flowers that bob with the Gerstner swell, drift away from nearby touch/hand/rain ripples, and pass naturally underneath the floating glass UI buttons.
- **Procedural Web Audio Engine (`M`)**
  - Zero external audio assets — all sounds are synthesized in real time via Web Audio API oscillators and filtered noise buffers (water drops, Minnaert bubble resonances, palm sweeps, plunge splashes, two-hand clap shockwaves, and ambient rainfall).
- **Webcam Multi-Hand Gesture Tracking (`Use hand gesture`)**
  - Powered by `@mediapipe/tasks-vision` (`HandLandmarker`, up to 2 hands):
    - **5-Finger Ripples**: Individual fingertips trace independent wakes across the pool.
    - **Palm Sweep**: Open-hand movement pushes wide, smooth waves.
    - **Fist / Plunge Splash**: Rapid hand-scale expansion or downward fist motion triggers a splash burst (with adjustable `Low` / `Med` / `High` sensitivity).
    - **Two-Hand Clap Shockwave**: Bringing both hands together rapidly emits a high-energy concentric shockwave and double-ring HUD pulse.
- **Adaptive Quality Scaling**
  - Automatically adjusts render resolution scale (`1.0` down to `0.5`) during sustained slow frames and restores full quality when frame times recover.

---

## Controls & Keyboard Shortcuts

| Action | Mouse / Touch / UI | Keyboard |
| :--- | :--- | :--- |
| Create ripples & wakes | Click / tap and drag across the water | — |
| Switch theme (**Sunlit**, **Sunset**, **Night**, **Biolum**) | Click theme pill in top-left toolbar | `1`, `2`, `3`, `4` |
| Toggle **Rain** mode (visual raindrops + rain audio) | Click `Rain` pill | `R` |
| Toggle **Floating Petals** | Click `Petals` pill | `P` |
| Toggle **Sound** mute | Click `Sound` pill | `M` |
| Enable **Webcam Hand Gestures** | Click `Use hand gesture` button (top-right) | — |
| Toggle **Camera Preview** (once camera is active) | Click `Hide camera` / `Show camera` pill | `C` |
| Toggle **Camera Mirroring** / **Splash Sensitivity** | Click `Mirror` / `Splash` pills above camera preview | — |

---

## Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- A browser with **WebGL2** and `EXT_color_buffer_float` support (Chrome, Edge, Firefox, Safari 15+)

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open `http://localhost:5173/` in your browser. (Running on `localhost` or HTTPS is required if you want to enable webcam hand tracking via `getUserMedia`.)

### Run Unit Tests

```bash
npm test
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## Project Structure

```text
water-caustics/
├── index.html                      # App shell, responsive top-bar & HUD layout
├── package.json                    # Scripts and dependencies (Vite, Vitest, MediaPipe)
├── src/
│   ├── main.js                     # Main loop, input wiring, theme & rain orchestration
│   ├── config.js                   # Pool geometry, camera, wave, rain, and theme presets
│   ├── gl.js                       # WebGL2 context, shader compiler, and float FBO helpers
│   ├── math.js                     # Matrix math (perspective, lookAt, ray-plane intersection)
│   ├── audio/
│   │   └── waterAudio.js           # Procedural Web Audio synthesizer & ambient rain bed
│   ├── input/
│   │   ├── touch.js                # NDC ray-casting onto displaced water surface
│   │   ├── hands.js                # MediaPipe HandLandmarker wrapper
│   │   └── handTracker.js          # Multi-hand gesture recognizer (fingers, palm, splash, clap)
│   ├── perf/
│   │   └── adaptiveQuality.js      # Frame-time monitor for dynamic DPR scaling
│   ├── render/
│   │   ├── mesh.js                 # Subdivided water surface grid generator
│   │   ├── renderer.js             # Multi-pass WebGL2 renderer (sim, caustics, water, UI glass)
│   │   └── shaders.js              # GLSL ES 3.00 shaders (UPDATE_FS, CAUSTIC_VS/FS, WATER_VS/FS, UI_GLASS_FS)
│   ├── sim/
│   │   ├── gerstner.js             # CPU-side Gerstner wave evaluation for ray hits & floaters
│   │   ├── heightfield.js          # CPU reference heightfield solver
│   │   ├── floaters.js             # Floating blossom physics & 3D-to-HUD projection
│   │   └── rain.js                 # Falling raindrop streaks, impact splashes, and ripple emitter
│   └── ui/
│       ├── buttonReflections.js    # DOM button rect tracker & theme CSS variable generator
│       └── overlay.js              # 2D HUD renderer (blossoms, raindrops, splashes, hand indicators)
└── tests/                          # Vitest unit test suite (12 test files)
```
