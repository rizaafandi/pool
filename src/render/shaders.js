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