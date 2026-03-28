import * as THREE from 'three';

const RING_SEGMENTS = 128;

const ringVertShader = `
attribute float aAngle;

uniform float uTime;
uniform float uProgress;
uniform float uRadius;

varying float vAngle;
varying float vAlpha;

void main() {
  vAngle = aAngle;

  float angle = aAngle;
  float r = uRadius;

  // Pulsing radius
  float pulse = 1.0 + 0.08 * sin(uTime * 4.0 + angle * 3.0);
  r *= pulse;

  // Wavy distortion
  float wave = 0.05 * sin(angle * 8.0 + uTime * 5.0) * uProgress;
  r += wave;

  vec3 pos = vec3(
    cos(angle) * r,
    sin(angle) * r,
    sin(angle * 4.0 + uTime * 3.0) * 0.03 * uProgress
  );

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = (2.0 + sin(uTime * 6.0 + angle * 5.0) * 1.0) * uProgress * (150.0 / -mvPosition.z);

  vAlpha = uProgress * (0.5 + 0.5 * sin(uTime * 3.0 + angle * 7.0));
}
`;

const ringFragShader = `
varying float vAngle;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float dist = length(c);
  if (dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;

  // Cursed energy: alternating cyan-dark blue
  vec3 color = mix(
    vec3(0.05, 0.45, 0.7),
    vec3(0.02, 0.1, 0.25),
    sin(vAngle * 10.0) * 0.5 + 0.5
  );

  gl_FragColor = vec4(color, alpha * 0.8);
}
`;

export class CursedEnergyRing {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(radius = 0.8) {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(RING_SEGMENTS * 3);
    const angles = new Float32Array(RING_SEGMENTS);

    for (let i = 0; i < RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = 0;
      angles[i] = angle;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: ringVertShader,
      fragmentShader: ringFragShader,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uRadius: { value: radius },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
  }

  update(time: number, progress: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uProgress.value = progress;
    this.points.visible = progress > 0.01;

    // Slowly rotate the ring
    this.points.rotation.z = time * 0.5;
    this.points.rotation.x = Math.sin(time * 0.3) * 0.2;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
