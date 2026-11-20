const SPLASH_DURATION_MS = 350;
const CLAP_DURATION_MS = 520;

export function indicatorScreenPoint(indicator, width, height) {
  const sx = Math.min(1, Math.max(0, indicator.screenX));
  const sy = Math.min(1, Math.max(0, indicator.screenY));
  return {
    x: sx * width,
    y: sy * height,
  };
}

function tracePillPath(ctx, p) {
  const r = Math.min(p.radius || 0, p.width * 0.5, p.height * 0.5);
  const x = p.x;
  const y = p.y;
  const w = p.width;
  const h = p.height;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function rgbaFromRgb(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}

// Reusable scratch buffers for batched splash bead drawing (zero per-frame allocations)
const splashBeadX = [];
const splashBeadY = [];
const splashBeadR = [];

function drawRainSplashes(ctx, splashes, width, height, theme) {
  const rainRgb = (theme && theme.rainRgb) || [224, 246, 255];
  const tipRgb = (theme && theme.rainTipRgb) || [255, 255, 255];
  const hasEllipse = typeof ctx.ellipse === 'function';
  const hasMoveTo = typeof ctx.moveTo === 'function';

  for (let si = 0; si < splashes.length; si++) {
    const s = splashes[si];
    const t = Math.min(1, Math.max(0, s.progress));
    const fade = Math.pow(1 - t, 1.25);
    const x = s.screenX * width;
    const y = s.screenY * height;
    const scale = s.scale || 1;

    // Perspective-foreshortened surface splash ring (for raindrop impacts; skipped on swipe sprays)
    if (s.showRing !== false) {
      const ringR = (4.0 + t * 24) * scale;
      const ringAspect = s.ringAspect || 0.88;
      if (hasEllipse) {
        ctx.beginPath();
        ctx.ellipse(x, y, ringR, ringR * ringAspect, 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgbaFromRgb(rainRgb, fade * 0.48);
        ctx.lineWidth = Math.max(0.75, (1.6 - t * 0.9) * scale);
        ctx.stroke();

        if (t < 0.45) {
          const innerT = t / 0.45;
          const innerR = (1.8 + innerT * 9.5) * scale;
          ctx.beginPath();
          ctx.ellipse(x, y, innerR, innerR * ringAspect, 0, 0, Math.PI * 2);
          ctx.strokeStyle = rgbaFromRgb(tipRgb, (1 - innerT) * 0.58);
          ctx.lineWidth = 1.1 * scale;
          ctx.stroke();
        }
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ringAspect);
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = rgbaFromRgb(rainRgb, fade * 0.48);
        ctx.lineWidth = Math.max(0.75, (1.6 - t * 0.9) * scale);
        ctx.stroke();

        if (t < 0.45) {
          const innerT = t / 0.45;
          const innerR = (1.8 + innerT * 9.5) * scale;
          ctx.beginPath();
          ctx.arc(0, 0, innerR, 0, Math.PI * 2);
          ctx.strokeStyle = rgbaFromRgb(tipRgb, (1 - innerT) * 0.58);
          ctx.lineWidth = 1.1 * scale;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Airborne glistening crown droplets arcing upward from impact (batched into 2 fills)
    const beads = Array.isArray(s.beads) ? s.beads : null;
    const age = s.age || 0;
    const beadAlpha = Math.max(0, 1 - t * 1.25);
    if (beadAlpha > 0.02 && beads && beads.length > 0) {
      let count = 0;
      const sizeScale = 1.2 * (1 - t * 0.4);
      const gravityTerm = 135 * age * age;
      for (let bi = 0; bi < beads.length; bi++) {
        const b = beads[bi];
        let bx;
        let by;
        if (b.screenX !== undefined && b.screenY !== undefined) {
          bx = b.screenX * width;
          by = b.screenY * height;
        } else {
          bx = x + b.vx * age;
          by = y + b.vy * age + gravityTerm;
          if (by > y + 6) continue;
        }
        splashBeadX[count] = bx;
        splashBeadY[count] = by;
        splashBeadR[count] = b.size * sizeScale;
        count += 1;
      }
      if (count > 0) {
        ctx.fillStyle = `rgba(4, 22, 58, ${(beadAlpha * 0.25).toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const bx = splashBeadX[i];
          const by = splashBeadY[i] + 1;
          const sr = splashBeadR[i] + 0.5;
          if (hasMoveTo) ctx.moveTo(bx + sr, by);
          ctx.arc(bx, by, sr, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.fillStyle = rgbaFromRgb(tipRgb, beadAlpha * 0.94);
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const bx = splashBeadX[i];
          const by = splashBeadY[i];
          const br = splashBeadR[i];
          if (hasMoveTo) ctx.moveTo(bx + br, by);
          ctx.arc(bx, by, br, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }
}

function drawLightningFlash(ctx, lightning, width, height) {
  if (!lightning || !(lightning.intensity > 0.01)) return;
  const flash = Math.min(1, lightning.intensity);
  ctx.save();
  if (typeof ctx.createRadialGradient === 'function' && typeof ctx.fillRect === 'function') {
    const cx = (lightning.x ?? 0.5) * width;
    const cy = (lightning.y ?? 0.1) * height;
    const radius = Math.hypot(width, height) * 0.95;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(232, 245, 255, ${(flash * 0.34).toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(195, 224, 255, ${(flash * 0.16).toFixed(3)})`);
    grad.addColorStop(1, `rgba(165, 205, 255, ${(flash * 0.04).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (typeof ctx.fillRect === 'function') {
    ctx.fillStyle = `rgba(215, 236, 255, ${(flash * 0.22).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

// Reusable bucket arrays for batched ambient rain streaks
const RAIN_BUCKET_ALPHA = [0.26, 0.50, 0.78];
const rainBuckets = [[], [], []];
const primaryRainStreaks = [];

function drawRainStreaks(ctx, streaks, width, height, theme, lightningIntensity = 0) {
  if (typeof ctx.moveTo !== 'function' || typeof ctx.lineTo !== 'function') return;
  const rainRgb = (theme && theme.rainRgb) || [224, 246, 255];
  const tipRgb = (theme && theme.rainTipRgb) || [255, 255, 255];
  const hasGradient = typeof ctx.createLinearGradient === 'function';
  const flashBoost = 1 + Math.min(1, Math.max(0, lightningIntensity)) * 0.65;

  rainBuckets[0].length = 0;
  rainBuckets[1].length = 0;
  rainBuckets[2].length = 0;
  primaryRainStreaks.length = 0;

  ctx.save();
  ctx.lineCap = 'round';

  // Pass 1: single batched dark water-refraction shadow stroke for all visible streaks
  let shadowCount = 0;
  ctx.beginPath();
  for (let i = 0; i < streaks.length; i++) {
    const d = streaks[i];
    const alpha = Math.min(1, Math.max(0, d.alpha * flashBoost));
    if (alpha < 0.01) continue;
    const x2 = d.x * width;
    const y2 = d.y * height;
    const x1 = x2 - d.dx * width;
    const y1 = y2 - d.dy * height;

    ctx.moveTo(x1 + 0.8, y1 + 0.8);
    ctx.lineTo(x2 + 0.8, y2 + 0.8);
    shadowCount += 1;

    if (d.isPrimary) {
      primaryRainStreaks.push(x1, y1, x2, y2, d.width || 1.4, alpha);
    } else {
      const bucketIdx = alpha < 0.36 ? 0 : (alpha < 0.64 ? 1 : 2);
      rainBuckets[bucketIdx].push(x1, y1, x2, y2);
    }
  }
  if (shadowCount > 0) {
    ctx.strokeStyle = 'rgba(4, 22, 58, 0.13)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // Pass 2: batched 2-segment tapered ambient streaks across 3 alpha buckets (zero gradients)
  for (let b = 0; b < 3; b++) {
    const arr = rainBuckets[b];
    if (arr.length === 0) continue;
    const bucketAlpha = RAIN_BUCKET_ALPHA[b];

    ctx.lineWidth = b === 0 ? 1.0 : (b === 1 ? 1.2 : 1.4);
    ctx.strokeStyle = rgbaFromRgb(rainRgb, bucketAlpha * 0.34);
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 4) {
      const x1 = arr[i];
      const y1 = arr[i + 1];
      const x2 = arr[i + 2];
      const y2 = arr[i + 3];
      const mx = x1 + (x2 - x1) * 0.52;
      const my = y1 + (y2 - y1) * 0.52;
      ctx.moveTo(x1, y1);
      ctx.lineTo(mx, my);
    }
    ctx.stroke();

    ctx.strokeStyle = rgbaFromRgb(tipRgb, bucketAlpha * 0.82);
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 4) {
      const x1 = arr[i];
      const y1 = arr[i + 1];
      const x2 = arr[i + 2];
      const y2 = arr[i + 3];
      const mx = x1 + (x2 - x1) * 0.52;
      const my = y1 + (y2 - y1) * 0.52;
      ctx.moveTo(mx, my);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  // Pass 3: hero primary foreground raindrops (keep linear gradient on the few primary drops)
  if (primaryRainStreaks.length > 0) {
    const rainZero = rgbaFromRgb(rainRgb, 0);
    for (let i = 0; i < primaryRainStreaks.length; i += 6) {
      const x1 = primaryRainStreaks[i];
      const y1 = primaryRainStreaks[i + 1];
      const x2 = primaryRainStreaks[i + 2];
      const y2 = primaryRainStreaks[i + 3];
      const lw = primaryRainStreaks[i + 4];
      const alpha = primaryRainStreaks[i + 5];

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      if (hasGradient) {
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, rainZero);
        grad.addColorStop(0.55, rgbaFromRgb(rainRgb, alpha * 0.68));
        grad.addColorStop(1, rgbaFromRgb(tipRgb, alpha * 0.98));
        ctx.strokeStyle = grad;
      } else {
        ctx.strokeStyle = rgbaFromRgb(rainRgb, alpha * 0.85);
      }
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    // Batch bright glistening teardrop tips for all primary raindrops into one fill
    ctx.fillStyle = rgbaFromRgb(tipRgb, Math.min(1, 0.88 * flashBoost));
    ctx.beginPath();
    for (let i = 0; i < primaryRainStreaks.length; i += 6) {
      const x2 = primaryRainStreaks[i + 2];
      const y2 = primaryRainStreaks[i + 3];
      const lw = primaryRainStreaks[i + 4];
      const tipR = Math.max(1.5, lw * 0.95);
      ctx.moveTo(x2 + tipR, y2);
      ctx.arc(x2, y2, tipR, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  ctx.restore();
}

function tracePetalPath(ctx, r, len, halfWidth, notch) {
  ctx.beginPath();
  ctx.moveTo(r * 0.06, -r * 0.03);
  ctx.bezierCurveTo(
    len * 0.28, -halfWidth * 0.82,
    len * 0.78, -halfWidth * 1.12,
    len, -halfWidth * 0.19,
  );
  ctx.quadraticCurveTo(len - notch, 0, len, halfWidth * 0.19);
  ctx.bezierCurveTo(
    len * 0.78, halfWidth * 1.12,
    len * 0.28, halfWidth * 0.82,
    r * 0.06, r * 0.03,
  );
  ctx.closePath();
}

const LEAF_VEIN_TOP_U = [-0.68, -0.44, -0.18, 0.08, 0.32, 0.54, 0.74];
const LEAF_VEIN_BOT_U = [-0.60, -0.34, -0.08, 0.17, 0.41, 0.63, 0.80];

function leafCurveParams(halfWidth, seed = 0.37) {
  return {
    curveAmp: Math.sin(seed * 3.7) * halfWidth * 0.22,
    tipHook: Math.cos(seed * 5.3) * halfWidth * 0.12,
    asym: Math.sin(seed * 6.1) * 0.085,
  };
}

function leafSpineY(u, curveAmp, tipHook) {
  const tipTerm = u > 0 ? u * u * u * tipHook : 0;
  return curveAmp * (1 - u * u) + tipTerm;
}

function leafMarginHalfW(t, halfWidth, side, asym) {
  if (t <= 0 || t >= 1) return 0;
  // Ovate-elliptic botanical profile: fuller lower-middle belly, graceful acuminate drip-tip
  const bell = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.80)), 0.90);
  const acuminate = 1 - 0.22 * t * t * t;
  const sideScale = side < 0 ? (1 + asym) : (1 - asym);
  return halfWidth * bell * acuminate * sideScale;
}

function traceLeafPath(ctx, halfLen, halfWidth, seed = 0.37) {
  const { curveAmp, tipHook, asym } = leafCurveParams(halfWidth, seed);
  const teeth = 11;
  const baseX = -halfLen;
  const baseY = leafSpineY(-1, curveAmp, tipHook);
  const tipX = halfLen;
  const tipY = leafSpineY(1, curveAmp, tipHook);

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);

  // Upper margin (base -> acuminate drip-tip) with forward-leaning fine botanical serrations
  for (let i = 0; i < teeth; i++) {
    const t0 = i / teeth;
    const t1 = (i + 1) / teeth;
    const ta = t0 + (t1 - t0) * 0.32;
    const tb = t0 + (t1 - t0) * 0.74;
    const u1 = t1 * 2 - 1;
    const ua = ta * 2 - 1;
    const ub = tb * 2 - 1;

    const env = Math.sin(Math.PI * tb);
    const toothScale = 1 + (i > 0 && i < teeth - 1 ? 0.048 * env * env : 0);
    const notchScale = 1 - (i + 1 < teeth && i > 0 ? 0.022 * Math.sin(Math.PI * t1) ** 2 : 0);

    const x1 = i === teeth - 1 ? tipX : u1 * halfLen;
    const y1 = i === teeth - 1
      ? tipY
      : leafSpineY(u1, curveAmp, tipHook) - leafMarginHalfW(t1, halfWidth, -1, asym) * notchScale;
    const xa = ua * halfLen;
    const ya = leafSpineY(ua, curveAmp, tipHook) - leafMarginHalfW(ta, halfWidth, -1, asym) * (1 + 0.014 * env);
    const xb = ub * halfLen;
    const yb = leafSpineY(ub, curveAmp, tipHook) - leafMarginHalfW(tb, halfWidth, -1, asym) * toothScale;

    ctx.bezierCurveTo(xa, ya, xb, yb, x1, y1);
  }

  // Lower margin (drip-tip -> base), keeping serration teeth oriented forward toward the drip-tip
  for (let i = teeth - 1; i >= 0; i--) {
    const tLow = i / teeth;
    const tHigh = (i + 1) / teeth;
    const ta = tLow + (tHigh - tLow) * 0.74;
    const tb = tLow + (tHigh - tLow) * 0.32;
    const uEnd = tLow * 2 - 1;
    const ua = ta * 2 - 1;
    const ub = tb * 2 - 1;

    const env = Math.sin(Math.PI * ta);
    const toothScale = 1 + (i > 0 && i < teeth - 1 ? 0.048 * env * env : 0);
    const notchScale = 1 - (i > 0 && i < teeth - 1 ? 0.022 * Math.sin(Math.PI * tLow) ** 2 : 0);

    const x1 = i === 0 ? baseX : uEnd * halfLen;
    const y1 = i === 0
      ? baseY
      : leafSpineY(uEnd, curveAmp, tipHook) + leafMarginHalfW(tLow, halfWidth, 1, asym) * notchScale;
    const xa = ua * halfLen;
    const ya = leafSpineY(ua, curveAmp, tipHook) + leafMarginHalfW(ta, halfWidth, 1, asym) * toothScale;
    const xb = ub * halfLen;
    const yb = leafSpineY(ub, curveAmp, tipHook) + leafMarginHalfW(tb, halfWidth, 1, asym) * (1 + 0.014 * env);

    ctx.bezierCurveTo(xa, ya, xb, yb, x1, y1);
  }

  ctx.closePath();
}

function drawRealisticLeaf(ctx, r, seed, altitude, relAngle, colors, hasLinearGrad, hasRadialGrad) {
  const halfLen = r * (1.12 + Math.sin(seed * 5.7) * 0.08);
  const halfWidth = r * (0.48 + Math.cos(seed * 4.3) * 0.055);
  const { curveAmp, tipHook, asym } = leafCurveParams(halfWidth, seed);
  const lit = Math.cos(relAngle);
  const sunCross = Math.sin(relAngle);
  const sunlitSide = sunCross >= 0 ? -1 : 1;
  const sunIntensity = colors.sunIntensity !== undefined ? colors.sunIntensity : 1.5;
  const sunRgb = colors.sunRgb || [255, 248, 224];
  const isNight = (colors.nightGlow || 0) > 0.45;
  const isBiolum = (colors.biolum || 0) > 0.45;
  const hasClip = typeof ctx.clip === 'function';

  // 1. Tapered organic woody petiole (stem) with subtle swollen abscission node at the tip
  const baseY = leafSpineY(-1, curveAmp, tipHook);
  const petX0 = -halfLen * 1.30;
  const petY0 = baseY + Math.sin(seed * 4.9) * halfWidth * 0.14 - curveAmp * 0.18;
  const petCtrlX = -halfLen * 1.14;
  const petCtrlY = baseY + (petY0 - baseY) * 0.35;
  const petEndX = -halfLen * 0.90;
  const petEndY = leafSpineY(-0.90, curveAmp, tipHook);
  const stemBaseW = Math.max(0.95, r * 0.056);
  const stemMidW = Math.max(0.65, r * 0.036);

  ctx.beginPath();
  ctx.moveTo(petX0, petY0 - stemBaseW * 0.58);
  ctx.quadraticCurveTo(petCtrlX, petCtrlY - stemMidW * 0.52, petEndX, petEndY - stemMidW * 0.65);
  ctx.lineTo(petEndX, petEndY + stemMidW * 0.65);
  ctx.quadraticCurveTo(petCtrlX, petCtrlY + stemMidW * 0.58, petX0, petY0 + stemBaseW * 0.58);
  ctx.closePath();
  if (hasLinearGrad) {
    const petGrad = ctx.createLinearGradient(petX0, petY0, petEndX, petEndY);
    petGrad.addColorStop(0, isNight ? 'rgba(16, 30, 34, 0.94)' : 'rgba(62, 58, 32, 0.95)');
    petGrad.addColorStop(0.55, colors.leafBase);
    petGrad.addColorStop(1, colors.leafMid);
    ctx.fillStyle = petGrad;
  } else {
    ctx.fillStyle = colors.leafBase;
  }
  ctx.fill();

  // Delicate highlight catching the upper cylindrical ridge of the stem
  ctx.beginPath();
  ctx.moveTo(petX0 + r * 0.02, petY0 - stemBaseW * 0.25);
  ctx.quadraticCurveTo(petCtrlX, petCtrlY - stemMidW * 0.24, petEndX, petEndY - stemMidW * 0.22);
  ctx.strokeStyle = isNight ? 'rgba(130, 175, 190, 0.24)' : 'rgba(225, 244, 178, 0.34)';
  ctx.lineWidth = Math.max(0.45, r * 0.018);
  ctx.stroke();

  // 2. Leaf blade silhouette + multi-layered botanical surface clipped cleanly inside the margin
  ctx.save();
  traceLeafPath(ctx, halfLen, halfWidth, seed);
  if (hasLinearGrad) {
    const grad = ctx.createLinearGradient(-halfLen, baseY, halfLen, leafSpineY(1, curveAmp, tipHook));
    grad.addColorStop(0, colors.leafBase);
    grad.addColorStop(0.36, colors.leafMid);
    grad.addColorStop(0.78, colors.leafEdge);
    grad.addColorStop(1, colors.leafMid);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = colors.leafMid;
  }
  ctx.fill();

  if (hasClip) {
    ctx.clip();
  }

  // 2a. Organic chlorophyll mottling & backlit subsurface translucency patches
  if (hasRadialGrad) {
    const sssStrength = Math.min(0.32, Math.max(0.06, sunIntensity * 0.14)) * (0.78 + Math.max(0, lit) * 0.42);
    const sssX = halfLen * (0.14 + Math.sin(seed * 4.1) * 0.16);
    const sssY = leafSpineY(0.14, curveAmp, tipHook) + sunlitSide * halfWidth * 0.34;
    const sssR = halfLen * 0.72;
    const sss = ctx.createRadialGradient(sssX, sssY, r * 0.05, sssX, sssY, sssR);
    if (isBiolum) {
      sss.addColorStop(0, `rgba(110, 248, 255, ${(sssStrength * 1.15).toFixed(3)})`);
      sss.addColorStop(0.55, `rgba(48, 198, 212, ${(sssStrength * 0.45).toFixed(3)})`);
      sss.addColorStop(1, 'rgba(20, 110, 128, 0)');
    } else if (isNight) {
      sss.addColorStop(0, `rgba(110, 158, 178, ${(sssStrength * 0.75).toFixed(3)})`);
      sss.addColorStop(0.6, `rgba(46, 86, 102, ${(sssStrength * 0.28).toFixed(3)})`);
      sss.addColorStop(1, 'rgba(12, 28, 38, 0)');
    } else {
      const warmR = Math.min(255, Math.round(168 + sunRgb[0] * 0.32));
      const warmG = Math.min(255, Math.round(182 + sunRgb[1] * 0.24));
      const warmB = Math.min(255, Math.round(44 + sunRgb[2] * 0.22));
      sss.addColorStop(0, `rgba(${warmR}, ${warmG}, ${warmB}, ${sssStrength.toFixed(3)})`);
      sss.addColorStop(0.52, `rgba(${warmR}, ${warmG}, ${warmB}, ${(sssStrength * 0.36).toFixed(3)})`);
      sss.addColorStop(1, `rgba(${warmR}, ${warmG}, ${warmB}, 0)`);
    }
    ctx.fillStyle = sss;
    ctx.beginPath();
    ctx.arc(sssX, sssY, sssR, 0, Math.PI * 2);
    ctx.fill();

    // Deep chlorophyll-dense pocket near the shaded lower base
    const deepX = -halfLen * 0.34;
    const deepY = leafSpineY(-0.34, curveAmp, tipHook) - sunlitSide * halfWidth * 0.28;
    const deepR = halfLen * 0.56;
    const deepGrad = ctx.createRadialGradient(deepX, deepY, 0, deepX, deepY, deepR);
    deepGrad.addColorStop(0, 'rgba(6, 26, 16, 0.24)');
    deepGrad.addColorStop(0.65, 'rgba(6, 26, 16, 0.09)');
    deepGrad.addColorStop(1, 'rgba(6, 26, 16, 0)');
    ctx.fillStyle = deepGrad;
    ctx.beginPath();
    ctx.arc(deepX, deepY, deepR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle natural organic warmth/mineral variation near the tip or outer edge
    if (!isNight && !isBiolum) {
      const tipPatchX = halfLen * (0.64 + Math.cos(seed * 7.1) * 0.10);
      const tipPatchY = leafSpineY(0.64, curveAmp, tipHook) + (Math.sin(seed * 8.3) > 0 ? 1 : -1) * halfWidth * 0.22;
      const tipPatchR = halfWidth * 0.72;
      const tipPatch = ctx.createRadialGradient(tipPatchX, tipPatchY, 0, tipPatchX, tipPatchY, tipPatchR);
      tipPatch.addColorStop(0, 'rgba(196, 172, 62, 0.17)');
      tipPatch.addColorStop(0.65, 'rgba(154, 146, 52, 0.06)');
      tipPatch.addColorStop(1, 'rgba(140, 140, 50, 0)');
      ctx.fillStyle = tipPatch;
      ctx.beginPath();
      ctx.arc(tipPatchX, tipPatchY, tipPatchR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2b. 3D V-fold shading across the curved central midrib
  if (hasLinearGrad) {
    const midY = leafSpineY(0, curveAmp, tipHook);
    const foldGrad = ctx.createLinearGradient(0, midY - halfWidth, 0, midY + halfWidth);
    const lightBoost = (0.08 + Math.max(0, lit) * 0.16) * Math.min(1.2, Math.max(0.35, sunIntensity * 0.65));
    const shadeDepth = 0.12 + Math.max(0, -lit) * 0.12;
    if (sunlitSide < 0) {
      foldGrad.addColorStop(0, `rgba(246, 255, 224, ${lightBoost.toFixed(3)})`);
      foldGrad.addColorStop(0.44, 'rgba(255, 255, 255, 0)');
      foldGrad.addColorStop(0.50, `rgba(6, 24, 16, ${(shadeDepth * 0.78).toFixed(3)})`);
      foldGrad.addColorStop(0.58, `rgba(8, 28, 18, ${(shadeDepth * 0.42).toFixed(3)})`);
      foldGrad.addColorStop(1, `rgba(5, 20, 14, ${shadeDepth.toFixed(3)})`);
    } else {
      foldGrad.addColorStop(0, `rgba(5, 20, 14, ${shadeDepth.toFixed(3)})`);
      foldGrad.addColorStop(0.42, `rgba(8, 28, 18, ${(shadeDepth * 0.42).toFixed(3)})`);
      foldGrad.addColorStop(0.50, `rgba(6, 24, 16, ${(shadeDepth * 0.78).toFixed(3)})`);
      foldGrad.addColorStop(0.56, 'rgba(255, 255, 255, 0)');
      foldGrad.addColorStop(1, `rgba(246, 255, 224, ${lightBoost.toFixed(3)})`);
    }
    ctx.fillStyle = foldGrad;
    traceLeafPath(ctx, halfLen, halfWidth, seed);
    ctx.fill();
  }

  // 2c. Glossy waxy cuticle specular sheen catching sky/sun reflection along the convex blade bulge
  if (hasRadialGrad) {
    const sheenAlpha = (0.11 + Math.max(0, lit) * 0.14) * Math.min(1.15, Math.max(0.28, sunIntensity * 0.62));
    const sheenX = halfLen * (-0.08 + Math.sin(seed * 3.1) * 0.12);
    const sheenY = leafSpineY(-0.08, curveAmp, tipHook) + sunlitSide * halfWidth * 0.40;
    ctx.save();
    ctx.translate(sheenX, sheenY);
    ctx.rotate(sunlitSide * -0.14);
    ctx.scale(1, 0.36);
    const sheenR = halfLen * 0.44;
    const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, sheenR);
    const sR = Math.round(210 + sunRgb[0] * 0.17);
    const sG = Math.round(218 + sunRgb[1] * 0.14);
    const sB = Math.round(205 + sunRgb[2] * 0.18);
    sheen.addColorStop(0, `rgba(${sR}, ${sG}, ${sB}, ${sheenAlpha.toFixed(3)})`);
    sheen.addColorStop(0.55, `rgba(${sR}, ${sG}, ${sB}, ${(sheenAlpha * 0.34).toFixed(3)})`);
    sheen.addColorStop(1, `rgba(${sR}, ${sG}, ${sB}, 0)`);
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(0, 0, sheenR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Multi-level botanical venation (secondary camptodromous arching veins + tertiary cross-veinlets)
  const drawSecondarySet = (uList, side, strokeStyle, widthScale, offsetY, withTertiary) => {
    ctx.strokeStyle = strokeStyle;
    ctx.lineCap = 'round';
    for (let vi = 0; vi < uList.length; vi++) {
      const u = uList[vi];
      const t = (u + 1) * 0.5;
      const vx = u * halfLen;
      const vy = leafSpineY(u, curveAmp, tipHook);

      const endU = Math.min(0.92, u + 0.25 + (1 - t) * 0.10);
      const endT = (endU + 1) * 0.5;
      const endW = leafMarginHalfW(endT, halfWidth, side, asym) * 0.86;
      const endX = endU * halfLen;
      const endY = leafSpineY(endU, curveAmp, tipHook) + side * endW;

      const midU = u + (endU - u) * 0.48;
      const midT = (midU + 1) * 0.5;
      const midW = leafMarginHalfW(midT, halfWidth, side, asym) * 0.58;
      const ctrlX = midU * halfLen - halfLen * 0.02;
      const ctrlY = leafSpineY(midU, curveAmp, tipHook) + side * midW;

      const taper = 1 - t * 0.45;
      ctx.lineWidth = Math.max(0.35, r * 0.023 * widthScale * taper);
      ctx.beginPath();
      ctx.moveTo(vx, vy + offsetY);
      ctx.quadraticCurveTo(ctrlX, ctrlY + offsetY, endX, endY + offsetY);
      ctx.stroke();

      // Delicate looping margin veinlet & tertiary micro-branch on inner veins
      if (withTertiary && vi > 0 && vi < uList.length - 1) {
        const bx = (vx + ctrlX * 2 + endX) * 0.25;
        const by = (vy + ctrlY * 2 + endY) * 0.25;
        const nextU = Math.min(0.94, endU + 0.12);
        const nextT = (nextU + 1) * 0.5;
        const nextW = leafMarginHalfW(nextT, halfWidth, side, asym) * 0.80;
        const branchX = nextU * halfLen;
        const branchY = leafSpineY(nextU, curveAmp, tipHook) + side * nextW;

        ctx.lineWidth = Math.max(0.28, r * 0.013 * taper);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo((bx + branchX) * 0.52, (by + branchY) * 0.5 + side * halfWidth * 0.06, branchX, branchY);
        ctx.stroke();
      }
    }
  };

  // Recessed micro-shadow beside veins gives gentle quilted leaf-blade relief
  const veinShadowOff = -sunlitSide * Math.max(0.45, r * 0.022);
  drawSecondarySet(LEAF_VEIN_TOP_U, -1, 'rgba(6, 26, 16, 0.20)', 1.15, veinShadowOff, false);
  drawSecondarySet(LEAF_VEIN_BOT_U, 1, 'rgba(6, 26, 16, 0.20)', 1.15, veinShadowOff, false);
  drawSecondarySet(LEAF_VEIN_TOP_U, -1, colors.leafVein, 1.0, 0, true);
  drawSecondarySet(LEAF_VEIN_BOT_U, 1, colors.leafVein, 1.0, 0, true);

  // 4. Tapered 3D primary midrib following the exact organic curved spine
  const midSteps = 8;
  // Shadow crease along the shaded flank of the midrib
  ctx.beginPath();
  for (let i = 0; i <= midSteps; i++) {
    const u = -0.96 + (i / midSteps) * 1.90;
    const x = u * halfLen;
    const y = leafSpineY(u, curveAmp, tipHook) + veinShadowOff * 1.1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(6, 26, 16, 0.28)';
  ctx.lineWidth = Math.max(0.75, r * 0.042);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Filled tapering midrib ribbon (thick at base -> fine hairline at tip)
  ctx.beginPath();
  for (let i = 0; i <= midSteps; i++) {
    const frac = i / midSteps;
    const u = -0.96 + frac * 1.90;
    const w = Math.max(0.28, r * (0.044 * (1 - frac * 0.82)));
    const x = u * halfLen;
    const y = leafSpineY(u, curveAmp, tipHook) - w * 0.5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = midSteps; i >= 0; i--) {
    const frac = i / midSteps;
    const u = -0.96 + frac * 1.90;
    const w = Math.max(0.28, r * (0.044 * (1 - frac * 0.82)));
    const x = u * halfLen;
    const y = leafSpineY(u, curveAmp, tipHook) + w * 0.5;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = colors.leafVein;
  ctx.fill();

  // Crisp sunlit top specular filament along the raised midrib ridge
  ctx.beginPath();
  for (let i = 0; i <= midSteps; i++) {
    const frac = i / midSteps;
    const u = -0.92 + frac * 1.72;
    const x = u * halfLen;
    const y = leafSpineY(u, curveAmp, tipHook) + sunlitSide * Math.max(0.25, r * 0.011);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = isBiolum
    ? 'rgba(180, 252, 255, 0.42)'
    : (isNight ? 'rgba(130, 176, 188, 0.24)' : 'rgba(232, 250, 186, 0.42)');
  ctx.lineWidth = Math.max(0.35, r * 0.014);
  ctx.stroke();

  // Subtle darkened wet edge bevel just inside the serrated margin
  traceLeafPath(ctx, halfLen, halfWidth, seed);
  ctx.strokeStyle = 'rgba(6, 24, 14, 0.26)';
  ctx.lineWidth = Math.max(0.75, r * 0.044);
  ctx.stroke();

  // 5. Realistic hydrophobic water droplets resting on the waxy cuticle
  if (altitude <= 0.001 && r >= 12) {
    const sunLx = lit;
    const sunLy = -sunCross;
    const dropCount = (Math.abs(Math.sin(seed * 11.3)) > 0.32) ? 2 : 1;
    for (let di = 0; di < dropCount; di++) {
      const du = di === 0
        ? -0.22 + Math.sin(seed * 9.7) * 0.26
        : 0.28 + Math.cos(seed * 6.3) * 0.22;
      const dt = (du + 1) * 0.5;
      const dSide = di === 0 ? sunlitSide : -sunlitSide;
      const maxW = leafMarginHalfW(dt, halfWidth, dSide, asym);
      if (maxW < r * 0.16) continue;
      const dx = du * halfLen;
      const dy = leafSpineY(du, curveAmp, tipHook) + dSide * maxW * (0.44 + (di * 0.10));
      const dr = Math.max(1.2, r * (di === 0 ? 0.088 : 0.062) * (0.85 + Math.abs(Math.sin(seed * 5.9 + di)) * 0.3));

      // Tiny dark contact shadow cast opposite to the sun
      ctx.beginPath();
      ctx.arc(dx - sunLx * dr * 0.34, dy - sunLy * dr * 0.34, dr * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(4, 20, 14, 0.34)';
      ctx.fill();

      // Refracted water bead body (darker upper crown, luminous lens caustic opposite sun)
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      if (hasRadialGrad) {
        const dg = ctx.createRadialGradient(
          dx - sunLx * dr * 0.28,
          dy - sunLy * dr * 0.28,
          dr * 0.08,
          dx,
          dy,
          dr,
        );
        dg.addColorStop(0, isBiolum ? 'rgba(180, 255, 255, 0.56)' : 'rgba(230, 255, 212, 0.52)');
        dg.addColorStop(0.55, 'rgba(180, 224, 198, 0.18)');
        dg.addColorStop(1, 'rgba(6, 26, 18, 0.34)');
        ctx.fillStyle = dg;
      } else {
        ctx.fillStyle = 'rgba(220, 248, 228, 0.36)';
      }
      ctx.fill();

      // Crisp pinpoint white specular glint on the sun-facing crown
      ctx.beginPath();
      ctx.arc(dx + sunLx * dr * 0.32, dy + sunLy * dr * 0.32, Math.max(0.45, dr * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = isNight ? 'rgba(195, 224, 245, 0.72)' : 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
    }
  }

  ctx.restore();

  // 6. Delicate sunlit water-meniscus rim right along the outer leaf contour
  traceLeafPath(ctx, halfLen, halfWidth, seed);
  const rimAlpha = (0.14 + Math.max(0, lit) * 0.20 + (altitude <= 0.001 ? 0.08 : 0))
    * Math.min(1.1, Math.max(0.45, sunIntensity * 0.65));
  ctx.strokeStyle = isBiolum
    ? `rgba(175, 252, 255, ${rimAlpha.toFixed(3)})`
    : `rgba(232, 255, 220, ${rimAlpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(0.5, r * 0.025);
  ctx.stroke();
}

function drawStyledPetal(ctx, r, len, halfWidth, notch, lit, altitude, colors, hasLinearGrad) {
  tracePetalPath(ctx, r, len, halfWidth, notch);
  if (hasLinearGrad) {
    const grad = ctx.createLinearGradient(r * 0.05, 0, len, 0);
    grad.addColorStop(0, colors.petalBase);
    grad.addColorStop(0.28, colors.petalMid);
    grad.addColorStop(0.76, colors.petalColor);
    grad.addColorStop(1, colors.petalEdge);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = colors.petalColor;
  }
  ctx.fill();

  if (hasLinearGrad) {
    const shadeGrad = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
    if (lit >= 0) {
      shadeGrad.addColorStop(0, `rgba(255, 255, 255, ${(0.06 + lit * 0.14).toFixed(3)})`);
      shadeGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
      shadeGrad.addColorStop(1, 'rgba(18, 28, 62, 0.09)');
    } else {
      shadeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
      shadeGrad.addColorStop(0.45, 'rgba(14, 24, 58, 0.03)');
      shadeGrad.addColorStop(1, `rgba(12, 22, 54, ${(0.08 + (-lit) * 0.11).toFixed(3)})`);
    }
    ctx.fillStyle = shadeGrad;
    ctx.fill();
  }

  ctx.strokeStyle = colors.petalVein;
  ctx.lineWidth = Math.max(0.45, r * 0.026);
  ctx.beginPath();
  ctx.moveTo(r * 0.12, 0);
  ctx.quadraticCurveTo(len * 0.42, 0, len * 0.72, 0);
  ctx.moveTo(r * 0.15, -r * 0.02);
  ctx.quadraticCurveTo(len * 0.40, -halfWidth * 0.34, len * 0.66, -halfWidth * 0.46);
  ctx.moveTo(r * 0.15, r * 0.02);
  ctx.quadraticCurveTo(len * 0.40, halfWidth * 0.34, len * 0.66, halfWidth * 0.46);
  ctx.stroke();

  tracePetalPath(ctx, r, len, halfWidth, notch);
  const rimAlpha = 0.22 + Math.max(0, lit) * 0.26 + (altitude <= 0.001 ? 0.08 : 0);
  ctx.strokeStyle = `rgba(255, 255, 255, ${rimAlpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(0.55, r * 0.032);
  ctx.stroke();
}

const MAX_SPRITE_CACHE = 96;
const RAFT_SEAM_T = [0.28, 0.50, 0.72];
const RAFT_GRAIN_T = [0.16, 0.39, 0.61, 0.84];
const WASHI_RIB_T = [0.22, 0.78];
const WASHI_FIBER_PAIRS = [[0.14, 0.32], [0.46, 0.38], [0.64, 0.76]];

const LANTERN_CORNERS = [{ ca: 0, sa: 0 }, { ca: 0, sa: 0 }, { ca: 0, sa: 0 }, { ca: 0, sa: 0 }];
const LANTERN_RAFT_TOP = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const LANTERN_RAFT_BOT = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const LANTERN_BOT = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const LANTERN_TOP = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const LANTERN_FACES = [{ i: 0, j: 1, avgY: 0 }, { i: 1, j: 2, avgY: 0 }, { i: 2, j: 3, avgY: 0 }, { i: 3, j: 0, avgY: 0 }];
const LANTERN_POST_ORDER = [0, 1, 2, 3];

function defaultCreateOffscreenCanvas(width, height) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  return null;
}

function lruSet(map, key, value) {
  if (map.size >= MAX_SPRITE_CACHE) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
  map.set(key, value);
}

function renderBlossomShadowVector(ctx, kind, petals, shadowR, shadowAlpha, seed = 0.37) {
  for (let layer = 0; layer < 2; layer++) {
    const layerScale = layer === 0 ? 1.14 : 0.94;
    const layerAlpha = shadowAlpha * (layer === 0 ? 0.36 : 0.62);
    ctx.fillStyle = `rgba(4, 34, 66, ${layerAlpha.toFixed(3)})`;
    if (kind === 'leaf') {
      const sHalfLen = shadowR * (1.10 + Math.sin(seed * 5.7) * 0.08) * layerScale;
      const sHalfWidth = shadowR * (0.48 + Math.cos(seed * 4.3) * 0.055) * layerScale;
      traceLeafPath(ctx, sHalfLen, sHalfWidth, seed);
      ctx.fill();
    } else if (kind === 'petal') {
      const sLen = shadowR * 1.38 * layerScale;
      const sW = shadowR * 0.54 * layerScale;
      ctx.save();
      ctx.translate(-sLen * 0.48, 0);
      tracePetalPath(ctx, shadowR * layerScale, sLen, sW, shadowR * 0.08);
      ctx.fill();
      ctx.restore();
    } else {
      const slotStep = (Math.PI * 2) / 5;
      for (let i = 0; i < petals; i++) {
        ctx.save();
        ctx.rotate(i * slotStep);
        const sLen = shadowR * 1.02 * layerScale;
        const sW = shadowR * 0.42 * layerScale;
        tracePetalPath(ctx, shadowR * layerScale, sLen, sW, shadowR * 0.06);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function renderBlossomBodyVector(
  ctx,
  kind,
  petals,
  r,
  seed,
  altitude,
  relAngle,
  colors,
  hasLinearGrad,
  hasRadialGrad,
) {
  // Subtle water-surface contact occlusion right underneath resting floaters
  if (altitude <= 0.001 && hasRadialGrad) {
    const occR = kind === 'leaf' ? r * 1.05 : r * 1.12;
    const contactGrad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, occR);
    contactGrad.addColorStop(0, 'rgba(3, 20, 56, 0.18)');
    contactGrad.addColorStop(0.65, 'rgba(3, 20, 56, 0.08)');
    contactGrad.addColorStop(1, 'rgba(3, 20, 56, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, occR, 0, Math.PI * 2);
    ctx.fillStyle = contactGrad;
    ctx.fill();
  }

  if (kind === 'leaf') {
    drawRealisticLeaf(ctx, r, seed, altitude, relAngle, colors, hasLinearGrad, hasRadialGrad);
  } else if (kind === 'petal') {
    // Single detached blossom petal centered around its own body
    const len = r * (1.44 + Math.cos(seed * 5.1) * 0.08);
    const halfWidth = r * (0.56 + Math.sin(seed * 7.3) * 0.04);
    const notch = r * (0.11 + (Math.sin(seed * 3.9) * 0.5 + 0.5) * 0.04);
    const lit = Math.cos(relAngle);

    ctx.save();
    ctx.translate(-len * 0.48, 0);
    drawStyledPetal(ctx, r, len, halfWidth, notch, lit, altitude, colors, hasLinearGrad);
    ctx.restore();
  } else {
    // Full 5-petal blossom or 2-3 petal partial fragment
    const slotStep = (Math.PI * 2) / 5;
    for (let i = 0; i < petals; i++) {
      const baseAngle = i * slotStep;
      const jitter = Math.sin(seed * 7.3 + i * 2.41);
      const petalAngle = baseAngle + jitter * 0.055;
      const len = r * (1.06 + Math.cos(seed * 5.1 + i * 3.17) * 0.055);
      const halfWidth = r * (0.43 + jitter * 0.03);
      const notch = r * (0.08 + (jitter * 0.5 + 0.5) * 0.035);
      const lit = Math.cos(relAngle + petalAngle);

      ctx.save();
      ctx.rotate(petalAngle);
      drawStyledPetal(ctx, r, len, halfWidth, notch, lit, altitude, colors, hasLinearGrad);
      ctx.restore();
    }

    // Soft glowing blossom throat
    const coreScale = kind === 'partial' ? 0.72 : 1.0;
    if (hasRadialGrad) {
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.34 * coreScale);
      coreGrad.addColorStop(0, colors.petalCore);
      coreGrad.addColorStop(0.55, colors.petalBase);
      coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34 * coreScale, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22 * coreScale, 0, Math.PI * 2);
      ctx.fillStyle = colors.petalCore;
      ctx.fill();
    }

    // Fine radiating stamen filaments and pollen anthers
    const stamenCount = kind === 'partial' ? 4 : 7;
    const antherR = Math.max(0.75, r * 0.044);
    ctx.strokeStyle = colors.petalStamen;
    ctx.lineWidth = Math.max(0.5, r * 0.025);
    for (let s = 0; s < stamenCount; s++) {
      const sa = kind === 'partial'
        ? (s / Math.max(1, stamenCount - 1)) * (petals - 1) * slotStep
        : (s * Math.PI * 2) / stamenCount + seed * 1.3;
      const sLen = r * (0.21 + (Math.sin(seed * 9.1 + s * 2.7) * 0.5 + 0.5) * 0.08);
      const sx = Math.cos(sa) * sLen;
      const sy = Math.sin(sa) * sLen;
      ctx.beginPath();
      ctx.moveTo(Math.cos(sa) * r * 0.05, Math.sin(sa) * r * 0.05);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, antherR, 0, Math.PI * 2);
      ctx.fillStyle = colors.petalCore;
      ctx.fill();
    }

    // Tiny central pistil dot
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.9, r * 0.075 * coreScale), 0, Math.PI * 2);
    ctx.fillStyle = colors.petalCore;
    ctx.fill();
  }
}

function createBlossomSpriteCache(createCanvas) {
  const shadowMap = new Map();
  const bodyMap = new Map();

  function getShadowSprite(kind, petals, qShadowR, qBlur, dpr, seed = 0.37) {
    const seedPart = kind === 'leaf' ? Math.round(seed * 10) : 0;
    const key = `${kind}|${petals}|${seedPart}|${qShadowR}|${qBlur}|${dpr}`;
    const hit = shadowMap.get(key);
    if (hit) return hit;

    const half = Math.ceil(qShadowR * 1.65 + qBlur * 2.5 + 4);
    const cssSize = half * 2;
    const pxSize = Math.max(2, Math.ceil(cssSize * dpr));
    const canvas = createCanvas(pxSize, pxSize);
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const sctx = canvas.getContext('2d');
    if (!sctx || typeof sctx.bezierCurveTo !== 'function') return null;

    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.translate(half, half);
    if (typeof sctx.filter === 'string' && qBlur > 0) {
      sctx.filter = `blur(${qBlur}px)`;
    }
    renderBlossomShadowVector(sctx, kind, petals, qShadowR, 1.0, seed);
    const entry = { canvas, half, cssSize, baseR: qShadowR };
    lruSet(shadowMap, key, entry);
    return entry;
  }

  function getBodySprite(kind, petals, qR, seed, resting, sector, colors, themeKey, dpr) {
    const qSeed = Math.round(seed * 10);
    const key = `${kind}|${petals}|${qSeed}|${qR}|${resting}|${sector}|${themeKey}|${dpr}`;
    const hit = bodyMap.get(key);
    if (hit) return hit;

    const half = Math.ceil(qR * 1.72 + 4);
    const cssSize = half * 2;
    const pxSize = Math.max(2, Math.ceil(cssSize * dpr));
    const canvas = createCanvas(pxSize, pxSize);
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const bctx = canvas.getContext('2d');
    if (!bctx || typeof bctx.bezierCurveTo !== 'function') return null;

    const hasLinearGrad = typeof bctx.createLinearGradient === 'function';
    const hasRadialGrad = typeof bctx.createRadialGradient === 'function';
    const relAngle = sector * (Math.PI / 6);

    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.translate(half, half);
    renderBlossomBodyVector(
      bctx,
      kind,
      petals,
      qR,
      seed,
      resting ? 0 : 0.25,
      relAngle,
      colors,
      hasLinearGrad,
      hasRadialGrad,
    );
    const entry = { canvas, half, cssSize, baseR: qR };
    lruSet(bodyMap, key, entry);
    return entry;
  }

  return {
    getShadowSprite,
    getBodySprite,
    clear() {
      shadowMap.clear();
      bodyMap.clear();
    },
  };
}

function drawBlossom(ctx, f, theme, spriteCache = null, dpr = 1) {
  const sunCol = theme && Array.isArray(theme.sunColor) ? theme.sunColor : [1.0, 0.97, 0.88];
  const colors = {
    petalBase: (theme && theme.petalBase) || 'rgba(255, 224, 150, 0.94)',
    petalMid: (theme && theme.petalMid) || 'rgba(255, 240, 245, 0.96)',
    petalColor: (theme && theme.petalColor) || 'rgba(255, 248, 251, 0.95)',
    petalEdge: (theme && theme.petalEdge) || 'rgba(255, 204, 220, 0.88)',
    petalVein: (theme && theme.petalVein) || 'rgba(226, 154, 176, 0.25)',
    petalCore: (theme && theme.petalCore) || 'rgba(248, 182, 58, 0.96)',
    petalStamen: (theme && theme.petalStamen) || 'rgba(255, 226, 124, 0.95)',
    leafBase: (theme && theme.leafBase) || 'rgba(34, 78, 38, 0.96)',
    leafMid: (theme && theme.leafMid) || 'rgba(58, 118, 52, 0.95)',
    leafEdge: (theme && theme.leafEdge) || 'rgba(112, 162, 68, 0.92)',
    leafVein: (theme && theme.leafVein) || 'rgba(192, 226, 138, 0.42)',
    sunRgb: [
      Math.round(Math.min(1, Math.max(0, sunCol[0])) * 255),
      Math.round(Math.min(1, Math.max(0, sunCol[1])) * 255),
      Math.round(Math.min(1, Math.max(0, sunCol[2])) * 255),
    ],
    sunIntensity: theme && theme.sunIntensity !== undefined ? theme.sunIntensity : 1.55,
    nightGlow: theme && theme.nightGlow !== undefined ? theme.nightGlow : 0,
    biolum: theme && theme.biolum !== undefined ? theme.biolum : 0,
  };

  const kind = f.kind || 'blossom';
  const petals = f.petals || (kind === 'blossom' ? 5 : (kind === 'partial' ? 3 : 1));
  const r = f.radiusPx;
  const seed = f.seed || 0.37;
  const altitude = Math.max(0, f.altitude || 0);
  const flutterTilt = f.flutterTilt || 0;
  const baseAspectY = f.aspectY || 0.85;
  const tiltX = f.tiltX || 0;
  const tiltZ = f.tiltZ || 0;
  const scaleX = altitude > 0
    ? Math.max(0.62, Math.min(1.08, 1.0 - Math.abs(flutterTilt) * 0.45))
    : Math.max(0.75, Math.min(1.12, 1.0 - Math.abs(tiltX) * 0.35));
  const scaleY = altitude > 0
    ? Math.max(0.45, Math.min(1.0, baseAspectY * (1.0 - Math.abs(flutterTilt) * 0.55)))
    : Math.max(0.52, Math.min(1.0, baseAspectY * (1.0 - tiltZ * 0.25)));

  const hasBezier = typeof ctx.bezierCurveTo === 'function'
    && typeof ctx.quadraticCurveTo === 'function'
    && typeof ctx.moveTo === 'function'
    && typeof ctx.lineTo === 'function'
    && typeof ctx.closePath === 'function';
  const hasLinearGrad = typeof ctx.createLinearGradient === 'function';
  const hasRadialGrad = typeof ctx.createRadialGradient === 'function';
  const canUseSprites = Boolean(spriteCache && hasBezier && typeof ctx.drawImage === 'function');

  // Soft underwater shadow cast opposite to active theme's sun/moon direction.
  // Airborne petals/leaves project their shadow onto the water surface below so object and shadow converge on landing.
  const sunDir = theme && Array.isArray(theme.sunDir) ? theme.sunDir : null;
  const sunY = sunDir ? Math.max(0.35, sunDir[1]) : 0.86;
  const sunAngle = sunDir ? Math.atan2(sunDir[2], sunDir[0]) : Math.atan2(0.46, 0.22);
  const shadowR = f.shadowRadiusPx !== undefined ? f.shadowRadiusPx : r;
  const shadowOffX = sunDir ? (-sunDir[0] / sunY) * shadowR * 0.65 : -shadowR * 0.28;
  const shadowOffY = sunDir ? (-sunDir[2] / sunY) * shadowR * 0.65 : shadowR * 0.42;
  const shadowBaseX = f.shadowX !== undefined ? f.shadowX : f.x;
  const shadowBaseY = f.shadowY !== undefined ? f.shadowY : f.y;
  const shadowAlpha = (f.shadowAlpha !== undefined ? f.shadowAlpha : 0.20) * 0.86;
  const blurPx = 2.4 + altitude * 5.2;

  const qDpr = Math.round(dpr * 2) / 2;
  let drewShadowSprite = false;
  if (canUseSprites) {
    const qShadowR = Math.max(4, Math.round(shadowR / 2) * 2);
    const qBlur = Math.max(1, Math.round(blurPx));
    const shadowSprite = spriteCache.getShadowSprite(kind, petals, qShadowR, qBlur, qDpr, seed);
    if (shadowSprite) {
      const rRatio = shadowR / shadowSprite.baseR;
      ctx.save();
      ctx.globalAlpha = shadowAlpha;
      ctx.translate(shadowBaseX + shadowOffX, shadowBaseY + shadowOffY);
      ctx.scale(scaleX * rRatio, baseAspectY * 0.94 * rRatio);
      ctx.rotate(f.angle);
      ctx.drawImage(
        shadowSprite.canvas,
        -shadowSprite.half,
        -shadowSprite.half,
        shadowSprite.cssSize,
        shadowSprite.cssSize,
      );
      ctx.restore();
      drewShadowSprite = true;
    }
  }

  if (!drewShadowSprite) {
    const hasFilter = typeof ctx.filter === 'string';
    ctx.save();
    if (hasFilter) {
      ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    }
    ctx.translate(shadowBaseX + shadowOffX, shadowBaseY + shadowOffY);
    ctx.scale(scaleX, baseAspectY * 0.94);
    if (hasBezier) {
      ctx.rotate(f.angle);
      renderBlossomShadowVector(ctx, kind, petals, shadowR, shadowAlpha, seed);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, shadowR * 0.95, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(4, 34, 66, ${shadowAlpha.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // Translucent floating blossom, detached petal, or botanical leaf
  const grabScale = f.grabbed ? 1.05 : 1.0;
  const resting = altitude <= 0.001;
  let drewBodySprite = false;
  if (canUseSprites) {
    const qR = Math.max(6, Math.round(r / 2) * 2);
    const relAngle = f.angle - sunAngle;
    const sector = ((Math.round(relAngle / (Math.PI / 6)) % 12) + 12) % 12;
    const themeKey = kind === 'leaf'
      ? `${colors.leafBase}|${colors.leafMid}|${colors.leafEdge}|${Math.round(colors.sunIntensity * 10)}`
      : `${colors.petalColor}|${colors.petalBase}|${colors.petalCore}`;
    const bodySprite = spriteCache.getBodySprite(
      kind,
      petals,
      qR,
      seed,
      resting ? 1 : 0,
      sector,
      colors,
      themeKey,
      qDpr,
    );
    if (bodySprite) {
      const rRatio = (r / bodySprite.baseR) * grabScale;
      ctx.save();
      if (resting) {
        ctx.globalAlpha = 0.94;
      }
      ctx.translate(f.x, f.y - (f.grabbed ? 2 : 0));
      ctx.scale(scaleX * rRatio, scaleY * rRatio);
      ctx.rotate(f.angle);
      ctx.drawImage(
        bodySprite.canvas,
        -bodySprite.half,
        -bodySprite.half,
        bodySprite.cssSize,
        bodySprite.cssSize,
      );
      ctx.restore();
      drewBodySprite = true;
    }
  }

  if (!drewBodySprite) {
    ctx.save();
    if (resting) {
      ctx.globalAlpha = 0.94;
    }
    ctx.translate(f.x, f.y - (f.grabbed ? 2 : 0));
    ctx.scale(scaleX * grabScale, scaleY * grabScale);
    ctx.rotate(f.angle);

    if (hasBezier) {
      renderBlossomBodyVector(
        ctx,
        kind,
        petals,
        r,
        seed,
        altitude,
        f.angle - sunAngle,
        colors,
        hasLinearGrad,
        hasRadialGrad,
      );
    } else {
      // Minimal canvas fallback (used by lightweight unit test mocks without bezier methods)
      for (let i = 0; i < petals; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / petals);
        ctx.beginPath();
        ctx.ellipse(r * 0.52, 0, r * 0.56, r * 0.30, 0, 0, Math.PI * 2);
        ctx.fillStyle = kind === 'leaf' ? colors.leafMid : colors.petalColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }
      if (kind !== 'leaf' && kind !== 'petal') {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = colors.petalCore;
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function traceQuad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

function lerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function drawWaterLantern(ctx, l, theme) {
  const s = l.sizePx || 28;
  const flicker = l.flicker || 1.0;
  const phase = l.phase || 0;
  const aspectY = l.aspectY || 0.78;
  const tiltX = (l.tiltX || 0) * 0.28;
  const tiltZ = (l.tiltZ || 0) * 0.28;
  const nightLevel = theme
    ? Math.max(theme.nightGlow || 0, theme.biolum || 0, Math.max(0, 1.35 - (theme.sunIntensity || 1.5) * 0.5))
    : 0.5;
  const isDark = nightLevel > 0.35;
  const glowStrength = 0.55 + nightLevel * 0.55;

  const hasRadialGrad = typeof ctx.createRadialGradient === 'function';
  const hasLinearGrad = typeof ctx.createLinearGradient === 'function';
  const hasClip = typeof ctx.clip === 'function';
  const hasQuad = typeof ctx.quadraticCurveTo === 'function';
  const hasPoly = typeof ctx.moveTo === 'function' && typeof ctx.lineTo === 'function' && typeof ctx.closePath === 'function';

  const appear = Math.min(1, Math.max(0.05, l.appear !== undefined ? l.appear : 1.0));
  const appearEase = 1 - Math.pow(1 - appear, 3);
  ctx.save();
  if (appearEase < 0.999) {
    ctx.globalAlpha = appearEase;
  }
  const scaleMod = (0.86 + 0.14 * appearEase) * (l.grabbed ? 1.04 : 1.0);
  ctx.translate(l.x, l.y - (l.grabbed ? 3 : 0) - (1 - appearEase) * 6);
  if (Math.abs(scaleMod - 1) > 0.001) ctx.scale(scaleMod, scaleMod);

  // 1. Warm shimmering water reflection & additive ambient bloom around the raft
  if (hasRadialGrad) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const haloR = s * (2.55 + (flicker - 1) * 0.45);
    const halo = ctx.createRadialGradient(0, s * 0.08, s * 0.12, 0, s * 0.08, haloR);
    halo.addColorStop(0, `rgba(255, 178, 62, ${(0.24 * glowStrength * flicker).toFixed(3)})`);
    halo.addColorStop(0.38, `rgba(255, 118, 24, ${(0.12 * glowStrength * flicker).toFixed(3)})`);
    halo.addColorStop(0.75, `rgba(220, 74, 10, ${(0.04 * glowStrength * flicker).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(200, 60, 8, 0)');
    ctx.save();
    ctx.scale(1, aspectY * 0.92);
    ctx.beginPath();
    ctx.arc(0, s * 0.08, haloR, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();
    ctx.restore();

    // Soft rippled inverted reflection streaks beneath the lantern on the water surface
    for (let r = 0; r < 3; r++) {
      const ry = s * (0.68 + r * 0.34);
      const rxOff = Math.sin(phase * 1.9 + r * 2.1 + flicker * 4.0) * s * (0.08 + r * 0.04);
      const rw = s * (0.76 - r * 0.14);
      const rh = s * (0.15 + r * 0.04);
      const rAlpha = (0.20 - r * 0.055) * glowStrength * flicker;
      ctx.save();
      ctx.translate(rxOff, ry);
      ctx.scale(1, rh / Math.max(1, rw));
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
      rg.addColorStop(0, `rgba(255, 206, 98, ${rAlpha.toFixed(3)})`);
      rg.addColorStop(0.55, `rgba(255, 134, 32, ${(rAlpha * 0.42).toFixed(3)})`);
      rg.addColorStop(1, 'rgba(255, 100, 14, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, rw, 0, Math.PI * 2);
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Soft water-contact ambient occlusion & directional cast shadow under the wooden raft
  if (hasRadialGrad) {
    const sunDir = theme && Array.isArray(theme.sunDir) ? theme.sunDir : [0.22, 0.86, 0.46];
    const shOffX = (-sunDir[0] / Math.max(0.4, sunDir[1])) * s * 0.24;
    const shOffY = (-sunDir[2] / Math.max(0.4, sunDir[1])) * s * 0.24 + s * 0.18;
    ctx.save();
    ctx.scale(1, aspectY);
    const shR = s * 1.24;
    const sh = ctx.createRadialGradient(shOffX, shOffY, s * 0.22, shOffX, shOffY, shR);
    sh.addColorStop(0, 'rgba(2, 10, 24, 0.46)');
    sh.addColorStop(0.55, 'rgba(3, 14, 32, 0.22)');
    sh.addColorStop(1, 'rgba(3, 14, 32, 0)');
    ctx.beginPath();
    ctx.arc(shOffX, shOffY, shR, 0, Math.PI * 2);
    ctx.fillStyle = sh;
    ctx.fill();
    ctx.restore();
  }

  if (!hasPoly) {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
    ctx.fill();
    ctx.restore();
    return;
  }

  // Geometry of rotating Toro Nagashi square wooden raft + slightly flared washi paper shade
  const baseR = s * 0.96;
  const raftThick = Math.max(2.5, s * 0.14);
  const shadeBotR = s * 0.64;
  const shadeTopR = s * 0.69;
  const heightPx = s * 0.92;
  const rot = l.angle || 0;

  const corners = LANTERN_CORNERS;
  const raftTop = LANTERN_RAFT_TOP;
  const raftBot = LANTERN_RAFT_BOT;
  for (let k = 0; k < 4; k++) {
    const a = rot + k * (Math.PI * 0.5) + Math.PI * 0.25;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    corners[k].ca = ca;
    corners[k].sa = sa;
    const rx = ca * baseR;
    const ry = sa * baseR * aspectY;
    raftTop[k].x = rx;
    raftTop[k].y = ry;
    raftBot[k].x = rx;
    raftBot[k].y = ry + raftThick;
  }

  // 2. Subtle wet water meniscus highlight around the submerged raft perimeter
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const p = raftBot[i];
    if (i === 0) ctx.moveTo(p.x * 1.05, p.y + 0.8);
    else ctx.lineTo(p.x * 1.05, p.y + 0.8);
  }
  ctx.closePath();
  ctx.strokeStyle = isDark ? 'rgba(255, 206, 134, 0.20)' : 'rgba(230, 248, 255, 0.34)';
  ctx.lineWidth = Math.max(1.0, s * 0.045);
  ctx.stroke();

  // 3. 3D Cedar Raft Side Skirts (front-facing edges with wet dark water-line shading)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const midY = (raftTop[i].y + raftTop[j].y) * 0.5;
    if (midY < -0.5) continue;
    const litSide = (raftTop[j].x - raftTop[i].x) > 0 ? 1 : 0;
    traceQuad(ctx, raftTop[i], raftTop[j], raftBot[j], raftBot[i]);
    if (hasLinearGrad) {
      const sg = ctx.createLinearGradient(0, midY, 0, midY + raftThick);
      if (litSide) {
        sg.addColorStop(0, isDark ? 'rgba(92, 54, 28, 0.98)' : 'rgba(122, 74, 40, 0.98)');
        sg.addColorStop(1, 'rgba(34, 18, 9, 0.98)');
      } else {
        sg.addColorStop(0, isDark ? 'rgba(62, 35, 18, 0.98)' : 'rgba(84, 48, 25, 0.98)');
        sg.addColorStop(1, 'rgba(24, 12, 6, 0.98)');
      }
      ctx.fillStyle = sg;
    } else {
      ctx.fillStyle = 'rgba(54, 30, 15, 0.98)';
    }
    ctx.fill();
  }

  // 4. Top Cedar Raft Deck with Wood Plank Seams, Grain & Warm Candle Bounce Light
  traceQuad(ctx, raftTop[0], raftTop[1], raftTop[2], raftTop[3]);
  if (hasLinearGrad) {
    const dg = ctx.createLinearGradient(raftTop[0].x, raftTop[0].y, raftTop[2].x, raftTop[2].y);
    dg.addColorStop(0, isDark ? 'rgba(96, 58, 30, 0.98)' : 'rgba(136, 86, 48, 0.98)');
    dg.addColorStop(0.5, isDark ? 'rgba(78, 44, 22, 0.98)' : 'rgba(114, 68, 36, 0.98)');
    dg.addColorStop(1, isDark ? 'rgba(56, 31, 15, 0.98)' : 'rgba(88, 50, 26, 0.98)');
    ctx.fillStyle = dg;
  } else {
    ctx.fillStyle = 'rgba(84, 48, 24, 0.98)';
  }
  ctx.fill();

  if (hasClip) {
    ctx.save();
    traceQuad(ctx, raftTop[0], raftTop[1], raftTop[2], raftTop[3]);
    ctx.clip();

    // Cedar slat plank seams & subtle fine wood grain
    ctx.strokeStyle = 'rgba(26, 12, 5, 0.42)';
    ctx.lineWidth = Math.max(0.7, s * 0.03);
    ctx.beginPath();
    for (let ti = 0; ti < RAFT_SEAM_T.length; ti++) {
      const t = RAFT_SEAM_T[ti];
      ctx.moveTo(raftTop[0].x + (raftTop[3].x - raftTop[0].x) * t, raftTop[0].y + (raftTop[3].y - raftTop[0].y) * t);
      ctx.lineTo(raftTop[1].x + (raftTop[2].x - raftTop[1].x) * t, raftTop[1].y + (raftTop[2].y - raftTop[1].y) * t);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 214, 158, 0.10)';
    ctx.lineWidth = Math.max(0.5, s * 0.02);
    ctx.beginPath();
    for (let ti = 0; ti < RAFT_GRAIN_T.length; ti++) {
      const t = RAFT_GRAIN_T[ti];
      ctx.moveTo(raftTop[0].x + (raftTop[3].x - raftTop[0].x) * t, raftTop[0].y + (raftTop[3].y - raftTop[0].y) * t);
      ctx.lineTo(raftTop[1].x + (raftTop[2].x - raftTop[1].x) * t, raftTop[1].y + (raftTop[2].y - raftTop[1].y) * t);
    }
    ctx.stroke();

    // Warm golden candlelight spilled onto the wooden raft deck around the lantern base
    if (hasRadialGrad) {
      const deckGlow = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, baseR * 0.95);
      deckGlow.addColorStop(0, `rgba(255, 198, 92, ${(0.56 * flicker).toFixed(3)})`);
      deckGlow.addColorStop(0.55, `rgba(255, 148, 46, ${(0.24 * flicker).toFixed(3)})`);
      deckGlow.addColorStop(1, 'rgba(255, 120, 24, 0)');
      ctx.fillStyle = deckGlow;
      ctx.fillRect(-baseR * 1.2, -baseR * 1.2, baseR * 2.4, baseR * 2.4);
    }
    ctx.restore();
  }

  // Crisp subtle wood edge bevel around the raft top
  traceQuad(ctx, raftTop[0], raftTop[1], raftTop[2], raftTop[3]);
  ctx.strokeStyle = 'rgba(255, 216, 158, 0.24)';
  ctx.lineWidth = Math.max(0.7, s * 0.032);
  ctx.stroke();

  // 5. Compute 3D paper shade vertices (slight gentle flare toward open top + wave sway)
  const swayX = tiltX * heightPx * 0.32;
  const swayY = tiltZ * heightPx * 0.20;
  const bot = LANTERN_BOT;
  const top = LANTERN_TOP;
  for (let k = 0; k < 4; k++) {
    const c = corners[k];
    bot[k].x = c.ca * shadeBotR;
    bot[k].y = c.sa * shadeBotR * aspectY - s * 0.02;
    top[k].x = c.ca * shadeTopR + swayX;
    top[k].y = c.sa * shadeTopR * aspectY - heightPx + swayY;
  }

  const faces = LANTERN_FACES;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) & 3;
    faces[i].i = i;
    faces[i].j = j;
    faces[i].avgY = (bot[i].y + bot[j].y) * 0.5;
  }
  faces.sort((a, b) => a.avgY - b.avgY);

  function paintWashiPanel(face, isFront) {
    const p0 = bot[face.i];
    const p1 = bot[face.j];
    const t1 = top[face.j];
    const t0 = top[face.i];
    const cx = (p0.x + p1.x + t0.x + t1.x) * 0.25;
    const cy = (p0.y + p1.y + t0.y + t1.y) * 0.25;
    const panelW = Math.hypot(p1.x - p0.x, p1.y - p0.y);

    ctx.save();
    traceQuad(ctx, p0, p1, t1, t0);
    if (hasClip) ctx.clip();

    // Base translucent handmade washi paper tone
    if (hasLinearGrad) {
      const botMid = lerpPt(p0, p1, 0.5);
      const topMid = lerpPt(t0, t1, 0.5);
      const pg = ctx.createLinearGradient(botMid.x, botMid.y, topMid.x, topMid.y);
      if (isFront) {
        pg.addColorStop(0, `rgba(255, 204, 114, ${(0.84 + 0.05 * flicker).toFixed(3)})`);
        pg.addColorStop(0.45, `rgba(255, 228, 162, ${(0.86 + 0.05 * flicker).toFixed(3)})`);
        pg.addColorStop(1, isDark ? 'rgba(246, 224, 184, 0.78)' : 'rgba(255, 248, 232, 0.84)');
      } else {
        // Interior back walls directly lit by the open flame
        pg.addColorStop(0, `rgba(255, 182, 74, ${(0.92).toFixed(3)})`);
        pg.addColorStop(0.55, 'rgba(255, 212, 126, 0.88)');
        pg.addColorStop(1, 'rgba(240, 194, 122, 0.82)');
      }
      ctx.fillStyle = pg;
    } else {
      ctx.fillStyle = isFront ? 'rgba(255, 232, 174, 0.86)' : 'rgba(255, 206, 118, 0.88)';
    }
    ctx.fill();

    // Subsurface scattering candle hotspot glowing through the center-lower paper
    if (hasRadialGrad) {
      const hotX = cx + swayX * 0.15;
      const hotY = cy + heightPx * 0.14;
      const hotR = Math.max(panelW * 0.85, heightPx * 0.75);
      const sss = ctx.createRadialGradient(hotX, hotY, 0, hotX, hotY, hotR);
      if (isFront) {
        sss.addColorStop(0, `rgba(255, 250, 214, ${(0.82 * flicker).toFixed(3)})`);
        sss.addColorStop(0.38, `rgba(255, 204, 96, ${(0.42 * flicker).toFixed(3)})`);
        sss.addColorStop(0.78, 'rgba(220, 124, 38, 0.10)');
        sss.addColorStop(1, 'rgba(110, 56, 20, 0.22)');
      } else {
        sss.addColorStop(0, `rgba(255, 242, 186, ${(0.76 * flicker).toFixed(3)})`);
        sss.addColorStop(0.55, `rgba(255, 174, 62, ${(0.32 * flicker).toFixed(3)})`);
        sss.addColorStop(1, 'rgba(96, 46, 16, 0.26)');
      }
      ctx.fillStyle = sss;
      ctx.fill();
    }

    // Subtle traditional horizontal bamboo kumiko rib + delicate mulberry washi paper fibers
    ctx.strokeStyle = isFront ? 'rgba(138, 78, 34, 0.18)' : 'rgba(110, 58, 22, 0.24)';
    ctx.lineWidth = Math.max(0.5, s * 0.020);
    ctx.beginPath();
    for (let ri = 0; ri < WASHI_RIB_T.length; ri++) {
      const frac = WASHI_RIB_T[ri];
      ctx.moveTo(p0.x + (t0.x - p0.x) * frac, p0.y + (t0.y - p0.y) * frac);
      ctx.lineTo(p1.x + (t1.x - p1.x) * frac, p1.y + (t1.y - p1.y) * frac);
    }
    ctx.stroke();

    ctx.strokeStyle = isFront ? 'rgba(255, 250, 232, 0.14)' : 'rgba(255, 240, 200, 0.10)';
    ctx.lineWidth = Math.max(0.45, s * 0.015);
    ctx.beginPath();
    const b15x = p0.x + (p1.x - p0.x) * 0.15;
    const b15y = p0.y + (p1.y - p0.y) * 0.15;
    const t15x = t0.x + (t1.x - t0.x) * 0.15;
    const t15y = t0.y + (t1.y - t0.y) * 0.15;
    const b85x = p0.x + (p1.x - p0.x) * 0.85;
    const b85y = p0.y + (p1.y - p0.y) * 0.85;
    const t85x = t0.x + (t1.x - t0.x) * 0.85;
    const t85y = t0.y + (t1.y - t0.y) * 0.85;
    for (let fi = 0; fi < WASHI_FIBER_PAIRS.length; fi++) {
      const f0 = WASHI_FIBER_PAIRS[fi][0];
      const f1 = WASHI_FIBER_PAIRS[fi][1];
      ctx.moveTo(b15x + (t15x - b15x) * f0, b15y + (t15y - b15y) * f0);
      ctx.lineTo(b85x + (t85x - b85x) * f1, b85y + (t85y - b85y) * f1);
    }
    ctx.stroke();

    // Soft side-edge wood-post vignette shading along left & right borders of the paper
    if (hasLinearGrad) {
      const vig = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      vig.addColorStop(0, 'rgba(68, 34, 12, 0.34)');
      vig.addColorStop(0.14, 'rgba(68, 34, 12, 0)');
      vig.addColorStop(0.86, 'rgba(68, 34, 12, 0)');
      vig.addColorStop(1, 'rgba(68, 34, 12, 0.34)');
      ctx.fillStyle = vig;
      ctx.fill();
    }

    ctx.restore();
  }

  // 6. Step A: Paint 2 Back Interior Paper Walls
  paintWashiPanel(faces[0], false);
  paintWashiPanel(faces[1], false);

  // 7. Step B: Real Wax Candle Holder, Beeswax Stub & Multi-Layer Teardrop Flame Inside!
  const candleBaseX = swayX * 0.14;
  const candleBaseY = -s * 0.05;
  const candleW = Math.max(2.6, s * 0.18);
  const candleH = Math.max(4.0, s * 0.26);

  // Small dark bronze/ceramic candle dish
  ctx.save();
  ctx.translate(candleBaseX, candleBaseY);
  ctx.scale(1, aspectY);
  ctx.beginPath();
  ctx.arc(0, 0, candleW * 1.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(42, 24, 14, 0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 206, 130, 0.42)';
  ctx.lineWidth = Math.max(0.6, s * 0.025);
  ctx.stroke();
  ctx.restore();

  // Cream beeswax candle cylinder with glowing molten top
  const cTopY = candleBaseY - candleH;
  ctx.beginPath();
  ctx.moveTo(candleBaseX - candleW * 0.5, candleBaseY);
  ctx.lineTo(candleBaseX + candleW * 0.5, candleBaseY);
  ctx.lineTo(candleBaseX + candleW * 0.48, cTopY);
  ctx.lineTo(candleBaseX - candleW * 0.48, cTopY);
  ctx.closePath();
  if (hasLinearGrad) {
    const cg = ctx.createLinearGradient(candleBaseX, candleBaseY, candleBaseX, cTopY);
    cg.addColorStop(0, 'rgba(226, 188, 124, 0.95)');
    cg.addColorStop(0.6, 'rgba(255, 232, 178, 0.98)');
    cg.addColorStop(1, 'rgba(255, 250, 224, 1.0)');
    ctx.fillStyle = cg;
  } else {
    ctx.fillStyle = 'rgba(255, 240, 204, 0.96)';
  }
  ctx.fill();

  // Tiny charred wick
  const wickTopY = cTopY - Math.max(1.5, s * 0.07);
  ctx.beginPath();
  ctx.moveTo(candleBaseX, cTopY);
  ctx.lineTo(candleBaseX + swayX * 0.08, wickTopY);
  ctx.strokeStyle = 'rgba(32, 18, 10, 0.9)';
  ctx.lineWidth = Math.max(0.7, s * 0.028);
  ctx.stroke();

  // Real flickering teardrop candle flame
  const flameH = s * (0.28 + (flicker - 1) * 0.14);
  const flameW = s * 0.11;
  const flameLean = swayX * 0.22 + Math.sin(phase * 3.7 + flicker * 8.0) * s * 0.03;
  const fx = candleBaseX + swayX * 0.08;
  const fy = wickTopY;

  if (hasRadialGrad) {
    const auraR = s * (0.56 + (flicker - 1) * 0.16);
    const aura = ctx.createRadialGradient(fx + flameLean * 0.3, fy - flameH * 0.45, 0, fx, fy - flameH * 0.45, auraR);
    aura.addColorStop(0, `rgba(255, 252, 224, ${(0.95 * flicker).toFixed(3)})`);
    aura.addColorStop(0.32, `rgba(255, 198, 76, ${(0.64 * flicker).toFixed(3)})`);
    aura.addColorStop(0.7, `rgba(255, 124, 24, ${(0.22 * flicker).toFixed(3)})`);
    aura.addColorStop(1, 'rgba(255, 100, 12, 0)');
    ctx.beginPath();
    ctx.arc(fx, fy - flameH * 0.45, auraR, 0, Math.PI * 2);
    ctx.fillStyle = aura;
    ctx.fill();
  }

  if (hasQuad) {
    // Outer warm amber flame teardrop
    ctx.beginPath();
    ctx.moveTo(fx, fy + 1);
    ctx.quadraticCurveTo(fx - flameW * 1.15, fy - flameH * 0.38, fx + flameLean, fy - flameH);
    ctx.quadraticCurveTo(fx + flameW * 1.15, fy - flameH * 0.38, fx, fy + 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 174, 48, 0.96)';
    ctx.fill();

    // Incandescent white-gold inner core
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx - flameW * 0.56, fy - flameH * 0.28, fx + flameLean * 0.55, fy - flameH * 0.66);
    ctx.quadraticCurveTo(fx + flameW * 0.56, fy - flameH * 0.28, fx, fy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 254, 232, 0.98)';
    ctx.fill();

    // Faint blue flame base right at the wick
    ctx.beginPath();
    ctx.arc(fx, fy - flameH * 0.08, Math.max(0.8, flameW * 0.34), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(110, 168, 255, 0.45)';
    ctx.fill();
  }

  // 8. Step C: Paint 2 Front Translucent Washi Panels (diffusing the candle flame behind them)
  paintWashiPanel(faces[2], true);
  paintWashiPanel(faces[3], true);

  // 9. Step D: Physical 3D Cedar Corner Posts & Top/Bottom Wooden Rim Collars
  const postW = Math.max(1.4, s * 0.072);
  // Bottom wooden collar sill
  for (let fi = 0; fi < 4; fi++) {
    const face = faces[fi];
    const p0 = bot[face.i];
    const p1 = bot[face.j];
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = face.avgY >= 0
      ? (isDark ? 'rgba(66, 36, 17, 0.96)' : 'rgba(90, 52, 26, 0.94)')
      : 'rgba(98, 56, 26, 0.72)';
    ctx.lineWidth = postW * 0.95;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // 4 Vertical cedar corner posts (sorted back-to-front by Y, with warm lit inner edge)
  LANTERN_POST_ORDER[0] = 0;
  LANTERN_POST_ORDER[1] = 1;
  LANTERN_POST_ORDER[2] = 2;
  LANTERN_POST_ORDER[3] = 3;
  LANTERN_POST_ORDER.sort((a, b) => bot[a].y - bot[b].y);
  for (let pi = 0; pi < 4; pi++) {
    const idx = LANTERN_POST_ORDER[pi];
    const bPt = bot[idx];
    const tPt = top[idx];
    const isFrontPost = bPt.y >= 0;
    // Outer natural cedar post
    ctx.beginPath();
    ctx.moveTo(bPt.x, bPt.y);
    ctx.lineTo(tPt.x, tPt.y);
    ctx.strokeStyle = isFrontPost
      ? (isDark ? 'rgba(64, 34, 16, 0.90)' : 'rgba(88, 50, 26, 0.88)')
      : (isDark ? 'rgba(88, 48, 22, 0.78)' : 'rgba(108, 64, 32, 0.74)');
    ctx.lineWidth = isFrontPost ? postW * 1.02 : postW * 0.82;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Warm golden candlelight highlight catching the inner wooden bevel
    const insetX = -bPt.x * 0.05;
    ctx.beginPath();
    ctx.moveTo(bPt.x + insetX, bPt.y);
    ctx.lineTo(tPt.x + insetX, tPt.y);
    ctx.strokeStyle = `rgba(255, 198, 112, ${(isFrontPost ? 0.28 : 0.42) * flicker})`;
    ctx.lineWidth = Math.max(0.6, postW * 0.30);
    ctx.stroke();
  }

  // Open top cedar wood collar frame with subtle warm rim highlight
  traceQuad(ctx, top[0], top[1], top[2], top[3]);
  ctx.strokeStyle = isDark ? 'rgba(62, 34, 16, 0.98)' : 'rgba(88, 50, 25, 0.95)';
  ctx.lineWidth = postW * 1.15;
  ctx.lineJoin = 'round';
  ctx.stroke();

  traceQuad(ctx, top[0], top[1], top[2], top[3]);
  ctx.strokeStyle = `rgba(255, 212, 146, ${(0.34 * flicker).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.6, postW * 0.28);
  ctx.stroke();

  ctx.restore();
}

export function createOverlay({
  hudCanvas,
  video,
  toggleButton,
  gestureBadge = null,
  mirrorButton = null,
  sensitivityButton = null,
  createCanvas = defaultCreateOffscreenCanvas,
}) {
  const ctx = hudCanvas ? hudCanvas.getContext('2d') : null;
  const spriteCache = typeof createCanvas === 'function' ? createBlossomSpriteCache(createCanvas) : null;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let cameraActive = false;
  let visible = false;
  let mirrored = true;
  let lastGestureLabel = null;
  let hudWasClean = false;
  const splashPulses = [];

  function syncDom() {
    const showPreview = cameraActive && visible;
    if (video) {
      video.classList.toggle('hidden', !showPreview);
      video.classList.toggle('unmirrored', !mirrored);
    }
    if (toggleButton) {
      toggleButton.classList.toggle('hidden', !cameraActive);
      toggleButton.setAttribute('aria-pressed', String(visible));
      toggleButton.textContent = visible ? 'Hide camera' : 'Show camera';
    }
    if (gestureBadge) {
      gestureBadge.classList.toggle('hidden', !showPreview);
    }
    if (mirrorButton) {
      mirrorButton.classList.toggle('hidden', !showPreview);
      mirrorButton.setAttribute('aria-pressed', String(mirrored));
      mirrorButton.textContent = mirrored ? 'Mirror: On' : 'Mirror: Off';
    }
    if (sensitivityButton) {
      sensitivityButton.classList.toggle('hidden', !showPreview);
    }
  }

  syncDom();

  return {
    resize(width, height, nextDpr = 1) {
      const prevDpr = dpr;
      cssWidth = Math.max(1, width);
      cssHeight = Math.max(1, height);
      dpr = Math.max(1, nextDpr);
      if (spriteCache && Math.abs(dpr - prevDpr) > 0.01) {
        spriteCache.clear();
      }
      hudWasClean = false;
      if (hudCanvas) {
        hudCanvas.width = Math.max(1, Math.floor(cssWidth * dpr));
        hudCanvas.height = Math.max(1, Math.floor(cssHeight * dpr));
      }
    },

    setCameraActive(active) {
      cameraActive = Boolean(active);
      if (cameraActive) visible = true;
      syncDom();
    },

    setVisible(nextVisible) {
      visible = Boolean(nextVisible);
      syncDom();
    },

    toggle() {
      visible = !visible;
      syncDom();
      return visible;
    },

    setMirrored(nextMirrored) {
      mirrored = Boolean(nextMirrored);
      syncDom();
    },

    setGestureLabel(label) {
      if (!gestureBadge) return false;
      const next = label || 'Show hand…';
      if (next === lastGestureLabel) return false;
      lastGestureLabel = next;
      gestureBadge.textContent = next;
      return true;
    },

    setSensitivityLabel(label) {
      if (!sensitivityButton) return;
      sensitivityButton.textContent = label;
    },

    draw(indicators, nowMs, extra = {}) {
      if (!ctx || !hudCanvas) return;

      const floaters = extra && Array.isArray(extra.floaters) ? extra.floaters : [];
      const lanterns = extra && Array.isArray(extra.lanterns) ? extra.lanterns : [];
      const rainVisuals = extra && extra.rain ? extra.rain : null;
      const rainSplashes = rainVisuals && Array.isArray(rainVisuals.splashes) ? rainVisuals.splashes : [];
      const extraSplashes = extra && Array.isArray(extra.splashes) ? extra.splashes : [];
      const allSplashes = extraSplashes.length > 0 ? rainSplashes.concat(extraSplashes) : rainSplashes;
      const rainStreaks = rainVisuals && Array.isArray(rainVisuals.streaks) ? rainVisuals.streaks : [];
      const occluders = extra && Array.isArray(extra.occluders) ? extra.occluders : [];
      const lightning = rainVisuals && rainVisuals.lightning ? rainVisuals.lightning : null;
      const hasLightning = Boolean(lightning && lightning.intensity > 0.01);
      const showCameraOverlay = cameraActive && visible;
      const list = showCameraOverlay && Array.isArray(indicators) ? indicators : [];

      if (!showCameraOverlay) {
        splashPulses.length = 0;
      }

      const hasContent = floaters.length > 0
        || lanterns.length > 0
        || allSplashes.length > 0
        || hasLightning
        || rainStreaks.length > 0
        || list.length > 0
        || splashPulses.length > 0;

      if (!hasContent) {
        if (!hudWasClean) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssWidth, cssHeight);
          hudWasClean = true;
        }
        return;
      }

      hudWasClean = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Draw floating blossoms, water lanterns & surface splashes (rain + touch/hand) clipped behind floating buttons
      if (floaters.length > 0 || lanterns.length > 0 || allSplashes.length > 0) {
        const shouldClip = occluders.length > 0 && typeof ctx.clip === 'function' && typeof ctx.rect === 'function';
        if (shouldClip) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, cssWidth, cssHeight);
          for (const pill of occluders) {
            tracePillPath(ctx, pill);
          }
          ctx.clip('evenodd');
        }
        for (let i = 0; i < floaters.length; i++) {
          drawBlossom(ctx, floaters[i], extra.theme, spriteCache, dpr);
        }
        for (let i = 0; i < lanterns.length; i++) {
          drawWaterLantern(ctx, lanterns[i], extra.theme);
        }
        if (allSplashes.length > 0) {
          drawRainSplashes(ctx, allSplashes, cssWidth, cssHeight, extra.theme);
        }
        if (shouldClip) {
          ctx.restore();
        }
      }

      // Draw falling raindrops in the air above the pool + periodic lightning sky glow
      if (hasLightning) {
        drawLightningFlash(ctx, lightning, cssWidth, cssHeight);
      }
      if (rainStreaks.length > 0) {
        drawRainStreaks(ctx, rainStreaks, cssWidth, cssHeight, extra.theme, hasLightning ? lightning.intensity : 0);
      }

      if (!showCameraOverlay) {
        return;
      }
      for (const ind of list) {
        if (ind.kind === 'splash' || ind.kind === 'clap') {
          splashPulses.push({
            screenX: ind.screenX,
            screenY: ind.screenY,
            radiusPx: ind.radiusPx || (ind.kind === 'clap' ? 38 : 28),
            kind: ind.kind,
            duration: ind.kind === 'clap' ? CLAP_DURATION_MS : SPLASH_DURATION_MS,
            startedAt: nowMs,
          });
        }
      }

      // Draw active finger and palm indicators
      for (const ind of list) {
        if (ind.kind === 'splash' || ind.kind === 'clap') continue;
        const { x, y } = indicatorScreenPoint(ind, cssWidth, cssHeight);
        const r = ind.radiusPx || (ind.kind === 'palm' ? 28 : 11);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (ind.kind === 'palm') {
          ctx.fillStyle = 'rgba(130, 228, 255, 0.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(200, 245, 255, 0.72)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(180, 240, 255, 0.22)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(235, 252, 255, 0.88)';
          ctx.lineWidth = 1.75;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw expanding splash & clap shockwave pulses
      for (let i = splashPulses.length - 1; i >= 0; i--) {
        const pulse = splashPulses[i];
        const age = nowMs - pulse.startedAt;
        if (age < 0 || age >= pulse.duration) {
          splashPulses.splice(i, 1);
          continue;
        }
        const t = age / pulse.duration;
        const { x, y } = indicatorScreenPoint(pulse, cssWidth, cssHeight);
        const r = pulse.radiusPx * (1 + t * (pulse.kind === 'clap' ? 3.1 : 1.9));
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(225, 252, 255, ${(1 - t) * 0.9})`;
        ctx.lineWidth = (pulse.kind === 'clap' ? 3.2 : 2.5) * (1 - t * 0.5);
        ctx.stroke();
        if (pulse.kind === 'clap') {
          ctx.beginPath();
          ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(140, 240, 255, ${(1 - t) * 0.75})`;
          ctx.lineWidth = 2.0 * (1 - t * 0.5);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  };
}
