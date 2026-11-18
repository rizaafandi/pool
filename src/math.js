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