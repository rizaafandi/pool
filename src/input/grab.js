/**
 * Screen-space hit-testing for floating surface objects (water lanterns first, then resting blossoms/petals/leaves).
 * Keeps hit targets generous enough for comfortable mouse & touch grabbing while respecting draw order.
 */
export function pickFloatingObject(
  screenX,
  screenY,
  projectedLanterns = [],
  projectedFloaters = [],
) {
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;

  // Check lanterns front-to-back (end of depth-sorted array is closest to camera)
  for (let i = projectedLanterns.length - 1; i >= 0; i--) {
    const l = projectedLanterns[i];
    if (!l) continue;
    const size = l.sizePx || 28;
    // Visual center is slightly above water anchor because the lantern rises upward
    const cx = l.x;
    const cy = l.y - size * 0.28;
    const hitR = Math.max(22, size * 1.15);
    const dx = screenX - cx;
    const dy = screenY - cy;
    if (dx * dx + dy * dy <= hitR * hitR) {
      return { type: 'lantern', id: l.id };
    }
  }

  // Check resting surface floaters front-to-back
  for (let i = projectedFloaters.length - 1; i >= 0; i--) {
    const f = projectedFloaters[i];
    if (!f || (f.altitude || 0) > 0.001) continue;
    const r = f.radiusPx || 16;
    const hitR = Math.max(18, r * 1.35);
    const dx = screenX - f.x;
    const dy = screenY - f.y;
    if (dx * dx + dy * dy <= hitR * hitR) {
      return { type: 'floater', id: f.id };
    }
  }

  return null;
}
