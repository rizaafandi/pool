import { describe, expect, it } from 'vitest';
import { createWaterAudio } from '../src/audio/waterAudio.js';

function makeMockAudioContext() {
  const events = [];
  const makeParam = () => ({
    setValueAtTime: (v, t) => events.push(['set', v, t]),
    exponentialRampToValueAtTime: (v, t) => events.push(['exp', v, t]),
    linearRampToValueAtTime: (v, t) => events.push(['lin', v, t]),
    value: 0,
  });
  return {
    events,
    state: 'suspended',
    currentTime: 1.0,
    sampleRate: 44100,
    destination: {},
    resume() {
      this.state = 'running';
      events.push(['resume']);
      return Promise.resolve();
    },
    createOscillator() {
      return {
        type: 'sine',
        frequency: makeParam(),
        connect() { return this; },
        start: (t) => events.push(['oscStart', t]),
        stop: (t) => events.push(['oscStop', t]),
      };
    },
    createGain() {
      return {
        gain: makeParam(),
        connect() { return this; },
      };
    },
    createBiquadFilter() {
      return {
        type: 'bandpass',
        frequency: makeParam(),
        Q: makeParam(),
        connect() { return this; },
      };
    },
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return { getChannelData: () => data, length, numberOfChannels: channels, sampleRate: rate };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() { return this; },
        start: (t) => events.push(['noiseStart', t]),
        stop: (t) => events.push(['noiseStop', t]),
      };
    },
    createStereoPanner() {
      return {
        pan: makeParam(),
        connect() { return this; },
      };
    },
  };
}

describe('createWaterAudio', () => {
  it('stays safe when AudioContext is unavailable', () => {
    const audio = createWaterAudio({ AudioContextCtor: null });
    expect(audio.isMuted()).toBe(false);
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.playDrop(0.5, 1000)).not.toThrow();
    expect(() => audio.playSweep(1.0, 1050)).not.toThrow();
    expect(() => audio.playSplash(1.0, 1100)).not.toThrow();
    expect(() => audio.playClap(1200)).not.toThrow();
    expect(() => audio.playThunder(0.9, 1300)).not.toThrow();
  });

  it('synthesizes drop, sweep, splash, and clap sounds when unlocked and respects rate limits & mute', () => {
    let ctx = null;
    const Ctor = function MockCtor() {
      ctx = makeMockAudioContext();
      return ctx;
    };
    const audio = createWaterAudio({ AudioContextCtor: Ctor });
    audio.unlock();
    expect(ctx).not.toBeNull();
    expect(ctx.state).toBe('running');

    // Drop triggers oscillator
    audio.playDrop(0.8, 1000);
    const oscAfterFirst = ctx.events.filter((e) => e[0] === 'oscStart').length;
    expect(oscAfterFirst).toBeGreaterThanOrEqual(1);

    // Rapid duplicate drop within throttle window is skipped
    audio.playDrop(0.8, 1010);
    expect(ctx.events.filter((e) => e[0] === 'oscStart').length).toBe(oscAfterFirst);

    // Sweep starts a single continuous filtered noise stream and modulates it smoothly
    audio.playSweep(1.2, 1200);
    const noiseAfterSweep = ctx.events.filter((e) => e[0] === 'noiseStart').length;
    expect(noiseAfterSweep).toBeGreaterThanOrEqual(1);
    audio.playSweep(1.6, 1300);
    audio.playSweep(1.9, 1400);
    // Repeated swipes reuse the continuous voice instead of spawning percussive bursts
    expect(ctx.events.filter((e) => e[0] === 'noiseStart').length).toBe(noiseAfterSweep);

    // Splash and clap trigger layered sounds
    const beforeSplash = ctx.events.length;
    audio.playSplash(1.0, 1500);
    expect(ctx.events.length).toBeGreaterThan(beforeSplash);

    const beforeClap = ctx.events.length;
    audio.playClap(2000);
    expect(ctx.events.length).toBeGreaterThan(beforeClap);

    // Mute silences all future calls
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    const mutedCount = ctx.events.length;
    audio.playDrop(1.0, 3000);
    audio.playRainDrop(0.8, 3100);
    audio.playSplash(1.0, 3200);
    audio.playClap(3500);
    expect(ctx.events.length).toBe(mutedCount);
  });

  it('starts and fades continuous ambient rain audio and synthesizes raindrop impact sounds', () => {
    let ctx = null;
    const Ctor = function MockCtor() {
      ctx = makeMockAudioContext();
      return ctx;
    };
    const audio = createWaterAudio({ AudioContextCtor: Ctor });
    audio.unlock();

    // Turning rain on starts the looping ambient rain bed and ramps gain up
    audio.setRainActive(true);
    expect(audio.isRainActive()).toBe(true);
    expect(ctx.events.filter((e) => e[0] === 'noiseStart').length).toBe(1);
    expect(ctx.events.some((e) => e[0] === 'lin' && e[1] > 0.05)).toBe(true);

    // Individual raindrop impact plays both bubble chirp and subtle surface tick
    const oscBefore = ctx.events.filter((e) => e[0] === 'oscStart').length;
    const noiseBefore = ctx.events.filter((e) => e[0] === 'noiseStart').length;
    audio.playRainDrop(0.9, 1000);
    expect(ctx.events.filter((e) => e[0] === 'oscStart').length).toBe(oscBefore + 1);
    expect(ctx.events.filter((e) => e[0] === 'noiseStart').length).toBe(noiseBefore + 1);

    // Turning rain off smoothly ramps ambient rain gain down near zero
    audio.setRainActive(false);
    expect(audio.isRainActive()).toBe(false);
    const rampDowns = ctx.events.filter((e) => e[0] === 'lin' && e[1] <= 0.001);
    expect(rampDowns.length).toBeGreaterThanOrEqual(1);
  });

  it('synthesizes layered rolling thunder and respects cooldown and mute', () => {
    let ctx = null;
    const Ctor = function MockCtor() {
      ctx = makeMockAudioContext();
      return ctx;
    };
    const audio = createWaterAudio({ AudioContextCtor: Ctor });
    audio.unlock();

    const oscBefore = ctx.events.filter((e) => e[0] === 'oscStart').length;
    const noiseBefore = ctx.events.filter((e) => e[0] === 'noiseStart').length;
    audio.playThunder(0.9, 5000);
    const oscAfter = ctx.events.filter((e) => e[0] === 'oscStart').length;
    const noiseAfter = ctx.events.filter((e) => e[0] === 'noiseStart').length;
    expect(oscAfter).toBeGreaterThan(oscBefore);
    expect(noiseAfter).toBeGreaterThan(noiseBefore);

    // Cooldown prevents immediate overlapping thunder strike
    audio.playThunder(0.9, 5300);
    expect(ctx.events.filter((e) => e[0] === 'noiseStart').length).toBe(noiseAfter);

    // Mute blocks thunder
    audio.setMuted(true);
    audio.playThunder(0.9, 9000);
    expect(ctx.events.filter((e) => e[0] === 'noiseStart').length).toBe(noiseAfter);
  });

  it('produces layered liquid sweep turbulence, wake micro-bubbles, and stereo panning without restarting noise source', () => {
    let ctx = null;
    const Ctor = function MockCtor() {
      ctx = makeMockAudioContext();
      return ctx;
    };
    const audio = createWaterAudio({ AudioContextCtor: Ctor });
    audio.unlock();

    audio.playSweep(0.45, 2000, -0.5);
    const noiseStarts = ctx.events.filter((e) => e[0] === 'noiseStart').length;
    const oscStartsFirst = ctx.events.filter((e) => e[0] === 'oscStart').length;
    expect(noiseStarts).toBe(1);
    // Starts liquid LFO + wake micro-bubble chirp
    expect(oscStartsFirst).toBeGreaterThanOrEqual(2);

    // Continued faster sweep reuses the single turbulence buffer, updates pan, and adds wake micro-bubbles
    audio.playSweep(1.5, 2150, 0.6);
    expect(ctx.events.filter((e) => e[0] === 'noiseStart').length).toBe(1);
    expect(ctx.events.filter((e) => e[0] === 'oscStart').length).toBeGreaterThan(oscStartsFirst);
    expect(ctx.events.some((e) => e[0] === 'lin' && Math.abs(e[1] - 0.6) < 1e-4)).toBe(true);
  });
});
