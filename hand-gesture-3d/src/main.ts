import * as THREE from 'three';
import { CameraManager } from './camera/camera-manager';
import { HandTracker } from './tracking/hand-tracker';
import { LandmarkSmoother } from './tracking/landmark-smoother';
import { GestureRecognizer } from './gestures/gesture-recognizer';
import { GestureState, GestureType } from './gestures/gesture-types';
import { PrisonRealm } from './prison-realm/prison-realm';
import { detectDevice } from './utils/device-detect';
import type { HandData } from './tracking/tracking-types';

// ── DOM Elements ──────────────────────────────────────────────
const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
const videoEl = document.getElementById('camera-feed') as HTMLVideoElement;
const overlayCanvas = document.getElementById('hand-overlay') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading') as HTMLDivElement;
const fpsDisplay = document.getElementById('fps-display') as HTMLDivElement;
const gestureDisplay = document.getElementById('gesture-display') as HTMLDivElement;

// ── Three.js Setup ────────────────────────────────────────────
const device = detectDevice();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !device.isMobile,
  alpha: true,
});
renderer.setPixelRatio(device.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 0, 3);
camera.lookAt(0, 0, 0);

// Ambient + directional light
scene.add(new THREE.AmbientLight(0x333333, 1.0));
const dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);

// ── Prison Realm ──────────────────────────────────────────────
const prisonRealm = new PrisonRealm();
scene.add(prisonRealm.group);

// ── Core Modules ──────────────────────────────────────────────
const cameraManager = new CameraManager(videoEl);
const handTracker = new HandTracker();
const smoother = new LandmarkSmoother(21, 1.0, 0.007);
const gestureRecognizer = new GestureRecognizer();

// ── Overlay Context ───────────────────────────────────────────
const overlayCtx = overlayCanvas.getContext('2d')!;

function drawHandOverlay(hands: readonly HandData[]): void {
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  overlayCtx.clearRect(0, 0, w, h);

  for (const hand of hands) {
    overlayCtx.strokeStyle = hand.handedness === 'Left'
      ? 'rgba(255, 80, 80, 0.8)'
      : 'rgba(80, 150, 255, 0.8)';
    overlayCtx.lineWidth = 2;
    overlayCtx.fillStyle = overlayCtx.strokeStyle;

    // Draw landmark dots
    for (const lm of hand.landmarks) {
      const x = (1 - lm.x) * w; // mirror
      const y = lm.y * h;
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, 3, 0, Math.PI * 2);
      overlayCtx.fill();
    }

    // Draw connections (simplified - fingers)
    const connections = [
      [0, 1, 2, 3, 4],       // thumb
      [0, 5, 6, 7, 8],       // index
      [0, 9, 10, 11, 12],    // middle
      [0, 13, 14, 15, 16],   // ring
      [0, 17, 18, 19, 20],   // pinky
      [5, 9, 13, 17],        // palm
    ];

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
  }
}

// ── FPS Counter ───────────────────────────────────────────────
let frameCount = 0;
let lastFpsTime = 0;
let currentFps = 0;

function updateFps(now: number): void {
  frameCount++;
  if (now - lastFpsTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
    fpsDisplay.textContent = `FPS: ${currentFps}`;
  }
}

// ── Animation Loop ────────────────────────────────────────────
let isRunning = false;

function animate(): void {
  if (!isRunning) return;
  requestAnimationFrame(animate);

  const now = performance.now();
  const timeSec = now / 1000;

  updateFps(now);

  // Detect hands
  const rawHands = handTracker.detect(videoEl, now);

  // Smooth landmarks + process gestures
  const smoothedHands: HandData[] = rawHands.map((hand) => ({
    ...hand,
    landmarks: smoother.smooth(hand.landmarks, now),
  }));

  // Draw hand overlay
  drawHandOverlay(smoothedHands);

  // Process gestures
  let gestureLabel = 'None';
  for (const hand of smoothedHands) {
    const events = gestureRecognizer.process(hand);

    for (const event of events) {
      if (event.type === GestureType.PINCH) {
        if (event.state === GestureState.ACTIVE) {
          // Pinch drag → rotate the prison realm
          prisonRealm.rotate(event.delta.x, event.delta.y);
          gestureLabel = `Pinch (${hand.handedness})`;
        } else if (event.state === GestureState.STARTED) {
          gestureLabel = `Pinch Start (${hand.handedness})`;
        }
      }
    }

    // Eye follows hand center (index finger tip)
    const indexTip = hand.landmarks[8];
    if (indexTip) {
      prisonRealm.setEyeLookDirection(
        (indexTip.x - 0.5) * 2,
        -(indexTip.y - 0.5) * 2,
      );
    }
  }

  if (smoothedHands.length === 0) {
    gestureRecognizer.reset();
    smoother.reset();
  }

  gestureDisplay.textContent = `Gesture: ${gestureLabel}`;

  // Update prison realm
  prisonRealm.update(timeSec);

  // Render
  renderer.render(scene, camera);
}

// ── Resize Handler ────────────────────────────────────────────
function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ── Init ──────────────────────────────────────────────────────
async function init(): Promise<void> {
  try {
    // Start camera
    await cameraManager.start();

    // Size overlay to match video feed display
    const videoRect = videoEl.getBoundingClientRect();
    overlayCanvas.width = videoRect.width;
    overlayCanvas.height = videoRect.height;

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
