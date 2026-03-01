import "./style.css";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

type Emotion = "happy" | "sad" | "surprised" | "angry" | "neutral" | "excited";
/* Helpful when identified unspecified emotions

EX: 
let emotion: Emotion = "happy";
emotion = "confused"; // ❌ TypeScript error: not a valid Emotion
emotion = "hapy"; // ❌ TypeScript error: typo caught immediately
*/

interface EmotionResult {
  //Any object that's a EmotionResult must have emotion type
  emotion: Emotion;
}

// ─── Emotion configuration to its image ───────────────────────────────────────────────────────────

const EMOTION_IMAGES: Record<Emotion, string> = {
  happy: "./images/expressions/happy.jpeg",
  sad: "./images/expressions/sad.jpeg",
  surprised: "./images/expressions/surprised.jpeg",
  angry: "./images/expressions/angry.jpeg",
  neutral: "./images/expressions/neutral.jpeg",
  excited: "./images/expressions/excited.jpeg",
};

// ─── Blend shape classifier ───────────────────────────────────────────────────
// MediaPipe outputs 52 "blend shape" values (0–1) describing facial muscle positions.
// We read key ones and score each emotion based on thresholds.

function classifyEmotion(
  blendShapes: { categoryName: string; score: number }[],
): EmotionResult {
  const s: Record<string, number> = {}; // Covert array to lookup dictionary (key:value)
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
      frown * 1.4 + browInner * 0.7 + (1.0 - dimple) * 0.2 + (1.0 - pucker) * 0.2,
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
    if (scores[key] < 0) scores[key] = 0;
  }

  // Find winner
  let best: Emotion = "neutral";
  let bestScore = -1;
  for (const [emotion, score] of Object.entries(scores) as [Emotion, number][]) {
    if (score > bestScore) {
      bestScore = score;
      best = emotion;
    }
  }

  return { emotion: best };
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const video           = document.getElementById("webcam") as HTMLVideoElement;
const webcamButton    = document.getElementById("webcamButton") as HTMLButtonElement;
const statusEl        = document.getElementById("status")!;
const emotionNameEl   = document.getElementById("emotion-name")!;
const expressionImg   = document.getElementById("expression-img") as HTMLImageElement;
const placeholder     = document.getElementById("image-placeholder")!;
const caption         = document.getElementById("expression-caption")!;
const loadingOverlay  = document.getElementById("loading-overlay")!;
const pills           = document.querySelectorAll<HTMLElement>(".pill");

// ─── State ────────────────────────────────────────────────────────────────────

let faceLandmarker: FaceLandmarker;
let webcamRunning = false;
let lastVideoTime = -1;
let currentEmotion: Emotion | null = null;

// Smoothing: keep a short history of emotions and pick the most frequent
const HISTORY_SIZE = 8;
const emotionHistory: Emotion[] = [];

// ─── Init MediaPipe ───────────────────────────────────────────────────────────

async function init() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });

  loadingOverlay.classList.add("hidden");
  webcamButton.disabled = false;
  setStatus("model ready — hit Start Camera");
}

// ─── Webcam ───────────────────────────────────────────────────────────────────

webcamButton.addEventListener("click", async () => {
  if (!faceLandmarker) return;

  if (webcamRunning) {
    webcamRunning = false;
    webcamButton.querySelector(".btn-text")!.textContent = "Start Camera";
    webcamButton.classList.remove("active");
    const tracks = (video.srcObject as MediaStream)?.getTracks();
    tracks?.forEach(t => t.stop());
    video.srcObject = null;
    setStatus("camera stopped");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.addEventListener("loadeddata", () => {
      webcamRunning = true;
      webcamButton.querySelector(".btn-text")!.textContent = "Stop Camera";
      webcamButton.classList.add("active");
      setStatus("detecting...");
      requestAnimationFrame(predict);
    }, { once: true });
  } catch (err) {
    setStatus("camera access denied");
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
      if (result.faceBlendshapes?.[0]?.categories) {
        const { emotion } = classifyEmotion(result.faceBlendshapes[0].categories);
        updateEmotionSmoothed(emotion);
      }
    } else {
      setStatus("no face detected");
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
    if (count > max) { max = count; dominant = e; }
  }

  updateUI(dominant);
}

// ─── UI updates ───────────────────────────────────────────────────────────────

function updateUI(emotion: Emotion) {
  if (emotion === currentEmotion) return; // no change, skip re-render
  currentEmotion = emotion;

  setStatus(`detected: ${emotion}`);

  // Emotion name
  emotionNameEl.textContent = emotion;
  emotionNameEl.className = `emotion-name emotion-${emotion}`;

  // Image
  expressionImg.src = EMOTION_IMAGES[emotion];
  expressionImg.classList.remove("hidden");
  expressionImg.classList.add("pop-in");
  placeholder.classList.add("hidden");
  // Remove animation class after it plays so it can re-trigger
  expressionImg.addEventListener("animationend", () => {
    expressionImg.classList.remove("pop-in");
  }, { once: true });

  // Highlight active pill
  pills.forEach(p => {
    p.classList.toggle("active", p.dataset.emotion === emotion);
  });
}

function clearEmotion() {
  currentEmotion = null;
  emotionNameEl.textContent = "—";
  emotionNameEl.className = "emotion-name";
  expressionImg.classList.add("hidden");
  placeholder.classList.remove("hidden");
  caption.textContent = "";
  pills.forEach(p => p.classList.remove("active"));
}

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();