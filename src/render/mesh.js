export function createGrid(segments, half) {
  const n = segments + 1;
  const positions = new Float32Array(n * n * 2);
  const indices = new Uint32Array(segments * segments * 6);
  let p = 0;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      positions[p++] = -half + (x / segments) * (2 * half);
      positions[p++] = -half + (z / segments) * (2 * half);
    }
  }
  let i = 0;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const a = z * n + x;
      indices[i++] = a;
      indices[i++] = a + n;
      indices[i++] = a + 1;
      indices[i++] = a + 1;
      indices[i++] = a + n;
      indices[i++] = a + n + 1;
    }
  }
  return { positions, indices };
}
