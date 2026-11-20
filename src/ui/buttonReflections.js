export const MAX_UI_PILLS = 16;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function toDisplayChannel(linear) {
  return Math.round(Math.pow(clamp(linear, 0, 1), 1 / 2.15) * 255);
}

function rgbCss(vec3, alpha = 1) {
  const r = toDisplayChannel(vec3[0]);
  const g = toDisplayChannel(vec3[1]);
  const b = toDisplayChannel(vec3[2]);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function themeCssVars(theme) {
  if (!theme) return {};
  const bright = theme.skyBright || [0.38, 0.9, 1.0];
  const caustic = theme.causticTint || [0.24, 0.82, 1.0];
  const sun = theme.sunColor || [1.0, 0.97, 0.88];
  const mixHighlight = [
    bright[0] * 0.45 + sun[0] * 0.55,
    bright[1] * 0.45 + sun[1] * 0.55,
    bright[2] * 0.45 + sun[2] * 0.55,
  ];
  return {
    '--ui-text': rgbCss([
      0.86 + sun[0] * 0.14,
      0.88 + sun[1] * 0.12,
      0.90 + sun[2] * 0.10,
    ], 0.94),
    '--ui-text-active': '#ffffff',
    '--ui-divider': rgbCss(caustic, 0.38),
    '--ui-focus': rgbCss(mixHighlight, 0.88),
    '--ui-cam-border': rgbCss(caustic, 0.52),
  };
}

function isHiddenElement(el) {
  if (!el) return true;
  if (el.classList && el.classList.contains('hidden')) return true;
  if (typeof el.closest === 'function' && el.closest('.hidden')) return true;
  return false;
}

function classifyKind(el) {
  if (!el) return 0;
  if (el.id === 'start') return 1;
  if (el.id === 'gesture-badge') return 2;
  return 0;
}

export function createButtonReflectionTracker() {
  const rects = new Float32Array(MAX_UI_PILLS * 4);
  const meta = new Float32Array(MAX_UI_PILLS * 4);
  const smoothState = new WeakMap();
  let layoutCache = new WeakMap();

  function readLayout(el) {
    let cached = layoutCache.get(el);
    if (cached !== undefined) return cached;

    const r = el.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) {
      return null;
    }

    const maxCssRadius = Math.min(r.width, r.height) * 0.5;
    const customRadius = el.dataset && el.dataset.glassRadius !== undefined
      ? Number.parseFloat(el.dataset.glassRadius)
      : NaN;
    const cssRadius = Number.isFinite(customRadius) && customRadius >= 0
      ? Math.min(customRadius, maxCssRadius)
      : maxCssRadius;

    cached = {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      cssRadius,
      kind: classifyKind(el),
    };
    layoutCache.set(el, cached);
    return cached;
  }

  return {
    invalidate() {
      layoutCache = new WeakMap();
    },

    collect(elements, canvasRect, canvasWidth, canvasHeight, dt = 1 / 60) {
      const cssPills = [];
      if (!elements || !canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
        return { count: 0, rects, meta, cssPills };
      }

      const scaleX = canvasWidth / canvasRect.width;
      const scaleY = canvasHeight / canvasRect.height;
      const minScale = Math.min(scaleX, scaleY);
      const blend = 1 - Math.exp(-Math.max(0, dt) * 14);
      let count = 0;

      for (const el of elements) {
        if (count >= MAX_UI_PILLS) break;
        if (isHiddenElement(el) || typeof el.getBoundingClientRect !== 'function') {
          if (el) layoutCache.delete(el);
          continue;
        }

        const r = readLayout(el);
        if (!r) continue;

        const localX = r.left - canvasRect.left;
        const localY = r.top - canvasRect.top;
        if (
          localX + r.width < 0
          || localY + r.height < 0
          || localX > canvasRect.width
          || localY > canvasRect.height
        ) {
          continue;
        }

        cssPills.push({
          x: localX,
          y: localY,
          width: r.width,
          height: r.height,
          radius: r.cssRadius,
        });

        const cx = (localX + r.width * 0.5) * scaleX;
        const cy = canvasHeight - (localY + r.height * 0.5) * scaleY;
        const halfW = r.width * 0.5 * scaleX;
        const halfH = r.height * 0.5 * scaleY;
        const radius = Math.min(r.cssRadius * minScale, halfW, halfH);

        const targetActive = el.classList && el.classList.contains('active') ? 1 : 0;
        let targetHover = 0;
        if (typeof el.matches === 'function') {
          try {
            targetHover = el.matches(':hover') ? 1 : 0;
          } catch {
            targetHover = 0;
          }
        }

        const prev = smoothState.get(el);
        let active;
        let hover;
        if (prev) {
          active = prev.active + (targetActive - prev.active) * blend;
          hover = prev.hover + (targetHover - prev.hover) * blend;
          prev.active = active;
          prev.hover = hover;
        } else {
          active = targetActive;
          hover = targetHover;
          smoothState.set(el, { active, hover });
        }

        const base = count * 4;
        rects[base] = cx;
        rects[base + 1] = cy;
        rects[base + 2] = halfW;
        rects[base + 3] = halfH;

        meta[base] = active;
        meta[base + 1] = hover;
        meta[base + 2] = radius;
        meta[base + 3] = r.kind;

        count += 1;
      }

      return { count, rects, meta, cssPills };
    },
  };
}
