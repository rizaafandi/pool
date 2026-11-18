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