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

function drawBlossom(ctx, f, theme) {
  const petalColor = (theme && theme.petalColor) || 'rgba(255, 245, 250, 0.92)';
  const petalCore = (theme && theme.petalCore) || 'rgba(255, 210, 110, 0.95)';
  const petals = f.petals || 5;
  const r = f.radiusPx;
  const baseAspectY = f.aspectY || 0.85;
  const tiltX = f.tiltX || 0;
  const tiltZ = f.tiltZ || 0;
  const scaleX = Math.max(0.75, Math.min(1.12, 1.0 - Math.abs(tiltX) * 0.35));
  const scaleY = Math.max(0.52, Math.min(1.0, baseAspectY * (1.0 - tiltZ * 0.25)));

  // Soft underwater shadow cast opposite to active theme's sun/moon direction
  const sunDir = theme && Array.isArray(theme.sunDir) ? theme.sunDir : null;
  const sunY = sunDir ? Math.max(0.35, sunDir[1]) : 0.86;
  const shadowOffX = sunDir ? (-sunDir[0] / sunY) * r * 0.65 : -r * 0.28;
  const shadowOffY = sunDir ? (-sunDir[2] / sunY) * r * 0.65 : r * 0.42;

  ctx.save();
  ctx.translate(f.x + shadowOffX, f.y + shadowOffY);
  ctx.scale(scaleX, scaleY * 0.94);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(2, 16, 54, 0.22)';
  ctx.fill();
  ctx.restore();

  // Translucent floating petals tilted by pool perspective and local wave normal
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(scaleX, scaleY);
  ctx.rotate(f.angle);
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / petals);
    ctx.beginPath();
    ctx.ellipse(r * 0.52, 0, r * 0.56, r * 0.30, 0, 0, Math.PI * 2);
    ctx.fillStyle = petalColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  // Warm blossom center
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = petalCore;
  ctx.fill();
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
