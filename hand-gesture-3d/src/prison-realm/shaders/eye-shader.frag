precision highp float;

varying vec2 vUv;
varying vec3 vNormal;

uniform float uTime;
uniform float uBlinkPhase;    // 0.0 = open, 1.0 = closed
uniform float uBlinkOffset;   // per-eye blink timing offset
uniform vec3 uIrisColor;      // deep red/purple
uniform vec2 uLookDirection;  // -1..1 eye look direction
uniform float uActivation;    // 0=dormant, 1=fully active

// Noise for organic blood vessel texture
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
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8); // rotation for each octave
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 centered = (uv - 0.5) * 2.0;

  // Elliptical eye shape - more almond-shaped
  float eyeAspect = 1.8;
  float eyeShape = length(centered * vec2(1.0, eyeAspect));

  // Realistic blink with variable timing
  float blinkTime = uTime * 0.5 + uBlinkOffset;
  // Main blink cycle (~every 4 seconds, quick)
  float mainBlink = mod(blinkTime, 6.2831853);
  float blink = smoothstep(0.0, 0.12, abs(sin(mainBlink)));
  // Occasional double blink
  float doubleBlink = mod(blinkTime * 0.37, 6.2831853);
  float db = smoothstep(0.0, 0.1, abs(sin(doubleBlink * 3.0)));
  blink = min(blink, db);
  blink = mix(blink, 0.0, uBlinkPhase);

  // When dormant, eyes are mostly closed
  blink *= uActivation;

  // Eyelid with wrinkle detail
  float lidCrease = fbm(uv * vec2(8.0, 20.0)) * 0.08;
  float lidTop = smoothstep(0.0, 0.06, centered.y + 0.65 * blink + lidCrease);
  float lidBottom = smoothstep(0.0, 0.06, -centered.y + 0.6 * blink + lidCrease * 0.5);
  float lidMask = lidTop * lidBottom;

  // Eye boundary with softer edge
  float eyeEdge = smoothstep(1.0, 0.88, eyeShape);
  float eyeMask = eyeEdge * lidMask;

  // Pupil and iris with look direction
  vec2 pupilCenter = centered - uLookDirection * 0.18;
  float pupilDist = length(pupilCenter);

  // Iris with detailed radial patterns
  float irisRadius = 0.48;
  float irisMask = smoothstep(irisRadius, irisRadius - 0.04, pupilDist);
  float irisEdge = smoothstep(irisRadius - 0.02, irisRadius - 0.08, pupilDist);

  // Iris fibers - radial streaks
  float irisAngle = atan(pupilCenter.y, pupilCenter.x);
  float fiberPattern = 0.0;
  // Multiple layers of fiber detail
  fiberPattern += fbm(vec2(irisAngle * 6.0, pupilDist * 12.0) + uTime * 0.08) * 0.6;
  fiberPattern += noise(vec2(irisAngle * 12.0 + 50.0, pupilDist * 8.0)) * 0.3;
  // Radial lines
  float radialLines = abs(sin(irisAngle * 24.0)) * smoothstep(0.15, 0.4, pupilDist);
  fiberPattern += radialLines * 0.15;

  // Iris coloring with depth
  vec3 irisCol = uIrisColor * (0.5 + 0.5 * fiberPattern);
  // Darker ring at iris edge (limbal ring)
  irisCol *= mix(0.4, 1.0, smoothstep(irisRadius, irisRadius - 0.1, pupilDist));
  // Inner color variation
  vec3 innerIrisColor = uIrisColor * vec3(1.2, 0.8, 0.6);
  irisCol = mix(irisCol, innerIrisColor, smoothstep(0.25, 0.15, pupilDist));

  // Pupil with realistic dilation
  float pupilRadius = 0.13 + 0.04 * sin(uTime * 0.25);
  // Pupil dilates when less activated
  pupilRadius = mix(0.2, pupilRadius, uActivation);
  float pupilMask = smoothstep(pupilRadius, pupilRadius - 0.025, pupilDist);

  // Sclera (white with blood vessels)
  float vessels = fbm(centered * 7.0 + uTime * 0.03);
  // Create branching vessel pattern
  float vesselBranch = fbm(centered * 15.0 + 200.0);
  float vesselLines = smoothstep(0.35, 0.65, vessels);
  vesselLines += smoothstep(0.4, 0.55, vesselBranch) * 0.5;
  vesselLines = min(vesselLines, 1.0);

  // More vessels near the edges
  float edgeVesselBoost = smoothstep(0.3, 0.7, eyeShape);

  vec3 scleraColor = mix(
    vec3(0.93, 0.89, 0.86),   // slightly yellowish white
    vec3(0.65, 0.12, 0.08),    // blood vessel red
    vesselLines * (0.2 + edgeVesselBoost * 0.35)
  );

  // Subtle moisture/wetness effect
  float moisture = smoothstep(0.7, 0.3, eyeShape) * 0.1;
  scleraColor += vec3(moisture);

  // Compose eye
  vec3 eyeColor = scleraColor;
  eyeColor = mix(eyeColor, irisCol, irisMask * irisEdge);
  eyeColor = mix(eyeColor, vec3(0.01), pupilMask);

  // Multiple specular highlights for realism
  // Main light reflection
  float spec1 = smoothstep(0.1, 0.06, length(pupilCenter - vec2(-0.1, 0.13)));
  // Secondary smaller highlight
  float spec2 = smoothstep(0.06, 0.03, length(pupilCenter - vec2(0.06, 0.08)));
  // Window reflection (subtle)
  float spec3 = smoothstep(0.15, 0.08, length(pupilCenter - vec2(-0.05, 0.1)));
  spec3 *= 0.15;

  eyeColor += vec3(0.6) * spec1 * (1.0 - pupilMask * 0.5);
  eyeColor += vec3(0.3) * spec2 * (1.0 - pupilMask * 0.5);
  eyeColor += vec3(0.15) * spec3;

  // Eyelid skin with texture
  vec3 skinColor = vec3(0.22, 0.07, 0.05);
  float skinTexture = fbm(uv * 18.0) * 0.1;
  float skinPores = noise(uv * 60.0) * 0.03;
  skinColor += skinTexture + skinPores;

  // Dark circles under eye
  float underEye = smoothstep(0.0, -0.3, centered.y) * smoothstep(1.0, 0.5, eyeShape);
  skinColor -= vec3(0.05, 0.02, 0.01) * underEye;

  // Eyelid edge shadow
  float lidShadow = smoothstep(0.25, 0.0, abs(centered.y) - 0.45 * blink);

  // Final composition
  vec3 finalColor = mix(skinColor, eyeColor, eyeMask);
  finalColor *= (1.0 - lidShadow * 0.35);

  // Eyelash suggestion at lid edges
  float lashMask = smoothstep(0.02, 0.0, abs(centered.y - 0.6 * blink)) * eyeEdge;
  lashMask += smoothstep(0.02, 0.0, abs(-centered.y - 0.55 * blink)) * eyeEdge * 0.5;
  finalColor = mix(finalColor, vec3(0.02), lashMask * 0.7);

  // Ominous pulsing glow - more intense when active
  float pulse = sin(uTime * 1.5 + uBlinkOffset) * 0.5 + 0.5;
  float glowIntensity = mix(0.02, 0.06, uActivation);
  finalColor += vec3(0.5, 0.05, 0.05) * pulse * glowIntensity;

  // Cursed energy shimmer around iris
  float shimmer = sin(irisAngle * 8.0 + uTime * 4.0) * 0.5 + 0.5;
  finalColor += vec3(0.15, 0.0, 0.05) * shimmer * irisMask * 0.15 * uActivation;

  // Alpha
  float alpha = smoothstep(1.1, 0.85, eyeShape);

  gl_FragColor = vec4(finalColor, alpha);
}
