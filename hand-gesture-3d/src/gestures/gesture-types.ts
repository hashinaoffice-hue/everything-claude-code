import type { Vec3 } from '../utils/math-utils';

export enum GestureType {
  NONE = 'none',
  PINCH = 'pinch',
  GRAB = 'grab',
  OPEN_PALM = 'open_palm',
  POINT = 'point',
  SWIPE = 'swipe',
}

export enum GestureState {
  IDLE = 'idle',
  STARTED = 'started',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export interface GestureEvent {
  readonly type: GestureType;
  readonly state: GestureState;
  readonly position: Vec3;
  readonly delta: Vec3;
  readonly confidence: number;
  readonly handedness: 'Left' | 'Right';
}

export interface GestureResult {
  readonly type: GestureType;
  readonly confidence: number;
  readonly position: Vec3;
}
