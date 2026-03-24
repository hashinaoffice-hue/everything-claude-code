precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float uTime;

// Noise functions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;

  // Base dark red color with aged stone/wood texture
  float stonePattern = fbm(uv * 8.0 + 0.5);
  float cracks = fbm(uv * 20.0);
  cracks = smoothstep(0.45, 0.5, cracks) * 0.3;

  // Dark reddish-brown base
  vec3 baseColor = mix(
    vec3(0.28, 0.06, 0.04),  // dark crimson
    vec3(0.35, 0.10, 0.06),  // slightly lighter red-brown
    stonePattern
  );

  // Add cracks (darker lines)
  baseColor -= vec3(cracks);

  // Edge darkening (vignette on each face)
  vec2 edgeDist = abs(uv - 0.5) * 2.0;
  float edgeFade = smoothstep(0.7, 1.0, max(edgeDist.x, edgeDist.y));
  baseColor *= (1.0 - edgeFade * 0.4);

  // Engraved symbols/patterns (subtle)
  float symbols = noise(uv * 4.0 + 100.0);
  symbols = smoothstep(0.48, 0.52, symbols);
  baseColor += vec3(0.03, 0.01, 0.0) * symbols;

  // Subtle ominous emissive pulse
  float pulse = sin(uTime * 0.8) * 0.5 + 0.5;
  vec3 emissive = vec3(0.5, 0.05, 0.02) * pulse * 0.08;
  baseColor += emissive;

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.3;
  baseColor *= (ambient + diffuse * 0.7);

  gl_FragColor = vec4(baseColor, 1.0);
}
