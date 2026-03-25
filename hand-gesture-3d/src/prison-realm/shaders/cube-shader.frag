precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uActivation; // 0=dormant, 1=active

// Noise functions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
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
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

// Voronoi for crack pattern
vec2 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 8.0;
  vec2 mr = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 31.0));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
      }
    }
  }
  return vec2(md, length(mr));
}

void main() {
  vec2 uv = vUv;

  // === Multi-layered aged wood/stone texture ===

  // Base grain - like aged wood with deep grooves
  float grain = fbm(uv * vec2(3.0, 12.0) + 10.0);
  float grainFine = fbm(uv * vec2(6.0, 25.0) + 50.0);

  // Voronoi cracks - like ancient cursed artifact
  vec2 vor = voronoi(uv * 6.0);
  float cracks = smoothstep(0.05, 0.0, vor.x) * 0.6;

  // Secondary crack network (finer)
  vec2 vor2 = voronoi(uv * 15.0 + 100.0);
  float fineCracks = smoothstep(0.03, 0.0, vor2.x) * 0.3;

  // Deep carved seal pattern
  float sealPattern = 0.0;
  // Concentric square borders
  vec2 fromCenter = abs(uv - 0.5) * 2.0;
  float borderDist = max(fromCenter.x, fromCenter.y);
  // Multiple border lines
  sealPattern += smoothstep(0.02, 0.0, abs(borderDist - 0.85)) * 0.4;
  sealPattern += smoothstep(0.015, 0.0, abs(borderDist - 0.7)) * 0.3;
  sealPattern += smoothstep(0.01, 0.0, abs(borderDist - 0.55)) * 0.2;

  // Kanji-like engraved symbols
  float symbols = noise(uv * 4.0 + 100.0);
  float symbolMask = smoothstep(0.48, 0.52, symbols);
  // Only show in certain regions
  float symbolRegion = smoothstep(0.4, 0.5, borderDist) * smoothstep(0.75, 0.65, borderDist);
  sealPattern += symbolMask * symbolRegion * 0.25;

  // === Color composition ===

  // Dark crimson base with variation
  vec3 baseColor = mix(
    vec3(0.25, 0.05, 0.03),   // very dark crimson
    vec3(0.38, 0.08, 0.05),   // dark red-brown
    grain
  );

  // Add fine grain variation
  baseColor += vec3(0.04, 0.01, 0.0) * grainFine;

  // Cracks are darker (like deep gouges)
  vec3 crackColor = vec3(0.08, 0.02, 0.01);
  baseColor = mix(baseColor, crackColor, cracks + fineCracks);

  // Seal engravings - subtle gold/amber in crevices
  vec3 sealColor = mix(
    vec3(0.4, 0.15, 0.05),    // amber
    vec3(0.5, 0.2, 0.08),     // gold-ish
    noise(uv * 8.0)
  );
  baseColor = mix(baseColor, sealColor, sealPattern * 0.5);

  // Edge darkening (vignette on each face)
  vec2 edgeDist = abs(uv - 0.5) * 2.0;
  float edgeFade = smoothstep(0.6, 1.0, max(edgeDist.x, edgeDist.y));
  baseColor *= (1.0 - edgeFade * 0.5);

  // === Cursed energy effects ===

  // Ominous emissive pulse - intensifies with activation
  float pulse = sin(uTime * 0.8) * 0.5 + 0.5;
  float pulse2 = sin(uTime * 1.3 + 2.0) * 0.5 + 0.5;
  float emissiveStrength = mix(0.04, 0.15, uActivation);
  vec3 emissive = vec3(0.6, 0.05, 0.02) * pulse * emissiveStrength;
  emissive += vec3(0.3, 0.0, 0.15) * pulse2 * emissiveStrength * 0.5;

  // Cracks glow with cursed energy when active
  float crackGlow = (cracks + fineCracks) * uActivation;
  emissive += vec3(0.8, 0.1, 0.05) * crackGlow * 0.4 * (0.5 + 0.5 * pulse);

  // Seal patterns glow
  emissive += sealColor * sealPattern * uActivation * 0.3 * (0.7 + 0.3 * pulse2);

  baseColor += emissive;

  // === Lighting ===
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(vNormal, lightDir), 0.0);

  // Fresnel-like rim light for supernatural feel
  float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
  rim = pow(rim, 3.0);
  vec3 rimColor = vec3(0.5, 0.05, 0.02) * rim * uActivation * 0.5;

  float ambient = 0.35;
  baseColor *= (ambient + diffuse * 0.65);
  baseColor += rimColor;

  // Surface roughness - subtle specular
  vec3 viewDir = normalize(-vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0);
  baseColor += vec3(0.08) * spec;

  gl_FragColor = vec4(baseColor, 1.0);
}
