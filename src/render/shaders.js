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
uniform int u_dropCount;
uniform vec4 u_drops[12];
uniform float u_texel;

void main() {
  vec4 s = texture(u_state, v_uv);
  vec4 sL = texture(u_state, v_uv + vec2(-u_texel, 0.0));
  vec4 sR = texture(u_state, v_uv + vec2(u_texel, 0.0));
  vec4 sD = texture(u_state, v_uv + vec2(0.0, -u_texel));
  vec4 sU = texture(u_state, v_uv + vec2(0.0, u_texel));
  float hTL = texture(u_state, v_uv + vec2(-u_texel, u_texel)).r;
  float hTR = texture(u_state, v_uv + vec2(u_texel, u_texel)).r;
  float hBL = texture(u_state, v_uv + vec2(-u_texel, -u_texel)).r;
  float hBR = texture(u_state, v_uv + vec2(u_texel, -u_texel)).r;

  // Isotropic 9-point Laplacian + light diffusive viscosity kills 2-texel grid noise
  float h = s.r;
  float avgH = (4.0 * (sL.r + sR.r + sD.r + sU.r) + (hTL + hTR + hBL + hBR)) * 0.05;
  float lap = (avgH - h) * 4.0;
  float velocity = s.g + lap * u_waveSpeed;
  velocity *= u_damping;
  h = mix(h, avgH, 0.03) + velocity;

  float avgSplash = 0.25 * (sL.b + sR.b + sD.b + sU.b);
  float splash = mix(s.b, avgSplash, 0.35) * 0.85;
  float avgFade = 0.25 * (sL.a + sR.a + sD.a + sU.a);
  float stampFade = max(s.a, avgFade) * 0.90;

  for (int i = 0; i < 12; i++) {
    if (i >= u_dropCount) break;
    vec4 d = u_drops[i];
    if (d.w == 0.0) continue;
    float dist = length(v_uv - d.xy);
    float mask = clamp(1.0 - dist / max(d.z, 1e-5), 0.0, 1.0);
    float drop = 0.5 - cos(mask * 3.14159265) * 0.5;
    if (drop > 0.0) {
      h += drop * d.w;
      velocity += drop * d.w * 0.20;
    }
    if (dist < d.z * 3.2) {
      stampFade = max(stampFade, smoothstep(d.z * 3.2, d.z * 0.5, dist));
    }
  }

  float energy = abs(h) + abs(velocity) * 4.2;
  float collision = smoothstep(0.030, 0.058, energy) * clamp(1.0 - stampFade * 1.8, 0.0, 1.0);
  splash = clamp(max(splash, collision * 0.75), 0.0, 0.75);

  // Smooth tanh soft-limiter prevents hard-clipping edges that excite grid ripples
  h = 0.16 * tanh(h / 0.16);
  velocity = 0.10 * tanh(velocity / 0.10);

  vec2 inside = step(vec2(u_texel), v_uv) * step(v_uv, vec2(1.0 - u_texel));
  float border = inside.x * inside.y;
  outColor = vec4(h * border, velocity * border, splash * border, clamp(stampFade, 0.0, 1.0) * border);
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
uniform highp int u_waveCount;
uniform vec4 u_waves[4];
uniform float u_phases[4];
`;

const SIM_SAMPLE_FN = `
vec4 bsplineW(float t) {
  float it = 1.0 - t;
  return vec4(
    it * it * it,
    3.0 * t * t * t - 6.0 * t * t + 4.0,
    -3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0,
    t * t * t
  ) / 6.0;
}

vec4 bsplineDW(float t) {
  float it = 1.0 - t;
  return vec4(
    -it * it,
    3.0 * t * t - 4.0 * t,
    -3.0 * t * t + 2.0 * t + 1.0,
    t * t
  ) * 0.5;
}

// C2-continuous cubic B-spline height/splash + exact C1 analytical slope (zero grid pillows)
vec4 sampleSimBicubic(vec2 uv, out vec2 grad) {
  float size = 1.0 / u_texel;
  vec2 p = uv * size - 0.5;
  vec2 f = fract(p);
  vec2 base = (floor(p) + 0.5) * u_texel;
  vec4 wx = bsplineW(f.x);
  vec4 wy = bsplineW(f.y);
  vec4 dwx = bsplineDW(f.x);
  vec4 dwy = bsplineDW(f.y);

  vec4 val = vec4(0.0);
  float dhdx = 0.0;
  float dhdz = 0.0;
  for (int j = 0; j < 4; j++) {
    float oy = float(j - 1) * u_texel;
    float wyj = wy[j];
    float dwyj = dwy[j];
    for (int i = 0; i < 4; i++) {
      float ox = float(i - 1) * u_texel;
      vec4 s = texture(u_sim, base + vec2(ox, oy));
      float wxi = wx[i];
      val += s * (wxi * wyj);
      dhdx += s.r * (dwx[i] * wyj);
      dhdz += s.r * (wxi * dwyj);
    }
  }
  grad = vec2(dhdx, dhdz) / u_worldDx;
  return val;
}
`;

const LIQUID_CAUSTIC_FN = `
float liquidField(vec2 p, float t) {
  vec2 q = p + 0.62 * vec2(
    sin(p.y * 1.25 + t * 0.75) + 0.45 * cos(p.x * 1.15 - t * 0.55),
    cos(p.x * 1.20 - t * 0.70) + 0.45 * sin(p.y * 1.10 + t * 0.60)
  );
  vec2 r = q + 0.48 * vec2(
    cos(q.y * 1.55 - t * 0.60) + 0.40 * sin(q.x * 1.30 + t * 0.50),
    sin(q.x * 1.50 + t * 0.65) + 0.40 * cos(q.y * 1.35 - t * 0.55)
  );
  float h = sin(r.x * 1.45 + t * 0.40) * cos(r.y * 1.45 - t * 0.38);
  h += 0.48 * cos(r.x * 1.95 - t * 0.48) * sin(r.y * 1.85 + t * 0.44);
  h += 0.25 * sin(r.x * 2.6 + r.y * 0.6 + t * 0.55);
  return h;
}

vec2 liquidSlope(vec2 xz, float t) {
  vec2 p = xz * 4.4;
  float e = 0.02;
  float hx = liquidField(p + vec2(e, 0.0), t) - liquidField(p - vec2(e, 0.0), t);
  float hz = liquidField(p + vec2(0.0, e), t) - liquidField(p - vec2(0.0, e), t);
  // Subtle high-frequency capillary ripple shimmer
  vec2 c = xz * 11.5;
  vec2 cap = vec2(
    cos(c.x + c.y * 0.65 + t * 1.35) - 0.5 * sin(c.x * 1.3 - c.y * 0.9 - t * 1.1),
    sin(c.y - c.x * 0.7 + t * 1.25) + 0.5 * cos(c.y * 1.2 + c.x * 0.85 - t * 1.05)
  ) * 0.022;
  return (vec2(hx, hz) / (2.0 * e)) * 0.21 + cap;
}

// Crisp sunlit caustic network on the pool floor
float causticWeb(vec2 xz, float t) {
  vec2 p = xz * 3.8;
  float f1 = liquidField(p, t * 1.05);
  float f2 = liquidField(p * 1.22 + vec2(1.7, -1.3), t * 0.92);
  float ridge1 = clamp(1.0 - abs(f1), 0.0, 1.0);
  float ridge2 = clamp(1.0 - abs(f2), 0.0, 1.0);
  float web = pow(ridge1, 7.2) * 1.15 + pow(ridge2, 7.5) * 0.72 + pow(ridge1 * ridge2, 3.2) * 0.55;
  return clamp(web, 0.0, 2.2);
}
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
${SIM_SAMPLE_FN}
out vec3 v_world;
out vec2 v_baseXZ;

void main() {
  vec2 horizontal;
  float swell;
  gerstner(a_xz, horizontal, swell);
  vec2 xz = a_xz + horizontal;
  vec2 uv = vec2(xz.x / (2.0 * u_half) + 0.5, xz.y / (2.0 * u_half) + 0.5);
  vec2 unusedGrad;
  vec4 simState = sampleSimBicubic(uv, unusedGrad);
  float simH = simState.r;
  float splash = simState.b;
  v_baseXZ = a_xz;
  v_world = vec3(xz.x, simH * 0.42 + splash * 0.06 + swell, xz.y);
  gl_Position = u_mvp * vec4(v_world, 1.0);
}
`;

export const WATER_FS = `#version 300 es
precision highp float;
in vec3 v_world;
in vec2 v_baseXZ;
out vec4 outColor;

uniform sampler2D u_sim;
uniform sampler2D u_caustic;
uniform float u_texel;
uniform float u_worldDx;
uniform vec3 u_camera;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;
uniform float u_floorY;
uniform float u_half;
uniform float u_f0;
uniform float u_ior;
uniform vec3 u_absorption;
uniform vec3 u_tileDark;
uniform vec3 u_tileMid;
uniform vec3 u_tileBright;
uniform vec3 u_groutCol;
uniform vec3 u_skyDeep;
uniform vec3 u_skyMid;
uniform vec3 u_skyBright;
uniform vec3 u_causticTint;
uniform float u_shaftStrength;
uniform float u_biolum;
uniform float u_nightGlow;
uniform float u_lightning;
uniform float u_rain;
${WAVE_UNIFORMS}
${GERSTNER_FN}
${SIM_SAMPLE_FN}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 sampleCausticSoft(vec2 uv) {
  float r = 0.0042;
  vec2 disp = vec2(0.0020, -0.0014);
  vec2 uvR = clamp(uv + disp, 0.0, 1.0);
  vec2 uvB = clamp(uv - disp, 0.0, 1.0);

  vec3 sum = vec3(
    texture(u_caustic, uvR).r,
    texture(u_caustic, uv).g,
    texture(u_caustic, uvB).b
  ) * 0.24;

  sum += vec3(texture(u_caustic, uvR + vec2(r, 0.0)).r, texture(u_caustic, uv + vec2(r, 0.0)).g, texture(u_caustic, uvB + vec2(r, 0.0)).b) * 0.12;
  sum += vec3(texture(u_caustic, uvR + vec2(-r, 0.0)).r, texture(u_caustic, uv + vec2(-r, 0.0)).g, texture(u_caustic, uvB + vec2(-r, 0.0)).b) * 0.12;
  sum += vec3(texture(u_caustic, uvR + vec2(0.0, r)).r, texture(u_caustic, uv + vec2(0.0, r)).g, texture(u_caustic, uvB + vec2(0.0, r)).b) * 0.12;
  sum += vec3(texture(u_caustic, uvR + vec2(0.0, -r)).r, texture(u_caustic, uv + vec2(0.0, -r)).g, texture(u_caustic, uvB + vec2(0.0, -r)).b) * 0.12;
  sum += vec3(texture(u_caustic, uvR + vec2(r, r)).r, texture(u_caustic, uv + vec2(r, r)).g, texture(u_caustic, uvB + vec2(r, r)).b) * 0.07;
  sum += vec3(texture(u_caustic, uvR + vec2(-r, r)).r, texture(u_caustic, uv + vec2(-r, r)).g, texture(u_caustic, uvB + vec2(-r, r)).b) * 0.07;
  sum += vec3(texture(u_caustic, uvR + vec2(r, -r)).r, texture(u_caustic, uv + vec2(r, -r)).g, texture(u_caustic, uvB + vec2(r, -r)).b) * 0.07;
  sum += vec3(texture(u_caustic, uvR + vec2(-r, -r)).r, texture(u_caustic, uv + vec2(-r, -r)).g, texture(u_caustic, uvB + vec2(-r, -r)).b) * 0.07;
  return sum;
}

${LIQUID_CAUSTIC_FN}

vec3 floorColor(vec2 xz) {
  vec2 uv = clamp(xz / (2.0 * u_half) + 0.5, 0.0, 1.0);

  // Crisp refracted swimming-pool ceramic mosaic tiles
  vec2 tileCoord = xz * 3.6;
  vec2 tileId = floor(tileCoord);
  vec2 tileF = fract(tileCoord);
  vec2 fw = max(fwidth(tileCoord), vec2(0.004));
  vec2 edge = min(tileF, 1.0 - tileF);
  float groutX = smoothstep(0.020, 0.020 + fw.x * 1.35, edge.x);
  float groutY = smoothstep(0.020, 0.020 + fw.y * 1.35, edge.y);
  float tileMask = groutX * groutY;

  float tileVar = hash21(tileId);
  float tileVar2 = hash21(tileId + 19.3);
  vec3 tileCol = mix(u_tileDark, u_tileMid, tileVar);
  tileCol = mix(tileCol, u_tileBright, smoothstep(0.52, 0.94, tileVar2) * 0.58);
  float bevel = smoothstep(0.02, 0.14, min(edge.x, edge.y));
  // Subtle ceramic glaze variation across each tile face
  float glaze = 0.96 + 0.08 * sin(tileF.x * 3.14159) * sin(tileF.y * 3.14159);
  tileCol *= mix(0.84, 1.04, bevel) * glaze;

  vec3 floorAlbedo = mix(u_groutCol, tileCol, tileMask);

  // Combine crisp chromatic sunlit caustic filaments + interactive touch caustic
  vec3 simCaustic = clamp(sampleCausticSoft(uv), 0.0, 1.0);
  vec3 prismCaustic = pow(simCaustic, vec3(1.35)) * 0.52;
  vec2 cDisp = vec2(0.006, -0.004);
  vec3 sunWebRgb = vec3(
    causticWeb(xz + cDisp, u_time),
    causticWeb(xz, u_time),
    causticWeb(xz - cDisp, u_time)
  );
  float rainDim = 1.0 - u_rain * 0.30;

  // Directional sunlight illumination + optional underwater night pool lamp glow
  float sunPoolGrad = clamp(0.84 + 0.22 * (xz.x * 0.35 - xz.y * 0.45), 0.68, 1.22);
  float lampPool = exp(-dot(xz, xz) * 0.65);
  float lampBoost = 1.0 + u_nightGlow * lampPool * 1.15;
  vec3 sunlitCaustic = mix(u_causticTint, u_sunColor, 0.46);
  vec3 col = floorAlbedo * (0.76 * sunPoolGrad * lampBoost);
  col += (sunlitCaustic * sunWebRgb * ((0.52 - u_biolum * 0.34) * rainDim) + mix(prismCaustic, sunlitCaustic * prismCaustic, 0.45)) * sunPoolGrad * lampBoost;
  return col;
}

vec3 envColor(vec3 r) {
  vec3 d = normalize(r);
  vec3 L = normalize(u_sunDir);
  // Clean natural sky dome gradient without milky artificial specular bands
  float elev = clamp(d.y * 0.85 + 0.15, 0.0, 1.0);
  vec3 horizon = mix(u_skyBright, u_sunColor, 0.14 * (1.0 - u_biolum));
  vec3 zenith = mix(u_skyDeep, u_skyMid, 0.45);
  vec3 col = mix(horizon, u_skyMid, smoothstep(0.0, 0.52, elev));
  col = mix(col, zenith, smoothstep(0.45, 0.96, elev));

  // Crisp sun / moon reflection disc + natural atmospheric scatter
  float sunDot = max(dot(d, L), 0.0);
  float sunHalo = pow(sunDot, 16.0);
  float sunCore = pow(sunDot, 180.0);
  float clearSky = 1.0 - u_rain * 0.72;
  col += mix(u_skyBright, u_sunColor, 0.55) * sunHalo * (0.38 * (1.0 - u_biolum * 0.7) * clearSky);
  col += u_sunColor * sunCore * (2.6 * (1.0 - u_biolum * 0.65) * clearSky);
  vec3 stormSky = mix(u_skyDeep, vec3(0.32, 0.42, 0.54), 0.48);
  col = mix(col, stormSky, u_rain * 0.38);
  return col;
}

void main() {
  vec2 horizontal;
  float swell;
  vec3 swellNormal = gerstner(v_baseXZ, horizontal, swell);
  vec2 uv = vec2(v_world.x / (2.0 * u_half) + 0.5, v_world.z / (2.0 * u_half) + 0.5);
  vec2 simGrad;
  vec4 simState = sampleSimBicubic(uv, simGrad);
  float simH = simState.r;
  float simV = simState.g;
  float splash = simState.b;

  vec2 simSlope = simGrad * 3.8;
  vec2 swellSlope = vec2(-swellNormal.x / swellNormal.y, -swellNormal.z / swellNormal.y) * 0.16;
  vec2 organicSlope = liquidSlope(v_world.xz, u_time);
  vec2 slope = simSlope + swellSlope + organicSlope;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 V = normalize(u_camera - v_world);
  vec3 L = normalize(u_sunDir);
  float NoV = max(dot(N, V), 0.0);

  // Physical water Fresnel (F0 ~ 0.02-0.05): crystal-clear view of pool floor tiles & caustics, crisp grazing reflections
  float fresnel = mix(0.05, 0.72, pow(1.0 - NoV, 4.0));
  vec3 reflected = envColor(reflect(-V, N));

  vec3 I = refract(-V, N, 1.0 / u_ior);
  vec3 through;
  if (I.y < -0.001) {
    float t = (u_floorY - v_world.y) / I.y;
    vec3 hit = v_world + I * t;
    float path = length(hit - v_world);
    through = floorColor(hit.xz) * exp(-u_absorption * path * 1.15);
  } else {
    through = u_skyDeep;
  }

  // Crisp pinpoint sunlight glints + subtle underwater sunbeams
  vec3 H = normalize(L + V);
  float specSparkle = pow(max(dot(N, H), 0.0), 320.0);
  float specSun = pow(max(dot(N, H), 0.0), 56.0);

  // Subtle diagonal sunbeam shafts streaming across the water
  float beamCoord = dot(v_world.xz, normalize(vec2(0.82, -0.57)));
  float shafts = 0.5 + 0.5 * sin(beamCoord * 3.6 + sin(v_world.z * 1.4 - u_time * 0.35) * 0.8);
  shafts = pow(shafts, 3.5) * smoothstep(-1.4, 1.2, v_world.x * 0.45 - v_world.z * 0.75);

  float crease = smoothstep(0.28, 0.86, 1.0 - NoV) * smoothstep(0.26, 0.92, length(slope));
  float rippleEdge = smoothstep(0.15, 1.05, length(simSlope));

  // Keep water crystal clear with crisp sun glints & subtle aerated micro-sparkles
  float rainSunScale = 1.0 - u_rain * 0.45;
  vec3 col = mix(through, reflected, fresnel);
  col = mix(col, u_skyDeep * 0.85, crease * 0.20);
  col += mix(u_causticTint, u_sunColor, 0.55) * shafts * u_shaftStrength * (1.0 - u_rain * 0.75);
  col += mix(u_causticTint, u_sunColor, 0.55) * (specSun * 0.11 + splash * specSun * 0.32) * rainSunScale;
  col += u_sunColor * (specSparkle * (2.1 + splash * 1.4) + rippleEdge * specSparkle * 1.2) * u_sunIntensity * rainSunScale;

  // Subtle aerated micro-sparkle on peak wave collisions while keeping water crystal-clear and translucent
  float peakSplash = smoothstep(0.42, 0.74, splash) * smoothstep(0.35, 1.15, length(simSlope));
  if (peakSplash > 0.01) {
    float micro = hash21(floor(v_world.xz * 48.0 + u_time * 3.0));
    float glint = smoothstep(0.62, 0.96, micro) * peakSplash;
    col += mix(u_causticTint, vec3(0.92, 0.98, 1.0), 0.55) * (glint * 0.22 + peakSplash * 0.06) * rainSunScale;
  }

  // Subtle cool overcast atmosphere while raining
  col = mix(col, col * vec3(0.76, 0.83, 0.92), u_rain * 0.38);

  // Periodic storm lightning illuminating the reflected sky, ripple crests, and pool depth
  if (u_lightning > 0.001) {
    vec3 flashTint = vec3(0.76, 0.88, 1.0);
    float crestCatch = 0.35 + 0.65 * fresnel + rippleEdge * 0.55 + specSun * 0.8;
    col += flashTint * (u_lightning * (0.48 * crestCatch + 0.18));
  }

  // Bioluminescent mode: active ripples, wakes, and collisions glow vivid neon aqua-cyan
  if (u_biolum > 0.001) {
    float waveActivity = abs(simH) * 14.0 + abs(simV) * 26.0 + length(simSlope) * 0.55 + splash * 1.5;
    float bio = smoothstep(0.12, 1.35, waveActivity);
    float bioCore = pow(smoothstep(0.35, 1.8, waveActivity), 1.8);
    vec3 neonCyan = vec3(0.05, 0.95, 1.0);
    vec3 neonCore = vec3(0.55, 0.98, 1.0);
    col += (neonCyan * bio * 1.35 + neonCore * bioCore * 1.65) * u_biolum;
  }

  // Filmic tone curve preserving rich depth, clear tiles, and bright warm highlights
  col = (col * (2.45 * col + 0.018)) / (col * (2.30 * col + 0.54) + 0.12);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.15));
  outColor = vec4(col, 1.0);
}
`;

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
${SIM_SAMPLE_FN}
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
  vec2 simGrad;
  vec4 simState = sampleSimBicubic(uv, simGrad);
  float simH = simState.r;
  float splash = simState.b;
  vec2 slope = simGrad
    + vec2(-swellNormal.x / swellNormal.y, -swellNormal.z / swellNormal.y);
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 P = vec3(xz.x, simH * 0.42 + splash * 0.06 + swell, xz.y);

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

export const UI_GLASS_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_uiCount;
uniform vec4 u_uiRects[16];
uniform vec4 u_uiMeta[16];
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_skyDeep;
uniform vec3 u_skyMid;
uniform vec3 u_skyBright;
uniform vec3 u_causticTint;
uniform float u_biolum;
uniform float u_nightGlow;
${LIQUID_CAUSTIC_FN}

vec3 toDisplay(vec3 c) {
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.15));
}

float sdPill(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 mirrorUv(vec2 uv) {
  vec2 m = abs(mod(uv + 1.0, 2.0) - 1.0);
  return clamp(m, vec2(0.002), vec2(0.998));
}

vec3 sampleFrostedScene(vec2 uv, vec2 disp, float blurPx) {
  vec2 stepUv = vec2(blurPx) / u_resolution;
  vec2 uvR = mirrorUv(uv + disp);
  vec2 uvG = mirrorUv(uv);
  vec2 uvB = mirrorUv(uv - disp);

  float r = texture(u_scene, uvR).r * 0.36
    + texture(u_scene, mirrorUv(uvR + vec2(stepUv.x, 0.0))).r * 0.16
    + texture(u_scene, mirrorUv(uvR - vec2(stepUv.x, 0.0))).r * 0.16
    + texture(u_scene, mirrorUv(uvR + vec2(0.0, stepUv.y))).r * 0.16
    + texture(u_scene, mirrorUv(uvR - vec2(0.0, stepUv.y))).r * 0.16;

  float g = texture(u_scene, uvG).g * 0.36
    + texture(u_scene, mirrorUv(uvG + vec2(stepUv.x, 0.0))).g * 0.16
    + texture(u_scene, mirrorUv(uvG - vec2(stepUv.x, 0.0))).g * 0.16
    + texture(u_scene, mirrorUv(uvG + vec2(0.0, stepUv.y))).g * 0.16
    + texture(u_scene, mirrorUv(uvG - vec2(0.0, stepUv.y))).g * 0.16;

  float b = texture(u_scene, uvB).b * 0.36
    + texture(u_scene, mirrorUv(uvB + vec2(stepUv.x, 0.0))).b * 0.16
    + texture(u_scene, mirrorUv(uvB - vec2(stepUv.x, 0.0))).b * 0.16
    + texture(u_scene, mirrorUv(uvB + vec2(0.0, stepUv.y))).b * 0.16
    + texture(u_scene, mirrorUv(uvB - vec2(0.0, stepUv.y))).b * 0.16;

  return vec3(r, g, b);
}

void main() {
  vec3 baseScene = texture(u_scene, v_uv).rgb;
  if (u_uiCount <= 0) {
    outColor = vec4(baseScene, 1.0);
    return;
  }

  vec2 fragCoord = v_uv * u_resolution;
  float bestD = 1e6;
  vec4 bestRect = vec4(0.0);
  vec4 bestMeta = vec4(0.0);
  vec2 bestP = vec2(0.0);
  float shadowAccum = 0.0;
  float haloAccum = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= u_uiCount) break;
    vec4 rect = u_uiRects[i];
    vec2 p = fragCoord - rect.xy;
    if (abs(p.x) > rect.z + 20.0 || abs(p.y) > rect.w + 24.0) continue;

    vec4 meta = u_uiMeta[i];
    float rad = meta.z;
    float d = sdPill(p, rect.zw, rad);

    if (d > -1.0) {
      float dShadow = sdPill(p - vec2(-2.0, -5.0), rect.zw * vec2(0.98, 0.94), rad * 0.94);
      float shadow = exp(-max(dShadow, 0.0) * 0.14) * smoothstep(22.0, -2.0, dShadow);
      shadowAccum = max(shadowAccum, shadow * (0.28 + 0.06 * meta.x));

      float underGlow = exp(-max(d, 0.0) * 0.28) * smoothstep(rect.w * 0.35, -rect.w, p.y);
      haloAccum = max(haloAccum, underGlow * (0.20 + 0.30 * meta.x + 0.16 * meta.y));
    }

    if (d < bestD) {
      bestD = d;
      bestRect = rect;
      bestMeta = meta;
      bestP = p;
    }
  }

  vec3 skyDeepDisp = toDisplay(u_skyDeep);
  vec3 skyMidDisp = toDisplay(u_skyMid);
  vec3 skyBrightDisp = toDisplay(u_skyBright);
  vec3 causticDisp = toDisplay(u_causticTint);
  vec3 sunDisp = toDisplay(u_sunColor);

  vec3 col = baseScene * (1.0 - shadowAccum);
  col += mix(causticDisp, sunDisp, 0.35) * haloAccum * (0.30 + u_biolum * 0.45);

  if (bestD < 1.25) {
    vec2 b = bestRect.zw;
    float rad = bestMeta.z;
    float isActive = bestMeta.x;
    float isHover = bestMeta.y;
    float isHero = step(0.5, bestMeta.w) * step(bestMeta.w, 1.5);
    vec2 normP = bestP / max(b, vec2(1.0));

    float eps = 1.5;
    vec2 sdfGrad = normalize(vec2(
      sdPill(bestP + vec2(eps, 0.0), b, rad) - sdPill(bestP - vec2(eps, 0.0), b, rad),
      sdPill(bestP + vec2(0.0, eps), b, rad) - sdPill(bestP - vec2(0.0, eps), b, rad)
    ) + vec2(1e-5));

    float bevelW = clamp(b.y * 0.65, 7.0, 22.0);
    float edgeT = clamp(1.0 + bestD / bevelW, 0.0, 1.0);
    float bevelCurve = pow(edgeT, 1.65);

    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 screenP = vec2(v_uv.x * aspect, v_uv.y);
    vec2 ripple = liquidSlope(screenP * 2.2, u_time * 1.15);

    vec2 dome = vec2(normP.x * 0.14, normP.y * 0.46);
    vec2 slopeXY = sdfGrad * bevelCurve * 0.85 + dome + ripple * (0.10 + 0.05 * isHover);
    vec3 N = normalize(vec3(slopeXY.x, slopeXY.y, 1.0));

    // Refracted water passing through the curved glass pill with subtle chromatic rim dispersion
    vec2 refractShift = (-sdfGrad * bevelCurve * (5.5 + isHero * 3.0) + ripple * 2.4) / u_resolution;
    vec2 dispShift = sdfGrad * bevelCurve * (1.8 + isActive * 0.8 + isHero * 0.6) / u_resolution;
    vec3 refracted = sampleFrostedScene(v_uv + refractShift, dispShift, 2.1 + isHero * 0.6);

    // Live inverted reflection of the pool water directly below the floating pill
    float hFromBottom = clamp(bestP.y + b.y, 0.0, 2.0 * b.y);
    float reflSpan = mix(1.45, 1.85, isHero);
    vec2 reflPx = vec2(
      fragCoord.x + N.x * (18.0 + b.y * 0.55) + ripple.x * (8.0 + 3.5 * isHover),
      (bestRect.y - b.y) - hFromBottom * reflSpan - 3.0 + N.y * 10.0 + ripple.y * (7.0 + 3.0 * isHover)
    );
    vec2 reflUv = mirrorUv(reflPx / u_resolution);
    vec2 rxOff = vec2(1.8 / u_resolution.x, 0.8 / u_resolution.y);
    vec3 reflected = texture(u_scene, reflUv).rgb * 0.50
      + texture(u_scene, mirrorUv(reflUv + rxOff)).rgb * 0.25
      + texture(u_scene, mirrorUv(reflUv - rxOff)).rgb * 0.25;
    vec3 reflSparkle = max(reflected - vec3(0.48), vec3(0.0));
    reflected += reflSparkle * (0.55 + 0.25 * isActive + 0.25 * isHover);

    // Animated caustic web bouncing upward from the pool onto the button
    float web = causticWeb(screenP * 1.45 + N.xy * 0.14, u_time * 1.1);
    float underside = smoothstep(0.65, -0.95, normP.y);
    vec3 causticBounce = mix(causticDisp, sunDisp, 0.35) * web * (0.10 + 0.24 * underside + 0.10 * isActive * edgeT + 0.08 * isHover);

    // Fresnel blend of refracted water core + live inverted water reflection
    float NoV = clamp(N.z, 0.0, 1.0);
    float fresnel = pow(1.0 - NoV, 2.1);
    float reflStrength = clamp(0.38 + 0.36 * fresnel + 0.22 * underside + 0.08 * isHover, 0.0, 0.90);
    vec3 glassCol = mix(refracted, reflected, reflStrength);

    // Rich translucent water-glass absorption: stronger in the center band so labels stay razor-sharp even over bright glints
    float centerWeight = (1.0 - bevelCurve) * smoothstep(1.0, 0.15, abs(normP.y));
    float luma = dot(glassCol, vec3(0.299, 0.587, 0.114));
    float glintGuard = smoothstep(0.56, 0.92, luma) * centerWeight * 0.28;
    float shadeTint = mix(0.26, 0.24, isActive) + glintGuard;
    shadeTint = mix(shadeTint, 0.22 + glintGuard * 0.9, isHero);
    vec3 deepTint = mix(skyDeepDisp * 0.58, skyMidDisp * 0.44, 0.30);
    vec3 activeCoreTint = mix(skyDeepDisp * 0.52, skyMidDisp * 0.72, 0.58);
    vec3 coreTint = mix(deepTint, activeCoreTint, isActive);
    glassCol = mix(glassCol, coreTint, clamp(shadeTint, 0.0, 0.58));

    // Active state luminous jewel-rim infusion (concentrated on curved bevel & meniscus so center text stays high-contrast)
    vec3 activeGlowCol = mix(skyMidDisp, causticDisp, 0.62 + u_biolum * 0.30);
    float activeRimMask = smoothstep(0.18, 0.96, edgeT);
    glassCol = mix(glassCol, mix(glassCol, activeGlowCol, 0.52), isActive * activeRimMask);
    glassCol += activeGlowCol * (isActive * (0.06 + 0.18 * activeRimMask + 0.10 * u_biolum));

    glassCol += causticBounce * (1.0 - u_biolum * 0.22);

    // Curved specular sky sheen on top lip + reflected water caustic bounce along bottom lip
    float topArc = smoothstep(0.16, 0.96, normP.y) * smoothstep(0.28, 0.98, edgeT);
    float bottomArc = smoothstep(-0.12, -0.96, normP.y) * smoothstep(0.22, 0.98, edgeT);
    float sweepX = 0.55 + 0.45 * cos(normP.x * 2.2 - u_sunDir.x * 1.6);
    vec3 topSpec = mix(skyBrightDisp, sunDisp, 0.55) * topArc * sweepX * (0.48 + 0.28 * isActive + 0.24 * isHover);
    vec3 bottomBounce = mix(causticDisp, sunDisp, 0.30) * bottomArc * (0.42 + 0.36 * isActive + 0.20 * isHover + 0.32 * u_biolum);
    glassCol += topSpec + bottomBounce;

    // Crisp Fresnel glass border (brighter luminous outline for active pills)
    float borderBand = smoothstep(-2.4, -0.45, bestD) * (1.0 - smoothstep(-0.15, 0.85, bestD));
    vec3 rimCol = mix(
      mix(causticDisp, skyBrightDisp, 0.5),
      mix(vec3(1.0), sunDisp, 0.30),
      0.32 + 0.54 * isActive + 0.22 * isHover
    );
    glassCol = mix(glassCol, rimCol, borderBand * (0.50 + 0.42 * isActive + 0.18 * isHover));

    float pillMask = 1.0 - smoothstep(-0.75, 0.75, bestD);
    col = mix(col, clamp(glassCol, 0.0, 1.0), pillMask);
  }

  outColor = vec4(col, 1.0);
}
`;
