import * as THREE from 'three';
import { CameraManager } from './camera/camera-manager';
import { HandTracker } from './tracking/hand-tracker';
import { LandmarkSmoother } from './tracking/landmark-smoother';
import { TwoHandDetector, TwoHandState } from './gestures/detectors/two-hand-detector';
import { PrisonRealm, PrisonRealmState } from './prison-realm/prison-realm';
import { detectDevice } from './utils/device-detect';
import type { HandData } from './tracking/tracking-types';

// ── DOM Elements ──────────────────────────────────────────────
const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
const videoEl = document.getElementById('camera-feed') as HTMLVideoElement;
const overlayCanvas = document.getElementById('hand-overlay') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading') as HTMLDivElement;
const fpsDisplay = document.getElementById('fps-display') as HTMLDivElement;
const gestureDisplay = document.getElementById('gesture-display') as HTMLDivElement;
const instructionEl = document.getElementById('instruction') as HTMLDivElement;

// ── Three.js Setup (transparent for AR overlay) ───────────────
const device = detectDevice();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !device.isMobile,
  alpha: true, // transparent background → camera shows through
});
renderer.setPixelRatio(device.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // fully transparent

const scene = new THREE.Scene();

const camera3d = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera3d.position.set(0, 0, 3);
camera3d.lookAt(0, 0, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0x444444, 1.2);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffeedd, 0.9);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);
// Subtle red point light for cursed atmosphere
const cursedLight = new THREE.PointLight(0xff2200, 0, 5);
scene.add(cursedLight);

// ── Prison Realm ──────────────────────────────────────────────
const prisonRealm = new PrisonRealm();
scene.add(prisonRealm.group);

// ── Core Modules ──────────────────────────────────────────────
const cameraManager = new CameraManager(videoEl);
const handTracker = new HandTracker();
const smootherLeft = new LandmarkSmoother(21, 1.2, 0.01);
const smootherRight = new LandmarkSmoother(21, 1.2, 0.01);
const twoHandDetector = new TwoHandDetector();

// ── Overlay Context ───────────────────────────────────────────
const overlayCtx = overlayCanvas.getContext('2d')!;

function resizeOverlay(): void {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
}

function drawHandOverlay(hands: readonly HandData[]): void {
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  overlayCtx.clearRect(0, 0, w, h);

  for (const hand of hands) {
    // Cursed energy glow effect on hands
    const isControlling = twoHandDetector.isSummoned();
    const baseColor = hand.handedness === 'Left'
      ? 'rgba(255, 60, 60,'
      : 'rgba(180, 60, 255,';

    overlayCtx.lineWidth = isControlling ? 2.5 : 1.5;

    // Draw connections with glow
    const connections = [
      [0, 1, 2, 3, 4],
      [0, 5, 6, 7, 8],
      [0, 9, 10, 11, 12],
      [0, 13, 14, 15, 16],
      [0, 17, 18, 19, 20],
      [5, 9, 13, 17],
    ];

    if (isControlling) {
      // Glow effect
      overlayCtx.shadowColor = hand.handedness === 'Left' ? '#ff3333' : '#aa33ff';
      overlayCtx.shadowBlur = 12;
    } else {
      overlayCtx.shadowBlur = 0;
    }

    overlayCtx.strokeStyle = `${baseColor} ${isControlling ? 0.9 : 0.6})`;
    for (const chain of connections) {
      overlayCtx.beginPath();
      for (let i = 0; i < chain.length; i++) {
        const lm = hand.landmarks[chain[i]];
        const x = (1 - lm.x) * w;
        const y = lm.y * h;
        if (i === 0) overlayCtx.moveTo(x, y);
        else overlayCtx.lineTo(x, y);
      }
      overlayCtx.stroke();
    }

    // Draw dots
    overlayCtx.fillStyle = `${baseColor} ${isControlling ? 1.0 : 0.7})`;
    for (const lm of hand.landmarks) {
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, isControlling ? 4 : 2.5, 0, Math.PI * 2);
      overlayCtx.fill();
    }

    overlayCtx.shadowBlur = 0;
  }
}

// ── Map normalized hand coords to 3D scene ────────────────────
function handToScene(nx: number, ny: number): { x: number; y: number } {
  // Convert normalized (0..1, mirrored) to NDC (-1..1)
  const ndcX = (1 - nx) * 2 - 1;
  const ndcY = -(ny * 2 - 1);

  // Project to world at z=0
  const fovRad = THREE.MathUtils.degToRad(camera3d.fov / 2);
  const worldHalfH = Math.tan(fovRad) * camera3d.position.z;
  const worldHalfW = worldHalfH * camera3d.aspect;

  return {
    x: ndcX * worldHalfW,
    y: ndcY * worldHalfH,
  };
}

// ── FPS Counter ───────────────────────────────────────────────
let frameCount = 0;
let lastFpsTime = 0;
let currentFps = 0;
let prevTime = 0;

function updateFps(now: number): void {
  frameCount++;
  if (now - lastFpsTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
    fpsDisplay.textContent = `FPS: ${currentFps}`;
  }
}

// ── State labels (Korean) ─────────────────────────────────────
const STATE_LABELS: Record<string, string> = {
  [TwoHandState.IDLE]: '대기 중',
  [TwoHandState.APART]: '양손 감지됨',
  [TwoHandState.CONVERGED]: '양손 모음 — 펼쳐서 소환!',
  [TwoHandState.SPREADING]: '소환 중...',
  [TwoHandState.CONTROLLING]: '옥문강 제어 중',
  [TwoHandState.DISMISSING]: '봉인 중...',
};

// ── Animation Loop ────────────────────────────────────────────
let isRunning = false;

function animate(): void {
  if (!isRunning) return;
  requestAnimationFrame(animate);

  const now = performance.now();
  const timeSec = now / 1000;
  const dt = prevTime > 0 ? Math.min((now - prevTime) / 1000, 0.1) : 0.016;
  prevTime = now;

  updateFps(now);

  // Detect hands
  const rawHands = handTracker.detect(videoEl, now);

  // Smooth landmarks per hand
  const smoothedHands: HandData[] = rawHands.map((hand) => {
    const smoother = hand.handedness === 'Left' ? smootherLeft : smootherRight;
    return {
      ...hand,
      landmarks: smoother.smooth(hand.landmarks, now),
    };
  });

  // Draw hand skeleton overlay
  drawHandOverlay(smoothedHands);

  // Two-hand gesture detection
  const gesture = twoHandDetector.detect(smoothedHands, now);

  if (gesture) {
    gestureDisplay.textContent = STATE_LABELS[gesture.state] ?? gesture.state;

    switch (gesture.state) {
      case TwoHandState.CONVERGED:
        // Show instruction
        instructionEl.style.opacity = '1';
        break;

      case TwoHandState.SPREADING:
        instructionEl.style.opacity = '0';
        prisonRealm.summon();
        break;

      case TwoHandState.CONTROLLING: {
        instructionEl.style.opacity = '0';

        // Position: prison realm follows the center between hands
        const pos = handToScene(gesture.center.x, gesture.center.y);
        prisonRealm.setPosition(pos.x, pos.y, 0);

        // Scale based on hand distance
        prisonRealm.setScale(gesture.scale);

        // Twist → rotation speed
        prisonRealm.setTwistSpeed(gesture.twistVelocity * 8);

        // Eyes follow hand movement
        prisonRealm.setEyeLookDirection(
          (gesture.center.x - 0.5) * 2,
          -(gesture.center.y - 0.5) * 2,
        );

        // Cursed light intensity follows activation
        cursedLight.intensity = 1.5;
        cursedLight.position.set(pos.x, pos.y, 2);
        break;
      }

      case TwoHandState.DISMISSING:
        prisonRealm.dismiss();
        cursedLight.intensity *= 0.95;
        break;

      default:
        if (!twoHandDetector.isSummoned()) {
          instructionEl.style.opacity = '1';
        }
        break;
    }
  } else {
    // No two-hand gesture active
    if (smoothedHands.length < 2 && !twoHandDetector.isSummoned()) {
      gestureDisplay.textContent = smoothedHands.length === 1 ? '한 손 감지됨' : '대기 중';
      instructionEl.style.opacity = '1';
    }

    // Reset smoothers when no hands
    if (smoothedHands.length === 0) {
      smootherLeft.reset();
      smootherRight.reset();
    }
  }

  // If hidden, fade out cursed light
  if (prisonRealm.getState() === PrisonRealmState.HIDDEN) {
    cursedLight.intensity *= 0.9;
  }

  // Update prison realm
  prisonRealm.update(timeSec, dt);

  // Render
  renderer.render(scene, camera3d);
}

// ── Resize Handler ────────────────────────────────────────────
function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
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

    // Start camera
    await cameraManager.start();

    // Init hand tracker (loads MediaPipe model)
    await handTracker.init();

    // Hide loading screen
    loadingEl.classList.add('hidden');

    // Start render loop
    isRunning = true;
    lastFpsTime = performance.now();
    animate();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    loadingEl.innerHTML = `
      <h2 style="color: #cc3333;">오류 발생</h2>
      <p style="margin-top: 12px; max-width: 400px;">${msg}</p>
      <p style="margin-top: 8px; opacity: 0.6;">카메라 권한을 허용하고 페이지를 새로고침하세요.</p>
    `;
  }
}

init();
