// ============================================================
//  THINGS I SHOULD HAVE SAID
//  Built on top of the original working classifier pattern:
//
//    preload()  → ml5.imageClassifier(url, { flipped:true })
//    setup()    → createCapture + classifyStart(video, gotResults)
//    gotResults → updates label variable each frame
//    draw()     → reads label, reacts to it
//
//  Nothing changed about how classification works.
//  Game logic, gestures, and UI are layered on top.
// ============================================================

// ── ORIGINAL CLASSIFIER VARS (unchanged from your working code) ──
let classifier;
let video;
let label = "waiting...";

// ── MEDIAPIPE HANDS ──────────────────────────────────────────────
let mpHands;
let gestureLabel     = "none";   // "palm" | "pinch" | "none"
let palmHoldCount    = 0;
const HOLD_FRAMES    = 18;       // frames palm must be held before firing
let palmFired        = false;
let palmBlockedUntil = 0;        // 2-second block after palm fires
let lastPinchTime    = 0;
const PINCH_COOLDOWN = 900;

// ── GAME STATE ───────────────────────────────────────────────────
const STATE = {
  TITLE:     "TITLE",
  PORCH:     "PORCH",
  HALL_WORK: "HALL_WORK",  // hallway — work phone trigger
  HALL_DAD:  "HALL_DAD",   // hallway — dad's missed call trigger
  KITCHEN:   "KITCHEN"
};
let gameState        = STATE.TITLE;
let isFading         = false;
let waitingForObject = false;   // true = classifier mode, gestures OFF
let objectDetected   = false;
let objectCooldown   = false;

// ── SCENE DATA ───────────────────────────────────────────────────
const SCENES = {

  // ── PORCH ────────────────────────────────────────────────
  PORCH: {
    bg:               "./images/porch.png",
    objectTrigger:    "key",
    objectPromptText: "— present the key —",
    objectImage:      "./images/hand_key.png",
    lines: [
      "The house looked smaller than I remembered.",
      "The wind chime was still there.\nStill off rhythm.\nStill trying.",
      "They called on Tuesday.\n“Come quickly. Sort everything.\nThe property needs to be sold.”",
      "I was nine when Mom died.\nDad and I didn’t talk about it.\nWe just… moved around each other.\nTwo people in a house that used to hold three.",
      "He got busier after.\nLonger hours. A new job.\nI thought he wanted to forget.\nI didn’t know what he was carrying.\nI didn’t ask.",
      "By the time I was old enough to ask,\nI was already too angry.",
      "The night I told him I’d applied for studio art,\nhe looked at me like I’d said something dangerous.\n\n“You’re throwing your life away.”",
      "I had spent years waiting for him to show up.\nAnd when he finally did,\nit was to take something from me.",
      "I told him he had no right.\nI left that night.\nI didn’t look back.",
      "That was ten years ago.",
      "I reached into my bag.\nPast my own life, carefully built somewhere else.\nSearching for the one thing I brought\nthat belonged here.",
      null
    ]
  },

  // ── HALLWAY — PHASE 1: work notifications ────────────────
  // Shows hand_phone_work.png on recognition, then continues
  // dialogue in the same room before asking for phone again.
  HALL_WORK: {
    bg:               "./images/hallway.png",
    objectTrigger:    "phone",
    objectPromptText: "— present the phone —",
    objectImage:      "./images/hand_phone_work.png",
    lines: [
      "The door opened with a reluctant groan.",
      "The air inside was still.\nNot stale.\nPaused.",
      "The same couch.\nThe same table.\nThe same silence that used to swallow everything.",
      "After Mom died, the quiet got heavy.\nDad stopped filling it.\nI’d come home from school and the house would just be waiting —\nno smell of dinner, no TV in the background.\nJust rooms.",
      "I used to draw at the kitchen table to make it feel less empty.\nHe never said anything about the drawings.\nI thought that meant he didn’t notice.",
      "A sharp vibration broke through the stillness.",
      null
    ]
  },

  // ── HALLWAY — PHASE 2: dad’s missed call ───────────────────
  // Same background, no fade between phases.
  // hand_phone_work.png is hidden before this scene loads.
  // Shows hand_phone_dad.png on recognition.
  HALL_DAD: {
    bg:               "./images/hallway.png",
    objectTrigger:    "phone",
    objectPromptText: "— present the phone —",
    objectImage:      "./images/hand_phone_dad.png",
    skipFade:         true,   // no room transition — same hallway
    lines: [
      "Work notifications. The world outside, still running.",
      "I moved to dismiss them.",
      "And saw it.",
      "Dad (3)\nDad — 1 voicemail",
      "The last call: eight days ago.",
      "I had told myself I’d listen when I was ready.",
      "My thumb hovered.",
      null
    ]
  },

  // ── KITCHEN ──────────────────────────────────────────────
  KITCHEN: {
    bg:               "./images/kitchen.png",
    objectTrigger:    "mug",
    objectPromptText: "— present the mug —",
    objectImage:      "./images/hand_mug.png",
    lines: [
      "I pressed play.",
      "“Hey. It’s me.”\nA pause.\n“I know you probably won’t pick up.”",
      "Another pause. The sound of him exhaling.",
      "“I’ve been thinking a lot lately.\nI just… wanted to hear your voice.\nEven if it’s just your voicemail.”",
      "The message ended.",
      "Eight days ago.\nOne week before he died.",
      "I held the button down until the screen went dark.",
      "The kitchen felt the same.\nThat surprised me.",
      "I expected distance.\nSomeone else’s space.\nBut it just felt like Saturday mornings.\nLike cereal before school.",
      "And then I saw it.",
      null
    ]
  }

};

let dialogueIndex = 0;
let currentScene  = null;

// ── DOM REFS (assigned in setup) ─────────────────────────────────
let titleScreen, gameScreen, fadeOverlay;
let dialogueText, gestureHint, pageCounter;
let objectPromptEl, objectPromptTextEl;
let detectionBadge, detectionTextEl;
let objectImageEl, webcamCorner, webcamLabelEl, handDebug;

// ============================================================
//  PRELOAD  — identical to your original working code
// ============================================================
function preload() {
  classifier = ml5.imageClassifier(
    "https://teachablemachine.withgoogle.com/models/55FUUPSEh/",
    { flipped: true }
  );
}

// ============================================================
//  gotResults  — identical to your original working code
//  label is updated here every classification cycle
// ============================================================
function gotResults(results) {
  label = results[0].label;

  // Show current classifier label in the webcam corner
  // (only when no hand gesture is overriding the display)
  if (gestureLabel === "none" && webcamLabelEl) {
    webcamLabelEl.textContent = label;
  }
}

// ============================================================
//  SETUP  — creates canvas + video exactly as your original,
//  then grabs DOM refs and inits MediaPipe
// ============================================================
function setup() {
  // Create canvas in <main> — same as your original
  let cnv = createCanvas(640, 480);

  // In game mode we move this canvas into the webcam corner div.
  // For now it sits in <main> at full size (title screen hides it).
  cnv.parent(select("main").elt);

  // Video capture — same as your original
  video = createCapture(VIDEO, { flipped: true });
  video.hide();

  // Start classification — same as your original
  classifier.classifyStart(video, gotResults);

  // ── DOM refs ──────────────────────────────────────────────
  titleScreen       = document.getElementById("title-screen");
  gameScreen        = document.getElementById("game-screen");
  fadeOverlay       = document.getElementById("fade-overlay");
  dialogueText      = document.getElementById("dialogue-text");
  gestureHint       = document.getElementById("gesture-hint");
  pageCounter       = document.getElementById("page-counter");
  objectPromptEl    = document.getElementById("object-prompt");
  objectPromptTextEl= document.getElementById("object-prompt-text");
  detectionBadge    = document.getElementById("detection-badge");
  detectionTextEl   = document.getElementById("detection-text");
  objectImageEl     = document.getElementById("object-reveal-img");
  webcamCorner      = document.getElementById("webcam-corner");
  webcamLabelEl     = document.getElementById("webcam-label");
  handDebug         = document.getElementById("hand-debug");

  // ── MediaPipe Hands ───────────────────────────────────────
  initMediaPipeHands();
}

// ============================================================
//  DRAW  — runs every frame
//  On title screen: draw video feed full size + label bar
//  On game screen:  object detection check only
// ============================================================
function draw() {
  if (gameState === STATE.TITLE) {
    // Show live camera feed on title screen so user can see themselves
    background(20, 12, 6);
    tint(255, 60);          // dim/ghosted
    image(video, 0, 0, width, height);
    noTint();

    // Small label bar at bottom (same as your original draw pattern)
    rectMode(CENTER);
    fill(0, 0, 0, 180);
    noStroke();
    rect(width / 2, height - 24, width, 48);
    textSize(16);
    fill(200, 160, 80);
    textAlign(CENTER, CENTER);
    text("gesture: " + gestureLabel + "   |   object: " + label, width / 2, height - 24);

  } else {
    // Game is running — canvas is now small in the corner
    // Just draw the video feed into the canvas
    background(10, 6, 2);
    image(video, 0, 0, width, height);

    // Check object detection every frame
    if (waitingForObject && !objectCooldown && !isFading && currentScene) {
      if (label === currentScene.objectTrigger) {
        triggerObjectDetected();
      }
    }
  }
}

// ============================================================
//  MEDIAPIPE HANDS
// ============================================================
function initMediaPipeHands() {
  // MediaPipe uses its own separate camera stream (not p5 video)
  let mpVideo = document.createElement("video");
  mpVideo.setAttribute("playsinline", "");
  mpVideo.setAttribute("autoplay",    "");
  mpVideo.setAttribute("muted",       "");
  mpVideo.style.display = "none";
  document.body.appendChild(mpVideo);

  mpHands = new Hands({
    locateFile: function(file) {
      return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file;
    }
  });

  mpHands.setOptions({
    maxNumHands:            1,
    modelComplexity:        1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence:  0.6
  });

  mpHands.onResults(onHandResults);

  var mpCamera = new Camera(mpVideo, {
    onFrame: async function() {
      await mpHands.send({ image: mpVideo });
    },
    width:  640,
    height: 480
  });

  mpCamera.start();
}

function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    gestureLabel  = "none";
    palmHoldCount = 0;
    palmFired     = false;
    if (!waitingForObject) updateHandUI("none");
    return;
  }

  // During object recognition mode, skip all gesture processing
  if (waitingForObject) return;

  var lm       = results.multiHandLandmarks[0];
  var detected = classifyGesture(lm);
  gestureLabel  = detected;

  updateHandUI(detected);
  handleGestureEvent(detected);
}

function classifyGesture(lm) {
  var indexUp  = lm[8].y  < lm[5].y;
  var middleUp = lm[12].y < lm[9].y;
  var ringUp   = lm[16].y < lm[13].y;
  var pinkyUp  = lm[20].y < lm[17].y;

  if (indexUp && middleUp && ringUp && pinkyUp) return "palm";

  var dx       = lm[4].x - lm[8].x;
  var dy       = lm[4].y - lm[8].y;
  var dist     = Math.sqrt(dx * dx + dy * dy);
  var handSize = Math.abs(lm[0].y - lm[9].y) || 0.1;

  if (dist / handSize < 0.35) return "pinch";

  return "none";
}

// ============================================================
//  GESTURE HANDLER
//  Gestures are completely disabled when waitingForObject=true
// ============================================================
function handleGestureEvent(gesture) {
  if (waitingForObject) return;  // object recognition mode: no gestures
  if (isFading)         return;

  var now = Date.now();

  if (gesture === "palm") {
    palmHoldCount++;
    if (palmHoldCount >= HOLD_FRAMES && !palmFired) {
      if (now < palmBlockedUntil) return;
      palmFired        = true;
      palmBlockedUntil = now + 2000;

      if (gameState === STATE.TITLE) {
        startGame();
      } else {
        advanceDialogue();
      }
    }
  } else {
    palmHoldCount = 0;
    palmFired     = false;
  }

  if (gesture === "pinch") {
    if (now - lastPinchTime < PINCH_COOLDOWN) return;
    lastPinchTime = now;
    console.log("[PINCH] reserved for diary");
  }
}

function updateHandUI(gesture) {
  if (webcamLabelEl) {
    if (gesture === "palm") {
      var pct = Math.min(100, Math.round((palmHoldCount / HOLD_FRAMES) * 100));
      webcamLabelEl.textContent = pct < 100 ? "palm " + pct + "%" : "palm — hold";
      webcamLabelEl.style.color = "#e8b870";
    } else if (gesture === "pinch") {
      webcamLabelEl.textContent = "pinch";
      webcamLabelEl.style.color = "#c4d4a0";
    } else {
      webcamLabelEl.textContent = label;
      webcamLabelEl.style.color = "#d9ccb8";
    }
  }

  if (handDebug) {
    handDebug.textContent = gesture !== "none"
      ? "gesture: " + gesture
      : "detecting: " + label;
  }
}

// ============================================================
//  GAME FLOW
// ============================================================
function startGame() {
  fadeTransition(function() {
    // Hide title, show game
    titleScreen.style.display = "none";
    gameScreen.classList.remove("hidden");

    // Move the p5 canvas into the webcam corner div and resize it
    var cnvEl = document.querySelector("canvas");
    webcamCorner.insertBefore(cnvEl, webcamLabelEl);
    cnvEl.style.width  = "100%";
    cnvEl.style.height = "auto";
    cnvEl.style.display = "block";

    loadScene(STATE.PORCH);
  });
}

function loadScene(key) {
  gameState        = key;
  currentScene     = SCENES[key];
  dialogueIndex    = 0;
  waitingForObject = false;
  objectDetected   = false;
  objectCooldown   = false;

  document.getElementById("room-bg").style.backgroundImage =
    "url('" + currentScene.bg + "')";

  objectPromptEl.classList.add("hidden");
  detectionBadge.classList.add("hidden");
  hideObjectImage();
  showDialogueLine(0);
}

// ============================================================
//  DIALOGUE SYSTEM
// ============================================================
function showDialogueLine(index) {
  var lines = currentScene.lines;

  if (index >= lines.length || lines[index] === null) {
    showObjectPrompt();
    return;
  }

  dialogueIndex = index;

  dialogueText.classList.add("fading");
  setTimeout(function() {
    dialogueText.innerHTML = lines[index].replace(/\n/g, "<br>");
    dialogueText.classList.remove("fading");
  }, 280);

  var total = lines.filter(function(l) { return l !== null; }).length;
  pageCounter.textContent   = (index + 1) + " / " + total;
  gestureHint.style.display = "inline";
}

function advanceDialogue() {
  var lines = currentScene.lines;
  var next  = dialogueIndex + 1;
  if (next >= lines.length || lines[next] === null) {
    showObjectPrompt();
  } else {
    showDialogueLine(next);
  }
}

// ============================================================
//  OBJECT PROMPT  — switches into classifier-only mode
// ============================================================
function showObjectPrompt() {
  waitingForObject = true;  // gestures now blocked

  gestureHint.style.display = "none";
  pageCounter.textContent   = "";

  dialogueText.classList.add("fading");
  setTimeout(function() {
    dialogueText.innerHTML = "";
    dialogueText.classList.remove("fading");
  }, 280);

  objectPromptTextEl.textContent =
    currentScene.objectPromptText || "— present the object —";
  objectPromptEl.classList.remove("hidden");
}

// ============================================================
//  OBJECT DETECTED
// ============================================================
function triggerObjectDetected() {
  if (objectDetected) return;
  objectDetected = true;
  objectCooldown = true;

  objectPromptEl.classList.add("hidden");

  var labelMap = { key: "key recognized", mug: "mug recognized",
                   phone: "phone recognized", photo: "photo recognized" };
  detectionTextEl.textContent =
    labelMap[currentScene.objectTrigger] || "recognized";
  detectionBadge.classList.remove("hidden");

  if (currentScene.objectImage) showObjectImage(currentScene.objectImage);

  setTimeout(function() {
    detectionBadge.classList.add("hidden");
    handleSceneComplete();
  }, 2200);
}

function showObjectImage(src) {
  if (!objectImageEl) return;
  objectImageEl.src = src;
  objectImageEl.classList.remove("hidden");
  setTimeout(function() { objectImageEl.classList.add("visible"); }, 20);
}

function hideObjectImage() {
  if (!objectImageEl) return;
  objectImageEl.classList.remove("visible");
  objectImageEl.classList.add("hidden");
}

// ============================================================
//  SCENE COMPLETE
// ============================================================
function handleSceneComplete() {
  var nextMap = { PORCH: "HALL_WORK", HALL_WORK: "HALL_DAD", HALL_DAD: "KITCHEN", KITCHEN: null };
  var next = nextMap[gameState];
  if (next) {
    var nextScene = SCENES[next];
    // skipFade: same background room, no black transition
    if (nextScene && nextScene.skipFade) {
      hideObjectImage();
      loadScene(next);
    } else {
      fadeTransition(function() { loadScene(next); });
    }
  } else {
    fadeTransition(function() {
      document.getElementById("room-bg").style.backgroundImage = "";
      dialogueText.innerHTML =
        "<em style='opacity:0.45;font-style:italic'>[ more rooms coming soon ]</em>";
      gestureHint.style.display = "none";
      pageCounter.textContent   = "";
      hideObjectImage();
    });
  }
}

// ============================================================
//  FADE TRANSITION
// ============================================================
function fadeTransition(callback) {
  if (isFading) return;
  isFading = true;
  fadeOverlay.classList.add("fading-out");
  setTimeout(function() {
    if (callback) callback();
    setTimeout(function() {
      fadeOverlay.classList.remove("fading-out");
      setTimeout(function() {
        isFading       = false;
        objectCooldown = false;
      }, 800);
    }, 300);
  }, 800);
}