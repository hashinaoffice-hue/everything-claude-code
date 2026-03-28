import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { HandData, Landmark } from './tracking-types';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );

    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  detect(video: HTMLVideoElement, timestamp: number): readonly HandData[] {
    if (!this.landmarker) return [];

    const result = this.landmarker.detectForVideo(video, timestamp);

    if (!result.landmarks || result.landmarks.length === 0) {
      return [];
    }

    return result.landmarks.map((landmarks, index): HandData => {
      const handedness = result.handednesses?.[index]?.[0]?.categoryName === 'Left'
        ? 'Left' as const
        : 'Right' as const;

      const worldLandmarks = result.worldLandmarks?.[index] ?? landmarks;

      return {
        landmarks: landmarks.map((lm): Landmark => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
        })),
        worldLandmarks: worldLandmarks.map((lm): Landmark => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
        })),
        handedness,
      };
    });
  }

  destroy(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
