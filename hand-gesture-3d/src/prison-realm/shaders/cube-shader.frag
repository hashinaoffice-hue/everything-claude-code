precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uActivation;

// ── Noise ─────────────────────────────────────────────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

// Voronoi for pitting/erosion
vec2 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 31.0));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) md = d;
    }
  }
  return vec2(md);
}

void main() {
  vec2 uv = vUv;

  // ── Dark metallic stone base ────────────────────────────────
  // Rough granular texture like aged iron/stone
  float grain1 = fbm(uv * 14.0 + 5.0);
  float grain2 = fbm(uv * 28.0 + 50.0);
  float grain3 = noise(uv * 60.0); // fine surface pores

  // Voronoi pitting — creates rough, pocked surface like the reference
  vec2 vor1 = voronoi(uv * 8.0);
  float pitting = smoothstep(0.08, 0.02, vor1.x) * 0.25;

  vec2 vor2 = voronoi(uv * 16.0 + 100.0);
  float finePitting = smoothstep(0.06, 0.01, vor2.x) * 0.15;

  // ── Color: dark silver/gunmetal with variation ──────────────
  // Base: dark gunmetal gray
  vec3 baseColor = vec3(0.22, 0.22, 0.24);

  // Lighter patches (oxidation variation)
  baseColor += vec3(0.08) * grain1;
  // Darker crevices
  baseColor -= vec3(0.06) * (1.0 - grain2);
  // Fine grain
  baseColor += vec3(0.02) * grain3;

  // Pitting makes surface darker in holes
  baseColor -= vec3(0.12) * pitting;
  baseColor -= vec3(0.08) * finePitting;

  // ── Edge wear (lighter edges like worn metal) ───────────────
  vec2 edgeDist = abs(uv - 0.5) * 2.0;
  float edge = smoothstep(0.85, 1.0, max(edgeDist.x, edgeDist.y));
  // Beveled edge highlight
  float bevel = smoothstep(0.92, 0.96, max(edgeDist.x, edgeDist.y));
  baseColor += vec3(0.06) * edge;
  baseColor += vec3(0.03) * bevel;

  // Edge lines (dark seams between faces)
  float edgeLine = smoothstep(0.01, 0.0, 1.0 - max(edgeDist.x, edgeDist.y));
  baseColor -= vec3(0.15) * edgeLine;

  // ── Subtle cursed energy when active ────────────────────────
  float pulse = sin(uTime * 1.2) * 0.5 + 0.5;
  float pulse2 = sin(uTime * 0.7 + 2.0) * 0.5 + 0.5;

  // Faint blue glow in crevices when activated
  float emissiveStr = uActivation * 0.08;
  vec3 emissive = vec3(0.05, 0.15, 0.35) * pulse * emissiveStr;
  emissive += vec3(0.02, 0.08, 0.2) * pulse2 * emissiveStr;

  // Pitting glows faintly
  emissive += vec3(0.03, 0.12, 0.25) * (pitting + finePitting) * uActivation * 0.3 * pulse;

  baseColor += emissive;

  // ── Metallic lighting ───────────────────────────────────────
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(vNormal, lightDir), 0.0);

  // Metallic specular (sharper, brighter)
  vec3 viewDir = normalize(-vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(vNormal, halfDir), 0.0), 48.0);

  // Fresnel rim
  float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
  rim = pow(rim, 4.0);
  vec3 rimColor = vec3(0.08, 0.15, 0.25) * rim * uActivation * 0.3;

  float ambient = 0.4;
  baseColor *= (ambient + diffuse * 0.6);
  // Metallic specular has color tint
  baseColor += vec3(0.12, 0.12, 0.14) * spec;
  baseColor += rimColor;

  gl_FragColor = vec4(baseColor, 1.0);
}
