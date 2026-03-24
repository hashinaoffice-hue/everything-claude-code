import type { HandData } from '../tracking/tracking-types';
import { GestureState, GestureType, type GestureEvent, type GestureResult } from './gesture-types';
import type { Vec3 } from '../utils/math-utils';
import { PinchDetector } from './detectors/pinch-detector';

interface DetectorEntry {
  readonly detect: (hand: HandData) => GestureResult | null;
  readonly reset: () => void;
  readonly type: GestureType;
}

interface GestureStateEntry {
  state: GestureState;
  prevPosition: Vec3 | null;
}

export class GestureRecognizer {
  private readonly detectors: DetectorEntry[] = [];
  private readonly gestureStates = new Map<GestureType, GestureStateEntry>();

  constructor() {
    this.registerDetector(new PinchDetector());
  }

  registerDetector(detector: DetectorEntry): void {
    this.detectors.push(detector);
    this.gestureStates.set(detector.type, {
      state: GestureState.IDLE,
      prevPosition: null,
    });
  }

  process(hand: HandData): readonly GestureEvent[] {
    const events: GestureEvent[] = [];

    for (const detector of this.detectors) {
      const result = detector.detect(hand);
      const stateEntry = this.gestureStates.get(detector.type)!;

      if (result) {
        const delta: Vec3 = stateEntry.prevPosition
          ? {
              x: result.position.x - stateEntry.prevPosition.x,
              y: result.position.y - stateEntry.prevPosition.y,
              z: result.position.z - stateEntry.prevPosition.z,
            }
          : { x: 0, y: 0, z: 0 };

        let newState: GestureState;
        if (stateEntry.state === GestureState.IDLE || stateEntry.state === GestureState.ENDED) {
          newState = GestureState.STARTED;
        } else {
          newState = GestureState.ACTIVE;
        }

        stateEntry.state = newState;
        stateEntry.prevPosition = result.position;

        events.push({
          type: result.type,
          state: newState,
          position: result.position,
          delta,
          confidence: result.confidence,
          handedness: hand.handedness,
        });
      } else {
        if (stateEntry.state === GestureState.STARTED || stateEntry.state === GestureState.ACTIVE) {
          stateEntry.state = GestureState.ENDED;
          events.push({
            type: detector.type,
            state: GestureState.ENDED,
            position: stateEntry.prevPosition ?? { x: 0, y: 0, z: 0 },
            delta: { x: 0, y: 0, z: 0 },
            confidence: 0,
            handedness: hand.handedness,
          });
        } else {
          stateEntry.state = GestureState.IDLE;
        }
        stateEntry.prevPosition = null;
      }
    }

    return events;
  }

  reset(): void {
    for (const detector of this.detectors) {
      detector.reset();
    }
    for (const [, entry] of this.gestureStates) {
      entry.state = GestureState.IDLE;
      entry.prevPosition = null;
    }
  }
}
