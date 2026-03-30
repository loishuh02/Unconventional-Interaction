// ============================================================
//  THINGS I SHOULD HAVE SAID — sketch.js
//
//  Interaction model:
//    TITLE SCREEN
//      Camera feed visible so user can check framing
//      Feedback bar shows gesture + object live
//      Thumbs-up → start game
//
//    DIALOGUE (auto-play, 3 s per line)
//      Palm  → pause immediately
//      Thumbs-up → start (title) / resume when paused (game)
//      Feedback text (top-center) shows object / gesture / PAUSED
//      Camera NOT shown during game
//
//    OBJECT PROMPT
//      Auto-play stops; user presents physical object
//      Feedback text shows what classifier sees
//
//    DIARY (hobby room)
//      Pinch → turn page
//
//    OUTRO
//      Auto-plays to end → fade to black
// ============================================================

// ── BACKGROUND AUDIO ─────────────────────────────────────────
var porchAudio = new Audio("./audio/porch_audio.mp3");
porchAudio.loop = true;

function stopAllAudio() {
  porchAudio.pause();
  porchAudio.currentTime = 0;
}

// ── ONE-SHOT AUDIO ────────────────────────────────────────────
var doorAudio  = new Audio("./audio/door_audio.mp3");
var mugAudio   = new Audio("./audio/mug_audio.mp3");
var photoAudio = new Audio("./audio/photo_audio.mp3");
var phoneAudio = new Audio("./audio/phone_audio.mp3");
var pageAudio  = new Audio("./audio/page_audio.mp3");

function playOneShot(audio) {
  audio.currentTime = 0;
  audio.play().catch(function(){});
}

// ── CLASSIFIER ───────────────────────────────────────────────
let classifier;
let video;
let label = "waiting...";

// ── MEDIAPIPE HANDS ──────────────────────────────────────────
let mpHands;
let gestureLabel = "none"; // "palm" | "thumbsup" | "pinch" | "none"

const HOLD_FRAMES    = 18;
let   palmHoldCount  = 0;
let   palmFired      = false;
let   palmBlockedUntil = 0;

let   lastPinchTime  = 0;
const PINCH_COOLDOWN = 1000; // minimum ms between page turns
let   pinchActive    = false; // true while fingers are held in pinch position
                              // page turn only fires on the LEADING EDGE of a
                              // new pinch (requires releasing between turns)

let   lastThumbTime  = 0;
const THUMB_COOLDOWN = 1200;

// ── AUTO-PLAY ────────────────────────────────────────────────
const DIALOGUE_MS = 5000; // ← ms each dialogue line stays visible
let   autoTimer   = null;
let   isPaused    = false;

// ── GAME STATE ───────────────────────────────────────────────
const STATE = {
  TITLE:          "TITLE",
  PORCH:          "PORCH",
  HALLWAY_INTRO:  "HALLWAY_INTRO",
  KITCHEN:        "KITCHEN",
  BEDROOM:        "BEDROOM",
  HALLWAY:        "HALLWAY",
  HOBBY:          "HOBBY",
  OUTRO:          "OUTRO",
  END:            "END"
};
let gameState        = STATE.TITLE;
let isFading         = false;
let waitingForObject = false;
let objectDetected   = false;
let objectCooldown   = false;
let isDiaryMode      = false; // true while diary pinch is active — blocks palm/thumbsup

// ── SCENE DATA ───────────────────────────────────────────
const SCENES = {

  PORCH: {
    bg:               "./images/porch.png",
    objectTrigger:    "key",
    objectPromptText: "— present the key —",
    objectImage:      "./images/hand_key.png",
    lines: [
      "The house looked smaller than I remembered.",
      "They called on Tuesday.\n“Come quickly. The property needs to be sold.”\n\nLike ten years could be packed into boxes.",
      "I was nine when Mom died.\nAfter that, it was just the two of us.\nWe never learned how to be that. We stopped talking to each other.",
      "The night I told him I’d applied for art school,\nhe said I was throwing my life away.\n\nI told him he had no right to judge.",
      "I left that night.\nThat was ten years ago.",
      "I reached for a key.",
      null,
      "The old key turned. A small keychain I’d given him once\nhung from the ring.\nI tried not to look at it."
    ]
  },

  HALLWAY_INTRO: {
    bg:               "./images/hallway.png",
    objectTrigger:    null,
    objectPromptText: null,
    objectImage:      null,
    lines: [
      "The air inside was still.\nNot stale.\nPaused.",
      "Nothing had changed.\nThe same silence that used to swallow everything."
    ]
  },

  KITCHEN: {
    bg:               "./images/kitchen.png",
    objectTrigger:    "mug",
    objectPromptText: "— present the mug —",
    objectImage:      "./images/hand_mug.png",
    lines: [
      "I went to the kitchen.\nMy throat was clenched and I didn’t know why.",
      "And then I saw it.",
      null,
      "He kept the mug.\nStill sitting out.\nStill being used.",
      "I made this in third grade. Cracked glaze, uneven bottom.\nI used to tell him to throw it away.\n\nHe never did."
    ]
  },

  BEDROOM: {
    bg:               "./images/bedroom.png",
    objectTrigger:    "photo",
    objectPromptText: "— present the photo —",
    objectImage:      "./images/hand_photo.png",
    lines: [
      "I was already in the bedroom\nbefore I realized I’d moved.",
      "Feeling unmoored, I looked around.",
      "On the bedside table —\na photo frame, facing the bed.\n\nIt was me.",
      null,
      "He kept this next to where he slept.\nEvery night.\nEven after I left home.",
      "I’d spent years thinking he’d forgotten me.\nBut this didn’t look like someone who forgot."
    ]
  },

  HALLWAY: {
    bg:               "./images/hallway.png",
    objectTrigger:    "phone",
    objectPromptText: "— present the phone —",
    objectImage:      "./images/hand_phone_work.png",
    objectImage2:     "./images/hand_phone_dad.png",
    lines: [
      "I rushed out into the hallway.\nSomething felt wrong.",
      "A sharp vibration broke through the quiet.",
      null,
      "Work notifications. Three of them. I dismissed them.",
      "And then, underneath —\n\nDad — 1 voicemail\n\nThe last call: eight days ago.",
      "I’d told myself I’d listen when I was ready.\n\nI was never ready.",
      "My thumb moved on its own.",
      null,
      "“Hey. It’s me.”\nA pause.\n“I just… wanted to talk to you.”",
      "The message ended.\n\nEight days ago.\nOne week before he died.",
      "Suddenly the silence felt loud."
    ]
  },

  HOBBY: {
    bg:               "./images/hobbyroom.png",
    objectTrigger:    null,
    objectPromptText: null,
    objectImage:      null,
    isDiary:          true,
    lines: [
      "I couldn’t stay.\nI opened the door in front of me.",
      "I hadn’t opened this door since Mom died.\nIt used to be her hobby room.\nMy dad never went inside either.",
      "Not what I expected.\nIt was clean.\nMaintained.\nCarefully kept.",
      "And my drawings.\nFramed.\nAll of them.",
      "In the corner — a desk.\nA notebook.\nWorn. Open.",
      null
    ],
    diaryPages: [
      "(pinch and move to turn pages)",
      "Thought about calling her today.\nBut ended up not calling.",
      "I know what it’s like to love art and not be able to survive on it.\nWhen her mother got sick, I couldn’t pay for the treatment.\nI’ve never stopped thinking about that.",
      "I didn’t want her to struggle the way I did.\nI thought I was protecting her.",
      "I hope she’s still drawing.",
      "I’m going to call her this week.\nI mean it this time.",
      "I just want to say one last thing."
    ]
  },

  OUTRO: {
    bg:               "./images/hobbyroom.png",
    objectTrigger:    null,
    objectPromptText: null,
    objectImage:      null,
    isOutro:          true,
    lines: [
      "Last entry.\nOne week before he died.",
      "The same day I ignored his call and voicemail.",
      "I closed the notebook.",
      "I wanted to say something back to him.\nI couldn’t.\nI still can’t.",
      "There were things I should have said.\nBut never did.\nAnd will never get to say.",
      null
    ]
  }
}

// ── DIALOGUE / DIARY / OUTRO STATE ───────────────────────────
let dialogueIndex  = 0;
let diaryPageIndex = 0;
let outroIndex     = 0;
let currentScene       = null;
let currentObjectImage = null; // which hand image to show on recognition
let nullCount          = 0;    // tracks null sentinels passed in current scene

// ── DOM REFS ─────────────────────────────────────────────────
let titleScreen, gameScreen, fadeOverlay;
let dialogueText, gestureHint, pageCounter;
let objectPromptEl, objectPromptTextEl;
let detectionBadge, detectionTextEl;
let objectImageEl, webcamCorner, handDebug, feedbackEl;

// ============================================================
//  PRELOAD
// ============================================================
function preload() {
  classifier = ml5.imageClassifier(
    "https://teachablemachine.withgoogle.com/models/55FUUPSEh/",
    { flipped: true }
  );
}

// ============================================================
//  gotResults
// ============================================================
function gotResults(results) {
  label = results[0].label;
  updateFeedback();
}

// ============================================================
//  SETUP
// ============================================================
function setup() {
  let cnv = createCanvas(640, 480);
  cnv.parent(select("main").elt);

  video = createCapture(VIDEO, { flipped: true });
  video.hide();
  classifier.classifyStart(video, gotResults);

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
  handDebug         = document.getElementById("hand-debug");
  feedbackEl        = document.getElementById("feedback-text");

  initMediaPipeHands();
}

// ============================================================
//  DRAW
// ============================================================
function draw() {
  if (gameState === STATE.TITLE) {
    background(20, 12, 6);
    tint(255, 80);
    image(video, 0, 0, width, height);
    noTint();
    rectMode(CENTER);
    fill(0, 0, 0, 190);
    noStroke();
    rect(width / 2, height - 24, width, 48);
    textSize(15);
    fill(200, 160, 80);
    textAlign(CENTER, CENTER);
    text("gesture: " + gestureLabel + "   |   object: " + label, width / 2, height - 24);
  } else {
    // Camera hidden during game; ML5 still needs a frame to classify
    background(0);
    image(video, 0, 0, width, height);
    if (waitingForObject && !objectCooldown && !isFading && currentScene) {
      if (label === currentScene.objectTrigger) {
        triggerObjectDetected();
      }
    }
  }
}

// ============================================================
//  FEEDBACK TEXT — removed; function kept as no-op so existing
//  calls throughout the code don’t throw errors.
// ============================================================
function updateFeedback() {}
// ============================================================
//  MEDIAPIPE HANDS
// ============================================================
function initMediaPipeHands() {
  var mpVideo = document.createElement("video");
  mpVideo.setAttribute("playsinline", "");
  mpVideo.setAttribute("autoplay", "");
  mpVideo.setAttribute("muted", "");
  mpVideo.style.display = "none";
  document.body.appendChild(mpVideo);

  mpHands = new Hands({
    locateFile: function(f) {
      return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + f;
    }
  });
  mpHands.setOptions({
    maxNumHands: 1, modelComplexity: 1,
    minDetectionConfidence: 0.7, minTrackingConfidence: 0.6
  });
  mpHands.onResults(onHandResults);

  var mpCam = new Camera(mpVideo, {
    onFrame: async function() { await mpHands.send({ image: mpVideo }); },
    width: 640, height: 480
  });
  mpCam.start();
}

// ============================================================
//  HAND RESULTS
// ============================================================
function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    gestureLabel  = "none";
    palmHoldCount = 0;
    palmFired     = false;
    updateFeedback();
    if (handDebug && gameState === STATE.TITLE)
      handDebug.textContent = "object: " + label;
    return;
  }

  if (waitingForObject) return; // image recognition mode — skip all gestures

  var lm       = results.multiHandLandmarks[0];
  var detected = classifyGesture(lm);
  gestureLabel  = detected;
  updateFeedback();

  if (handDebug && gameState === STATE.TITLE) {
    handDebug.textContent = detected !== "none"
      ? "gesture: " + detected + "   |   object: " + label
      : "object: " + label;
  }

  // During diary: only allow pinch (page turn); block everything else
  if (isDiaryMode) {
    if (detected === "pinch") {
      // Only fire on the LEADING EDGE — when pinch just became active
      // AND enough time has passed since the last turn.
      // pinchActive=true means fingers are already held; don't re-fire.
      if (!pinchActive) {
        pinchActive = true;
        var nowD = Date.now();
        if (nowD - lastPinchTime >= PINCH_COOLDOWN) {
          lastPinchTime = nowD;
          showDiaryPage(diaryPageIndex + 1);
        }
      }
    } else {
      // Hand left pinch state — reset so next pinch can fire
      pinchActive = false;
    }
    return; // block palm, thumbsup, everything else
  }

  handleGestureEvent(detected);
}

// ============================================================
//  GESTURE CLASSIFICATION
//  palm     — 4 fingers extended
//  thumbsup — thumb up, fingers curled
//  pinch    — thumb tip close to index tip
// ============================================================
function classifyGesture(lm) {
  var indexUp  = lm[8].y  < lm[5].y;
  var middleUp = lm[12].y < lm[9].y;
  var ringUp   = lm[16].y < lm[13].y;
  var pinkyUp  = lm[20].y < lm[17].y;

  if (indexUp && middleUp && ringUp && pinkyUp) return "palm";

  var thumbTipHigh  = lm[4].y < lm[3].y && lm[4].y < lm[2].y;
  var fingersCurled = !indexUp && !middleUp && !ringUp && !pinkyUp;
  if (thumbTipHigh && fingersCurled) return "thumbsup";

  var dx = lm[4].x - lm[8].x;
  var dy = lm[4].y - lm[8].y;
  var dist     = Math.sqrt(dx * dx + dy * dy);
  var handSize = Math.abs(lm[0].y - lm[9].y) || 0.1;
  if (dist / handSize < 0.35) return "pinch";

  return "none";
}

// ============================================================
//  GESTURE EVENTS
// ============================================================
function handleGestureEvent(gesture) {
  if (waitingForObject) return;  // image recognition mode — no gestures
  if (isDiaryMode)      return;  // diary pinch mode — no palm or thumbsup
  if (isFading)         return;
  var now = Date.now();

  // THUMBS UP: start game on title / resume when paused
  if (gesture === "thumbsup") {
    if (now - lastThumbTime < THUMB_COOLDOWN) return;
    lastThumbTime = now;
    if (gameState === STATE.TITLE) {
      startGame();
    } else if (isPaused) {
      resumeDialogue();
    }
  }

  // PALM: return to title on end screen / pause dialogue during game
  if (gesture === "palm") {
    palmHoldCount++;
    if (palmHoldCount >= HOLD_FRAMES && !palmFired) {
      if (now < palmBlockedUntil) return;
      palmFired        = true;
      palmBlockedUntil = now + 2000;
      if (gameState === STATE.END) {
        returnToTitle();
      } else if (gameState !== STATE.TITLE) {
        pauseDialogue();
      }
    }
  } else {
    palmHoldCount = 0;
    palmFired     = false;
  }

  // PINCH: diary page turn
  if (gesture === "pinch") {
    if (now - lastPinchTime < PINCH_COOLDOWN) return;
    lastPinchTime = now;
    if (gameState === STATE.HOBBY && currentScene && currentScene.isDiary) {
      showDiaryPage(diaryPageIndex + 1);
    }
  }
}

// ============================================================
//  AUTO-PLAY
// ============================================================
function startAutoPlay() {
  stopAutoPlay();
  isPaused  = false;
  autoTimer = setInterval(function() {
    if (!isPaused && !waitingForObject && !isFading) {
      advanceDialogue();
    }
  }, DIALOGUE_MS);
}

function stopAutoPlay() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

function pauseDialogue() {
  if (isPaused) return;
  isPaused = true;
  stopAutoPlay();
  updateFeedback();
  gestureHint.textContent   = "paused \u2014 show \uD83D\uDC4D to resume";
  gestureHint.style.display = "inline";
}

function resumeDialogue() {
  if (!isPaused) return;
  isPaused = false;
  updateFeedback();
  gestureHint.textContent   = "auto-playing  \u2022  palm to pause";
  gestureHint.style.display = "inline";
  startAutoPlay();
}

// ============================================================
//  GAME FLOW
// ============================================================
function startGame() {
  fadeTransition(function() {
    titleScreen.style.display = "none";
    gameScreen.classList.remove("hidden");

    // Hide p5 canvas visually (ML5 still classifies)
    var cnvEl = document.querySelector("canvas");
    if (cnvEl) cnvEl.style.display = "none";

    if (webcamCorner) webcamCorner.style.display = "none";
    // feedbackEl intentionally not shown — removed per design

    loadScene(STATE.PORCH);
  });
}

function loadScene(key) {
  gameState        = key;
  currentScene     = SCENES[key];
  dialogueIndex    = 0;
  diaryPageIndex   = 0;
  outroIndex       = 0;
  waitingForObject = false;
  objectDetected   = false;
  objectCooldown   = false;
  isPaused         = false;

  document.getElementById("room-bg").style.backgroundImage =
    "url('" + currentScene.bg + "')";

  nullCount        = 0;
  isDiaryMode      = false;
  objectPromptEl.classList.add("hidden");
  detectionBadge.classList.add("hidden");
  hideObjectImage();

  // Background audio: stop previous, start scene-specific audio
  stopAllAudio();
  if (key === "PORCH") porchAudio.play().catch(function(){});

  showDialogueLine(0);
}

// ============================================================
//  DIALOGUE
// ============================================================
function showDialogueLine(index) {
  var lines = currentScene.lines;
  if (index >= lines.length || lines[index] === null) {
    stopAutoPlay();
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
  gestureHint.textContent   = "auto-playing  \u2022  palm to pause";
  gestureHint.style.display = "inline";

  startAutoPlay(); // always restart timer — stopAutoPlay() is called inside
}

function advanceDialogue() {
  if (currentScene && currentScene.isOutro) { showOutroLines(); return; }
  var lines = currentScene.lines;
  var next  = dialogueIndex + 1;

  if (next >= lines.length) {
    // Reached true end of lines array — advance scene
    stopAutoPlay();
    handleSceneComplete();
    return;
  }

  if (lines[next] === null) {
    // Hit a null sentinel — pause for object prompt
    stopAutoPlay();
    showObjectPrompt();
    return;
  }

  showDialogueLine(next);
}

// ============================================================
//  OBJECT PROMPT
//  Pauses auto-play mid-scene for object recognition.
//  After recognition: resumes remaining lines, then scene ends
//  when last line finishes.
// ============================================================
function showObjectPrompt() {
  stopAutoPlay();
  gestureHint.style.display = "none";
  pageCounter.textContent   = "";

  dialogueText.classList.add("fading");
  setTimeout(function() {
    dialogueText.innerHTML = "";
    dialogueText.classList.remove("fading");
  }, 280);

  if (currentScene.isDiary) {
    waitingForObject = false;
    isDiaryMode      = true;  // block palm/thumbsup while reading diary
    pinchActive      = false; // reset so first pinch fires cleanly
    diaryPageIndex   = 0;
    gestureHint.textContent   = "pinch to turn page";
    gestureHint.style.display = "inline";
    showDiaryPage(0);
    return;
  }

  if (currentScene.isOutro) {
    waitingForObject = false;
    showOutroLines();
    return;
  }

  // Pick correct objectImage for multi-prompt scenes (e.g. HALLWAY)
  var imgSrc = currentScene.objectImage;
  if (nullCount === 1 && currentScene.objectImage2) {
    imgSrc = currentScene.objectImage2;
  }
  currentObjectImage = imgSrc; // store so triggerObjectDetected can use it

  nullCount++;
  waitingForObject = true;
  objectPromptTextEl.textContent =
    currentScene.objectPromptText || "— present the object —";
  objectPromptEl.classList.remove("hidden");
  updateFeedback();
}

// ============================================================
//  DIARY
// ============================================================
function showDiaryPage(index) {
  var pages = currentScene.diaryPages;
  if (index >= pages.length) {
    isDiaryMode = false; // diary done — restore normal gesture handling
    handleSceneComplete();
    return;
  }
  // Play page turn sound on every pinch (index 0 is auto-shown, not a pinch)
  if (index > 0) playOneShot(pageAudio);
  diaryPageIndex = index;
  dialogueText.classList.add("fading");
  setTimeout(function() {
    dialogueText.innerHTML =
      "<em>" + pages[index].replace(/\n/g, "<br>") + "</em>";
    dialogueText.classList.remove("fading");
  }, 280);
  pageCounter.textContent = (index + 1) + " / " + pages.length;
}

// ============================================================
//  OUTRO
// ============================================================
function showOutroLines() {
  var lines = currentScene.lines.filter(function(l) { return l !== null; });
  if (outroIndex >= lines.length) { handleSceneComplete(); return; }
  gestureHint.textContent   = "auto-playing";
  gestureHint.style.display = "inline";
  dialogueText.classList.add("fading");
  setTimeout(function() {
    dialogueText.innerHTML = lines[outroIndex].replace(/\n/g, "<br>");
    dialogueText.classList.remove("fading");
  }, 280);
  pageCounter.textContent = "";
  outroIndex++;
  if (outroIndex === 1) startAutoPlay();
}

// ============================================================
//  OBJECT DETECTED
//  After recognition: shows image + badge, then RESUMES
//  remaining dialogue lines in the same scene.
//  Scene only transitions when the last line finishes.
// ============================================================
function triggerObjectDetected() {
  if (objectDetected) return;
  objectDetected = true;
  objectCooldown = true;
  objectPromptEl.classList.add("hidden");

  // Show hand image — no text badge
  if (currentObjectImage) showObjectImage(currentObjectImage);

  // Play one-shot audio matching this recognition moment
  if (gameState === "PORCH") {
    playOneShot(doorAudio);
  } else if (gameState === "KITCHEN") {
    playOneShot(mugAudio);
  } else if (gameState === "BEDROOM") {
    playOneShot(photoAudio);
  } else if (gameState === "HALLWAY" && currentObjectImage === currentScene.objectImage) {
    // Only on the first recognition (phone_work image, not phone_dad)
    playOneShot(phoneAudio);
  }

  // Brief pause to let the image register, then resume dialogue
  setTimeout(function() {
    // Find the line after this null sentinel
    var lines = currentScene.lines;
    var resumeIndex = dialogueIndex + 1;
    while (resumeIndex < lines.length && lines[resumeIndex] === null) {
      resumeIndex++;
    }

    // Reset recognition flags
    waitingForObject = false;
    objectDetected   = false;
    objectCooldown   = false;

    if (resumeIndex >= lines.length) {
      handleSceneComplete();
    } else {
      showDialogueLine(resumeIndex);
    }
  }, 1800);
}

var _hideImageTimer = null;

function showObjectImage(src) {
  if (!objectImageEl) return;
  // Cancel any in-flight hide timer so it can't overwrite us
  if (_hideImageTimer) { clearTimeout(_hideImageTimer); _hideImageTimer = null; }
  // The element starts as display:none (inline style in HTML, no .hidden class)
  // Remove the class just in case, then make visible
  objectImageEl.classList.remove("hidden");
  objectImageEl.src = src;
  objectImageEl.style.display = "block";
  // Force a reflow so the browser registers display:block before
  // we add the .visible class — without this the CSS transition won't fire
  void objectImageEl.offsetWidth;
  objectImageEl.classList.add("visible");
}

function hideObjectImage() {
  if (!objectImageEl) return;
  objectImageEl.classList.remove("visible");
  // After the CSS fade-out (0.55s), remove from flex flow
  _hideImageTimer = setTimeout(function() {
    _hideImageTimer = null;
    objectImageEl.style.display = "none";
  }, 600);
}

// ============================================================
//  SCENE COMPLETE
// ============================================================
function handleSceneComplete() {
  stopAutoPlay();
  var nextMap = {
    PORCH: "HALLWAY_INTRO", HALLWAY_INTRO: "KITCHEN",
    KITCHEN: "BEDROOM", BEDROOM: "HALLWAY",
    HALLWAY: "HOBBY", HOBBY: "OUTRO", OUTRO: null
  };
  var next = nextMap[gameState];
  if (!next) {
    fadeTransition(function() {
      stopAllAudio();
      gameState = STATE.END;
      document.getElementById("room-bg").style.backgroundImage = "";
      dialogueText.innerHTML =
        "<div style='text-align:center;line-height:2'>" +
        "<em style='opacity:0.5;letter-spacing:0.12em'>\u2014 end \u2014</em>" +
        "<br>" +
        "<span style='font-size:1.05em;opacity:0.85;letter-spacing:0.08em'>Thank you for playing</span>" +
        "</div>";
      gestureHint.textContent   = "show palm to go back to title";
      gestureHint.style.display = "inline";
      pageCounter.textContent   = "";
      if (feedbackEl) feedbackEl.style.display = "none";
      hideObjectImage();
    });
    return;
  }
  fadeTransition(function() { loadScene(next); });
}

// ============================================================
//  RETURN TO TITLE
// ============================================================
function returnToTitle() {
  fadeTransition(function() {
    stopAllAudio();
    stopAutoPlay();

    // Reset all state
    gameState        = STATE.TITLE;
    currentScene     = null;
    isPaused         = false;
    isFading         = false;
    waitingForObject = false;
    objectDetected   = false;
    objectCooldown   = false;
    isDiaryMode      = false;
    dialogueIndex    = 0;
    diaryPageIndex   = 0;
    outroIndex       = 0;
    nullCount        = 0;
    palmHoldCount    = 0;
    palmFired        = false;

    // Restore UI
    gameScreen.classList.add("hidden");
    titleScreen.style.display = "flex";
    var cnvEl = document.querySelector("canvas");
    if (cnvEl) cnvEl.style.display = "block";

    dialogueText.innerHTML    = "";
    gestureHint.style.display = "none";
    pageCounter.textContent   = "";
    document.getElementById("room-bg").style.backgroundImage = "";
    hideObjectImage();
    objectPromptEl.classList.add("hidden");
    detectionBadge.classList.add("hidden");
  });
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
        isFading = false; objectCooldown = false;
      }, 800);
    }, 300);
  }, 800);
}