import type { HandData } from '../../tracking/tracking-types';
import { distance2D, distance3D, type Vec3 } from '../../utils/math-utils';
import { LANDMARK } from '../../tracking/tracking-types';

export enum TwoHandState {
  IDLE = 'idle',
  /** Hands detected but far apart */
  APART = 'apart',
  /** Hands close together (ready to summon) */
  CONVERGED = 'converged',
  /** Hands spreading apart → summon */
  SPREADING = 'spreading',
  /** Object summoned, hands controlling it */
  CONTROLLING = 'controlling',
  /** Hands coming back together → dismiss */
  DISMISSING = 'dismissing',
}

export interface TwoHandGesture {
  readonly state: TwoHandState;
  /** Center point between both hands (normalized 0..1) */
  readonly center: Vec3;
  /** Distance between palms (normalized) */
  readonly handDistance: number;
  /** Rate of distance change (positive = spreading) */
  readonly spreadVelocity: number;
  /** Twist angle between hands (radians) */
  readonly twistAngle: number;
  /** Rate of twist change */
  readonly twistVelocity: number;
  /** Scale factor based on hand distance */
  readonly scale: number;
}

/** Thresholds */
const CONVERGE_DIST = 0.12;
const SPREAD_DIST = 0.25;
const DISMISS_DIST = 0.10;
const SPREAD_VELOCITY_THRESHOLD = 0.003;
const DISMISS_VELOCITY_THRESHOLD = -0.002;

function palmCenter(hand: HandData): Vec3 {
  const wrist = hand.landmarks[LANDMARK.WRIST];
  const middleMcp = hand.landmarks[LANDMARK.MIDDLE_MCP];
  return {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2,
    z: (wrist.z + middleMcp.z) / 2,
  };
}

function wristAngle(hand: HandData): number {
  const wrist = hand.landmarks[LANDMARK.WRIST];
  const middleMcp = hand.landmarks[LANDMARK.MIDDLE_MCP];
  return Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x);
}

export class TwoHandDetector {
  private state = TwoHandState.IDLE;
  private prevDistance = 0;
  private prevTwist = 0;
  private prevTimestamp = 0;
  private spreadVelocity = 0;
  private twistVelocity = 0;
  private convergeStartTime = 0;
  private summoned = false;

  detect(hands: readonly HandData[], timestamp: number): TwoHandGesture | null {
    if (hands.length < 2) {
      // Keep controlling state briefly if object is summoned (hand tracking lost momentarily)
      if (this.summoned && this.state === TwoHandState.CONTROLLING) {
        return {
          state: TwoHandState.CONTROLLING,
          center: { x: 0.5, y: 0.5, z: 0 },
          handDistance: this.prevDistance,
          spreadVelocity: 0,
          twistAngle: this.prevTwist,
          twistVelocity: 0,
          scale: this.distanceToScale(this.prevDistance),
        };
      }
      this.state = TwoHandState.IDLE;
      return null;
    }

    // Identify left and right hands
    const leftHand = hands.find((h) => h.handedness === 'Left') ?? hands[0];
    const rightHand = hands.find((h) => h.handedness === 'Right') ?? hands[1];

    const leftPalm = palmCenter(leftHand);
    const rightPalm = palmCenter(rightHand);

    const center: Vec3 = {
      x: (leftPalm.x + rightPalm.x) / 2,
      y: (leftPalm.y + rightPalm.y) / 2,
      z: (leftPalm.z + rightPalm.z) / 2,
    };

    const dist = distance2D(leftPalm, rightPalm);

    // Compute velocities
    const dt = this.prevTimestamp > 0
      ? Math.max((timestamp - this.prevTimestamp) / 1000, 0.001)
      : 0.016;
    this.spreadVelocity = (dist - this.prevDistance) / dt;

    // Twist: angle difference between wrists
    const leftAngle = wristAngle(leftHand);
    const rightAngle = wristAngle(rightHand);
    const twist = leftAngle - rightAngle;
    this.twistVelocity = (twist - this.prevTwist) / dt;

    this.prevDistance = dist;
    this.prevTwist = twist;
    this.prevTimestamp = timestamp;

    // State machine
    this.updateState(dist, timestamp);

    return {
      state: this.state,
      center,
      handDistance: dist,
      spreadVelocity: this.spreadVelocity,
      twistAngle: twist,
      twistVelocity: this.twistVelocity,
      scale: this.distanceToScale(dist),
    };
  }

  private updateState(dist: number, timestamp: number): void {
    switch (this.state) {
      case TwoHandState.IDLE:
      case TwoHandState.APART:
        if (dist < CONVERGE_DIST) {
          this.state = TwoHandState.CONVERGED;
          this.convergeStartTime = timestamp;
        } else {
          this.state = TwoHandState.APART;
        }
        break;

      case TwoHandState.CONVERGED:
        if (dist > SPREAD_DIST && this.spreadVelocity > SPREAD_VELOCITY_THRESHOLD) {
          this.state = TwoHandState.SPREADING;
        } else if (dist > CONVERGE_DIST * 1.5) {
          this.state = TwoHandState.APART;
        }
        break;

      case TwoHandState.SPREADING:
        if (dist > SPREAD_DIST * 0.8) {
          this.state = TwoHandState.CONTROLLING;
          this.summoned = true;
        }
        break;

      case TwoHandState.CONTROLLING:
        if (dist < DISMISS_DIST && this.spreadVelocity < DISMISS_VELOCITY_THRESHOLD) {
          this.state = TwoHandState.DISMISSING;
        }
        break;

      case TwoHandState.DISMISSING:
        if (dist < DISMISS_DIST * 0.8) {
          this.state = TwoHandState.IDLE;
          this.summoned = false;
        } else if (dist > SPREAD_DIST * 0.5) {
          this.state = TwoHandState.CONTROLLING;
        }
        break;
    }
  }

  private distanceToScale(dist: number): number {
    const minDist = 0.08;
    const maxDist = 0.5;
    const clamped = Math.max(minDist, Math.min(maxDist, dist));
    return ((clamped - minDist) / (maxDist - minDist)) * 1.5 + 0.2;
  }

  isSummoned(): boolean {
    return this.summoned;
  }

  reset(): void {
    this.state = TwoHandState.IDLE;
    this.prevDistance = 0;
    this.prevTwist = 0;
    this.prevTimestamp = 0;
    this.spreadVelocity = 0;
    this.twistVelocity = 0;
    this.summoned = false;
  }
}
