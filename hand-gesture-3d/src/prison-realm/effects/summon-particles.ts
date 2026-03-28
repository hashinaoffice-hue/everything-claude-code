import * as THREE from 'three';

const PARTICLE_COUNT = 200;

const particleVertShader = `
attribute float aSize;
attribute float aLife;
attribute float aSpeed;
attribute vec3 aDirection;

uniform float uTime;
uniform float uProgress; // 0=dormant, 0..1=summoning, 1=active

varying float vLife;
varying float vAlpha;

void main() {
  vLife = aLife;

  // Particles spiral inward during summon, orbit during active
  float t = mod(uTime * aSpeed + aLife * 6.2831, 6.2831);
  float radius = mix(3.0, 0.6, uProgress) * (0.5 + aLife * 0.5);

  vec3 offset = vec3(
    cos(t + aLife * 6.28) * radius,
    sin(t * 1.3 + aLife * 3.14) * radius * 0.6,
    sin(t + aLife * 4.71) * radius
  );

  // During summoning, particles converge to center
  float converge = smoothstep(0.0, 1.0, uProgress);
  offset *= mix(1.0, 0.3, converge);

  vec3 pos = position + offset * aDirection;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float size = aSize * (200.0 / -mvPosition.z) * mix(0.5, 1.5, uProgress);
  gl_PointSize = size;
  gl_Position = projectionMatrix * mvPosition;

  // Fade based on progress
  float distFromCenter = length(offset) / 3.0;
  vAlpha = smoothstep(0.0, 0.3, uProgress) * (1.0 - distFromCenter * 0.5);
  vAlpha *= 0.4 + 0.6 * sin(uTime * 3.0 + aLife * 10.0) * 0.5 + 0.5;
}
`;

const particleFragShader = `
varying float vLife;
varying float vAlpha;

void main() {
  // Soft circle
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  if (dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.1, dist) * vAlpha;

  // Cursed energy color: cyan to blue (matching reference)
  vec3 color = mix(
    vec3(0.05, 0.4, 0.7),   // cyan
    vec3(0.1, 0.2, 0.5),     // deep blue
    vLife
  );

  // Bright core
  color += vec3(0.1, 0.3, 0.4) * smoothstep(0.3, 0.0, dist);

  gl_FragColor = vec4(color, alpha);
}
`;

export class SummonParticles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const lives = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const directions = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      sizes[i] = 1.5 + Math.random() * 3;
      lives[i] = Math.random();
      speeds[i] = 0.3 + Math.random() * 0.8;

      // Random direction on unit sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      directions[i * 3] = Math.sin(phi) * Math.cos(theta);
      directions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
      directions[i * 3 + 2] = Math.cos(phi);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aDirection', new THREE.BufferAttribute(directions, 3));

    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertShader,
      fragmentShader: particleFragShader,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
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
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
