import * as THREE from 'three';
import cubeFragShader from './shaders/cube-shader.frag';
import { Eye } from './eye';

const cubeVertShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Face orientations for placing eyes on each face of the cube */
const FACE_CONFIGS: Array<{
  position: [number, number, number];
  rotation: [number, number, number];
}> = [
  { position: [0, 0, 0.501], rotation: [0, 0, 0] },
  { position: [0, 0, -0.501], rotation: [0, Math.PI, 0] },
  { position: [0.501, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [-0.501, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { position: [0, 0.501, 0], rotation: [-Math.PI / 2, 0, 0] },
  { position: [0, -0.501, 0], rotation: [Math.PI / 2, 0, 0] },
];

const BLINK_OFFSETS = [0, 2.1, 4.2, 1.05, 3.15, 5.25];

/** Distinct iris colors for each eye */
const IRIS_COLORS: THREE.Vector3[] = [
  new THREE.Vector3(0.55, 0.05, 0.15),  // deep crimson
  new THREE.Vector3(0.45, 0.03, 0.25),  // purple-red
  new THREE.Vector3(0.60, 0.08, 0.10),  // bright crimson
  new THREE.Vector3(0.40, 0.05, 0.20),  // dark purple
  new THREE.Vector3(0.50, 0.10, 0.12),  // blood red
  new THREE.Vector3(0.48, 0.02, 0.22),  // violet
];

export class SealedForm {
  readonly group: THREE.Group;
  private readonly cubeMaterial: THREE.ShaderMaterial;
  private readonly eyes: Eye[] = [];

  constructor() {
    this.group = new THREE.Group();

    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.cubeMaterial = new THREE.ShaderMaterial({
      vertexShader: cubeVertShader,
      fragmentShader: cubeFragShader,
      uniforms: {
        uTime: { value: 0 },
        uActivation: { value: 0 },
      },
    });
    const cube = new THREE.Mesh(cubeGeometry, this.cubeMaterial);
    this.group.add(cube);

    for (let i = 0; i < 6; i++) {
      const config = FACE_CONFIGS[i];
      const eye = new Eye({
        blinkOffset: BLINK_OFFSETS[i],
        irisColor: IRIS_COLORS[i],
      });

      eye.mesh.position.set(...config.position);
      eye.mesh.rotation.set(...config.rotation);

      this.group.add(eye.mesh);
      this.eyes.push(eye);
    }
  }

  update(time: number): void {
    this.cubeMaterial.uniforms.uTime.value = time;
    for (const eye of this.eyes) {
      eye.update(time);
    }
  }

  setActivation(value: number): void {
    this.cubeMaterial.uniforms.uActivation.value = value;
    for (const eye of this.eyes) {
      eye.setActivation(value);
    }
  }

  setEyeLookDirection(x: number, y: number): void {
    for (const eye of this.eyes) {
      eye.setLookDirection(x, y);
    }
  }

  dispose(): void {
    this.cubeMaterial.dispose();
    for (const eye of this.eyes) {
      eye.dispose();
    }
  }
}
