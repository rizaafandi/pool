import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HAND } from '../config.js';
import { fingertipHit, isTouching } from './touch.js';

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
    sample(camera, aspect, pool) {
      if (video.readyState < 2) return null;
      if (video.currentTime === lastVideoTime) {
        return cached && { ...cached, fresh: false };
      }
      lastVideoTime = video.currentTime;
      let stamp = performance.now();
      if (stamp <= lastStamp) stamp = lastStamp + 1;
      lastStamp = stamp;
      const result = detector.detectForVideo(video, stamp);
      const landmarks = result.landmarks && result.landmarks[0];
      if (!landmarks) {
        cached = { touching: false, hit: null };
        return { ...cached, fresh: true };
      }
      cached = {
        touching: isTouching(landmarks),
        hit: fingertipHit(landmarks[8], camera, aspect, pool),
      };
      return { ...cached, fresh: true };
    },
  };
}
