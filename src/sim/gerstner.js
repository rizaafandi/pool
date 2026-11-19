import { rayPlaneY } from '../math.js';

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

export function gerstnerHeightAt(x, z, time, waves) {
  let ax = x;
  let az = z;
  for (let i = 0; i < 8; i++) {
    const g = gerstnerAt(ax, az, time, waves);
    ax = x - g.ox;
    az = z - g.oz;
  }
  return gerstnerAt(ax, az, time, waves).oy;
}

export function rayGerstnerSurface(origin, dir, time, waves) {
  if (dir[1] >= -1e-6) return null;
  if (!waves || waves.length === 0) return rayPlaneY(origin, dir, 0);

  let maxAmp = 0;
  let minWavelength = Infinity;
  for (const w of waves) {
    maxAmp += w.steepness / ((Math.PI * 2) / w.wavelength);
    if (w.wavelength < minWavelength) minWavelength = w.wavelength;
  }
  if (!(maxAmp > 0)) return rayPlaneY(origin, dir, 0);

  let lo = (maxAmp - origin[1]) / dir[1];
  let hi = (-maxAmp - origin[1]) / dir[1];
  if (hi < 0) return null;
  if (lo < 0) lo = 0;

  const horizSpan = Math.hypot(dir[0], dir[2]) * (hi - lo);
  const steps = Math.max(8, Math.min(64, Math.ceil(horizSpan / (minWavelength * 0.25))));
  const ds = (hi - lo) / steps;
  let prevS = lo;
  let prevF = (origin[1] + dir[1] * prevS)
    - gerstnerHeightAt(origin[0] + dir[0] * prevS, origin[2] + dir[2] * prevS, time, waves);
  let found = false;
  for (let i = 1; i <= steps; i++) {
    const s = lo + ds * i;
    const f = (origin[1] + dir[1] * s)
      - gerstnerHeightAt(origin[0] + dir[0] * s, origin[2] + dir[2] * s, time, waves);
    if (prevF >= 0 && f <= 0) {
      lo = prevS;
      hi = s;
      found = true;
      break;
    }
    prevS = s;
    prevF = f;
  }
  if (!found) return rayPlaneY(origin, dir, 0);

  for (let i = 0; i < 16; i++) {
    const mid = 0.5 * (lo + hi);
    const y = origin[1] + dir[1] * mid;
    const sy = gerstnerHeightAt(origin[0] + dir[0] * mid, origin[2] + dir[2] * mid, time, waves);
    if (y > sy) lo = mid;
    else hi = mid;
  }
  const s = 0.5 * (lo + hi);
  return [
    origin[0] + dir[0] * s,
    origin[1] + dir[1] * s,
    origin[2] + dir[2] * s,
  ];
}