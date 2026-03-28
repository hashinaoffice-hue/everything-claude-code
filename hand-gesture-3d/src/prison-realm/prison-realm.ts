import * as THREE from 'three';
import { SealedForm } from './sealed-form';
import { SummonParticles } from './effects/summon-particles';
import { CursedEnergyRing } from './effects/cursed-energy';
import { lerp } from '../utils/math-utils';

export enum PrisonRealmState {
  HIDDEN = 'hidden',
  SUMMONING = 'summoning',
  ACTIVE = 'active',
  DISMISSING = 'dismissing',
}

export class PrisonRealm {
  readonly group: THREE.Group;
  private readonly sealedForm: SealedForm;
  private readonly particles: SummonParticles;
  private readonly energyRing: CursedEnergyRing;
  private state = PrisonRealmState.HIDDEN;

  private summonProgress = 0;
  private targetProgress = 0;
  private rotationSpeed = 0;
  private targetRotationSpeed = 0;

  // Gesture motion
  private shakeIntensity = 0;
  private targetShakeIntensity = 0;
  private scaleMultiplier = 1;
  private targetScaleMultiplier = 1;
  private sealProgress = 0;
  private energyBurst = 0;

  // Smooth floating phase (prevents jumps)
  private floatPhase = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.sealedForm = new SealedForm();
    this.particles = new SummonParticles();
    this.energyRing = new CursedEnergyRing(0.5);

    this.group.add(this.sealedForm.group);
    this.group.add(this.particles.points);
    this.group.add(this.energyRing.points);
  }

  getState(): PrisonRealmState {
    return this.state;
  }

  summon(): void {
    if (this.state === PrisonRealmState.HIDDEN) {
      this.state = PrisonRealmState.SUMMONING;
      this.targetProgress = 1;
      this.group.visible = true;
      this.group.scale.set(0.01, 0.01, 0.01);
      this.sealProgress = 0;
      this.floatPhase = 0;
    }
  }

  dismiss(): void {
    if (this.state === PrisonRealmState.ACTIVE || this.state === PrisonRealmState.SUMMONING) {
      this.state = PrisonRealmState.DISMISSING;
      this.targetProgress = 0;
    }
  }

  // ── Gesture motions ──────────────────────────────────────────

  applyRotationSeal(twistVelocity: number): void {
    this.targetRotationSpeed = twistVelocity * 15;
    this.energyBurst = Math.min(1, this.energyBurst + 0.2);
  }

  applyCompress(progress: number): void {
    this.targetScaleMultiplier = lerp(1.0, 0.35, progress);
    this.targetShakeIntensity = 0.008 + progress * 0.015;
  }

  applyRelease(): void {
    this.targetScaleMultiplier = 1.8;
    this.energyBurst = 1;
    this.targetRotationSpeed = 10;
  }

  applySeal(progress: number): void {
    this.sealProgress = progress;
    if (progress >= 1) {
      this.dismiss();
    }
  }

  resetGestureEffects(): void {
    this.targetShakeIntensity = 0;
    this.targetScaleMultiplier = 1;
  }

  update(time: number, dt: number): void {
    // ── Summon / dismiss ──────────────────────────────────────
    const progressSpeed = this.state === PrisonRealmState.SUMMONING ? 2.0 : 2.5;
    this.summonProgress = lerp(
      this.summonProgress,
      this.targetProgress,
      1 - Math.exp(-progressSpeed * dt),
    );

    if (this.state === PrisonRealmState.SUMMONING && this.summonProgress > 0.95) {
      this.state = PrisonRealmState.ACTIVE;
      this.summonProgress = 1;
    }
    if (this.state === PrisonRealmState.DISMISSING && this.summonProgress < 0.02) {
      this.state = PrisonRealmState.HIDDEN;
      this.summonProgress = 0;
      this.group.visible = false;
      this.sealProgress = 0;
    }

    // ── Scale ─────────────────────────────────────────────────
    this.scaleMultiplier = lerp(this.scaleMultiplier, this.targetScaleMultiplier, 1 - Math.exp(-5 * dt));
    this.targetScaleMultiplier = lerp(this.targetScaleMultiplier, 1.0, 1 - Math.exp(-1.5 * dt));

    let scale = this.summonProgress * this.scaleMultiplier;
    if (this.sealProgress > 0) {
      // Seal shrinks completely to 0
      scale *= Math.max(0, 1 - this.sealProgress);
    }
    // No elastic overshoot during summon (was causing jitter)
    this.sealedForm.group.scale.setScalar(Math.max(0.001, scale));

    // ── Rotation ──────────────────────────────────────────────
    this.rotationSpeed = lerp(this.rotationSpeed, this.targetRotationSpeed, 1 - Math.exp(-3 * dt));
    this.targetRotationSpeed = lerp(this.targetRotationSpeed, 0, 1 - Math.exp(-1.2 * dt));
    this.sealedForm.group.rotation.y += this.rotationSpeed * dt;

    // Very slow idle rotation
    if (this.state === PrisonRealmState.ACTIVE && Math.abs(this.rotationSpeed) < 0.2) {
      this.sealedForm.group.rotation.y += 0.08 * dt;
    }

    // ── Gentle zero-gravity floating ──────────────────────────
    // Very slow, smooth multi-axis float (no jitter)
    this.floatPhase += dt;
    const fp = this.floatPhase;

    this.shakeIntensity = lerp(this.shakeIntensity, this.targetShakeIntensity, 1 - Math.exp(-6 * dt));
    this.targetShakeIntensity = lerp(this.targetShakeIntensity, 0, 1 - Math.exp(-4 * dt));

    // Gentle float: very slow sin waves at different frequencies
    const floatY = Math.sin(fp * 0.6) * 0.012 + Math.sin(fp * 0.23) * 0.006;
    const floatX = Math.sin(fp * 0.4 + 1.0) * 0.005;
    const floatZ = Math.sin(fp * 0.35 + 2.0) * 0.004;

    // Shake only during compress gesture (small, high-freq)
    const sk = this.shakeIntensity;
    const shakeX = sk > 0.001 ? Math.sin(fp * 50) * sk : 0;
    const shakeY = sk > 0.001 ? Math.cos(fp * 43) * sk : 0;

    this.sealedForm.group.position.set(
      (floatX + shakeX) * this.summonProgress,
      (floatY + shakeY) * this.summonProgress,
      floatZ * this.summonProgress,
    );

    // Gentle tilt oscillation
    this.sealedForm.group.rotation.x = Math.sin(fp * 0.3) * 0.015 * this.summonProgress;
    this.sealedForm.group.rotation.z = Math.sin(fp * 0.25 + 1.5) * 0.01 * this.summonProgress;

    // ── Energy burst decay ────────────────────────────────────
    this.energyBurst = lerp(this.energyBurst, 0, 1 - Math.exp(-4 * dt));

    // ── Effects: particles/ring only during summon/dismiss + burst ──
    // When ACTIVE and idle: effects are very subtle or off
    let effectIntensity = 0;
    if (this.state === PrisonRealmState.SUMMONING) {
      effectIntensity = this.summonProgress;
    } else if (this.state === PrisonRealmState.DISMISSING) {
      effectIntensity = this.summonProgress * 0.8;
    } else if (this.state === PrisonRealmState.ACTIVE) {
      // Only show effects during energy burst, otherwise off
      effectIntensity = this.energyBurst * 0.8;
    }

    this.sealedForm.update(time);
    this.sealedForm.setActivation(Math.min(1.5, this.summonProgress * (1 + this.energyBurst * 0.4)));
    this.particles.update(time, effectIntensity);
    this.energyRing.update(time, effectIntensity);
  }

  setTwistSpeed(speed: number): void {
    this.targetRotationSpeed = speed;
  }

  setScale(s: number): void {
    this.group.scale.setScalar(s);
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  setTilt(tiltX: number, tiltZ: number): void {
    this.group.rotation.x = tiltX;
    this.group.rotation.z = tiltZ;
  }

  setEyeLookDirection(x: number, y: number): void {
    this.sealedForm.setEyeLookDirection(x, y);
  }

  dispose(): void {
    this.sealedForm.dispose();
    this.particles.dispose();
    this.energyRing.dispose();
  }
}
