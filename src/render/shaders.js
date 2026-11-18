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
