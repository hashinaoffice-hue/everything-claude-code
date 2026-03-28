export interface CameraConfig {
  readonly width: number;
  readonly height: number;
  readonly facingMode: 'user' | 'environment';
}

export const DESKTOP_CONFIG: CameraConfig = {
  width: 1280,
  height: 720,
  facingMode: 'user',
};

export const MOBILE_CONFIG: CameraConfig = {
  width: 640,
  height: 480,
  facingMode: 'user',
};
