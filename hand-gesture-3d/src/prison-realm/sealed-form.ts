import * as THREE from 'three';
import cubeFragShader from './shaders/cube-shader.frag';
import eyeVertShader from './shaders/eye-shader.vert';
import { Eye } from './eye';

// Cube vertex shader (same as eye but with world position)
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
  { position: [0, 0, 0.501], rotation: [0, 0, 0] },           // front (+Z)
  { position: [0, 0, -0.501], rotation: [0, Math.PI, 0] },     // back (-Z)
  { position: [0.501, 0, 0], rotation: [0, Math.PI / 2, 0] },  // right (+X)
  { position: [-0.501, 0, 0], rotation: [0, -Math.PI / 2, 0] },// left (-X)
  { position: [0, 0.501, 0], rotation: [-Math.PI / 2, 0, 0] }, // top (+Y)
  { position: [0, -0.501, 0], rotation: [Math.PI / 2, 0, 0] }, // bottom (-Y)
];

/** Unique blink timing offsets per eye (one blinks every ~3s for dry-eye effect) */
const BLINK_OFFSETS = [0, 2.1, 4.2, 1.05, 3.15, 5.25];

export class SealedForm {
  readonly group: THREE.Group;
  private readonly cubeMaterial: THREE.ShaderMaterial;
  private readonly eyes: Eye[] = [];

  constructor() {
    this.group = new THREE.Group();

    // Create the cube body
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.cubeMaterial = new THREE.ShaderMaterial({
      vertexShader: cubeVertShader,
      fragmentShader: cubeFragShader,
      uniforms: {
        uTime: { value: 0 },
      },
    });
    const cube = new THREE.Mesh(cubeGeometry, this.cubeMaterial);
    this.group.add(cube);

    // Create eyes on each face
    for (let i = 0; i < 6; i++) {
      const config = FACE_CONFIGS[i];
      const irisColor = new THREE.Vector3(
        0.45 + Math.random() * 0.2,
        0.03 + Math.random() * 0.05,
        0.1 + Math.random() * 0.1,
      );
      const eye = new Eye({
        blinkOffset: BLINK_OFFSETS[i],
        irisColor,
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
