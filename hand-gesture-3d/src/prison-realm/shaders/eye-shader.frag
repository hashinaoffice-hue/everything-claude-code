precision highp float;

varying vec2 vUv;
varying vec3 vNormal;

uniform float uTime;
uniform float uBlinkPhase;    // 0.0 = open, 1.0 = closed
uniform float uBlinkOffset;   // per-eye blink timing offset
uniform vec3 uIrisColor;      // deep red/purple
uniform vec2 uLookDirection;  // -1..1 eye look direction

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
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 centered = (uv - 0.5) * 2.0;

  // Elliptical eye shape
  float eyeShape = length(centered * vec2(1.0, 1.6));

  // Blink animation - eyelids close from top and bottom
  float blinkTime = uTime * 0.5 + uBlinkOffset;
  float blinkCycle = mod(blinkTime, 6.2831853);
  // Quick blink: sharp close and open
  float blink = smoothstep(0.0, 0.15, abs(sin(blinkCycle)));
  blink = mix(blink, 0.0, uBlinkPhase);

  // Eyelid mask
  float lidTop = smoothstep(0.0, 0.08, centered.y + 0.7 * blink);
  float lidBottom = smoothstep(0.0, 0.08, -centered.y + 0.7 * blink);
  float lidMask = lidTop * lidBottom;

  // Eye boundary
  float eyeEdge = smoothstep(1.0, 0.92, eyeShape);
  float eyeMask = eyeEdge * lidMask;

  // Pupil and iris with look direction
  vec2 pupilCenter = centered - uLookDirection * 0.15;
  float pupilDist = length(pupilCenter);

  // Iris
  float irisRadius = 0.45;
  float irisMask = smoothstep(irisRadius, irisRadius - 0.05, pupilDist);

  // Iris detail - radial pattern
  float irisAngle = atan(pupilCenter.y, pupilCenter.x);
  float irisPattern = fbm(vec2(irisAngle * 3.0, pupilDist * 8.0) + uTime * 0.1);
  vec3 irisCol = uIrisColor * (0.6 + 0.4 * irisPattern);

  // Pupil
  float pupilRadius = 0.15 + 0.03 * sin(uTime * 0.3);
  float pupilMask = smoothstep(pupilRadius, pupilRadius - 0.03, pupilDist);

  // Sclera (white with blood vessels)
  float vessels = fbm(centered * 6.0 + uTime * 0.05);
  float vesselLines = smoothstep(0.3, 0.7, vessels);
  vec3 scleraColor = mix(
    vec3(0.92, 0.88, 0.85),  // slightly yellowish white
    vec3(0.7, 0.15, 0.1),     // blood vessel red
    vesselLines * 0.3
  );

  // Compose eye
  vec3 eyeColor = scleraColor;
  eyeColor = mix(eyeColor, irisCol, irisMask);
  eyeColor = mix(eyeColor, vec3(0.02), pupilMask);

  // Specular highlight
  float specular = smoothstep(0.12, 0.08, length(pupilCenter - vec2(-0.12, 0.12)));
  eyeColor += vec3(0.5) * specular * (1.0 - pupilMask);

  // Eyelid skin color (dark reddish)
  vec3 skinColor = vec3(0.25, 0.08, 0.06);
  float skinTexture = fbm(uv * 15.0) * 0.1;
  skinColor += skinTexture;

  // Eyelid edge shadow
  float lidShadow = smoothstep(0.3, 0.0, abs(centered.y) - 0.5 * blink);

  // Final composition
  vec3 finalColor = mix(skinColor, eyeColor, eyeMask);
  finalColor *= (1.0 - lidShadow * 0.3);

  // Subtle pulsing glow
  float pulse = 0.03 * sin(uTime * 1.5 + uBlinkOffset);
  finalColor += vec3(0.4, 0.05, 0.05) * pulse;

  // Alpha: full opacity for the eye area
  float alpha = smoothstep(1.1, 0.9, eyeShape);

  gl_FragColor = vec4(finalColor, alpha);
}
