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

  /** 0 = hidden, 1 = fully visible */
  private summonProgress = 0;
  private targetProgress = 0;
  private rotationSpeed = 0;
  private targetRotationSpeed = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.sealedForm = new SealedForm();
    this.particles = new SummonParticles();
    this.energyRing = new CursedEnergyRing(0.8);

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
    }
  }

  dismiss(): void {
    if (this.state === PrisonRealmState.ACTIVE || this.state === PrisonRealmState.SUMMONING) {
      this.state = PrisonRealmState.DISMISSING;
      this.targetProgress = 0;
    }
  }

  update(time: number, dt: number): void {
    // Smooth progress transition
    const progressSpeed = this.state === PrisonRealmState.SUMMONING ? 1.8 : 2.5;
    this.summonProgress = lerp(this.summonProgress, this.targetProgress, 1 - Math.exp(-progressSpeed * dt));

    // State transitions
    if (this.state === PrisonRealmState.SUMMONING && this.summonProgress > 0.95) {
      this.state = PrisonRealmState.ACTIVE;
      this.summonProgress = 1;
    }
    if (this.state === PrisonRealmState.DISMISSING && this.summonProgress < 0.02) {
      this.state = PrisonRealmState.HIDDEN;
      this.summonProgress = 0;
      this.group.visible = false;
    }

    // Scale animation
    const scale = this.summonProgress;
    // Elastic overshoot during summoning
    const elastic = this.state === PrisonRealmState.SUMMONING
      ? scale + Math.sin(scale * Math.PI * 3) * 0.05 * (1 - scale)
      : scale;
    this.sealedForm.group.scale.setScalar(elastic);

    // Rotation
    this.rotationSpeed = lerp(this.rotationSpeed, this.targetRotationSpeed, 1 - Math.exp(-3 * dt));
    this.sealedForm.group.rotation.y += this.rotationSpeed * dt;

    // Idle rotation when active
    if (this.state === PrisonRealmState.ACTIVE && Math.abs(this.targetRotationSpeed) < 0.1) {
      this.sealedForm.group.rotation.y += 0.15 * dt;
    }

    // Floating animation
    this.sealedForm.group.position.y = Math.sin(time * 0.8) * 0.04 * this.summonProgress;

    // Update sub-components
    this.sealedForm.update(time);
    this.sealedForm.setActivation(this.summonProgress);
    this.particles.update(time, this.summonProgress);
    this.energyRing.update(time, this.summonProgress);
  }

  setTwistSpeed(speed: number): void {
    this.targetRotationSpeed = speed;
  }

  setScale(scale: number): void {
    this.group.scale.setScalar(scale);
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
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
