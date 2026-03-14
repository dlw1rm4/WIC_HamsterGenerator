import "./style.css";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

type Emotion = "happy" | "sad" | "surprised" | "angry" | "neutral" | "excited";

interface EmotionResult {
  //Any object that's a EmotionResult must have emotion type
  emotion: Emotion;
}

// ─── Preload Emotion images to paste onto canvas ───────────────────────────────────────────────────────────

const EMOTION_IMAGES: Record<Emotion, string> = {
  happy: "./images/expressions/happy.jpeg",
  sad: "./images/expressions/sad.jpeg",
  surprised: "./images/expressions/surprised.jpeg",
  angry: "./images/expressions/angry.jpeg",
  neutral: "./images/expressions/neutral.jpeg",
  excited: "./images/expressions/excited.jpeg",
};

const EMOTION_IMAGE_ELEMENTS: Partial<Record<Emotion, HTMLImageElement>> = {};
for (const [emotion, src] of Object.entries(EMOTION_IMAGES) as [Emotion, string][]) {
  const img = new Image();
  img.src = src;
  EMOTION_IMAGE_ELEMENTS[emotion] = img;
}

// ─── Blend shape classifier ───────────────────────────────────────────────────
// MediaPipe outputs 52 "blend shape" values (0–1) describing facial muscle positions.
// We read key ones and score each emotion based on thresholds.

function classifyEmotion(
  blendShapes: { categoryName: string; score: number }[],
): EmotionResult {
  const s: Record<string, number> = {}; // s is thhe dictionary of different features and their values, such as s["mouthSmileLeft"] = 0.8
  for (const b of blendShapes) {
    s[b.categoryName] = b.score;
  }

  const get = (name: string) => s[name] ?? 0; // Helper function to find the blend shape value by its name

  // Key blend shapes used:
  // mouthSmileLeft / mouthSmileRight    → smile
  // mouthFrownLeft / mouthFrownRight    → frown / sad
  // mouthPucker                         → if high, puckered lips (kissy face). if low, it a frowning
  // jawOpen                             → mouth open
  // browInnerUp                         → raised inner brows (sad / surprised)
  // browOuterUpLeft / browOuterUpRight  → raised outer brows (surprised / excited)
  // browDownLeft / browDownRight        → furrowed brows (angry)
  // eyeWideLeft / eyeWideRight          → wide eyes (surprised / excited)
  // cheekSquintLeft / cheekSquintRight  → squinting (angry / happy scrunch)
  // noseSneerLeft / noseSneerRight      → sneer (angry / disgusted)

  const smile = (get("mouthSmileLeft") + get("mouthSmileRight")) / 2;
  const frown = (get("mouthFrownLeft") + get("mouthFrownRight")) / 2;
  const dimple = (get("mouthDimpleLeft") + get("mouthDimpleRight")) / 2;
  const pucker = get("mouthPucker");
  const jawOpen = get("jawOpen");
  const browUp = (get("browOuterUpLeft") + get("browOuterUpRight")) / 2;
  const browInner = get("browInnerUp");
  const browDown = (get("browDownLeft") + get("browDownRight")) / 2;
  const eyeWide = (get("eyeWideLeft") + get("eyeWideRight")) / 2;
  const cheekSquint = (get("cheekSquintLeft") + get("cheekSquintRight")) / 2;
  const sneer = (get("noseSneerLeft") + get("noseSneerRight")) / 2;
  const mouthShrug = (get("mouthShrugUpper") + get("mouthShrugLower")) / 2;
  const eyeSquint = (get("eyeSquintLeft") + get("eyeSquintRight")) / 2;
  const eyeLookDown = (get("eyeLookDownLeft") + get("eyeLookDownRight")) / 2;

  // Each emotion parameter
  const scores: Record<Emotion, number> = {
    happy: smile * 1.5 + cheekSquint * 0.5,
    excited: smile * 1.0 + eyeWide * 0.8 + browUp * 0.6 + jawOpen * 0.4,
    surprised: jawOpen * 1.4 + eyeWide * 1.0 + browUp * 0.6 + browInner * 0.4,
    sad:
      frown * 1.4 +
      browInner * 0.7 +
      (1.0 - dimple) * 0.2 +
      (1.0 - pucker) * 0.2,
    angry:
      eyeSquint * 1.2 +
      mouthShrug * 1.0 +
      eyeLookDown * 0.7 +
      browDown * 0.5 +
      sneer * 0.5 -
      smile * 0.5,
    neutral:
      1.1 -
      (smile +
        frown +
        jawOpen +
        browUp +
        browDown +
        eyeWide +
        eyeSquint +
        mouthShrug) /
        4,
  };

  // Clamp negatives to 0
  for (const key of Object.keys(scores) as Emotion[]) {
    if (scores[key] < 0) {
      scores[key] = 0;
    }
  }

  // Find winner
  let best: Emotion = "neutral";
  let bestScore = -1;
  for (const [emotion, score] of Object.entries(scores) as [
    Emotion,
    number,
  ][]) {
    if (score > bestScore) {
      bestScore = score;
      best = emotion;
    }
  }

  return { emotion: best };
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const video = document.getElementById("webcam") as HTMLVideoElement;
const cameraOverlay = document.getElementById("camera-overlay")!;
const webcamButton = document.getElementById(
  "webcamButton",
) as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const emotionNameEl = document.getElementById("emotion-name")!;
const expressionCanvas = document.getElementById("expression-canvas") as HTMLCanvasElement;
const ctx = expressionCanvas.getContext("2d")!; // CanvasRenderingContext2D object representing a two-dimensional rendering context
const placeholder = document.getElementById("image-placeholder")!;
const pills = document.querySelectorAll<HTMLElement>(".pill");


// ─── State ────────────────────────────────────────────────────────────────────

let faceLandmarker: FaceLandmarker;
let webcamRunning = false;
let lastVideoTime = -1;
let currentEmotion: Emotion | null = null;

// Smoothing: keep a short history of emotions and pick the most frequent
const HISTORY_SIZE = 8;
const emotionHistory: Emotion[] = [];

function drawImgCanvas(normX: number, normY: number) { //To balance the img, we normalize the x and y coordinates to center the image on the live cam
  expressionCanvas.width = video.videoWidth;
  expressionCanvas.height = video.videoHeight;
  ctx.clearRect(0, 0, expressionCanvas.width, expressionCanvas.height); //Transparent img frame (consistent size)

  // Test cases
  if (!currentEmotion) return;
  const img = EMOTION_IMAGE_ELEMENTS[currentEmotion];
  if (!img?.complete) return;

  const px = normX * expressionCanvas.width;
  const py = normY * expressionCanvas.height;
  const size = expressionCanvas.width * 0.15;

  ctx.drawImage(img, px - (size / 2), py - size, size, size);
}

async function requestCamera() {
  // Immediately request camera access
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.addEventListener(
      "loadeddata",
      () => {
        cameraOverlay.classList.add("hidden");
        setStatus("Camera's ready! Hit Start!");
        webcamButton.disabled = false;
      },
      { once: true },
    );
  } catch (err: any) {
    if (err.name === "NotAllowedError") {
      cameraOverlay.textContent = "Camera access denied.";
    } else if (err.name === "NotFoundError") {
      cameraOverlay.textContent = "No camera found.";
    } else {
      cameraOverlay.textContent = "Camera error.";
    }
    console.error(err);
  }
}

// ─── Init MediaPipe ───────────────────────────────────────────────────────────

async function init() {
  webcamButton.disabled = true; // keep start btn disabled until camera is ready
  cameraOverlay.textContent = "Checking for camera access...";

  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });

  await requestCamera();
}

// ─── Webcam ───────────────────────────────────────────────────────────────────

webcamButton.addEventListener("click", async () => {
  if (!faceLandmarker) return;

  if (webcamRunning) {
    webcamRunning = false;
    webcamButton.querySelector(".btn-text")!.textContent = "Start Camera";
    webcamButton.classList.remove("active");
    const tracks = (video.srcObject as MediaStream)?.getTracks();
    tracks?.forEach((t) => t.stop()); // Safety measure in case of multiple tracks
    video.srcObject = null;
    cameraOverlay.classList.remove("hidden");
    cameraOverlay.textContent = "Camera stopped. Click Start to try again.";
    clearEmotion();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.addEventListener(
      "loadeddata",
      () => {
        webcamRunning = true;
        cameraOverlay.classList.add("hidden");
        webcamButton.querySelector(".btn-text")!.textContent = "Stop Camera";
        webcamButton.classList.add("active");
        requestAnimationFrame(predict);
      },
      { once: true },
    );
  } catch (err: any) {
    cameraOverlay.classList.remove("hidden");
    if (err.name === "NotAllowedError") {
      cameraOverlay.textContent = "Camera access denied.";
    } else if (err.name === "NotFoundError") {
      cameraOverlay.textContent = "No camera found.";
    } else {
      cameraOverlay.textContent = "Camera error.";
    }
    console.error(err);
  }
});

// ─── Prediction loop ──────────────────────────────────────────────────────────

async function predict() {
  if (!webcamRunning) return;

  const nowMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;

    const result = faceLandmarker.detectForVideo(video, nowMs);

    if (result.faceLandmarks?.length) {
      const lm = result.faceLandmarks[0]; 

      if (result.faceBlendshapes?.[0]?.categories) {
        const { emotion } = classifyEmotion(
          result.faceBlendshapes[0].categories,
        );
        updateEmotionSmoothed(emotion);
      }

      drawImgCanvas(lm[10].x, lm[10].y); //Upper forehead x and y coordinates
      
    } else {
      setStatus("No face detected...");
      clearEmotion();
    }
  }

  requestAnimationFrame(predict);
}

// ─── Smoothing ────────────────────────────────────────────────────────────────

function updateEmotionSmoothed(emotion: Emotion) {
  emotionHistory.push(emotion);
  if (emotionHistory.length > HISTORY_SIZE) emotionHistory.shift();

  // Count frequency
  const freq: Partial<Record<Emotion, number>> = {};
  for (const e of emotionHistory) freq[e] = (freq[e] ?? 0) + 1;

  // Pick most frequent
  let dominant: Emotion = emotion;
  let max = 0;
  for (const [e, count] of Object.entries(freq) as [Emotion, number][]) {
    if (count > max) {
      max = count;
      dominant = e;
    }
  }

  updateUI(dominant);
}

// ─── UI updates ───────────────────────────────────────────────────────────────

function updateUI(emotion: Emotion) {
  if (emotion === currentEmotion) return; // no change, skip re-render
  currentEmotion = emotion;

  setStatus(`Detected: ${emotion}`);

  // Emotion name
  emotionNameEl.textContent = emotion;
  emotionNameEl.className = `emotion-name emotion-${emotion}`;
  placeholder.classList.add("hidden");

  // Highlight active pill
  pills.forEach((p) => {
    p.classList.toggle("active", p.dataset.emotion === emotion);
  });
}

function clearEmotion() {
  currentEmotion = null;
  emotionNameEl.textContent = "";
  emotionNameEl.className = "emotion-name";
  ctx.clearRect(0, 0, expressionCanvas.width, expressionCanvas.height);
  placeholder.classList.remove("hidden");
  pills.forEach((p) => p.classList.remove("active"));
}

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

init();