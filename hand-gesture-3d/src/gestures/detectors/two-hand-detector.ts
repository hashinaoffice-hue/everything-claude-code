import type { HandData } from '../../tracking/tracking-types';
import { distance2D, type Vec3 } from '../../utils/math-utils';
import { LANDMARK } from '../../tracking/tracking-types';

export enum TwoHandState {
  IDLE = 'idle',
  APART = 'apart',
  PRAYER = 'prayer',
  SUMMONING = 'summoning',
  CONTROLLING = 'controlling',
  COMPRESS = 'compress',
  RELEASE = 'release',
  SEALING = 'sealing',
}

export interface TwoHandGesture {
  readonly state: TwoHandState;
  readonly center: Vec3;
  readonly handDistance: number;
  readonly spreadVelocity: number;
  readonly scale: number;
  readonly gestureProgress: number;
}

// ── Thresholds ────────────────────────────────────────────────
const PRAYER_DIST = 0.16;
const PRAYER_HOLD_MS = 250;
const SPREAD_TRIGGER_DIST = 0.18;
const SPREAD_VEL_MIN = 0.0005;
const SEAL_DIST = 0.11;
const SEAL_HOLD_MS = 1500;
const COMPRESS_DIST = 0.20;
const COMPRESS_VEL = -0.0003;
const RELEASE_VEL = 0.003;
const TRACKING_GRACE_MS = 800;

export function palmCenter(hand: HandData): Vec3 {
  const w = hand.landmarks[LANDMARK.WRIST];
  const m = hand.landmarks[LANDMARK.MIDDLE_MCP];
  const i = hand.landmarks[LANDMARK.INDEX_MCP];
  const r = hand.landmarks[LANDMARK.RING_MCP];
  return {
    x: (w.x + m.x + i.x + r.x) / 4,
    y: (w.y + m.y + i.y + r.y) / 4,
    z: (w.z + m.z + i.z + r.z) / 4,
  };
}

function ema(prev: number, next: number, alpha: number): number {
  return alpha * next + (1 - alpha) * prev;
}

export class TwoHandDetector {
  private state = TwoHandState.IDLE;
  private prevDist = 0;
  private prevTs = 0;
  private spreadVel = 0;
  private summoned = false;
  private lastTwoHandTs = 0;
  private lastCenter: Vec3 = { x: 0.5, y: 0.5, z: 0 };
  private prayerStartTs = 0;
  private sealStartTs = 0;
  private compressStartTs = 0;

  detect(hands: readonly HandData[], ts: number): TwoHandGesture | null {
    if (hands.length < 2) {
      // Grace period for tracking drops
      if (this.summoned && (ts - this.lastTwoHandTs) < TRACKING_GRACE_MS) {
        return this.makeResult(TwoHandState.CONTROLLING, ts);
      }
      if (!this.summoned) this.state = TwoHandState.IDLE;
      return null;
    }

    this.lastTwoHandTs = ts;

    const left = hands.find((h) => h.handedness === 'Left') ?? hands[0];
    const right = hands.find((h) => h.handedness === 'Right') ?? hands[1];
    const lp = palmCenter(left);
    const rp = palmCenter(right);

    const center: Vec3 = {
      x: (lp.x + rp.x) / 2,
      y: (lp.y + rp.y) / 2,
      z: (lp.z + rp.z) / 2,
    };
    this.lastCenter = center;

    const dist = distance2D(lp, rp);
    const dt = this.prevTs > 0 ? Math.max((ts - this.prevTs) / 1000, 0.001) : 0.016;
    this.spreadVel = ema(this.spreadVel, (dist - this.prevDist) / dt, 0.3);
    this.prevDist = dist;
    this.prevTs = ts;

    this.updateState(dist, ts);
    return this.makeResult(this.state, ts);
  }

  private makeResult(state: TwoHandState, ts: number): TwoHandGesture {
    let gestureProgress = 0;
    if (state === TwoHandState.SEALING && this.sealStartTs > 0) {
      gestureProgress = Math.min(1, (ts - this.sealStartTs) / SEAL_HOLD_MS);
    }
    if (state === TwoHandState.COMPRESS && this.compressStartTs > 0) {
      gestureProgress = Math.min(1, (ts - this.compressStartTs) / 800);
    }
    return {
      state,
      center: this.lastCenter,
      handDistance: this.prevDist,
      spreadVelocity: this.spreadVel,
      scale: this.distToScale(this.prevDist),
      gestureProgress,
    };
  }

  private updateState(dist: number, ts: number): void {
    switch (this.state) {
      case TwoHandState.IDLE:
      case TwoHandState.APART:
        if (dist < PRAYER_DIST) {
          this.state = TwoHandState.PRAYER;
          this.prayerStartTs = ts;
        } else {
          this.state = TwoHandState.APART;
        }
        break;

      case TwoHandState.PRAYER:
        if (dist > PRAYER_DIST * 1.8) {
          this.state = TwoHandState.APART;
        } else if (
          (ts - this.prayerStartTs) > PRAYER_HOLD_MS &&
          dist > SPREAD_TRIGGER_DIST &&
          this.spreadVel > SPREAD_VEL_MIN
        ) {
          this.state = TwoHandState.SUMMONING;
        }
        break;

      case TwoHandState.SUMMONING:
        if (dist > SPREAD_TRIGGER_DIST) {
          this.state = TwoHandState.CONTROLLING;
          this.summoned = true;
        }
        break;

      case TwoHandState.CONTROLLING:
        if (this.spreadVel > RELEASE_VEL && dist > 0.35) {
          this.state = TwoHandState.RELEASE;
        } else if (dist < COMPRESS_DIST && this.spreadVel < COMPRESS_VEL) {
          this.state = TwoHandState.COMPRESS;
          this.compressStartTs = ts;
        } else if (dist < SEAL_DIST && Math.abs(this.spreadVel) < 0.002) {
          this.state = TwoHandState.SEALING;
          this.sealStartTs = ts;
        }
        break;

      case TwoHandState.RELEASE:
        this.state = TwoHandState.CONTROLLING;
        break;

      case TwoHandState.COMPRESS:
        if (dist > COMPRESS_DIST * 1.3 || this.spreadVel > 0.001) {
          this.state = TwoHandState.CONTROLLING;
        }
        break;

      case TwoHandState.SEALING:
        if (dist > SEAL_DIST * 2.0) {
          this.state = TwoHandState.CONTROLLING;
          this.sealStartTs = 0;
        } else if ((ts - this.sealStartTs) > SEAL_HOLD_MS && dist < SEAL_DIST) {
          this.state = TwoHandState.IDLE;
          this.summoned = false;
          this.sealStartTs = 0;
        }
        break;
    }
  }

  private distToScale(dist: number): number {
    const min = 0.08, max = 0.55;
    const clamped = Math.max(min, Math.min(max, dist));
    return ((clamped - min) / (max - min)) * 0.45 + 0.15;
  }

  isSummoned(): boolean { return this.summoned; }
  setSummoned(v: boolean): void { this.summoned = v; }

  reset(): void {
    this.state = TwoHandState.IDLE;
    this.prevDist = 0;
    this.prevTs = 0;
    this.spreadVel = 0;
    this.summoned = false;
    this.lastTwoHandTs = 0;
    this.prayerStartTs = 0;
    this.sealStartTs = 0;
    this.compressStartTs = 0;
  }
}
