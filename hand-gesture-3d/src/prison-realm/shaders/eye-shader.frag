precision highp float;

varying vec2 vUv;
varying vec3 vNormal;

uniform float uTime;
uniform float uBlinkPhase;
uniform float uBlinkOffset;
uniform vec3 uIrisColor;      // cyan/blue tones
uniform vec2 uLookDirection;
uniform float uActivation;

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
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 centered = (uv - 0.5) * 2.0;

  // ── Teardrop / almond eye shape (pointed at bottom) ─────────
  // Wider at top, tapers to point at bottom
  float eyeAspect = 1.6;
  vec2 shaped = centered * vec2(1.0, eyeAspect);
  // Slight teardrop: shift bottom tighter
  shaped.y += centered.y * abs(centered.y) * 0.3;
  float eyeShape = length(shaped);

  // ── Blink ───────────────────────────────────────────────────
  float blinkTime = uTime * 0.4 + uBlinkOffset;
  float blink = smoothstep(0.0, 0.15, abs(sin(mod(blinkTime, 6.2831853))));
  float doubleBlink = smoothstep(0.0, 0.12, abs(sin(mod(blinkTime * 0.31, 6.2831853) * 3.0)));
  blink = min(blink, doubleBlink);
  blink = mix(blink, 0.0, uBlinkPhase);
  blink *= uActivation;

  // ── Eyelid ──────────────────────────────────────────────────
  float lidTop = smoothstep(0.0, 0.08, centered.y + 0.6 * blink);
  float lidBot = smoothstep(0.0, 0.08, -centered.y + 0.55 * blink);
  float lidMask = lidTop * lidBot;

  float eyeEdge = smoothstep(1.0, 0.85, eyeShape);
  float eyeMask = eyeEdge * lidMask;

  // ── Metallic eye socket rim ─────────────────────────────────
  // Dark metallic border around the eye opening
  float rimDist = abs(eyeShape - 0.9);
  float socketRim = smoothstep(0.12, 0.02, rimDist);
  vec3 rimColor = vec3(0.18, 0.18, 0.20); // dark metallic
  float rimHighlight = smoothstep(0.08, 0.03, rimDist) * 0.15;
  rimColor += vec3(rimHighlight);

  // ── Pupil + iris with look direction ────────────────────────
  vec2 pupilCenter = centered - uLookDirection * 0.15;
  float pupilDist = length(pupilCenter);

  // Iris
  float irisRadius = 0.45;
  float irisMask = smoothstep(irisRadius, irisRadius - 0.04, pupilDist);
  float irisEdge = smoothstep(irisRadius - 0.02, irisRadius - 0.08, pupilDist);

  // Iris fiber patterns
  float irisAngle = atan(pupilCenter.y, pupilCenter.x);
  float fiber = fbm(vec2(irisAngle * 5.0, pupilDist * 10.0) + uTime * 0.06) * 0.5;
  fiber += noise(vec2(irisAngle * 10.0 + 50.0, pupilDist * 7.0)) * 0.3;
  float radial = abs(sin(irisAngle * 20.0)) * smoothstep(0.15, 0.35, pupilDist) * 0.12;
  fiber += radial;

  // ── Iris color: cyan/blue (matching reference) ──────────────
  vec3 irisCol = uIrisColor * (0.6 + 0.4 * fiber);
  // Limbal ring (dark outer edge)
  irisCol *= mix(0.35, 1.0, smoothstep(irisRadius, irisRadius - 0.1, pupilDist));
  // Bright inner ring
  vec3 innerCol = uIrisColor * vec3(1.3, 1.1, 0.9);
  irisCol = mix(irisCol, innerCol, smoothstep(0.22, 0.12, pupilDist));

  // Emissive glow — iris glows when active
  float glowPulse = sin(uTime * 1.5 + uBlinkOffset) * 0.5 + 0.5;
  vec3 irisGlow = uIrisColor * 0.3 * uActivation * (0.6 + 0.4 * glowPulse);
  irisCol += irisGlow;

  // Pupil
  float pupilR = 0.12 + 0.03 * sin(uTime * 0.3);
  pupilR = mix(0.18, pupilR, uActivation);
  float pupilMask = smoothstep(pupilR, pupilR - 0.02, pupilDist);

  // ── Sclera: dark, not white (like the reference) ────────────
  // The reference shows dark/black sclera, not white
  vec3 scleraColor = vec3(0.06, 0.06, 0.08);
  // Slight vessel variation
  float vessels = fbm(centered * 6.0) * 0.04;
  scleraColor += vec3(vessels * 0.5, vessels * 0.3, vessels);

  // ── Compose eye ─────────────────────────────────────────────
  vec3 eyeColor = scleraColor;
  eyeColor = mix(eyeColor, irisCol, irisMask * irisEdge);
  eyeColor = mix(eyeColor, vec3(0.01), pupilMask);

  // Specular highlights
  float spec1 = smoothstep(0.09, 0.04, length(pupilCenter - vec2(-0.08, 0.12)));
  float spec2 = smoothstep(0.05, 0.02, length(pupilCenter - vec2(0.05, 0.07)));
  eyeColor += vec3(0.4) * spec1 * (1.0 - pupilMask * 0.5);
  eyeColor += vec3(0.2) * spec2;

  // ── Eye socket (metallic surround) ──────────────────────────
  // Outside the eye opening: dark metallic surface matching cube
  float socketNoise = fbm(uv * 10.0) * 0.06;
  vec3 socketColor = vec3(0.15, 0.15, 0.17) + socketNoise;

  // ── Final composition ───────────────────────────────────────
  vec3 finalColor = socketColor;
  // Rim around eye
  finalColor = mix(finalColor, rimColor, socketRim);
  // Eye itself
  finalColor = mix(finalColor, eyeColor, eyeMask);

  // Eyelid skin = dark metallic (same as cube surface)
  vec3 lidColor = vec3(0.14, 0.14, 0.16) + fbm(uv * 12.0) * 0.04;
  float lidCover = 1.0 - lidMask;
  finalColor = mix(finalColor, lidColor, lidCover * eyeEdge);

  // Alpha: fade at edges
  float alpha = smoothstep(1.2, 0.8, eyeShape);

  gl_FragColor = vec4(finalColor, alpha);
}
