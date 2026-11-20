import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HAND } from '../config.js';

async function landmarker(fileset, delegate) {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: HAND.model,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: HAND.numHands,
  });
}

export async function createHands(video, { minIntervalMs = 33 } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(HAND.wasmBase);
  let detector;
  try {
    detector = await landmarker(fileset, 'GPU');
  } catch {
    detector = await landmarker(fileset, 'CPU');
  }
  let lastVideoTime = -1;
  let lastStamp = 0;
  let lastDetectAt = -Infinity;
  let cachedFresh = null;
  let cachedStale = null;

  return {
    sample() {
      if (video.readyState < 2) return null;
      const now = performance.now();
      if (video.currentTime === lastVideoTime || now - lastDetectAt < minIntervalMs) {
        return cachedStale;
      }
      lastVideoTime = video.currentTime;
      lastDetectAt = now;
      let stamp = now;
      if (stamp <= lastStamp) stamp = lastStamp + 1;
      lastStamp = stamp;
      const result = detector.detectForVideo(video, stamp);
      const list = result.landmarks || [];
      const hands = list.map((landmarks) => ({ landmarks }));
      cachedFresh = { hands, fresh: true };
      cachedStale = { hands, fresh: false };
      return cachedFresh;
    },
  };
}
