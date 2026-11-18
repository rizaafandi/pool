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