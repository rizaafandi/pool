function getDefaultAudioCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createWaterAudio({ AudioContextCtor = getDefaultAudioCtor() } = {}) {
  let ctx = null;
  let noiseBuffer = null;
  let rainNoiseBuffer = null;
  let thunderNoiseBuffer = null;
  let rainSource = null;
  let rainGain = null;
  let sweepSource = null;
  let sweepFilter = null;
  let sweepGain = null;
  let rainActive = false;
  let muted = false;
  let lastDropAt = -Infinity;
  let lastRainDropAt = -Infinity;
  let lastSweepAt = -Infinity;
  let lastSplashAt = -Infinity;
  let lastClapAt = -Infinity;
  let lastThunderAt = -Infinity;

  function ensureNoiseBuffers(c) {
    const rate = c.sampleRate || 44100;
    if (!noiseBuffer && c.createBuffer) {
      const length = Math.max(1, Math.floor(rate * 0.6));
      const buffer = c.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.12) * 0.6;
      }
      noiseBuffer = buffer;
    }

    if (!rainNoiseBuffer && c.createBuffer) {
      const length = Math.max(1, Math.floor(rate * 2.4));
      const buffer = c.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let patterEnv = 0;
      const fadeSamples = Math.min(Math.floor(rate * 0.04), Math.floor(length * 0.1));
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.996 * b0 + white * 0.026;
        b1 = 0.982 * b1 + white * 0.034;
        b2 = 0.935 * b2 + white * 0.052;
        // Occasional micro rain-patter bursts blended into steady warm pink rain noise
        if (Math.random() < 0.0018) {
          patterEnv = Math.min(1, patterEnv + 0.45 + Math.random() * 0.55);
        }
        patterEnv *= 0.994;
        const sample = (b0 + b1 + b2 + white * (0.14 + patterEnv * 0.24)) * 0.48;
        data[i] = sample;
      }
      // Crossfade loop seam so looping rainfall is completely click-free
      for (let i = 0; i < fadeSamples; i++) {
        const w = i / Math.max(1, fadeSamples);
        data[i] = data[i] * w + data[length - fadeSamples + i] * (1 - w);
      }
      rainNoiseBuffer = buffer;
    }

    if (!thunderNoiseBuffer && c.createBuffer) {
      const length = Math.max(1, Math.floor(rate * 3.6));
      const buffer = c.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      let pink = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + white * 0.045) * 0.992;
        pink = pink * 0.96 + white * 0.14;
        data[i] = Math.max(-1, Math.min(1, brown * 1.9 + pink * 0.45));
      }
      thunderNoiseBuffer = buffer;
    }
  }

  function ensureContext() {
    if (muted || !AudioContextCtor) return null;
    if (!ctx) {
      ctx = new AudioContextCtor();
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    ensureNoiseBuffers(ctx);
    return ctx;
  }

  function syncRainBed() {
    const shouldPlay = rainActive && !muted;
    if (shouldPlay) {
      const c = ensureContext();
      if (!c || !rainNoiseBuffer || !c.createBufferSource || !c.createBiquadFilter || !c.createGain) return;
      const t = c.currentTime;
      if (!rainSource) {
        const src = c.createBufferSource();
        src.buffer = rainNoiseBuffer;
        src.loop = true;

        const highpass = c.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(340, t);
        highpass.Q.setValueAtTime(0.7, t);

        const lowpass = c.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(2700, t);
        lowpass.Q.setValueAtTime(0.65, t);

        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t);

        src.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(c.destination);
        src.start(t);

        rainSource = src;
        rainGain = gain;
      }
      if (rainGain) {
        if (typeof rainGain.gain.cancelScheduledValues === 'function') {
          rainGain.gain.cancelScheduledValues(t);
        }
        const cur = Math.max(0.0001, rainGain.gain.value || 0.0001);
        rainGain.gain.setValueAtTime(cur, t);
        rainGain.gain.linearRampToValueAtTime(0.075, t + 0.55);
      }
    } else if (rainGain && ctx) {
      const t = ctx.currentTime;
      if (typeof rainGain.gain.cancelScheduledValues === 'function') {
        rainGain.gain.cancelScheduledValues(t);
      }
      const cur = Math.max(0.0001, rainGain.gain.value || 0.075);
      rainGain.gain.setValueAtTime(cur, t);
      rainGain.gain.linearRampToValueAtTime(0.0001, t + 0.35);
    }
  }

  function bubbleChirp(c, startTime, baseFreq, endFreq, peakGain, duration) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  function filteredNoise(c, startTime, centerFreq, q, peakGain, duration) {
    if (!noiseBuffer || !c.createBufferSource) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, centerFreq * 0.55), startTime + duration);
    filter.Q.setValueAtTime(q, startTime);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.025, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }

  return {
    unlock() {
      ensureContext();
      if (rainActive) syncRainBed();
    },

    isMuted() {
      return muted;
    },

    setMuted(nextMuted) {
      muted = Boolean(nextMuted);
      syncRainBed();
      if (muted && sweepGain && ctx) {
        const t = ctx.currentTime;
        if (typeof sweepGain.gain.cancelScheduledValues === 'function') {
          sweepGain.gain.cancelScheduledValues(t);
        }
        sweepGain.gain.setValueAtTime(Math.max(0.0001, sweepGain.gain.value || 0.0001), t);
        sweepGain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      }
    },

    toggleMute() {
      muted = !muted;
      if (!muted) ensureContext();
      syncRainBed();
      if (muted && sweepGain && ctx) {
        const t = ctx.currentTime;
        if (typeof sweepGain.gain.cancelScheduledValues === 'function') {
          sweepGain.gain.cancelScheduledValues(t);
        }
        sweepGain.gain.setValueAtTime(Math.max(0.0001, sweepGain.gain.value || 0.0001), t);
        sweepGain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      }
      return muted;
    },

    setRainActive(active) {
      rainActive = Boolean(active);
      syncRainBed();
    },

    isRainActive() {
      return rainActive;
    },

    playDrop(intensity = 0.6, nowMs = performance.now()) {
      if (muted || nowMs - lastDropAt < 55) return;
      const c = ensureContext();
      if (!c) return;
      lastDropAt = nowMs;
      const t = c.currentTime;
      const clamped = Math.min(1.5, Math.max(0.15, intensity));
      const base = 290 + Math.random() * 190;
      bubbleChirp(c, t, base, base * (1.75 + Math.random() * 0.35), 0.055 * clamped, 0.068);
    },

    playRainDrop(intensity = 0.7, nowMs = performance.now()) {
      if (muted || nowMs - lastRainDropAt < 65) return;
      const c = ensureContext();
      if (!c) return;
      lastRainDropAt = nowMs;
      const t = c.currentTime;
      const amp = Math.min(1.4, Math.max(0.25, intensity));
      // Crystalline high-pitched water-droplet plink (Minnaert bubble resonance)
      const base = 520 + Math.random() * 680;
      const dur = 0.042 + Math.random() * 0.024;
      bubbleChirp(c, t, base, base * (1.55 + Math.random() * 0.4), 0.044 * amp, dur);
      // Delicate high-bandpass impact tick on water surface
      filteredNoise(c, t, 1850 + Math.random() * 1250, 2.4, 0.026 * amp, 0.036);
    },

    playSweep(speed = 0.8, nowMs = performance.now()) {
      if (muted || nowMs - lastSweepAt < 35) return;
      const c = ensureContext();
      if (!c || !rainNoiseBuffer || !c.createBufferSource || !c.createBiquadFilter || !c.createGain) return;
      lastSweepAt = nowMs;
      const t = c.currentTime;
      const clamped = Math.min(2.2, Math.max(0.15, speed));

      if (!sweepSource) {
        const src = c.createBufferSource();
        src.buffer = rainNoiseBuffer;
        src.loop = true;

        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(420, t);
        filter.Q.setValueAtTime(0.85, t);

        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);
        src.start(t);

        sweepSource = src;
        sweepFilter = filter;
        sweepGain = gain;
      }

      const targetFreq = 360 + clamped * 340;
      const targetGain = Math.min(0.11, 0.022 + clamped * 0.042);

      if (typeof sweepFilter.frequency.cancelScheduledValues === 'function') {
        sweepFilter.frequency.cancelScheduledValues(t);
      }
      sweepFilter.frequency.setValueAtTime(
        Math.max(120, sweepFilter.frequency.value || targetFreq),
        t,
      );
      sweepFilter.frequency.linearRampToValueAtTime(targetFreq, t + 0.08);
      sweepFilter.frequency.linearRampToValueAtTime(280, t + 0.34);

      if (typeof sweepGain.gain.cancelScheduledValues === 'function') {
        sweepGain.gain.cancelScheduledValues(t);
      }
      const curGain = Math.max(0.0001, sweepGain.gain.value || 0.0001);
      sweepGain.gain.setValueAtTime(curGain, t);
      sweepGain.gain.linearRampToValueAtTime(targetGain, t + 0.075);
      sweepGain.gain.linearRampToValueAtTime(0.0001, t + 0.32);
    },

    playSplash(intensity = 1.0, nowMs = performance.now()) {
      if (muted || nowMs - lastSplashAt < 180) return;
      const c = ensureContext();
      if (!c) return;
      lastSplashAt = nowMs;
      const t = c.currentTime;
      const amp = Math.min(1.5, Math.max(0.4, intensity));
      bubbleChirp(c, t, 145, 58, 0.12 * amp, 0.14);
      filteredNoise(c, t, 1150, 1.1, 0.14 * amp, 0.28);
      bubbleChirp(c, t + 0.03, 360, 740, 0.05 * amp, 0.075);
      bubbleChirp(c, t + 0.065, 480, 920, 0.04 * amp, 0.065);
    },

    playClap(nowMs = performance.now()) {
      if (muted || nowMs - lastClapAt < 250) return;
      const c = ensureContext();
      if (!c) return;
      lastClapAt = nowMs;
      const t = c.currentTime;
      bubbleChirp(c, t, 120, 42, 0.18, 0.22);
      filteredNoise(c, t, 1450, 0.9, 0.19, 0.36);
      bubbleChirp(c, t + 0.035, 310, 680, 0.06, 0.08);
      bubbleChirp(c, t + 0.075, 440, 890, 0.055, 0.075);
      bubbleChirp(c, t + 0.12, 560, 1080, 0.04, 0.07);
    },

    playThunder(intensity = 0.85, nowMs = performance.now()) {
      if (muted || nowMs - lastThunderAt < 1500) return;
      const c = ensureContext();
      if (!c) return;
      lastThunderAt = nowMs;
      const t = c.currentTime;
      const amp = Math.min(1.2, Math.max(0.35, intensity));

      // 1. Sub-bass pressure boom
      if (c.createOscillator && c.createGain) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(68 + Math.random() * 14, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 1.35);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.11 * amp, t + 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(t);
        osc.stop(t + 1.5);
      }

      // 2. Rolling lowpass thunder rumble with secondary echo swell
      if (thunderNoiseBuffer && c.createBufferSource && c.createBiquadFilter && c.createGain) {
        const dur = 2.6 + Math.random() * 0.9;
        const rumble = c.createBufferSource();
        rumble.buffer = thunderNoiseBuffer;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(220 + amp * 120, t);
        lp.frequency.exponentialRampToValueAtTime(52, t + dur);
        lp.Q.setValueAtTime(0.85, t);
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.24 * amp, t + 0.11);
        gain.gain.linearRampToValueAtTime(0.11 * amp, t + 0.55);
        gain.gain.linearRampToValueAtTime(0.19 * amp, t + 0.95);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        rumble.connect(lp);
        lp.connect(gain);
        gain.connect(c.destination);
        rumble.start(t);
        rumble.stop(t + dur + 0.05);

        // 3. Sharper mid-low sky crack for closer/stronger strikes
        if (amp > 0.55) {
          const crack = c.createBufferSource();
          crack.buffer = thunderNoiseBuffer;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(420 + Math.random() * 180, t);
          bp.frequency.exponentialRampToValueAtTime(110, t + 0.42);
          bp.Q.setValueAtTime(1.1, t);
          const cGain = c.createGain();
          cGain.gain.setValueAtTime(0.0001, t);
          cGain.gain.linearRampToValueAtTime(0.16 * amp, t + 0.025);
          cGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
          crack.connect(bp);
          bp.connect(cGain);
          cGain.connect(c.destination);
          crack.start(t);
          crack.stop(t + 0.5);
        }
      }
    },
  };
}
