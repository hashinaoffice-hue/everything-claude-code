import * as THREE from 'three';
import { CameraManager } from './camera/camera-manager';
import { HandTracker } from './tracking/hand-tracker';
import { LandmarkSmoother } from './tracking/landmark-smoother';
import { TwoHandDetector, TwoHandState, palmCenter } from './gestures/detectors/two-hand-detector';
import { PrisonRealm, PrisonRealmState } from './prison-realm/prison-realm';
import { detectDevice } from './utils/device-detect';
import { LANDMARK } from './tracking/tracking-types';
import { distance2D } from './utils/math-utils';
import type { HandData } from './tracking/tracking-types';
import type { Vec3 } from './utils/math-utils';

// ── DOM ───────────────────────────────────────────────────────
const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
const videoEl = document.getElementById('camera-feed') as HTMLVideoElement;
const overlayCanvas = document.getElementById('hand-overlay') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading') as HTMLDivElement;
const fpsDisplay = document.getElementById('fps-display') as HTMLDivElement;
const gestureDisplay = document.getElementById('gesture-display') as HTMLDivElement;
const instructionEl = document.getElementById('instruction') as HTMLDivElement;

// ── Three.js ──────────────────────────────────────────────────
const device = detectDevice();
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, alpha: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(device.pixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera3d.position.set(0, 0, 3);
camera3d.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0x444444, 1.2));
const dirLight = new THREE.DirectionalLight(0xffeedd, 0.9);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);
const cursedLight = new THREE.PointLight(0x0088ff, 0, 5);
scene.add(cursedLight);

// ── Prison Realm ──────────────────────────────────────────────
const prisonRealm = new PrisonRealm();
scene.add(prisonRealm.group);

// ── Modules ───────────────────────────────────────────────────
const cameraManager = new CameraManager(videoEl);
const handTracker = new HandTracker();
const smootherLeft = new LandmarkSmoother(21, 0.8, 0.005);
const smootherRight = new LandmarkSmoother(21, 0.8, 0.005);
const twoHandDetector = new TwoHandDetector();

// ── Smooth state ──────────────────────────────────────────────
let sPosX = 0, sPosY = 0, sScale = 0.3, sCursed = 0;
let sTiltX = 0, sTiltZ = 0;

function expSmooth(cur: number, tgt: number, spd: number, dt: number): number {
  return cur + (tgt - cur) * (1 - Math.exp(-spd * dt));
}

// ── Mode management ───────────────────────────────────────────
enum ControlMode {
  NONE = 'none',
  TWO_HAND = 'two_hand',
  ONE_HAND = 'one_hand',
}

let currentMode = ControlMode.NONE;
let modeChangeTs = 0;
const MODE_DEBOUNCE_MS = 500;

function trySetMode(newMode: ControlMode, now: number): void {
  if (newMode === currentMode) return;
  if ((now - modeChangeTs) < MODE_DEBOUNCE_MS) return;
  currentMode = newMode;
  modeChangeTs = now;
}

// ── One-hand state ────────────────────────────────────────────
let prevHandPalmX = 0, prevHandPalmY = 0, prevHandTs = 0;
let prevWristAngle = 0;
let oneHandRotSpeed = 0;
let isFist = false;
// Juggle
let throwVelX = 0, throwVelY = 0, isFlying = false;

// ── Hand helpers ──────────────────────────────────────────────

/** Detect fist: all fingertips close to palm center */
function detectFist(hand: HandData): boolean {
  const pc = palmCenter(hand);
  const tips = [LANDMARK.INDEX_TIP, LANDMARK.MIDDLE_TIP, LANDMARK.RING_TIP, LANDMARK.PINKY_TIP];
  let closedCount = 0;
  for (const tip of tips) {
    const d = distance2D(hand.landmarks[tip], pc);
    if (d < 0.08) closedCount++;
  }
  return closedCount >= 3;
}

/** Estimate hand "size" for depth/proximity scaling */
function handApparentSize(hand: HandData): number {
  const wrist = hand.landmarks[LANDMARK.WRIST];
  const middleTip = hand.landmarks[LANDMARK.MIDDLE_TIP];
  return distance2D(wrist, middleTip);
}

/** Get hand tilt angles from wrist→middle finger direction */
function handTilt(hand: HandData): { tiltX: number; tiltZ: number } {
  const wrist = hand.landmarks[LANDMARK.WRIST];
  const middle = hand.landmarks[LANDMARK.MIDDLE_MCP];
  const dx = middle.x - wrist.x;
  const dy = middle.y - wrist.y;
  // tiltZ = roll (left/right lean), tiltX = pitch (forward/back)
  return {
    tiltX: Math.atan2(dy, Math.abs(dx)) * 0.3,
    tiltZ: Math.atan2(dx, Math.abs(dy)) * 0.3,
  };
}

function wristAngle(hand: HandData): number {
  const w = hand.landmarks[LANDMARK.WRIST];
  const m = hand.landmarks[LANDMARK.MIDDLE_MCP];
  return Math.atan2(m.y - w.y, m.x - w.x);
}

// ── Overlay ───────────────────────────────────────────────────
const overlayCtx = overlayCanvas.getContext('2d')!;
function resizeOverlay(): void {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
}

const HAND_CHAINS = [
  [0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20],[5,9,13,17],
];

function drawHands(hands: readonly HandData[]): void {
  const w = overlayCanvas.width, h = overlayCanvas.height;
  overlayCtx.clearRect(0, 0, w, h);
  const active = twoHandDetector.isSummoned();

  for (const hand of hands) {
    const col = hand.handedness === 'Left' ? 'rgba(80,180,255,' : 'rgba(120,160,255,';
    overlayCtx.lineWidth = active ? 2 : 1.5;
    if (active) { overlayCtx.shadowColor = '#0088ff'; overlayCtx.shadowBlur = 8; }
    else overlayCtx.shadowBlur = 0;

    overlayCtx.strokeStyle = `${col}${active ? 0.8 : 0.5})`;
    for (const chain of HAND_CHAINS) {
      overlayCtx.beginPath();
      for (let i = 0; i < chain.length; i++) {
        const lm = hand.landmarks[chain[i]];
        const x = (1 - lm.x) * w, y = lm.y * h;
        i === 0 ? overlayCtx.moveTo(x, y) : overlayCtx.lineTo(x, y);
      }
      overlayCtx.stroke();
    }

    overlayCtx.fillStyle = `${col}${active ? 0.9 : 0.6})`;
    for (const idx of [0, 4, 8, 12, 16, 20]) {
      const lm = hand.landmarks[idx];
      overlayCtx.beginPath();
      overlayCtx.arc((1 - lm.x) * w, lm.y * h, active ? 3 : 2, 0, Math.PI * 2);
      overlayCtx.fill();
    }
    overlayCtx.shadowBlur = 0;
  }
}

function handToScene(nx: number, ny: number): { x: number; y: number } {
  const ndcX = (1 - nx) * 2 - 1, ndcY = -(ny * 2 - 1);
  const fov = THREE.MathUtils.degToRad(camera3d.fov / 2);
  const hH = Math.tan(fov) * camera3d.position.z, hW = hH * camera3d.aspect;
  return { x: ndcX * hW, y: ndcY * hH };
}

// ── FPS ───────────────────────────────────────────────────────
let fCnt = 0, lastFps = 0, prevTime = 0;
let detectFrame = 0;
const DETECT_EVERY = device.isMobile ? 2 : 1;
let lastHands: HandData[] = [];

const LABELS: Record<string, string> = {
  [TwoHandState.IDLE]: '대기 중',
  [TwoHandState.APART]: '양손 감지됨',
  [TwoHandState.PRAYER]: '합장 — 양손을 펼쳐 소환!',
  [TwoHandState.SUMMONING]: '전개 중...',
  [TwoHandState.CONTROLLING]: '양손 제어 중',
  [TwoHandState.COMPRESS]: '압축인...',
  [TwoHandState.RELEASE]: '해방!',
  [TwoHandState.SEALING]: '봉인인... 유지하세요',
};

// ── Main Loop ─────────────────────────────────────────────────
let isRunning = false;

function animate(): void {
  if (!isRunning) return;
  requestAnimationFrame(animate);

  const now = performance.now();
  const timeSec = now / 1000;
  const dt = prevTime > 0 ? Math.min((now - prevTime) / 1000, 0.1) : 0.016;
  prevTime = now;

  fCnt++;
  if (now - lastFps >= 1000) { fpsDisplay.textContent = `FPS: ${fCnt}`; fCnt = 0; lastFps = now; }

  // ── Detection ───────────────────────────────────────────────
  detectFrame++;
  if (detectFrame % DETECT_EVERY === 0) {
    const raw = handTracker.detect(videoEl, now);
    lastHands = raw.map((h) => ({
      ...h,
      landmarks: (h.handedness === 'Left' ? smootherLeft : smootherRight).smooth(h.landmarks, now),
    }));
  }

  drawHands(lastHands);

  let tPosX = sPosX, tPosY = sPosY, tScale = sScale, tCursed = 0;
  let tTiltX = 0, tTiltZ = 0;
  const summoned = twoHandDetector.isSummoned();

  // ── Determine desired mode ──────────────────────────────────
  if (!summoned) {
    trySetMode(ControlMode.NONE, now);
  } else if (lastHands.length >= 2) {
    trySetMode(ControlMode.TWO_HAND, now);
  } else if (lastHands.length === 1) {
    trySetMode(ControlMode.ONE_HAND, now);
  }
  // 0 hands + summoned: keep current mode (grace period)

  // ── TWO-HAND MODE ──────────────────────────────────────────
  if (currentMode === ControlMode.TWO_HAND || !summoned) {
    const g = twoHandDetector.detect(lastHands, now);

    if (g) {
      gestureDisplay.textContent = LABELS[g.state] ?? g.state;
      isFlying = false;

      switch (g.state) {
        case TwoHandState.PRAYER:
          instructionEl.style.opacity = '1';
          break;

        case TwoHandState.SUMMONING:
          instructionEl.style.opacity = '0';
          prisonRealm.summon();
          break;

        case TwoHandState.CONTROLLING: {
          instructionEl.style.opacity = '0';
          const p = handToScene(g.center.x, g.center.y);
          tPosX = p.x; tPosY = p.y;
          tScale = g.scale;
          prisonRealm.resetGestureEffects();
          tCursed = 0.3;
          break;
        }

        case TwoHandState.COMPRESS: {
          instructionEl.style.opacity = '0';
          const p = handToScene(g.center.x, g.center.y);
          tPosX = p.x; tPosY = p.y;
          tScale = g.scale;
          prisonRealm.applyCompress(g.gestureProgress);
          tCursed = 0.6;
          break;
        }

        case TwoHandState.RELEASE: {
          instructionEl.style.opacity = '0';
          const p = handToScene(g.center.x, g.center.y);
          tPosX = p.x; tPosY = p.y;
          prisonRealm.applyRelease();
          tCursed = 1.2;
          break;
        }

        case TwoHandState.SEALING: {
          instructionEl.style.opacity = '0';
          const p = handToScene(g.center.x, g.center.y);
          tPosX = p.x; tPosY = p.y;
          tScale = g.scale * Math.max(0, 1 - g.gestureProgress);
          prisonRealm.applySeal(g.gestureProgress);
          tCursed = Math.max(0, 0.8 - g.gestureProgress * 0.8);
          break;
        }

        default:
          if (!summoned) instructionEl.style.opacity = '1';
          break;
      }
    } else if (!summoned) {
      gestureDisplay.textContent = lastHands.length >= 1 ? '손 감지됨' : '대기 중';
      instructionEl.style.opacity = '1';
    }
  }

  // ── ONE-HAND MODE ──────────────────────────────────────────
  if (currentMode === ControlMode.ONE_HAND && summoned && lastHands.length >= 1) {
    const hand = lastHands[0];
    const pc = palmCenter(hand);
    const hp = handToScene(pc.x, pc.y);

    instructionEl.style.opacity = '0';

    // Fist detection
    isFist = detectFist(hand);

    // Hand velocity for flick
    const handDt = prevHandTs > 0 ? Math.max((now - prevHandTs) / 1000, 0.001) : 0.016;
    const handVelX = (hp.x - prevHandPalmX) / handDt;
    const handVelY = (hp.y - prevHandPalmY) / handDt;
    prevHandPalmX = hp.x;
    prevHandPalmY = hp.y;
    prevHandTs = now;

    // Hand size → scale (closer = bigger hand = bigger cube)
    const apparentSize = handApparentSize(hand);
    const sizeScale = THREE.MathUtils.clamp(apparentSize * 1.5, 0.15, 0.6);

    // Hand tilt → cube tilt
    const tilt = handTilt(hand);
    tTiltX = tilt.tiltX;
    tTiltZ = tilt.tiltZ;

    // Wrist twist → rotation
    const angle = wristAngle(hand);
    const angleDelta = angle - prevWristAngle;
    prevWristAngle = angle;

    if (isFist) {
      // Fist = stop rotation gradually
      oneHandRotSpeed = expSmooth(oneHandRotSpeed, 0, 5, dt);
      gestureDisplay.textContent = '주먹 — 회전 정지';
    } else if (Math.abs(angleDelta) < 0.3) {
      // Open hand twist → rotation speed
      const twistInput = angleDelta / handDt;
      if (Math.abs(twistInput) > 0.5) {
        oneHandRotSpeed = expSmooth(oneHandRotSpeed, twistInput * 2, 4, dt);
      }
    }

    // Apply rotation
    prisonRealm.setTwistSpeed(oneHandRotSpeed);

    const speed = Math.sqrt(handVelX * handVelX + handVelY * handVelY);

    if (isFlying) {
      // Flying: apply velocity with drag + gravity
      tPosX = sPosX + throwVelX * dt;
      tPosY = sPosY + throwVelY * dt;
      throwVelX *= (1 - 3 * dt);
      throwVelY *= (1 - 3 * dt);
      throwVelY -= 0.8 * dt;

      // Catch if hand is near
      const distToCube = Math.sqrt((hp.x - sPosX) ** 2 + (hp.y - sPosY) ** 2);
      if (distToCube < 1.0) {
        isFlying = false;
      }

      // Off-screen snap back
      if (Math.abs(tPosX) > 4 || Math.abs(tPosY) > 3) {
        isFlying = false;
        tPosX = hp.x;
        tPosY = hp.y;
      }

      tScale = sizeScale;
      tCursed = 0.2;
      gestureDisplay.textContent = '날아가는 중...';
    } else {
      // Magnet: follow hand
      tPosX = hp.x;
      tPosY = hp.y;
      tScale = sizeScale;

      // Flick detection
      if (speed > 6 && !isFist) {
        isFlying = true;
        throwVelX = handVelX * 0.5;
        throwVelY = handVelY * 0.5;
        gestureDisplay.textContent = '던지기!';
      } else if (!isFist) {
        gestureDisplay.textContent = '한 손 제어 중';
      }

      tCursed = 0.2;
    }

    // Eyes follow hand
    prisonRealm.setEyeLookDirection((pc.x - 0.5) * 2, -(pc.y - 0.5) * 2);
  }

  // ── No hands ────────────────────────────────────────────────
  if (lastHands.length === 0) {
    if (!summoned) {
      gestureDisplay.textContent = '대기 중';
      instructionEl.style.opacity = '1';
    }
    smootherLeft.reset();
    smootherRight.reset();
    prevHandTs = 0;
  }

  // ── Smoothing ───────────────────────────────────────────────
  const posSpeed = isFlying ? 25 : 6;
  sPosX = expSmooth(sPosX, tPosX, posSpeed, dt);
  sPosY = expSmooth(sPosY, tPosY, posSpeed, dt);
  sScale = expSmooth(sScale, tScale, 4, dt);
  sCursed = expSmooth(sCursed, tCursed, 4, dt);
  sTiltX = expSmooth(sTiltX, tTiltX, 5, dt);
  sTiltZ = expSmooth(sTiltZ, tTiltZ, 5, dt);

  prisonRealm.setPosition(sPosX, sPosY, 0);
  prisonRealm.setScale(sScale);
  prisonRealm.setTilt(sTiltX, sTiltZ);
  cursedLight.intensity = sCursed;
  cursedLight.position.set(sPosX, sPosY, 2);

  if (prisonRealm.getState() === PrisonRealmState.HIDDEN) {
    sCursed = expSmooth(sCursed, 0, 10, dt);
    cursedLight.intensity = sCursed;
  }

  prisonRealm.update(timeSec, dt);
  renderer.render(scene, camera3d);
}

// ── Resize ────────────────────────────────────────────────────
function onResize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  camera3d.aspect = w / h;
  camera3d.updateProjectionMatrix();
  renderer.setSize(w, h);
  resizeOverlay();
}
window.addEventListener('resize', onResize);

// ── Init ──────────────────────────────────────────────────────
async function init(): Promise<void> {
  try {
    resizeOverlay();
    await cameraManager.start();
    await handTracker.init();
    loadingEl.classList.add('hidden');
    isRunning = true;
    lastFps = performance.now();
    animate();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    loadingEl.innerHTML = `
      <h2 style="color: #0088cc;">오류 발생</h2>
      <p style="margin-top: 12px; max-width: 400px;">${msg}</p>
      <p style="margin-top: 8px; opacity: 0.6;">카메라 권한을 허용하고 페이지를 새로고침하세요.</p>
    `;
  }
}

init();
