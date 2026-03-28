import type { HandData } from '../../tracking/tracking-types';
import { LANDMARK } from '../../tracking/tracking-types';
import { distance2D } from '../../utils/math-utils';
import { GestureType, type GestureResult } from '../gesture-types';

const PINCH_THRESHOLD = 0.06;
const PINCH_RELEASE_THRESHOLD = 0.08;

export class PinchDetector {
  readonly type = GestureType.PINCH;
  private isPinching = false;

  detect(hand: HandData): GestureResult | null {
    const thumbTip = hand.landmarks[LANDMARK.THUMB_TIP];
    const indexTip = hand.landmarks[LANDMARK.INDEX_TIP];

    const dist = distance2D(thumbTip, indexTip);

    const threshold = this.isPinching ? PINCH_RELEASE_THRESHOLD : PINCH_THRESHOLD;

    if (dist < threshold) {
      this.isPinching = true;
      const midpoint = {
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2,
        z: (thumbTip.z + indexTip.z) / 2,
      };
      return {
        type: this.type,
        confidence: 1 - dist / PINCH_RELEASE_THRESHOLD,
        position: midpoint,
      };
    }

    this.isPinching = false;
    return null;
  }

  reset(): void {
    this.isPinching = false;
  }
}
