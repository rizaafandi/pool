import { describe, expect, it } from 'vitest';
import { createGrid } from '../src/render/mesh.js';

describe('createGrid', () => {
  it('covers the pool square and builds six indices per cell', () => {
    const segments = 2;
    const half = 3;
    const { positions, indices } = createGrid(segments, half);
    expect(positions).toHaveLength(3 * 3 * 2);
    expect(indices).toHaveLength(2 * 2 * 6);
    expect(positions[0]).toBe(-3);
    expect(positions[1]).toBe(-3);
    expect(positions[positions.length - 2]).toBe(3);
    expect(positions[positions.length - 1]).toBe(3);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(3);
    expect(indices[2]).toBe(1);
  });
});
