import * as THREE from 'three';
import eyeVertShader from './shaders/eye-shader.vert';
import eyeFragShader from './shaders/eye-shader.frag';

export interface EyeConfig {
  readonly blinkOffset: number;
  readonly irisColor: THREE.Vector3;
}

const DEFAULT_IRIS_COLOR = new THREE.Vector3(0.55, 0.05, 0.15);

export class Eye {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(config?: Partial<EyeConfig>) {
    const blinkOffset = config?.blinkOffset ?? Math.random() * Math.PI * 2;
    const irisColor = config?.irisColor ?? DEFAULT_IRIS_COLOR;

    this.material = new THREE.ShaderMaterial({
      vertexShader: eyeVertShader,
      fragmentShader: eyeFragShader,
      uniforms: {
        uTime: { value: 0 },
        uBlinkPhase: { value: 0 },
        uBlinkOffset: { value: blinkOffset },
        uIrisColor: { value: irisColor },
        uLookDirection: { value: new THREE.Vector2(0, 0) },
        uActivation: { value: 0 },
      },
      transparent: true,
      side: THREE.FrontSide,
    });

    const geometry = new THREE.PlaneGeometry(0.7, 0.7);
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  setActivation(value: number): void {
    this.material.uniforms.uActivation.value = value;
  }

  setLookDirection(x: number, y: number): void {
    const dir = this.material.uniforms.uLookDirection.value as THREE.Vector2;
    dir.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    );
  }

  setBlink(phase: number): void {
    this.material.uniforms.uBlinkPhase.value = THREE.MathUtils.clamp(phase, 0, 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
