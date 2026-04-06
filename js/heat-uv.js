/* ═══════════════════════════════════════════════════════════════
   heat-uv.js  —  AniMonitor · UV & Heat Index Page
   ═══════════════════════════════════════════════════════════════
   Firebase fields expected (same as dashboard.js):
     data.uv          → UV index (numeric, e.g. 8.4)
     data.temperature → Ambient temp in °C  (e.g. 33.2)
     data.humidity    → Relative humidity % (e.g. 78)
   ═══════════════════════════════════════════════════════════════ */


// ─── FLAGS ──────────────────────────────────────────────────────
// Set USE_FIREBASE to true when your ESP32 is pushing live data.
// Set to false to use generated mock data during development.
const USE_FIREBASE = false;


// ─── FIREBASE CONFIG ────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyD4w7Pwr76wPC0QGtPkF5bDdS1Am9ZJaSw",
  authDomain:        "animonitordb.firebaseapp.com",
  databaseURL:       "https://animonitordb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "animonitordb",
  storageBucket:     "animonitordb.firebasestorage.app",
  messagingSenderId: "383571268113",
  appId:             "1:383571268113:web:6fea2d970da19ed10557b0",
  measurementId:     "G-L4BMFXWWSF"
};

const SENSOR_PATH = "sensors/node01";


// ─── INIT FIREBASE (only when enabled) ──────────────────────────
let sensorRef = null;
if (USE_FIREBASE) {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  sensorRef = firebase.database().ref(SENSOR_PATH);
}


// ─── STATE ──────────────────────────────────────────────────────
let prevUV = null;
let prevHI = null;


// ═══════════════════════════════════════════════════════════════
// 1. HEAT INDEX CALCULATION  (PAGASA / NWS Rothfusz equation)
//    Valid for T ≥ 27 °C and RH ≥ 40 %
//    Inputs: temp °C, humidity %
//    Returns: Heat Index °C (rounded to 1 dp)
// ═══════════════════════════════════════════════════════════════
function calcHeatIndex(tempC, rh) {
  if (tempC < 27 || rh < 40) return +tempC.toFixed(1);

  const T = tempC * 9 / 5 + 32;
  const R = rh;

  let HI =
    -42.379
    + 2.04901523  * T
    + 10.14333127 * R
    - 0.22475541  * T * R
    - 0.00683783  * T * T
    - 0.05481717  * R * R
    + 0.00122874  * T * T * R
    + 0.00085282  * T * R * R
    - 0.00000199  * T * T * R * R;

  // Low-humidity adjustment
  if (R < 13 && T >= 80 && T <= 112) {
    HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  }
  // High-humidity adjustment
  if (R > 85 && T >= 80 && T <= 87) {
    HI += ((R - 85) / 10) * ((87 - T) / 5);
  }

  return +((HI - 32) * 5 / 9).toFixed(1);
}


// ═══════════════════════════════════════════════════════════════
// 2. UV INDEX CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
function classifyUV(uv) {
  if (uv >= 11) return { level: "Extreme",   color: "#9c27b0" };
  if (uv >= 8)  return { level: "Very High",  color: "#ff3b30" };
  if (uv >= 6)  return { level: "High",       color: "#ff9500" };
  if (uv >= 3)  return { level: "Moderate",   color: "#ffd60a" };
  return               { level: "Low",        color: "#34c759" };
}


// ═══════════════════════════════════════════════════════════════
// 3. HEAT INDEX CLASSIFICATION  (PAGASA categories)
// ═══════════════════════════════════════════════════════════════
function classifyHI(hi) {
  if (hi >= 52) return { level: "Fatal",            color: "#9c27b0" };
  if (hi >= 42) return { level: "Danger",            color: "#ff3b30" };
  if (hi >= 33) return { level: "Extreme Caution",   color: "#ff9500" };
  if (hi >= 27) return { level: "Caution",           color: "#ffd60a" };
  return               { level: "Safe",              color: "#34c759" };
}


// ═══════════════════════════════════════════════════════════════
// 4. CAUTION HEADLINE  (left column, driven by UV + HI)
// ═══════════════════════════════════════════════════════════════
function getCautionHeadline(uv, hi) {
  if (uv >= 11 || hi >= 42) return "Danger!<br>Stay Indoors Today.";
  if (uv >= 8  || hi >= 33) return "Please Exercise<br>Caution Today.";
  if (uv >= 6  || hi >= 27) return "Take Care<br>in the Sun Today.";
  if (uv >= 3)              return "Enjoy the Day —<br>Sun Protection Advised.";
  return "All Clear.<br>Have a Great Day!";
}


// ═══════════════════════════════════════════════════════════════
// 5. SAFETY REMINDERS  (dynamic, based on UV + HI)
// ═══════════════════════════════════════════════════════════════
const REMINDERS = {
  hydrate: {
    id: "reminderHydrate", icon: "🥛", name: "Hydrate",
    levels: {
      low:      { desc: "Drink at least 6 glasses of water today.",              active: true  },
      moderate: { desc: "Drink 6–8 glasses of water; more if outdoors.",         active: true  },
      high:     { desc: "Drink 8–10 glasses. Avoid sugary or iced drinks.",      active: true  },
      extreme:  { desc: "Drink water every 20 min. Dehydration risk is high.",   active: true  },
    }
  },
  spf: {
    id: "reminderSPF", icon: "🧴", name: "Use Sunscreen",
    levels: {
      low:      { desc: "SPF 15 optional for extended outdoor time.",            active: false },
      moderate: { desc: "Apply SPF 30+ before going outside.",                  active: true  },
      high:     { desc: "SPF 50+ essential. Reapply every 2 hours.",            active: true  },
      extreme:  { desc: "SPF 50+ broad-spectrum. Reapply every 1–2 hrs.",       active: true  },
    }
  },
  sun: {
    id: "reminderSun", icon: "🕶️", name: "Limit Peak Sun Exposure",
    levels: {
      low:      { desc: "Sun exposure is generally safe today.",                 active: false },
      moderate: { desc: "Seek shade between 10 am – 2 pm.",                     active: true  },
      high:     { desc: "Avoid direct sun 10 am – 3 pm.",                       active: true  },
      extreme:  { desc: "Stay indoors 9 am – 4 pm if possible.",                active: true  },
    }
  },
  heat: {
    id: "reminderHeat", icon: "🏠", name: "Stay Cool Indoors",
    levels: {
      low:      { desc: null, active: false },
      moderate: { desc: null, active: false },
      high:     { desc: "Take breaks in air-conditioned spaces.",                active: false },
      extreme:  { desc: "Avoid all strenuous outdoor activity.",                 active: true  },
    }
  }
};

function uvToReminderLevel(uv, hi) {
  if (uv >= 11 || hi >= 42) return "extreme";
  if (uv >= 8  || hi >= 33) return "high";
  if (uv >= 3  || hi >= 27) return "moderate";
  return "low";
}

function renderReminders(uv, hi) {
  const level = uvToReminderLevel(uv, hi);
  const container = document.querySelector(".reminders-card");

  // Remove optional heat reminder row from a prior update
  const existingHeat = document.getElementById("reminderHeat");
  if (existingHeat) existingHeat.remove();

  Object.entries(REMINDERS).forEach(([, rem]) => {
    const cfg = rem.levels[level];

    // Dynamically create the heat reminder row only when active
    if (rem.id === "reminderHeat") {
      if (!cfg.active) return;
      const row = document.createElement("div");
      row.className = "reminder-row";
      row.id = rem.id;
      row.innerHTML = `
        <div class="reminder-text">
          <span class="reminder-name">${rem.name}</span>
          <span class="reminder-desc">${cfg.desc}</span>
        </div>
        <span class="reminder-icon">${rem.icon}</span>`;
      container.appendChild(row);
      return;
    }

    const row = document.getElementById(rem.id);
    if (!row) return;
    row.classList.toggle("reminder-inactive", !cfg.active);
    const bodyEl = row.querySelector(".reminder-desc");
    if (bodyEl) bodyEl.textContent = cfg.active ? cfg.desc : "Not required today.";
  });
}


// ═══════════════════════════════════════════════════════════════
// 6. RIGHT-COLUMN CARDS  (UV Index & Heat Index)
// ═══════════════════════════════════════════════════════════════
function setArrow(el, current, previous) {
  if (previous === null || current === previous) {
    el.textContent = "→"; el.style.color = "rgba(255,255,255,0.4)";
  } else if (current > previous) {
    el.textContent = "↑"; el.style.color = "#ff3b30";
  } else {
    el.textContent = "↓"; el.style.color = "#34c759";
  }
}

function updateRightColumn(uv, hi) {
  const uvClass = classifyUV(uv);
  const hiClass = classifyHI(hi);

  const uvValEl = document.getElementById("uvValue");
  const uvLvlEl = document.getElementById("uvLevel");
  const uvArrEl = document.getElementById("uvArrow");

  if (uvValEl) uvValEl.textContent = uv.toFixed(1);
  if (uvLvlEl) { uvLvlEl.textContent = uvClass.level; uvLvlEl.style.color = uvClass.color; }
  if (uvArrEl) setArrow(uvArrEl, uv, prevUV);

  const hiValEl = document.getElementById("hiValue");
  const hiLvlEl = document.getElementById("hiLevel");
  const hiArrEl = document.getElementById("hiArrow");

  if (hiValEl) hiValEl.textContent = hi.toFixed(1);
  if (hiLvlEl) { hiLvlEl.textContent = hiClass.level; hiLvlEl.style.color = hiClass.color; }
  if (hiArrEl) setArrow(hiArrEl, hi, prevHI);
}


// ═══════════════════════════════════════════════════════════════
// 7. LEFT-COLUMN CARDS
// ═══════════════════════════════════════════════════════════════
function updateLeftColumn(uv, hi) {
  const headlineEl = document.getElementById("cautionHeadline");
  if (headlineEl) headlineEl.innerHTML = getCautionHeadline(uv, hi);

  const dateEl = document.getElementById("cautionDate");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  const feelsEl = document.getElementById("cautionFeels");
  if (feelsEl) feelsEl.textContent = `feels like ${hi.toFixed(1)}°C`;

  renderReminders(uv, hi);
}


// ═══════════════════════════════════════════════════════════════
// 8. MASTER UPDATE  (called by both Firebase listener & mock tick)
// ═══════════════════════════════════════════════════════════════
function applyUpdate(uv, tempC, rh) {
  const hi = calcHeatIndex(tempC, rh);
  updateLeftColumn(uv, hi);
  updateRightColumn(uv, hi);
  prevUV = uv;
  prevHI = hi;
}


// ═══════════════════════════════════════════════════════════════
// 9A. FIREBASE REALTIME LISTENER  (USE_FIREBASE = true)
// ═══════════════════════════════════════════════════════════════
function initFirebaseListener() {
  sensorRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const uv   = parseFloat(data.uv)          || 0;
    const temp = parseFloat(data.temperature ?? data.temp) || 0;
    const hum  = parseFloat(data.humidity     ?? data.hum) || 0;

    applyUpdate(uv, temp, hum);
  }, (err) => {
    console.error("Firebase read error:", err);
    const headlineEl = document.getElementById("cautionHeadline");
    if (headlineEl) headlineEl.innerHTML = "Sensor Offline.<br>Data Unavailable.";
    const feelsEl = document.getElementById("cautionFeels");
    if (feelsEl) feelsEl.textContent = "feels like --°C";
  });
}


// ═══════════════════════════════════════════════════════════════
// 9B. MOCK DATA POLLING  (USE_FIREBASE = false)
//     Mirrors the ranges used in dashboard.js
// ═══════════════════════════════════════════════════════════════
function startMockPolling() {
  function tick() {
    const uv   = +(7 + Math.random() * 3).toFixed(2);
    const temp = +(30 + Math.random() * 4).toFixed(1);
    const hum  = +(72 + Math.random() * 10).toFixed(0);
    applyUpdate(uv, temp, hum);
  }
  tick();                        // immediate first render
  setInterval(tick, 2000);       // then every 2 s, matching dashboard.js
}


// ═══════════════════════════════════════════════════════════════
// 10. LIVE DATE TICKER  (updates the caution-date every minute)
// ═══════════════════════════════════════════════════════════════
function tickDate() {
  const dateEl = document.getElementById("cautionDate");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }
}
tickDate();
setInterval(tickDate, 60_000);


// ═══════════════════════════════════════════════════════════════
// 11. ENTRY POINT
// ═══════════════════════════════════════════════════════════════
if (USE_FIREBASE) {
  initFirebaseListener();
} else {
  startMockPolling();
}