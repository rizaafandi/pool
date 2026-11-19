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

function drawRainSplashes(ctx, splashes, width, height, theme) {
  const rainRgb = (theme && theme.rainRgb) || [224, 246, 255];
  const tipRgb = (theme && theme.rainTipRgb) || [255, 255, 255];

  for (const s of splashes) {
    const t = Math.min(1, Math.max(0, s.progress));
    const fade = Math.pow(1 - t, 1.25);
    const x = s.screenX * width;
    const y = s.screenY * height;
    const scale = s.scale || 1;

    // Perspective-foreshortened surface splash ring (for raindrop impacts; skipped on swipe sprays)
    if (s.showRing !== false) {
      const ringR = (4.0 + t * 24) * scale;
      const ringAspect = s.ringAspect || 0.88;
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

    // Airborne glistening crown droplets arcing upward from impact
    const beads = Array.isArray(s.beads) ? s.beads : [];
    const age = s.age || 0;
    const beadAlpha = Math.max(0, 1 - t * 1.25);
    if (beadAlpha > 0.02 && beads.length > 0) {
      ctx.save();
      for (const b of beads) {
        let bx;
        let by;
        if (b.screenX !== undefined && b.screenY !== undefined) {
          bx = b.screenX * width;
          by = b.screenY * height;
        } else {
          bx = x + b.vx * age;
          by = y + b.vy * age + 135 * age * age;
          if (by > y + 6) continue;
        }
        const br = b.size * 1.2 * (1 - t * 0.4);
        ctx.beginPath();
        ctx.arc(bx, by + 1, br + 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(4, 22, 58, ${(beadAlpha * 0.25).toFixed(3)})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = rgbaFromRgb(tipRgb, beadAlpha * 0.94);
        ctx.fill();
      }
      ctx.restore();
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

function drawRainStreaks(ctx, streaks, width, height, theme, lightningIntensity = 0) {
  if (typeof ctx.moveTo !== 'function' || typeof ctx.lineTo !== 'function') return;
  const rainRgb = (theme && theme.rainRgb) || [224, 246, 255];
  const tipRgb = (theme && theme.rainTipRgb) || [255, 255, 255];
  const hasGradient = typeof ctx.createLinearGradient === 'function';
  const flashBoost = 1 + Math.min(1, Math.max(0, lightningIntensity)) * 0.65;

  ctx.save();
  ctx.lineCap = 'round';
  for (const d of streaks) {
    const x2 = d.x * width;
    const y2 = d.y * height;
    const x1 = x2 - d.dx * width;
    const y1 = y2 - d.dy * height;
    const alpha = Math.min(1, Math.max(0, d.alpha * flashBoost));
    if (alpha < 0.01) continue;
    const lw = d.width || 1.4;

    // Subtle dark water-refraction edge behind streak for clear visibility over sunlit water
    ctx.beginPath();
    ctx.moveTo(x1 + 0.8, y1 + 0.8);
    ctx.lineTo(x2 + 0.8, y2 + 0.8);
    ctx.strokeStyle = `rgba(4, 22, 58, ${(alpha * 0.22).toFixed(3)})`;
    ctx.lineWidth = lw + 1.0;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (hasGradient) {
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, rgbaFromRgb(rainRgb, 0));
      grad.addColorStop(0.55, rgbaFromRgb(rainRgb, alpha * 0.68));
      grad.addColorStop(1, rgbaFromRgb(tipRgb, alpha * 0.98));
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = rgbaFromRgb(rainRgb, alpha * 0.85);
    }
    ctx.lineWidth = lw;
    ctx.stroke();

    // Bright glistening teardrop tip on primary raindrops
    if (d.isPrimary) {
      ctx.beginPath();
      ctx.arc(x2, y2, Math.max(1.5, lw * 0.95), 0, Math.PI * 2);
      ctx.fillStyle = rgbaFromRgb(tipRgb, alpha * 0.95);
      ctx.fill();
    }
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

function traceLeafPath(ctx, halfLen, halfWidth) {
  ctx.beginPath();
  ctx.moveTo(-halfLen, 0);
  ctx.bezierCurveTo(
    -halfLen * 0.55, -halfWidth * 1.05,
    halfLen * 0.38, -halfWidth * 0.96,
    halfLen, 0,
  );
  ctx.bezierCurveTo(
    halfLen * 0.38, halfWidth * 0.96,
    -halfLen * 0.55, halfWidth * 1.05,
    -halfLen, 0,
  );
  ctx.closePath();
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

function drawBlossom(ctx, f, theme) {
  const colors = {
    petalBase: (theme && theme.petalBase) || 'rgba(255, 224, 150, 0.94)',
    petalMid: (theme && theme.petalMid) || 'rgba(255, 240, 245, 0.96)',
    petalColor: (theme && theme.petalColor) || 'rgba(255, 248, 251, 0.95)',
    petalEdge: (theme && theme.petalEdge) || 'rgba(255, 204, 220, 0.88)',
    petalVein: (theme && theme.petalVein) || 'rgba(226, 154, 176, 0.25)',
    petalCore: (theme && theme.petalCore) || 'rgba(248, 182, 58, 0.96)',
    petalStamen: (theme && theme.petalStamen) || 'rgba(255, 226, 124, 0.95)',
    leafBase: (theme && theme.leafBase) || 'rgba(66, 134, 72, 0.95)',
    leafMid: (theme && theme.leafMid) || 'rgba(92, 166, 86, 0.94)',
    leafEdge: (theme && theme.leafEdge) || 'rgba(134, 194, 102, 0.90)',
    leafVein: (theme && theme.leafVein) || 'rgba(196, 232, 152, 0.36)',
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
  const hasFilter = typeof ctx.filter === 'string';

  ctx.save();
  if (hasFilter) {
    const blurPx = 2.4 + altitude * 5.2;
    ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
  }
  ctx.translate(shadowBaseX + shadowOffX, shadowBaseY + shadowOffY);
  ctx.scale(scaleX, baseAspectY * 0.94);
  if (hasBezier) {
    ctx.rotate(f.angle);
    for (let layer = 0; layer < 2; layer++) {
      const layerScale = layer === 0 ? 1.14 : 0.94;
      const layerAlpha = shadowAlpha * (layer === 0 ? 0.36 : 0.62);
      ctx.fillStyle = `rgba(4, 34, 66, ${layerAlpha.toFixed(3)})`;
      if (kind === 'leaf') {
        traceLeafPath(ctx, shadowR * 1.05 * layerScale, shadowR * 0.46 * layerScale);
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
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, shadowR * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(4, 34, 66, ${shadowAlpha.toFixed(3)})`;
    ctx.fill();
  }
  ctx.restore();

  // Translucent floating blossom, detached petal, or botanical leaf
  ctx.save();
  if (altitude <= 0.001) {
    ctx.globalAlpha = 0.94;
  }
  ctx.translate(f.x, f.y);
  ctx.scale(scaleX, scaleY);
  ctx.rotate(f.angle);

  if (hasBezier) {
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
      const halfLen = r * (1.08 + Math.sin(seed * 5.7) * 0.08);
      const halfWidth = r * (0.46 + Math.cos(seed * 4.3) * 0.05);
      const lit = Math.cos(f.angle - sunAngle);

      // Tiny petiole stem at base of leaf
      ctx.strokeStyle = colors.leafBase;
      ctx.lineWidth = Math.max(0.8, r * 0.055);
      ctx.beginPath();
      ctx.moveTo(-halfLen * 1.24, 0);
      ctx.quadraticCurveTo(-halfLen * 1.10, halfWidth * 0.08, -halfLen * 0.96, 0);
      ctx.stroke();

      // Leaf blade gradient from base to sunlit tip
      traceLeafPath(ctx, halfLen, halfWidth);
      if (hasLinearGrad) {
        const grad = ctx.createLinearGradient(-halfLen, 0, halfLen, 0);
        grad.addColorStop(0, colors.leafBase);
        grad.addColorStop(0.45, colors.leafMid);
        grad.addColorStop(1, colors.leafEdge);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = colors.leafMid;
      }
      ctx.fill();

      // Subtle two-half fold shading across the central midrib
      if (hasLinearGrad) {
        const foldGrad = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
        const topLight = 0.07 + Math.max(0, lit) * 0.14;
        const botShade = 0.08 + Math.max(0, -lit) * 0.10;
        foldGrad.addColorStop(0, `rgba(255, 255, 240, ${topLight.toFixed(3)})`);
        foldGrad.addColorStop(0.49, 'rgba(255, 255, 255, 0)');
        foldGrad.addColorStop(0.51, `rgba(8, 28, 22, ${(botShade * 0.5).toFixed(3)})`);
        foldGrad.addColorStop(1, `rgba(6, 22, 18, ${botShade.toFixed(3)})`);
        ctx.fillStyle = foldGrad;
        ctx.fill();
      }

      // Central midrib and angled lateral leaf veins
      ctx.strokeStyle = colors.leafVein;
      ctx.lineWidth = Math.max(0.65, r * 0.036);
      ctx.beginPath();
      ctx.moveTo(-halfLen * 0.92, 0);
      ctx.lineTo(halfLen * 0.88, 0);
      ctx.stroke();

      ctx.lineWidth = Math.max(0.45, r * 0.022);
      ctx.beginPath();
      const veinStops = [-0.46, -0.10, 0.24, 0.54];
      for (const s of veinStops) {
        const vx = halfLen * s;
        const reach = (1 - Math.abs(s) * 0.85) * halfWidth * 0.78;
        ctx.moveTo(vx, 0);
        ctx.quadraticCurveTo(vx + halfLen * 0.14, -reach * 0.55, vx + halfLen * 0.24, -reach);
        ctx.moveTo(vx, 0);
        ctx.quadraticCurveTo(vx + halfLen * 0.14, reach * 0.55, vx + halfLen * 0.24, reach);
      }
      ctx.stroke();

      // Delicate sunlit leaf rim
      traceLeafPath(ctx, halfLen, halfWidth);
      const rimAlpha = 0.16 + Math.max(0, lit) * 0.22 + (altitude <= 0.001 ? 0.06 : 0);
      ctx.strokeStyle = `rgba(235, 255, 230, ${rimAlpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(0.5, r * 0.028);
      ctx.stroke();
    } else if (kind === 'petal') {
      // Single detached blossom petal centered around its own body
      const len = r * (1.44 + Math.cos(seed * 5.1) * 0.08);
      const halfWidth = r * (0.56 + Math.sin(seed * 7.3) * 0.04);
      const notch = r * (0.11 + (Math.sin(seed * 3.9) * 0.5 + 0.5) * 0.04);
      const lit = Math.cos(f.angle - sunAngle);

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
        const lit = Math.cos(f.angle + petalAngle - sunAngle);

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

export function createOverlay({
  hudCanvas,
  video,
  toggleButton,
  gestureBadge = null,
  mirrorButton = null,
  sensitivityButton = null,
}) {
  const ctx = hudCanvas ? hudCanvas.getContext('2d') : null;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let cameraActive = false;
  let visible = false;
  let mirrored = true;
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
      cssWidth = Math.max(1, width);
      cssHeight = Math.max(1, height);
      dpr = Math.max(1, nextDpr);
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
      if (!gestureBadge) return;
      gestureBadge.textContent = label || 'Show hand…';
    },

    setSensitivityLabel(label) {
      if (!sensitivityButton) return;
      sensitivityButton.textContent = label;
    },

    draw(indicators, nowMs, extra = {}) {
      if (!ctx || !hudCanvas) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Draw floating blossoms & surface splashes (rain + touch/hand) clipped behind floating buttons
      const floaters = extra && Array.isArray(extra.floaters) ? extra.floaters : [];
      const rainVisuals = extra && extra.rain ? extra.rain : null;
      const rainSplashes = rainVisuals && Array.isArray(rainVisuals.splashes) ? rainVisuals.splashes : [];
      const extraSplashes = extra && Array.isArray(extra.splashes) ? extra.splashes : [];
      const allSplashes = extraSplashes.length > 0 ? rainSplashes.concat(extraSplashes) : rainSplashes;
      const rainStreaks = rainVisuals && Array.isArray(rainVisuals.streaks) ? rainVisuals.streaks : [];
      const occluders = extra && Array.isArray(extra.occluders) ? extra.occluders : [];
      if (floaters.length > 0 || allSplashes.length > 0) {
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
        for (const f of floaters) {
          drawBlossom(ctx, f, extra.theme);
        }
        if (allSplashes.length > 0) {
          drawRainSplashes(ctx, allSplashes, cssWidth, cssHeight, extra.theme);
        }
        if (shouldClip) {
          ctx.restore();
        }
      }

      // Draw falling raindrops in the air above the pool + periodic lightning sky glow
      const lightning = rainVisuals && rainVisuals.lightning ? rainVisuals.lightning : null;
      if (lightning && lightning.intensity > 0.01) {
        drawLightningFlash(ctx, lightning, cssWidth, cssHeight);
      }
      if (rainStreaks.length > 0) {
        drawRainStreaks(ctx, rainStreaks, cssWidth, cssHeight, extra.theme, lightning ? lightning.intensity : 0);
      }

      if (!cameraActive || !visible) {
        splashPulses.length = 0;
        return;
      }

      const list = Array.isArray(indicators) ? indicators : [];
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
