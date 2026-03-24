import * as THREE from 'three';
import { SealedForm } from './sealed-form';

export enum PrisonRealmState {
  SEALED = 'sealed',
  ACTIVATING = 'activating',
  ACTIVATED = 'activated',
  SEALING = 'sealing',
}

export class PrisonRealm {
  readonly group: THREE.Group;
  private readonly sealedForm: SealedForm;
  private state = PrisonRealmState.SEALED;

  constructor() {
    this.group = new THREE.Group();
    this.sealedForm = new SealedForm();
    this.group.add(this.sealedForm.group);
  }

  getState(): PrisonRealmState {
    return this.state;
  }

  update(time: number): void {
    this.sealedForm.update(time);

    // Subtle idle floating animation
    this.group.position.y = Math.sin(time * 0.5) * 0.05;
  }

  rotate(deltaX: number, deltaY: number): void {
    this.group.rotation.y += deltaX * 3;
    this.group.rotation.x += deltaY * 3;
  }

  setEyeLookDirection(x: number, y: number): void {
    this.sealedForm.setEyeLookDirection(x, y);
  }

  dispose(): void {
    this.sealedForm.dispose();
  }
}
