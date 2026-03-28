import type { Landmark } from './tracking-types';

/**
 * One Euro Filter for landmark smoothing.
 * Reduces jitter while maintaining responsiveness to fast movements.
 */
class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private prevValue: number | null = null;
  private prevDerivative = 0;
  private prevTimestamp = 0;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, timestamp: number): number {
    if (this.prevValue === null) {
      this.prevValue = value;
      this.prevTimestamp = timestamp;
      return value;
    }

    const dt = Math.max((timestamp - this.prevTimestamp) / 1000, 0.001);
    this.prevTimestamp = timestamp;

    const dAlpha = this.smoothingFactor(dt, this.dCutoff);
    const derivative = (value - this.prevValue) / dt;
    const smoothedDerivative = dAlpha * derivative + (1 - dAlpha) * this.prevDerivative;
    this.prevDerivative = smoothedDerivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    const alpha = this.smoothingFactor(dt, cutoff);
    const smoothedValue = alpha * value + (1 - alpha) * this.prevValue;
    this.prevValue = smoothedValue;

    return smoothedValue;
  }

  private smoothingFactor(dt: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  reset(): void {
    this.prevValue = null;
    this.prevDerivative = 0;
    this.prevTimestamp = 0;
  }
}

export class LandmarkSmoother {
  private readonly filters: OneEuroFilter[][] = [];

  constructor(
    private readonly numLandmarks = 21,
    minCutoff = 1.0,
    beta = 0.007,
  ) {
    for (let i = 0; i < numLandmarks; i++) {
      this.filters.push([
        new OneEuroFilter(minCutoff, beta),
        new OneEuroFilter(minCutoff, beta),
        new OneEuroFilter(minCutoff, beta),
      ]);
    }
  }

  smooth(landmarks: readonly Landmark[], timestamp: number): readonly Landmark[] {
    return landmarks.map((lm, i): Landmark => {
      if (i >= this.numLandmarks) return lm;
      const filters = this.filters[i];
      return {
        x: filters[0].filter(lm.x, timestamp),
        y: filters[1].filter(lm.y, timestamp),
        z: filters[2].filter(lm.z, timestamp),
      };
    });
  }

  reset(): void {
    for (const group of this.filters) {
      for (const filter of group) {
        filter.reset();
      }
    }
  }
}
