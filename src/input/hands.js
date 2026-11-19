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

export async function createHands(video) {
  const fileset = await FilesetResolver.forVisionTasks(HAND.wasmBase);
  let detector;
  try {
    detector = await landmarker(fileset, 'GPU');
  } catch {
    detector = await landmarker(fileset, 'CPU');
  }
  let lastVideoTime = -1;
  let lastStamp = 0;
  let cached = null;

  return {
    sample() {
      if (video.readyState < 2) return null;
      if (video.currentTime === lastVideoTime) {
        return cached && { ...cached, fresh: false };
      }
      lastVideoTime = video.currentTime;
      let stamp = performance.now();
      if (stamp <= lastStamp) stamp = lastStamp + 1;
      lastStamp = stamp;
      const result = detector.detectForVideo(video, stamp);
      const list = result.landmarks || [];
      cached = {
        hands: list.map((landmarks) => ({ landmarks })),
      };
      return { ...cached, fresh: true };
    },
  };
}
