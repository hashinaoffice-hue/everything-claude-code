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

/**
 * Dice-like eye placement matching the reference image.
 * Eyes are large — each eye takes up ~30-40% of face width.
 *
 * Reference proportions:
 *   - Single eye face: eye is ~50% of face width
 *   - Multi-eye face: eyes are ~25-30% each, well-spaced
 */

interface FaceConfig {
  normal: [number, number, number];
  rotation: [number, number, number];
  eyePositions: Array<[number, number]>;
}

const FACE_OFFSET = 0.501;

const FACE_CONFIGS: FaceConfig[] = [
  // Front (z+): 1 eye — large, centered
  {
    normal: [0, 0, 1],
    rotation: [0, 0, 0],
    eyePositions: [[0, 0]],
  },
  // Back (z-): 6 eyes — 2 columns of 3
  {
    normal: [0, 0, -1],
    rotation: [0, Math.PI, 0],
    eyePositions: [
      [-0.2, 0.28], [0.2, 0.28],
      [-0.2, 0],    [0.2, 0],
      [-0.2, -0.28],[0.2, -0.28],
    ],
  },
  // Right (x+): 3 eyes — diagonal
  {
    normal: [1, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    eyePositions: [
      [-0.22, 0.22],
      [0, 0],
      [0.22, -0.22],
    ],
  },
  // Left (x-): 4 eyes — corners
  {
    normal: [-1, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
    eyePositions: [
      [-0.2, 0.2], [0.2, 0.2],
      [-0.2, -0.2],[0.2, -0.2],
    ],
  },
  // Top (y+): 5 eyes — X pattern
  {
    normal: [0, 1, 0],
    rotation: [-Math.PI / 2, 0, 0],
    eyePositions: [
      [0, 0],
      [-0.22, 0.22], [0.22, 0.22],
      [-0.22, -0.22],[0.22, -0.22],
    ],
  },
  // Bottom (y-): 2 eyes — diagonal
  {
    normal: [0, -1, 0],
    rotation: [Math.PI / 2, 0, 0],
    eyePositions: [
      [-0.17, 0.17],
      [0.17, -0.17],
    ],
  },
];

/** Eye sizes matching reference — large relative to cube face */
function eyeScale(eyeCount: number): number {
  switch (eyeCount) {
    case 1: return 0.55;   // single eye: very large, ~55% of face
    case 2: return 0.38;
    case 3: return 0.32;
    case 4: return 0.30;
    case 5: return 0.27;
    case 6: return 0.24;
    default: return 0.28;
  }
}

/** Cyan/blue iris colors matching reference */
const IRIS_COLORS: THREE.Vector3[] = [
  new THREE.Vector3(0.1, 0.55, 0.75),
  new THREE.Vector3(0.05, 0.45, 0.70),
  new THREE.Vector3(0.15, 0.60, 0.80),
  new THREE.Vector3(0.08, 0.50, 0.65),
  new THREE.Vector3(0.12, 0.58, 0.72),
  new THREE.Vector3(0.06, 0.42, 0.68),
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

    let eyeIndex = 0;
    for (const face of FACE_CONFIGS) {
      const count = face.eyePositions.length;
      const s = eyeScale(count);

      for (const [lx, ly] of face.eyePositions) {
        const colorIdx = eyeIndex % IRIS_COLORS.length;
        const eye = new Eye({
          blinkOffset: eyeIndex * 1.3 + Math.random() * 0.5,
          irisColor: IRIS_COLORS[colorIdx],
        });

        eye.mesh.scale.set(s, s, 1);

        // Position on face surface
        const pos = new THREE.Vector3();

        if (face.normal[2] !== 0) {
          // z-axis faces
          pos.set(
            lx * (face.normal[2] > 0 ? -1 : 1),
            ly,
            face.normal[2] * FACE_OFFSET,
          );
        } else if (face.normal[0] !== 0) {
          // x-axis faces
          pos.set(
            face.normal[0] * FACE_OFFSET,
            ly,
            lx * (face.normal[0] > 0 ? -1 : 1),
          );
        } else {
          // y-axis faces
          pos.set(
            lx,
            face.normal[1] * FACE_OFFSET,
            ly * (face.normal[1] > 0 ? -1 : 1),
          );
        }

        eye.mesh.position.copy(pos);
        eye.mesh.rotation.set(...face.rotation);

        this.group.add(eye.mesh);
        this.eyes.push(eye);
        eyeIndex++;
      }
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
