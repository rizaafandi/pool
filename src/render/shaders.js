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
    float steepness = u_waves[i].w * u_swellScale;
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
uniform float u_swellScale;
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
uniform float u_organicScale;
uniform vec3 u_bedWeights;
uniform int u_koiCount;
uniform vec4 u_koiPos[12];
uniform vec4 u_koiMeta[12];
uniform int u_lanternCount;
uniform vec4 u_lanterns[6];
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

float koiNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float koiSpineOffset(float u, float phase, float bend) {
  // True subcarangiform traveling wave: subtle head counter-yaw, fluid muscular tail whip
  float headYaw = sin(phase + 0.55) * 0.010 * smoothstep(0.06, 0.47, u);
  float bodyT = clamp((0.36 - u) / 0.98, 0.0, 1.0);
  float wave = sin(u * 7.8 + phase) * (0.004 + 0.124 * bodyT * bodyT);
  float du = u - 0.16;
  float curve = bend * du * du * (1.35 + 0.45 * bodyT);
  return wave + headYaw + curve;
}

float koiSpineSlope(float u, float phase, float bend) {
  return (koiSpineOffset(u + 0.02, phase, bend) - koiSpineOffset(u - 0.02, phase, bend)) * 25.0;
}

vec2 koiLocal(vec2 worldXZ, vec2 centerXZ, float heading, float len, float phase, float bend) {
  vec2 d = worldXZ - centerXZ;
  float ch = cos(heading);
  float sh = sin(heading);
  vec2 loc = vec2(d.x * ch + d.y * sh, -d.x * sh + d.y * ch) / max(len, 0.05);
  loc.y -= koiSpineOffset(loc.x, phase, bend);
  return loc;
}

float koiBodyHalfWidth(float u) {
  // Authentic mature Nishikigoi confirmation: softly rounded U-snout at +0.475,
  // broad rounded shoulders at +0.16..+0.26, muscular taper into slender caudal peduncle at -0.34
  if (u >= 0.478 || u <= -0.35) return 0.0;
  float t = clamp((u + 0.35) / 0.828, 0.0, 1.0);
  float nose = pow(max(1.0 - t, 0.0001), 0.48);
  float taper = pow(max(t, 0.0001), 1.32);
  float sDu = (u - 0.18) / 0.16;
  float shoulder = 1.0 + 0.10 * exp(-sDu * sDu);
  float profile = 0.355 * nose * taper * shoulder;
  // Muscular caudal peduncle leading smoothly into the tail fin root
  float peduncle = 0.025 * smoothstep(-0.35, -0.27, u) * smoothstep(0.04, -0.24, u);
  return max(profile, peduncle);
}

// Imbricated roof-tile fish scales mapped around the cylindrical dorsal body.
// Returns vec4(edgeDark, centerDome, normalTiltU, normalTiltV)
vec4 koiScales(float u, float cylV) {
  vec2 g = vec2(u * 30.0, cylV * 14.5);
  float row = floor(g.x);
  vec2 f0 = fract(vec2(g.x, g.y + mod(row, 2.0) * 0.5));
  vec2 f1 = fract(vec2(g.x + 0.5, g.y + mod(row + 1.0, 2.0) * 0.5));

  // Rearward semicircular scale arc (scales overlap front-over-back)
  vec2 c0 = vec2(f0.x - 0.82, f0.y - 0.5);
  vec2 c1 = vec2(f1.x - 0.82, f1.y - 0.5);
  float d0 = length(c0 * vec2(1.15, 1.05));
  float d1 = length(c1 * vec2(1.15, 1.05));

  bool pick0 = d0 < d1;
  float d = pick0 ? d0 : d1;
  vec2 cv = pick0 ? c0 : c1;

  float edgeDark = smoothstep(0.36, 0.56, d) * smoothstep(0.68, 0.54, d);
  float centerDome = smoothstep(0.58, 0.14, d);
  return vec4(edgeDark, centerDome, cv.x, cv.y);
}

float koiFloorShadow(vec2 floorXZ) {
  if (u_koiCount <= 0) return 0.0;
  float shadow = 0.0;
  float sunY = max(u_sunDir.y, 0.32);
  for (int i = 0; i < 12; i++) {
    if (i >= u_koiCount) break;
    vec4 kp = u_koiPos[i];
    vec4 km = u_koiMeta[i];
    float hAboveFloor = max(0.02, kp.y - u_floorY);
    vec2 sCenter = kp.xz - u_sunDir.xz * (hAboveFloor / sunY);
    vec2 delta = floorXZ - sCenter;
    float maxR = km.x * 0.88;
    if (dot(delta, delta) > maxR * maxR) continue;
    vec2 loc = koiLocal(floorXZ, sCenter, kp.w, km.x, km.y, km.z);
    float av = abs(loc.y);
    float blur = 0.036 + hAboveFloor * 0.19;
    float hw = koiBodyHalfWidth(loc.x);

    // Body + caudal shadow
    float inLen = smoothstep(-0.67 - blur, -0.33, loc.x) * smoothstep(0.49 + blur, 0.36, loc.x);
    float tT = clamp((-0.29 - loc.x) / 0.38, 0.0, 1.0);
    float tailW = mix(hw, 0.165 * sin(min(1.0, tT * 1.15) * 1.5708), smoothstep(-0.26, -0.56, loc.x));
    float bodyM = smoothstep(tailW + blur, tailW - blur * 0.45, av) * inLen;

    // Soft pectoral fin shadow pads extending from the shoulders
    float pecU = loc.x - (0.16 - av * 0.48);
    float pecV = av - (hw * 0.65 + 0.105);
    float pecR = length(vec2(pecU / 0.13, pecV / 0.11));
    float pecM = smoothstep(1.08 + blur * 2.0, 0.45, pecR) * smoothstep(0.32, 0.20, loc.x) * 0.55;

    float depthFade = clamp(1.0 - hAboveFloor * 1.08, 0.42, 0.94);
    shadow = max(shadow, max(bodyM, pecM) * 0.54 * depthFade);
  }
  return shadow;
}

vec4 sampleKoi(vec2 worldXZ, vec4 kp, vec4 km, vec3 sunWebRgb, vec3 prismCaustic) {
  vec2 delta = worldXZ - kp.xz;
  float maxR = km.x * 0.88;
  if (dot(delta, delta) > maxR * maxR) return vec4(0.0);

  vec2 loc = koiLocal(worldXZ, kp.xz, kp.w, km.x, km.y, km.z);
  float u = loc.x;
  float v = loc.y;
  float av = abs(v);
  float sideSign = v >= 0.0 ? 1.0 : -1.0;

  float variant = floor(km.w + 0.001);
  float seed = fract(km.w) * 19.7;

  // Smooth anatomical Nishikigoi torpedo body silhouette
  float hw = koiBodyHalfWidth(u);
  float bodyDist = av - hw;
  float bodyAlpha = smoothstep(0.0075, -0.0060, bodyDist)
    * smoothstep(0.480, 0.458, u)
    * smoothstep(-0.352, -0.318, u);

  // Graceful teardrop/paddle pectoral fins (Munabire) with independent sculling & turn flare
  float scull = sin(km.y * 0.52 + sideSign * 0.55) * 0.015;
  float turnFlare = clamp(-km.z * sideSign * 0.08, -0.018, 0.030);
  float pecOriginU = 0.245;
  float pecOriginV = max(hw * 0.68, 0.088);
  float pecDu = pecOriginU - u;
  float pecDv = av - pecOriginV;
  // Swept paddle coordinates: curves cleanly backward with a rounded outer lobe
  float sweepU = pecDu - pecDv * (0.72 + scull * 3.5);
  float pecReach = 0.145 + turnFlare;
  float pecNormV = clamp(pecDv / max(pecReach, 0.05), 0.0, 1.3);
  float pecChord = mix(0.075, 0.142, sin(min(1.0, pecNormV * 1.08) * 3.14159)) * smoothstep(1.12, 0.72, pecNormV);
  float pecCenter = 0.032 + pecNormV * 0.055;
  float pecDist = abs(sweepU - pecCenter) - pecChord * 0.55;
  float pecEnv = smoothstep(0.012, -0.010, pecDist)
    * smoothstep(0.0, 0.026, pecDv + 0.018)
    * smoothstep(1.06, 0.82, pecNormV)
    * smoothstep(0.285, 0.225, u);
  float pecAngle = atan(max(0.001, pecDv + 0.02), max(0.01, pecDu + 0.04));
  // Fine branching radial fin rays + opaque curved leading bone ray
  float pecRayA = 0.5 + 0.5 * sin(pecAngle * 34.0);
  float pecRayB = 0.5 + 0.5 * sin(pecAngle * 68.0 + 0.8);
  float pecRays = 0.78 + 0.15 * pecRayA + 0.07 * pecRayB * smoothstep(0.35, 0.85, pecNormV);
  float pecLeadEdge = smoothstep(0.022, 0.002, abs(sweepU - (pecCenter - pecChord * 0.48))) * pecEnv * smoothstep(0.95, 0.15, pecNormV);
  float pecAlpha = pecEnv * (mix(0.84, 0.30, pow(max(clamp(pecNormV, 0.0, 1.0), 0.0001), 0.85)) * pecRays + pecLeadEdge * 0.24);
  pecAlpha = clamp(pecAlpha, 0.0, 0.94);

  // Swept translucent pelvic fins (Harabire) tucked mid-body
  float pelvDu = -0.02 - u;
  float pelvDv = av - max(hw * 0.60, 0.058);
  float pelvSweep = pelvDu - pelvDv * 0.78;
  float pelvNormV = clamp(pelvDv / 0.088, 0.0, 1.3);
  float pelvChord = 0.086 * sin(min(1.0, pelvNormV * 1.1) * 3.14159);
  float pelvEnv = smoothstep(0.010, -0.008, abs(pelvSweep - 0.025) - pelvChord * 0.5)
    * smoothstep(0.0, 0.020, pelvDv + 0.014)
    * smoothstep(1.05, 0.78, pelvNormV);
  float pelvAngle = atan(max(0.001, pelvDv + 0.015), max(0.01, pelvDu + 0.03));
  float pelvRays = 0.84 + 0.16 * sin(pelvAngle * 28.0);
  float pelvAlpha = pelvEnv * mix(0.68, 0.24, clamp(pelvNormV, 0.0, 1.0)) * pelvRays;

  // Flowing silk-like caudal tail fin (Obire) with rounded lobes, lunate fork & trailing phase lag
  float tailT = clamp((-0.29 - u) / 0.39, 0.0, 1.0);
  // Subtle delayed silk whip in the translucent tail membrane
  float tailSilkLag = sin(u * 7.0 + km.y - 0.75) * 0.024 * tailT * tailT;
  float vTail = v - tailSilkLag;
  float avTail = abs(vTail);
  // Rounded upper/lower lobe outer sweep (fuller, graceful curve rather than rigid triangle)
  float tailHalfW = mix(0.022, 0.205, pow(max(tailT, 0.0001), 0.68)) * (1.0 - 0.10 * smoothstep(0.72, 1.0, tailT));
  float lobeNorm = clamp(avTail / max(tailHalfW, 0.012), 0.0, 1.0);
  // Smooth rounded lobe tips peaking near lobeNorm = 0.72 with a graceful lunate center cleft
  float lobeArch = sin(pow(max(lobeNorm, 0.0001), 0.78) * 3.14159);
  float forkCut = -0.525 - 0.155 * pow(max(lobeArch, 0.0001), 0.72);
  float tailIn = smoothstep(-0.275, -0.335, u) * smoothstep(forkCut - 0.014, forkCut + 0.024, u);
  float tailEdge = smoothstep(tailHalfW + 0.010, tailHalfW - 0.008, avTail);
  float tailRayA = 0.5 + 0.5 * sin(lobeNorm * 28.0 + tailT * 2.2);
  float tailRayB = 0.5 + 0.5 * sin(lobeNorm * 56.0 - tailT * 1.4);
  float tailRays = 0.78 + 0.15 * tailRayA + 0.07 * tailRayB * smoothstep(0.35, 0.90, tailT);
  float tailOuterLead = smoothstep(0.78, 0.96, lobeNorm) * tailEdge * tailIn * smoothstep(0.92, 0.15, tailT);
  float tailAlpha = tailIn * tailEdge * (mix(0.88, 0.32, pow(max(tailT, 0.0001), 0.85)) * tailRays + tailOuterLead * 0.16);
  tailAlpha = clamp(tailAlpha, 0.0, 0.94);

  // Delicate curved whisker barbels (Hige) sweeping gracefully back from the corners of the mouth
  float barbT = clamp((0.468 - u) / 0.056, 0.0, 1.0);
  float barbCurveV = 0.030 + pow(max(barbT, 0.0001), 0.78) * 0.036 + sin(km.y * 0.6 + sideSign) * 0.004 * barbT;
  float barbIn = smoothstep(0.472, 0.460, u) * smoothstep(0.405, 0.422, u);
  float barbThick = mix(0.0065, 0.0022, barbT);
  float barbAlpha = smoothstep(barbThick + 0.004, barbThick * 0.35, abs(av - barbCurveV)) * barbIn * 0.68;

  // Sculpted translucent dorsal fin ribbon swaying along the spine + sun-projected shadow onto back
  float dorsalLen = smoothstep(-0.25, -0.14, u) * smoothstep(0.17, 0.05, u);
  float dorsalWave = sin(u * 9.5 + km.y - 0.55) * 0.014 - km.z * 0.038 * dorsalLen;
  float dorsalRibbon = smoothstep(0.017, 0.0025, abs(v - dorsalWave)) * dorsalLen;
  float dorsalRays = 0.82 + 0.18 * sin(u * 135.0);
  float dorsalLine = dorsalRibbon * dorsalRays;

  // Project sun direction into koi's local lateral axis for accurate dorsal shadow direction
  float ch0 = cos(kp.w);
  float sh0 = sin(kp.w);
  float sunLat = -u_sunDir.x * sh0 + u_sunDir.z * ch0;
  float dorsalShOff = -clamp(sunLat, -0.8, 0.8) * 0.022;
  float dorsalSideShadow = smoothstep(0.026, 0.004, abs(v - dorsalWave - dorsalShOff)) * dorsalLen;

  float finAlpha = max(max(pecAlpha, pelvAlpha), max(tailAlpha, barbAlpha));
  float totalAlpha = clamp(max(bodyAlpha, finAlpha), 0.0, 1.0);
  if (totalAlpha < 0.005) return vec4(0.0);

  // Cylindrical lateral wrap for realistic foreshortened scales & 3D shading
  float flank = clamp(v / max(hw, 0.015), -1.0, 1.0);
  float dorsalZ = sqrt(max(0.05, 1.0 - flank * flank * 0.93));
  float cylV = asin(clamp(flank, -0.98, 0.98)) * 0.64;

  // Imbricated roof-tile fish scales across the torso (cleanly stopping at the curved operculum gill line)
  float gillCurveU = 0.242 - av * av * 1.75;
  float torsoMask = smoothstep(gillCurveU + 0.020, gillCurveU - 0.035, u) * smoothstep(-0.33, -0.20, u);
  vec4 scaleData = koiScales(u, cylV);
  float scaleEdge = scaleData.x * torsoMask;
  float scaleCenter = scaleData.y * torsoMask;

  // All koi pigments in TRUE LINEAR LIGHT SPACE (WATER_FS applies filmic curve + gamma 1/2.15)
  vec2 nCoord = vec2(u * 4.0 + seed, cylV * 3.4 - seed * 0.65);
  float patchA = koiNoise(nCoord) * 0.68 + koiNoise(nCoord * 2.15 + 3.1) * 0.32;
  float patchB = koiNoise(nCoord * 1.65 + vec2(6.7, -3.9)) * 0.72 + koiNoise(nCoord * 3.1 - 2.2) * 0.28;
  // Scale-modulated pigment boundary: mimics authentic Kiwa (scale-following edge) & Sashi
  float scaleMod = (scaleCenter - 0.45) * 0.048 * torsoMask;

  vec3 pureWhite = vec3(0.86, 0.88, 0.90);
  vec3 warmIvory = vec3(0.88, 0.84, 0.78);
  vec3 orangeRed = vec3(0.94, 0.115, 0.007);
  vec3 orangeDeep = vec3(0.72, 0.052, 0.003);
  vec3 butterGold = vec3(0.72, 0.50, 0.048);
  vec3 goldBright = vec3(0.96, 0.80, 0.145);
  vec3 sumiBlack = vec3(0.008, 0.010, 0.015);

  vec3 albedo = pureWhite;
  vec3 finCol = vec3(0.84, 0.88, 0.91);
  vec3 dorsalCol = vec3(0.56, 0.62, 0.68);
  vec3 irisCol = vec3(0.64, 0.54, 0.28);
  float ginrin = 0.0;

  if (variant < 0.5) {
    // 0: Platinum Ogon (luminous porcelain-silver white with subtle pearlescent Ginrin scale luster)
    albedo = mix(pureWhite, vec3(0.92, 0.94, 0.97), scaleCenter * 0.35);
    albedo *= 1.0 - scaleEdge * 0.11;
    finCol = vec3(0.86, 0.90, 0.94);
    dorsalCol = vec3(0.52, 0.58, 0.65);
    irisCol = vec3(0.70, 0.74, 0.78);
    ginrin = 0.42;
  } else if (variant < 1.5) {
    // 1: Kohaku (pure Shiroji porcelain white + deep scarlet-vermilion Hi saddles with scale-edged Kiwa)
    float sashi = smoothstep(0.41, 0.48, patchA + scaleMod * 0.6) * smoothstep(-0.32, -0.18, u);
    float hi = smoothstep(0.445, 0.478, patchA + scaleMod) * smoothstep(-0.32, -0.18, u);
    // Subtle occasional Tancho forehead crown marking on some Kohaku seeds
    float tanchoSeed = step(0.62, fract(seed * 0.37));
    float tancho = tanchoSeed * smoothstep(0.072, 0.052, length(vec2((u - 0.335) * 1.15, v * 1.25)));
    hi = max(hi, tancho);
    vec3 hiCol = mix(orangeDeep, orangeRed, smoothstep(0.46, 0.72, patchA) * 0.72 + scaleCenter * 0.28);
    vec3 shiroji = mix(pureWhite, warmIvory, 0.15 * (1.0 - dorsalZ));
    // Soft Sashi under-scale coral blush right ahead of solid Hi patches
    albedo = mix(shiroji, mix(shiroji, orangeRed, 0.28), clamp(sashi - hi, 0.0, 1.0) * 0.55);
    albedo = mix(albedo, hiCol, hi);
    albedo *= 1.0 - scaleEdge * mix(0.10, 0.16, hi);
    finCol = vec3(0.84, 0.88, 0.91);
    dorsalCol = mix(vec3(0.54, 0.60, 0.66), vec3(0.62, 0.045, 0.005), hi);
    irisCol = vec3(0.72, 0.52, 0.22);
    ginrin = 0.14;
  } else if (variant < 2.5) {
    // 2: Yamabuki Ogon (metallic honey-gold with prominent reticulated Fukurin scale mesh)
    float sheen = smoothstep(0.26, 0.78, patchA);
    vec3 fukurinEdge = vec3(0.50, 0.30, 0.022);
    albedo = mix(butterGold, goldBright, sheen * 0.42 + dorsalZ * 0.34 + scaleCenter * 0.24);
    albedo = mix(albedo, fukurinEdge, scaleEdge * 0.34);
    finCol = vec3(0.84, 0.68, 0.15);
    dorsalCol = vec3(0.44, 0.32, 0.04);
    irisCol = vec3(0.86, 0.70, 0.20);
    ginrin = 0.55;
  } else {
    // 3: Showa / Sanke (deep lacquer Sumi-black + vivid Hi-vermilion + crisp Shiroji white + Motoguro fin roots)
    float blackPatch = smoothstep(0.495, 0.532, patchB + scaleMod) * smoothstep(-0.29, -0.13, u);
    float whiteEdge = smoothstep(0.635, 0.685, patchA + scaleMod) * (1.0 - blackPatch) * smoothstep(0.28, -0.14, u);
    vec3 hiCol = mix(orangeDeep, orangeRed, 0.58 + scaleCenter * 0.26);
    albedo = mix(hiCol, pureWhite, whiteEdge * 0.94);
    albedo = mix(albedo, sumiBlack, blackPatch * 0.98);
    albedo *= 1.0 - scaleEdge * mix(0.14, 0.05, blackPatch);
    // Authentic Motoguro (dark sumi-black pigment at the base of the pectoral fins)
    float motoguro = smoothstep(0.58, 0.16, pecNormV) * pecEnv;
    finCol = mix(vec3(0.84, 0.88, 0.91), vec3(0.022, 0.026, 0.032), motoguro * 0.88);
    dorsalCol = mix(vec3(0.03, 0.035, 0.042), vec3(0.54, 0.58, 0.64), whiteEdge * 0.6);
    irisCol = vec3(0.68, 0.46, 0.18);
    ginrin = 0.18;
  }

  // Smooth bony head anatomy: curved gill-cover (operculum) seam with gentle breathing rhythm
  float breath = sin(u_time * 3.0 + seed) * 0.003;
  float gillArc = abs(u - (gillCurveU + breath));
  float gillShade = smoothstep(0.017, 0.0025, gillArc) * smoothstep(0.025, 0.075, av) * bodyAlpha;
  float gillLip = smoothstep(0.010, 0.002, abs(u - (gillCurveU + breath + 0.009))) * smoothstep(0.03, 0.08, av) * bodyAlpha;
  albedo = mix(albedo, albedo * vec3(0.58, 0.44, 0.44), gillShade * 0.42);
  albedo *= 1.0 + gillLip * 0.07;

  // Subtle crescent mouth shadow at tip of snout & tiny paired nostril pits (nares)
  float mouthArc = abs((u - 0.468) + av * av * 6.5);
  float mouthShade = smoothstep(0.008, 0.002, mouthArc) * smoothstep(0.042, 0.022, av) * bodyAlpha;
  albedo *= (1.0 - mouthShade * 0.32);

  vec2 nareDelta = vec2((u - 0.422) * 1.4, (av - hw * 0.42) * 1.1);
  float nareMask = smoothstep(0.009, 0.003, length(nareDelta)) * bodyAlpha;
  albedo *= (1.0 - nareMask * 0.38);

  // Anatomical lateral eyes: dark socket rim, metallic iris ring, glossy jet-black pupil, crisp catchlight
  vec2 eyeCenter = vec2(0.362, hw * 0.80);
  vec2 eyeDelta = vec2(u - eyeCenter.x, av - eyeCenter.y);
  float eyeDist = length(eyeDelta * vec2(1.0, 1.15));
  float eyeSocket = smoothstep(0.028, 0.017, eyeDist) * bodyAlpha;
  float eyeIris = smoothstep(0.022, 0.015, eyeDist) * bodyAlpha;
  float eyePupil = smoothstep(0.014, 0.0085, eyeDist) * bodyAlpha;
  float eyeGlint = smoothstep(0.0055, 0.0015, length(eyeDelta - vec2(0.0045, -0.0035))) * eyePupil;
  albedo *= (1.0 - eyeSocket * 0.25);
  albedo = mix(albedo, irisCol, eyeIris * 0.88);
  albedo = mix(albedo, vec3(0.003, 0.004, 0.006), eyePupil);

  // Curved 3D dorsal normal accounting for live swimming S-curve + longitudinal slope + scale micro-normals
  float slopeY = koiSpineSlope(u, km.y, km.z);
  float localHeading = kp.w + atan(clamp(slopeY, -0.65, 0.65));
  float ch = cos(localHeading);
  float sh = sin(localHeading);
  float longTilt = clamp((u - 0.14) * 0.45, -0.22, 0.32) * smoothstep(0.32, 0.48, u)
    - 0.14 * smoothstep(-0.10, -0.35, u);
  float sTiltU = scaleData.z * 0.24 * torsoMask;
  float sTiltV = scaleData.w * 0.22 * torsoMask;
  vec3 locN = normalize(vec3(longTilt + sTiltU, dorsalZ, flank * 0.84 + sTiltV));
  vec3 fishN = normalize(vec3(
    ch * locN.x - sh * locN.z,
    locN.y,
    sh * locN.x + ch * locN.z
  ));

  vec3 sunL = normalize(u_sunDir);
  float ndl = max(dot(fishN, sunL), 0.0);
  float edgeAO = mix(0.42, 1.0, pow(dorsalZ, 0.58));
  float diffuse = mix(0.28, 1.14, ndl) * edgeAO;

  // Glossy wet mucus specular + subtle metallic Ginrin scale sparkle along curved back
  vec3 wetH = normalize(sunL + vec3(0.0, 0.92, 0.38));
  float ndh = max(dot(fishN, wetH), 0.0001);
  float wetSpec = pow(ndh, 52.0) * 0.30 * bodyAlpha;
  float ginrinSparkle = pow(ndh, 18.0) * scaleCenter * ginrin * 0.34 * bodyAlpha;
  // Soft warm translucent subsurface rim glow along thin flanks
  float flankSSS = pow(max(1.0 - dorsalZ, 0.0001), 2.2) * (0.35 + 0.65 * ndl) * 0.16;

  float nightFactor = clamp(u_nightGlow * (1.0 - u_biolum * 0.65), 0.0, 1.0);
  float moonAmbient = mix(1.0, 0.18, nightFactor);
  float rainDim = 1.0 - u_rain * 0.25;
  vec3 sunlitCaustic = mix(u_causticTint, u_sunColor, 0.50);
  vec3 moodTint = mix(vec3(1.0), u_sunColor, 0.24 + nightFactor * 0.28);

  vec3 bodyLit = albedo * (diffuse + flankSSS) * moodTint * moonAmbient;
  bodyLit += u_sunColor * (wetSpec + ginrinSparkle + eyeGlint * 0.68) * (1.0 - u_rain * 0.45) * mix(1.0, 0.35, nightFactor);

  // Sculpted translucent dorsal fin ribbon + sun-aligned cast shadow onto curved back
  bodyLit = mix(bodyLit, bodyLit * 0.54, dorsalSideShadow * 0.58 * bodyAlpha);
  vec3 dorsalLit = dorsalCol * (0.62 + 0.48 * ndl) * moodTint * moonAmbient
    + u_sunColor * 0.12 * dorsalLine * ndl * mix(1.0, 0.25, nightFactor);
  bodyLit = mix(bodyLit, dorsalLit, dorsalLine * 0.74 * bodyAlpha);

  // Dancing underwater caustic filaments draped across the koi's curved back
  float causticNight = mix(1.0, 0.15, nightFactor);
  bodyLit += sunlitCaustic * sunWebRgb * (0.26 * rainDim * causticNight) * (0.38 + 0.62 * ndl) * dorsalZ;
  bodyLit += prismCaustic * (0.17 * causticNight) * dorsalZ;

  // Warm golden candlelight illuminating koi when swimming near floating water lanterns
  if (u_lanternCount > 0) {
    vec3 lanternLight = vec3(1.0, 0.52, 0.12);
    float lnBoost = 0.55 + 1.35 * max(nightFactor, u_biolum);
    for (int i = 0; i < 6; i++) {
      if (i >= u_lanternCount) break;
      vec4 ln = u_lanterns[i];
      vec2 d = worldXZ - ln.xy;
      float d2 = dot(d, d);
      float kGlow = exp(-d2 * 5.2) * ln.z * lnBoost;
      bodyLit += albedo * lanternLight * kGlow * (0.65 + 0.35 * dorsalZ);
    }
  }

  if (u_biolum > 0.01) {
    vec3 bioGlow = mix(u_causticTint, vec3(0.55, 0.95, 1.0), 0.35);
    bodyLit += bioGlow * u_biolum * (0.12 + dorsalLine * 0.28 + scaleEdge * 0.16 + (1.0 - bodyAlpha) * 0.26);
  }

  // Fin shading: opaque bone leading ray, subtle dark socket AO at root, translucent backlit membrane
  float finRootAO = mix(0.76, 1.0, smoothstep(0.0, 0.32, max(pecNormV, tailT)));
  float finHighlight = max(pecLeadEdge * 0.24, tailOuterLead * 0.18);
  vec3 finBase = mix(finCol, pureWhite, finHighlight * (variant < 2.5 && variant > 1.5 ? 0.25 : 0.70));
  vec3 finLit = finBase * finRootAO * (0.58 + 0.48 * ndl) * moodTint * moonAmbient
    + sunlitCaustic * sunWebRgb * (0.16 * causticNight)
    + u_sunColor * (finHighlight * 0.18 * ndl * mix(1.0, 0.25, nightFactor));
  if (u_lanternCount > 0) {
    vec3 lanternFin = vec3(1.0, 0.58, 0.16);
    float lnBoost = 0.50 + 1.15 * max(nightFactor, u_biolum);
    for (int i = 0; i < 6; i++) {
      if (i >= u_lanternCount) break;
      vec4 ln = u_lanterns[i];
      vec2 d = worldXZ - ln.xy;
      float kGlow = exp(-dot(d, d) * 5.2) * ln.z * lnBoost;
      finLit += finBase * lanternFin * kGlow * 0.72;
    }
  }
  vec3 finalCol = mix(finLit, bodyLit, bodyAlpha);

  return vec4(finalCol, totalAlpha);
}

vec3 tilesAlbedo(vec2 xz) {
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
  float glaze = 0.96 + 0.08 * sin(tileF.x * 3.14159) * sin(tileF.y * 3.14159);
  tileCol *= mix(0.84, 1.04, bevel) * glaze;
  return mix(u_groutCol, tileCol, tileMask);
}

vec3 pebblesAlbedo(vec2 xz) {
  // Smooth wet river cobblestones via Voronoi cellular tessellation with rounded dome shading
  vec2 p = xz * 5.8;
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  float d1 = 8.0;
  float d2 = 8.0;
  vec2 bestOff = vec2(0.0);
  vec2 bestId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 id = ip + g;
      vec2 rnd = vec2(hash21(id), hash21(id + vec2(37.2, 17.9)));
      vec2 center = g + 0.14 + 0.72 * rnd;
      vec2 diff = center - fp;
      // Gently elongated natural oval stones
      float ang = rnd.x * 6.28318;
      float ca = cos(ang);
      float sa = sin(ang);
      vec2 rotD = vec2(diff.x * ca + diff.y * sa, (-diff.x * sa + diff.y * ca) * 1.24);
      float dist = length(rotD);
      if (dist < d1) {
        d2 = d1;
        d1 = dist;
        bestOff = diff;
        bestId = id;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }

  float seam = d2 - d1;
  float stoneMask = smoothstep(0.055, 0.145, seam);
  float dome = clamp(1.0 - d1 * 1.55, 0.0, 1.0);
  vec3 stoneN = normalize(vec3(-bestOff.x * 2.4, 0.48 + dome * 0.78, -bestOff.y * 2.4));
  float ndl = max(dot(stoneN, normalize(u_sunDir)), 0.0);

  float v1 = hash21(bestId + 3.7);
  float v2 = hash21(bestId + 51.4);
  // Natural wet river-bed mineral palette in true linear space (deep slate, basalt, river ochre, smooth quartz)
  vec3 slate = vec3(0.022, 0.048, 0.072);
  vec3 warmGrey = vec3(0.072, 0.078, 0.072);
  vec3 riverOchre = vec3(0.145, 0.088, 0.042);
  vec3 quartz = vec3(0.20, 0.21, 0.20);
  vec3 stoneBase = mix(slate, warmGrey, smoothstep(0.10, 0.55, v1));
  stoneBase = mix(stoneBase, riverOchre, smoothstep(0.55, 0.85, v1) * 0.78);
  stoneBase = mix(stoneBase, quartz, smoothstep(0.84, 0.98, v2) * 0.70);
  float speckle = koiNoise(xz * 34.0 + bestId * 2.1);
  stoneBase *= (0.82 + 0.34 * speckle);

  // Adapt harmoniously to sunset / night / biolum mood so Night stays deep dark & Sunset glows warm orange
  vec3 themeTint = mix(vec3(1.0), clamp(u_tileBright * 1.9 + 0.14, 0.10, 1.25), 0.52);
  float sunsetBias = clamp((u_sunColor.r - u_sunColor.b) * 1.15, 0.0, 0.75);
  themeTint = mix(themeTint, vec3(1.18, 0.62, 0.26), sunsetBias * 0.45);
  float nightDim = mix(1.0, 0.14, clamp(u_nightGlow * (1.0 - u_biolum * 0.6), 0.0, 1.0)) * mix(1.0, 0.22, u_biolum);
  vec3 gravelCrevice = vec3(0.005, 0.009, 0.016) * themeTint * nightDim;
  vec3 litStone = stoneBase * themeTint * mix(0.36, 1.22, ndl) * (0.64 + 0.44 * dome) * nightDim;
  return mix(gravelCrevice, litStone, stoneMask);
}

vec3 sandAlbedo(vec2 xz) {
  // Organic underwater coastal sand ripples with sunlit crests, shaded troughs & fine quartz grain
  vec2 warp = vec2(
    koiNoise(xz * 1.9 + vec2(2.3, 1.1)),
    koiNoise(xz * 2.1 - vec2(4.7, 3.2))
  ) * 0.55;
  vec2 p = xz + warp * 0.32;
  float ripplePhase = p.x * 13.5 + p.y * 5.2 + sin(p.y * 3.4 - p.x * 1.8) * 1.3;
  float ripple = 0.5 + 0.5 * sin(ripplePhase);
  float rippleSlope = cos(ripplePhase);
  float microRipple = 0.5 + 0.5 * sin(p.x * 29.0 - p.y * 11.0 + warp.x * 4.0);

  vec3 sandN = normalize(vec3(-rippleSlope * 0.38, 1.0, -rippleSlope * 0.16));
  float ndl = max(dot(sandN, normalize(u_sunDir)), 0.0);

  float grain = hash21(floor(xz * 120.0));
  float grainSoft = koiNoise(xz * 22.0);
  // Warm sunlit coastal sand in linear space, shifting toward deep dark moonlit seabed at night
  vec3 warmSand = vec3(0.38, 0.30, 0.16);
  vec3 coolSand = vec3(0.006, 0.016, 0.036);
  vec3 bioSand = vec3(0.006, 0.022, 0.052);
  vec3 sandBase = mix(warmSand, coolSand, clamp(u_nightGlow * 0.96, 0.0, 1.0));
  sandBase = mix(sandBase, bioSand, u_biolum * 0.90);
  float sunsetBias = clamp((u_sunColor.r - u_sunColor.b) * 1.15, 0.0, 0.78);
  sandBase = mix(sandBase, vec3(0.46, 0.19, 0.055), sunsetBias * 0.72);

  vec3 troughCol = sandBase * 0.58;
  vec3 crestCol = sandBase * 1.18;
  vec3 col = mix(troughCol, crestCol, smoothstep(0.12, 0.88, ripple * 0.82 + microRipple * 0.18));
  col *= mix(0.72, 1.22, ndl);
  col *= (0.92 + 0.12 * grainSoft + 0.06 * grain);
  return col;
}

vec3 floorColor(vec2 xz) {
  vec2 uv = clamp(xz / (2.0 * u_half) + 0.5, 0.0, 1.0);

  vec3 floorAlbedo = vec3(0.0);
  if (u_bedWeights.x > 0.002) floorAlbedo += tilesAlbedo(xz) * u_bedWeights.x;
  if (u_bedWeights.y > 0.002) floorAlbedo += pebblesAlbedo(xz) * u_bedWeights.y;
  if (u_bedWeights.z > 0.002) floorAlbedo += sandAlbedo(xz) * u_bedWeights.z;

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

  // Directional sunlight illumination; Night mode drops into deep quiet moonlight so lanterns become the main glow
  float nightFactor = clamp(u_nightGlow * (1.0 - u_biolum * 0.65), 0.0, 1.0);
  float sunPoolGrad = clamp(0.84 + 0.22 * (xz.x * 0.35 - xz.y * 0.45), 0.68, 1.22);
  float moonPool = 0.65 + 0.35 * exp(-dot(xz, xz) * 0.55);
  float floorLight = mix(0.76 * sunPoolGrad, 0.52 * moonPool, nightFactor);
  float causticScale = mix(1.0, 0.12, nightFactor);
  vec3 sunlitCaustic = mix(u_causticTint, u_sunColor, 0.46);
  float koiShadow = koiFloorShadow(xz);
  vec3 col = floorAlbedo * (floorLight * (1.0 - koiShadow));
  col += (sunlitCaustic * sunWebRgb * ((0.52 - u_biolum * 0.34) * rainDim) + mix(prismCaustic, sunlitCaustic * prismCaustic, 0.45)) * sunPoolGrad * causticScale * (1.0 - koiShadow * 0.65);

  // Warm underwater glow cast downward onto the pool floor beneath floating water lanterns
  if (u_lanternCount > 0) {
    vec3 lanternWarm = vec3(1.0, 0.34, 0.04);
    vec3 lanternCore = vec3(1.0, 0.62, 0.14);
    float nightFactorLn = 0.35 + 0.92 * max(nightFactor, u_biolum);
    for (int i = 0; i < 6; i++) {
      if (i >= u_lanternCount) break;
      vec4 ln = u_lanterns[i];
      vec2 d = xz - ln.xy;
      float d2 = dot(d, d);
      float wideGlow = exp(-d2 * 5.2) * ln.z * nightFactorLn;
      float coreGlow = exp(-d2 * 18.0) * ln.z * nightFactorLn;
      vec3 litBase = max(floorAlbedo * 1.25, vec3(0.042, 0.020, 0.007));
      col += litBase * (lanternWarm * wideGlow * 0.85 + lanternCore * coreGlow * 0.48);
    }
  }
  return col;
}

vec3 envColor(vec3 r) {
  vec3 d = normalize(r);
  vec3 L = normalize(u_sunDir);
  // Clean natural sky dome gradient without milky artificial specular bands
  float elev = clamp(d.y * 0.85 + 0.15, 0.0, 1.0);
  vec3 horizon = mix(u_skyBright, u_sunColor, 0.22 * (1.0 - u_biolum));
  vec3 zenith = mix(u_skyDeep, u_skyMid, 0.45);
  vec3 col = mix(horizon, u_skyMid, smoothstep(0.0, 0.52, elev));
  col = mix(col, zenith, smoothstep(0.45, 0.96, elev));

  // Crisp sun / moon reflection disc scaled naturally by u_sunIntensity
  float sunDot = max(dot(d, L), 0.0);
  float sunHalo = pow(sunDot, 16.0);
  float sunCore = pow(sunDot, 180.0);
  float clearSky = 1.0 - u_rain * 0.72;
  float skyDiscScale = clamp(u_sunIntensity * 0.62, 0.08, 1.15);
  col += mix(u_skyBright, u_sunColor, 0.55) * sunHalo * (0.38 * skyDiscScale * (1.0 - u_biolum * 0.7) * clearSky);
  col += u_sunColor * sunCore * (2.4 * skyDiscScale * (1.0 - u_biolum * 0.65) * clearSky);
  vec3 stormSky = mix(u_skyDeep, vec3(0.32, 0.42, 0.54) * skyDiscScale, 0.48);
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
  vec2 organicSlope = liquidSlope(v_world.xz, u_time) * u_organicScale;
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

    if (u_koiCount > 0) {
      vec3 koiPremul = vec3(0.0);
      float koiAlpha = 0.0;
      float bestKoiT = 1e6;
      for (int i = 0; i < 12; i++) {
        if (i >= u_koiCount) break;
        vec4 kp = u_koiPos[i];
        vec4 km = u_koiMeta[i];
        float tk = (kp.y - v_world.y) / I.y;
        if (tk <= 0.0 || tk >= t) continue;
        vec3 khit = v_world + I * tk;
        vec2 kDelta = khit.xz - kp.xz;
        float kMaxR = km.x * 0.88;
        if (dot(kDelta, kDelta) > kMaxR * kMaxR) continue;
        vec2 kuv = clamp(khit.xz / (2.0 * u_half) + 0.5, 0.0, 1.0);
        vec3 kSimCaustic = clamp(sampleCausticSoft(kuv), 0.0, 1.0);
        vec3 kPrism = pow(kSimCaustic, vec3(1.35)) * 0.45;
        vec2 kDisp = vec2(0.005, -0.003);
        vec3 kSunWeb = vec3(
          causticWeb(khit.xz + kDisp, u_time),
          causticWeb(khit.xz, u_time),
          causticWeb(khit.xz - kDisp, u_time)
        );
        vec4 kSample = sampleKoi(khit.xz, kp, km, kSunWeb, kPrism);
        if (kSample.a > 0.005) {
          float kPath = length(khit - v_world);
          vec3 kAtten = kSample.rgb * exp(-u_absorption * kPath * 0.72);
          float ka = kSample.a;
          if (tk < bestKoiT) {
            // Front-over-back premultiplied alpha compositing
            koiPremul = kAtten * ka + koiPremul * (1.0 - ka);
            koiAlpha = ka + koiAlpha * (1.0 - ka);
            bestKoiT = tk;
          } else {
            // Back-under-front compositing so deeper koi stay visible beneath translucent fins
            koiPremul = koiPremul + kAtten * ka * (1.0 - koiAlpha);
            koiAlpha = koiAlpha + ka * (1.0 - koiAlpha);
          }
        }
      }
      if (koiAlpha > 0.005) {
        through = through * (1.0 - koiAlpha) + koiPremul;
      }
    }
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

  // Shimmering warm amber reflections from floating water lanterns across passing ripples
  if (u_lanternCount > 0) {
    vec3 flameCol = vec3(1.0, 0.36, 0.045);
    vec3 flameCore = vec3(1.0, 0.70, 0.18);
    float nightBoost = 0.36 + 0.72 * max(u_nightGlow, max(u_biolum, clamp(1.45 - u_sunIntensity * 0.55, 0.0, 1.0)));
    for (int i = 0; i < 6; i++) {
      if (i >= u_lanternCount) break;
      vec4 ln = u_lanterns[i];
      vec3 lightPos = vec3(ln.x, 0.095, ln.y);
      vec3 toLight = lightPos - v_world;
      float dist2 = dot(toLight.xz, toLight.xz);
      if (dist2 > 1.55) continue;
      vec3 lDir = normalize(toLight);
      vec3 lh = normalize(lDir + V);
      float ndh = max(dot(N, lh), 0.0);
      float atten = exp(-dist2 * 3.8) / (1.0 + dist2 * 4.0);
      float wideShimmer = pow(ndh, 22.0) * 0.52;
      float tightGlint = pow(ndh, 130.0) * 1.35;
      // Elongated inverted reflection column toward the viewer distorted by live surface normal N.xz
      vec2 reflOff = vec2(v_world.x - ln.x + N.x * 0.14, (v_world.z - ln.y - 0.10) * 0.56 + N.z * 0.14);
      float reflColumn = exp(-dot(reflOff * vec2(8.6, 5.0), reflOff * vec2(8.6, 5.0))) * smoothstep(-0.04, 0.06, v_world.z - ln.y + 0.05);
      float halo = exp(-dist2 * 11.5) * 0.20;
      col += (flameCol * (wideShimmer + halo + reflColumn * 0.52) + flameCore * (tightGlint + reflColumn * pow(ndh, 30.0) * 0.52)) * atten * ln.z * nightBoost;
    }
  }

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
