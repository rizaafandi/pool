import { LANTERNS, POOL } from '../config.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function floaterCollisionRadius(item) {
  const size = Math.max(0.015, item.size || 0.045);
  const kind = item.kind || 'blossom';
  if (kind === 'leaf') return size * 1.25;
  if (kind === 'petal') return size * 1.05;
  return size * 1.24;
}

export function floaterMass(item) {
  const kind = item.kind || 'blossom';
  if (kind === 'blossom') return 1.4;
  if (kind === 'leaf') return 1.2;
  if (kind === 'partial') return 1.0;
  return 0.75;
}

export function lanternCollisionRadius(item) {
  const size = Math.max(0.03, item.size || 0.078);
  return size * 1.24;
}

export function lanternMass() {
  return 8.5;
}

/**
 * Resolves buoyant 2D surface collisions across all resting floaters (blossoms, petals, leaves)
 * and floating water lanterns so objects never overlap, while imparting mass-weighted buoyant
 * bounce and subtle off-center rotational spin.
 */
export function resolveBuoyantCollisions(floaters = [], lanterns = [], options = {}) {
  const iterations = Math.max(1, options.iterations || 4);
  const restitution = options.restitution !== undefined ? options.restitution : 0.24;
  const bodies = [];

  for (const l of lanterns) {
    if (!l) continue;
    bodies.push({
      ref: l,
      isLantern: true,
      r: lanternCollisionRadius(l),
      invMass: 1 / lanternMass(),
    });
  }

  for (const f of floaters) {
    if (!f || f.falling || (f.altitude || 0) > 0.001) continue;
    bodies.push({
      ref: f,
      isLantern: false,
      r: floaterCollisionRadius(f),
      invMass: 1 / floaterMass(f),
    });
  }

  const count = bodies.length;
  if (count < 2) return 0;

  let collisionCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < count; i++) {
      const a = bodies[i];
      const ra = a.ref;

      for (let j = i + 1; j < count; j++) {
        const b = bodies[j];
        const rb = b.ref;

        const dx = rb.x - ra.x;
        const dz = rb.z - ra.z;
        const minDist = a.r + b.r;
        const dist2 = dx * dx + dz * dz;
        if (dist2 >= minDist * minDist) continue;

        anyOverlap = true;
        if (iter === 0) collisionCount += 1;

        let nx;
        let nz;
        let dist;
        if (dist2 > 1e-10) {
          dist = Math.sqrt(dist2);
          nx = dx / dist;
          nz = dz / dist;
        } else {
          const fallbackAngle = ((i * 2.39996 + j * 1.17) % (Math.PI * 2));
          nx = Math.cos(fallbackAngle);
          nz = Math.sin(fallbackAngle);
          dist = 0;
        }

        const overlap = minDist - dist;
        const invA = ra.grabbed && !rb.grabbed ? 0 : a.invMass;
        const invB = rb.grabbed && !ra.grabbed ? 0 : b.invMass;
        const totalInvMass = invA + invB;
        const shareA = invA / totalInvMass;
        const shareB = invB / totalInvMass;

        // Positional separation removes overlap cleanly proportional to inverse mass
        const push = overlap * (iter === iterations - 1 ? 1.0 : 0.85);
        ra.x -= nx * push * shareA;
        ra.z -= nz * push * shareA;
        rb.x += nx * push * shareB;
        rb.z += nz * push * shareB;

        // Apply buoyant velocity impulse + gentle off-center glancing spin on first contact pass
        if (iter === 0) {
          const rvx = (rb.vx || 0) - (ra.vx || 0);
          const rvz = (rb.vz || 0) - (ra.vz || 0);
          const vn = rvx * nx + rvz * nz;

          if (vn < 0) {
            const jImp = (-(1 + restitution) * vn) / totalInvMass;
            ra.vx = (ra.vx || 0) - jImp * invA * nx;
            ra.vz = (ra.vz || 0) - jImp * invA * nz;
            rb.vx = (rb.vx || 0) + jImp * invB * nx;
            rb.vz = (rb.vz || 0) + jImp * invB * nz;

            // Tangential grazing speed gently spins lightweight floaters & subtly turns rafts
            const tx = -nz;
            const tz = nx;
            const vt = rvx * tx + rvz * tz;
            const spinGainA = a.isLantern ? 0.35 : 2.6;
            const spinGainB = b.isLantern ? 0.35 : 2.6;
            ra.spin = clamp((ra.spin || 0) + vt * invA * spinGainA, -2.4, 2.4);
            rb.spin = clamp((rb.spin || 0) - vt * invB * spinGainB, -2.4, 2.4);
          } else if (overlap > 0.002) {
            // Gentle outward water-cushion drift when newly placed or landed on top of another object
            const nudge = Math.min(0.16, overlap * 1.4);
            ra.vx = (ra.vx || 0) - nx * nudge * shareA;
            ra.vz = (ra.vz || 0) - nz * nudge * shareA;
            rb.vx = (rb.vx || 0) + nx * nudge * shareB;
            rb.vz = (rb.vz || 0) + nz * nudge * shareB;
          }
        }
      }
    }

    // Keep all separated bodies inside their safe pool bounds
    const maxPool = POOL.halfExtent - 0.1;
    for (let i = 0; i < count; i++) {
      const b = bodies[i];
      const r = b.ref;
      if (b.isLantern) {
        r.x = clamp(r.x, -LANTERNS.boundsX, LANTERNS.boundsX);
        r.z = clamp(r.z, LANTERNS.minZ, LANTERNS.maxZ);
      } else {
        r.x = clamp(r.x, -maxPool, maxPool);
        r.z = clamp(r.z, -maxPool, maxPool);
      }
    }

    if (!anyOverlap) break;
  }

  return collisionCount;
}
