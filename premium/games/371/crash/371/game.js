document.addEventListener('DOMContentLoaded', function () {
  const svg = document.querySelector('.crash-game__svg');
  const path = svg ? svg.querySelector('.crash-game__stroke') : null;
  const clipGroup = svg ? svg.querySelector('g[clip-path="url(#a)"]') : null;
  let crashCircle = clipGroup ? clipGroup.querySelector('circle') : null;
  const pin = document.querySelector('.crash-game__wrap .crash-game__pin') || document.querySelector('.crash-game__pin');
  const waiting = document.querySelector('.crash-game__waiting');
  const multiplierEl = document.querySelector('.crash-game__counter');
  // Countdown elements from built UI
  const timerElement = document.querySelector('.crash-game__timer.crash-timer');
  const timerCircle = document.querySelector('.crash-timer__circle');
  const segmentsContainer = document.querySelector('.crash-timer__segments');
  const timerCounterEl = document.querySelector('.crash-timer__counter');
  // Helper: hide/show game visuals (graph, pin, counter)
  const gameWrapEl = document.querySelector('.crash-game__wrap');
  function setGameVisibility(visible) {
    const displayValue = visible ? '' : 'none';
    if (svg) svg.style.display = displayValue;
    if (gameWrapEl) gameWrapEl.style.display = displayValue;
    if (multiplierEl) multiplierEl.style.display = displayValue;
  }

  // Helper: dispatch game lifecycle events
  function emitState(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // -------------------------
  // Firebase setup (optional)
  // -------------------------
  const firebaseConfig = {
    apiKey: "AIzaSyB1_XCbC777hKwxlilhMeq5Hpty1dvDT1I",
    authDomain: "giper-8fd92.firebaseapp.com",
    databaseURL: "https://giper-8fd92-default-rtdb.firebaseio.com",
    projectId: "giper-8fd92",
    storageBucket: "giper-8fd92.firebasestorage.app",
    messagingSenderId: "485740337398",
    appId: "1:485740337398:web:ab901fd4f28219ea5834d7"
  };

  let firebaseAvailable = false;
  try {
    if (window.firebase) {
      // initialize only if not initialized
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
      }
      if (window.firebase.database) {
        firebaseAvailable = true;
        console.log('Firebase initialized and available for writes.');
      } else {
        console.warn('Firebase SDK loaded but database() not found.');
      }
    } else {
      console.warn('Firebase SDK not found. Firebase writes disabled.');
    }
  } catch (e) {
    console.warn('Firebase init error:', e);
    firebaseAvailable = false;
  }

  function writeRoundToFirebase(roundId, payload) {
    if (!firebaseAvailable) return Promise.resolve();
    try {
      const ref = firebase.database().ref('copy/' + roundId);
      return ref.set(payload);
    } catch (e) {
      console.error('Firebase write error:', e);
      return Promise.resolve();
    }
  }

  // =========================
  // Original game logic below
  // (kept intact; only added firebase writes)
  // =========================

  // Initialize Game Store (if exists)
  let currentRound = null;
  let gameScheduleLoaded = false;
  
  // NEW: Variable to hold the crash coefficient for the next round (in fallback mode)
  let nextRoundCrashCoeff = null;

  async function loadGameSchedule() {
    try {
      const response = await fetch('./game-schedule.json');
      const scheduleData = await response.json();
      gameScheduleLoaded = gameStore.loadScheduleFromJSON
        ? gameStore.loadScheduleFromJSON(scheduleData)
        : false;

      if (gameScheduleLoaded) {
        console.log('Game schedule loaded successfully');
        console.log(`Total rounds: ${scheduleData.total_rounds}`);
        startScheduledGameLoop();
      } else {
        console.error('Failed to load game schedule, falling back to random mode');
        startCountdown(); // Fallback to original behavior
      }
    } catch (error) {
      console.error('Error loading game schedule:', error);
      console.log('Falling back to random mode');
      gameScheduleLoaded = false;
      startCountdown(); // Fallback to original behavior
    }
  }

  // Scheduled loop
  function startScheduledGameLoop() {
    function checkSchedule() {
      const timeUntilNext = gameStore.getTimeUntilNextEvent
        ? gameStore.getTimeUntilNextEvent()
        : null;

      if (!timeUntilNext) {
        console.log('No more scheduled rounds');
        return;
      }

      if (timeUntilNext.type === 'countdown' && timeUntilNext.seconds <= 0) {
        currentRound = timeUntilNext.round;
        console.log(`Starting countdown for round ${currentRound.round_id}, crash point: ${currentRound.crash_point}x`);
        startScheduledCountdown();
      } else if (timeUntilNext.type === 'crash' && timeUntilNext.seconds <= 0) {
        console.log(`Triggering crash for round ${currentRound.round_id}`);
        triggerScheduledCrash();
      } else {
        setTimeout(checkSchedule, 1000);
      }
    }
    checkSchedule();
  }

  if (!svg || !path || !pin) {
    console.warn('Required game elements not found.');
    return;
  }

  // Hide waiting banner if present
  if (waiting) waiting.style.display = 'none';

  // Ensure we have a circle element to mark runtime position
  if (!crashCircle) {
    crashCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    crashCircle.setAttribute('r', '4');
    crashCircle.setAttribute('fill', '#de8a06');
    clipGroup && clipGroup.appendChild(crashCircle);
  }

  // SVG grid clipping region based on index.html clipPath#"a"
  const clipRect = { x: 15, y: 0, w: 305, h: 107 };

  // Helpers to convert SVG coords to wrap percentages
  const percentFromX = (x) => ((x - clipRect.x) / clipRect.w) * 100;
  const percentBottomFromY = (y) => ((clipRect.h - (y - clipRect.y)) / clipRect.h) * 100;
  // Inverse helpers: from percentages to SVG coords
  const xFromLeftPct = (pct) => clipRect.x + (pct / 100) * clipRect.w;
  const yFromBottomPct = (pct) => clipRect.y + clipRect.h - (pct / 100) * clipRect.h;

  // COUNTDOWN (7s) -> FLY -> CRASH -> LOOP
  const COUNTDOWN_SECONDS = 7;
  let countdownInterval = null;

  function initializeTimer() {
    if (!timerElement) return;
    // Show and mark as countdown state
    timerElement.style.display = 'flex';
    timerElement.classList.add('crash-timer--countdown');

    // Restart circle bounce animation
    if (timerCircle) {
      timerCircle.style.animation = 'none';
      void timerCircle.offsetWidth; // reflow
      timerCircle.style.animation = 'circle-bounce 1s .7s linear infinite';
    }

    // Reset segments starting rotation
    if (segmentsContainer) {
      segmentsContainer.style.transition = 'none';
      segmentsContainer.style.transform = 'rotate(-90deg)';
      void segmentsContainer.offsetWidth; // reflow
    }
  }

  function updateTimerCounter(currentCount) {
    if (timerCounterEl) timerCounterEl.textContent = currentCount;
    if (segmentsContainer) {
      const totalDegrees = 210; // visual sweep
      const degreesPerSecond = totalDegrees / COUNTDOWN_SECONDS;
      const secondsElapsed = COUNTDOWN_SECONDS - currentCount;
      const currentDegrees = -90 - (degreesPerSecond * secondsElapsed);
      segmentsContainer.style.transition = 'transform 0.9s ease-in-out';
      segmentsContainer.style.transform = `rotate(${currentDegrees}deg)`;
    }
  }

  // Scheduled countdown that uses predetermined crash point
  function startScheduledCountdown() {
    if (!timerElement || !currentRound) {
      runScheduledRound();
      return;
    }

    setGameVisibility(false);
    emitState('game:countdownStart', { seconds: COUNTDOWN_SECONDS });

    initializeTimer();
    let current = COUNTDOWN_SECONDS;
    updateTimerCounter(current);

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(function () {
      current--;
      if (current <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        timerElement.classList.remove('crash-timer--countdown');
        if (segmentsContainer) segmentsContainer.style.transform = 'rotate(180deg)';
        timerElement.style.display = 'none';
        runScheduledRound();
      } else {
        updateTimerCounter(current);
      }
    }, 1000);
  }

  function startCountdown() {
    if (!timerElement) {
      runRound();
      return;
    }

    // NEW: Generate and store a random crash coefficient for the upcoming round
function generateCrashCoeff() {
  const rand = Math.random(); // 0 - 1 oralig‘ida tasodifiy son

  let nextRoundCrashCoeff;

  if (rand < 1.200) {
    // 80% ehtimollik — past qiymat (1.00 - 2.00x)
    nextRoundCrashCoeff = (Math.random() * (2 - 1) + 1).toFixed(2);
  } else if (rand < 0.29) {
    // 18% ehtimollik — o‘rta qiymat (4.00 - 10.00x)
    nextRoundCrashCoeff = (Math.random() * (10 - 4) + 4).toFixed(2);
  } else {
    // 2% ehtimollik — yuqori qiymat (25.00 - 35.00x)
    nextRoundCrashCoeff = (Math.random() * (35 - 25) + 25).toFixed(2);
  }

  console.log('Next round crash coefficient (random):', nextRoundCrashCoeff + 'x');
  return nextRoundCrashCoeff;
}

// Misol uchun chaqiramiz:
const nextRoundCrashCoeff = generateCrashCoeff();
    setGameVisibility(false);
    emitState('game:countdownStart', { seconds: COUNTDOWN_SECONDS, nextCrashCoeff: parseFloat(nextRoundCrashCoeff) });

    initializeTimer();
    let current = COUNTDOWN_SECONDS;
    updateTimerCounter(current);

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(function () {
      current--;
      if (current <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        timerElement.classList.remove('crash-timer--countdown');
        if (segmentsContainer) segmentsContainer.style.transform = 'rotate(180deg)';
        timerElement.style.display = 'none';
        runRound();
      } else {
        updateTimerCounter(current);
      }
    }, 1000);
  }

  // Run a scheduled round with predetermined crash point and timing
  function runScheduledRound() {
    if (!currentRound) {
      console.error('No current round data available');
      return;
    }

    // Create round payload and write initial to Firebase
    const roundId = 'round_' + Date.now();
    const roundPayload = { id: roundId, createdAt: Date.now(), scheduleRoundId: currentRound.round_id || null, crashCoeff: currentRound.crash_point, events: [] }; // Added crashCoeff
    // write initial metadata
    writeRoundToFirebase(roundId, roundPayload);

    setGameVisibility(true);

// Spec-driven positional timeline (percents)
const START_LEFT = 0.0;           // %
const START_BOTTOM = 0.445;       // %
const MAX_LEFT = 80.0;            // %
const MAX_BOTTOM = 94.5;          // %
const T_MAX_LEFT = 10.0;          // s (vizual animatsiya uchun)
const T_MAX_BOTTOM = 10.0;        // s

// Score thresholds and speeds — ULTRA SLOW (1.00 → 2.00x in ~10 years)
const THRESH_LEFT_START = 0.0000000000001;
const THRESH_BOTTOM_START = 0.0000000000001;
const RATE_BASE = 0.00000000317;           // 10 yil ichida 1.00 → 2.00
const RATE_AT_MAX_BOTTOM = 0.00000000317;  // bir xil tezlik (lineer)
const RATE_AT_MAX_BOTH = 0.00000000317;    // eng yuqori tezlik — deyarli o‘zgarmaydi

// Pin konfiguratsiya
const PIN_ANCHOR_X = 0.0;
const PIN_ANCHOR_Y = 0.0;
const PIN_TRANSFORM = `translate(${-PIN_ANCHOR_X * 100}%, ${-PIN_ANCHOR_Y * 100}%) rotate(-29deg)`;

const start = {
  x: xFromLeftPct(START_LEFT),
  y: yFromBottomPct(START_BOTTOM),
};

console.log("🕐 Ultra Slow Mode: 1.00x → 2.00x o‘sish 10 yil davom etadi!");    path.setAttribute('fill', 'none');

    const crashCoeff = currentRound.crash_point;
    if (multiplierEl) multiplierEl.textContent = '1.00x';
    emitState('game:flyingStart', { crashCoeff: crashCoeff });

    pin.classList.remove('crash-game__pin--crash');
    pin.style.left = `${START_LEFT}%`;
    pin.style.bottom = `${START_BOTTOM}%`;
    pin.style.transform = PIN_TRANSFORM;

    if (crashCircle) {
      crashCircle.setAttribute('cx', start.x.toFixed(2));
      crashCircle.setAttribute('cy', start.y.toFixed(2));
    }

    let startTs = null;
    let lastTs = null;
    let crashed = false;
    let score = 0;

    // snapshot timer for firebase (every 3s)
    let lastSnapshot = Date.now();

    function animate(ts) {
      if (!startTs) startTs = ts;
      if (!lastTs) lastTs = ts;
      const elapsedSec = (ts - startTs) / 1000;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const currentTime = Math.floor(Date.now() / 1000);
      if (!crashed && currentTime >= currentRound.crash_time) {
        crashed = true;
        pin.classList.add('crash-game__pin--crash');
        if (multiplierEl) multiplierEl.textContent = `${crashCoeff.toFixed(2)}x`;
        emitState('game:crash', { crashCoeff: crashCoeff });
        // write crash event
        roundPayload.events.push({ type: 'crash', ts: Date.now(), crashCoeff: crashCoeff });
        writeRoundToFirebase(roundId, roundPayload).then(() => {
          setTimeout(() => startScheduledGameLoop(), 3000);
        });
        return;
      }

      const leftPct = Math.min(START_LEFT + (MAX_LEFT - START_LEFT) * (elapsedSec / T_MAX_LEFT), MAX_LEFT);
      const bottomPct = Math.min(START_BOTTOM + (MAX_BOTTOM - START_BOTTOM) * (elapsedSec / T_MAX_BOTTOM), MAX_BOTTOM);

      const x = xFromLeftPct(leftPct);
      const y = yFromBottomPct(bottomPct);

      pin.style.left = `${leftPct}%`;
      pin.style.bottom = `${bottomPct}%`;
      pin.style.transform = PIN_TRANSFORM;

     const control = { x: start.x + (x - start.x) * 0.4, y: start.y };
      path.setAttribute('d', `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${x} ${y}`);

      // Move circle with plane runtime (middle marker)
      if (crashCircle) {
        crashCircle.setAttribute('cx', x.toFixed(2));
        crashCircle.setAttribute('cy', y.toFixed(2));
      }


      if (crashCircle) {
        crashCircle.setAttribute('cx', x.toFixed(2));
        crashCircle.setAttribute('cy', y.toFixed(2));
      }

      const crossedThresholds = (leftPct >= THRESH_LEFT_START) && (bottomPct >= THRESH_BOTTOM_START);
      let rate = 0;
      if (crossedThresholds) rate = RATE_BASE;
      if (bottomPct >= MAX_BOTTOM) rate = RATE_AT_MAX_BOTTOM;
      if (bottomPct >= MAX_BOTTOM && leftPct >= MAX_LEFT) rate = RATE_AT_MAX_BOTH;

      if (crossedThresholds && rate > 0) {
        score += dt * rate;
      }

      if (multiplierEl) multiplierEl.textContent = `${Math.min(score, crashCoeff).toFixed(2)}x`;

      // Periodic firebase snapshots
      if (Date.now() - lastSnapshot >= 3000) {
        lastSnapshot = Date.now();
        roundPayload.events.push({ type: 'flying_snapshot', ts: Date.now(), coeff: Math.min(score, crashCoeff) });
        writeRoundToFirebase(roundId, roundPayload);
      }

      if (!crashed) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }

  // Trigger scheduled crash (called by schedule checker)
  function triggerScheduledCrash() {
    console.log('Scheduled crash triggered');
  }

  // Original runRound function for fallback mode
  function runRound() {
    // MODIFIED: Use the pre-determined crash coefficient from startCountdown
    let crashCoeff = nextRoundCrashCoeff;
    if (!crashCoeff) {
        // Fallback if somehow missing
        console.warn('Crash coefficient missing, generating random fallback.');
        crashCoeff = (Math.random() * (3 - 1) + 1).toFixed(2);
    }
    const floatCrashCoeff = parseFloat(crashCoeff);
    nextRoundCrashCoeff = null; // Clear for next round

    // Create round payload and write initial to Firebase
    const roundId = 'round_' + Date.now();
    // MODIFIED: Include crashCoeff in the initial payload
    const roundPayload = { id: roundId, createdAt: Date.now(), crashCoeff: floatCrashCoeff, events: [] };
    writeRoundToFirebase(roundId, roundPayload);

    setGameVisibility(true);

    const START_LEFT = 0.0;           // %
    const START_BOTTOM = 0.445;       // %
    const MAX_LEFT = 80.0;            // %
    const MAX_BOTTOM = 64.5;          // %
    const T_MAX_LEFT = 9.0;           // s
    const T_MAX_BOTTOM = 10.5;         // s

    const THRESH_LEFT_START = 0.00131;   // %
    const THRESH_BOTTOM_START = 0.0922;  // %
    const RATE_BASE = 0.2;              // x per second after thresholds
    const RATE_AT_MAX_BOTTOM = 0.83;    // x per second once max bottom reached
    const RATE_AT_MAX_BOTH = 1.30;      // x per second once max bottom & left reached

    const PIN_ANCHOR_X = 0.0; // move anchor near the nose horizontally
    const PIN_ANCHOR_Y = 0.0; // slight vertical bias to fuselage centerline
    const PIN_TRANSFORM = `translate(${-PIN_ANCHOR_X * 100}%, ${-PIN_ANCHOR_Y * 100}%) rotate(-29deg)`;

    const start = { x: xFromLeftPct(START_LEFT), y: yFromBottomPct(START_BOTTOM) };

    path.setAttribute('stroke', 'url(#grad)');
    path.setAttribute('fill', 'none');

    if (multiplierEl) multiplierEl.textContent = '1.00x';
    emitState('game:flyingStart', { crashCoeff: floatCrashCoeff });

    pin.classList.remove('crash-game__pin--crash');
    pin.style.left = `${START_LEFT}%`;
    pin.style.bottom = `${START_BOTTOM}%`;
    pin.style.transform = PIN_TRANSFORM;

    if (crashCircle) {
      crashCircle.setAttribute('cx', start.x.toFixed(2));
      crashCircle.setAttribute('cy', start.y.toFixed(2));
    }

    let startTs = null;
    let lastTs = null; // for delta time
    let crashed = false;
    let score = 1; // score starts from 0

    // for firebase snapshots every 3s
    let lastSnapshot = Date.now();

    function animate(ts) {
      if (!startTs) startTs = ts;
      if (!lastTs) lastTs = ts;
      const elapsedSec = (ts - startTs) / 1000;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const leftPct = Math.min(START_LEFT + (MAX_LEFT - START_LEFT) * (elapsedSec / T_MAX_LEFT), MAX_LEFT);
      const bottomPct = Math.min(START_BOTTOM + (MAX_BOTTOM - START_BOTTOM) * (elapsedSec / T_MAX_BOTTOM), MAX_BOTTOM);

      const x = xFromLeftPct(leftPct);
      const y = yFromBottomPct(bottomPct);

      pin.style.left = `${leftPct}%`;
      pin.style.bottom = `${bottomPct}%`;
      pin.style.transform = PIN_TRANSFORM;

      const control = { x: start.x + (x - start.x) * 0.4, y: start.y };
      path.setAttribute('d', `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${x} ${y}`);

      if (crashCircle) {
        crashCircle.setAttribute('cx', x.toFixed(2));
        crashCircle.setAttribute('cy', y.toFixed(2));
      }

      const crossedThresholds = (leftPct >= THRESH_LEFT_START) && (bottomPct >= THRESH_BOTTOM_START);
      let rate = 0;
      if (crossedThresholds) rate = RATE_BASE;
      if (bottomPct >= MAX_BOTTOM) rate = RATE_AT_MAX_BOTTOM;
      if (bottomPct >= MAX_BOTTOM && leftPct >= MAX_LEFT) rate = RATE_AT_MAX_BOTH;

      if (crossedThresholds && rate > 0) {
        score += dt * rate;
      }

      if (multiplierEl) multiplierEl.textContent = `${Math.min(score, floatCrashCoeff).toFixed(2)}x`;

      // Periodic firebase snapshot
      if (Date.now() - lastSnapshot >= 3000) {
        lastSnapshot = Date.now();
        roundPayload.events.push({ type: 'flying_snapshot', ts: Date.now(), coeff: Math.min(score, floatCrashCoeff) });
        writeRoundToFirebase(roundId, roundPayload);
      }

      if (!crashed && score >= floatCrashCoeff) {
        crashed = true;
        pin.classList.add('crash-game__pin--crash');
        if (multiplierEl) multiplierEl.textContent = `${floatCrashCoeff.toFixed(2)}x`;
        emitState('game:crash', { crashCoeff: floatCrashCoeff });

        // final crash write
        roundPayload.events.push({ type: 'crash', ts: Date.now(), crashCoeff: floatCrashCoeff });
        writeRoundToFirebase(roundId, roundPayload).then(() => {
          setTimeout(() => startCountdown(), 3000);
        });
        return;
      }

      if (!crashed) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }

  // Kick off the game - try to load schedule first, fallback to original behavior
  if (typeof GameStore !== 'undefined') {
    loadGameSchedule();
  } else {
    console.warn('Game');
    startCountdown();
  }
});
