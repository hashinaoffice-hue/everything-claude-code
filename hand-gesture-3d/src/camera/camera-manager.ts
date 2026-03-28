import { detectDevice } from '../utils/device-detect';
import { DESKTOP_CONFIG, MOBILE_CONFIG, type CameraConfig } from './camera-config';

export class CameraManager {
  private stream: MediaStream | null = null;
  private readonly video: HTMLVideoElement;
  private readonly config: CameraConfig;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
    const device = detectDevice();
    this.config = device.isMobile ? MOBILE_CONFIG : DESKTOP_CONFIG;
  }

  async start(): Promise<HTMLVideoElement> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          facingMode: this.config.facingMode,
        },
        audio: false,
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      return this.video;
    } catch (error) {
      throw new Error(
        `Camera access failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'Please allow camera access and reload.',
      );
    }
  }

  getVideo(): HTMLVideoElement {
    return this.video;
  }

  getResolution(): { width: number; height: number } {
    return {
      width: this.video.videoWidth || this.config.width,
      height: this.video.videoHeight || this.config.height,
    };
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}
