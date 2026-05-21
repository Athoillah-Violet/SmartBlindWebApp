/**
 * SmartBlind App — Realtime navigation status
 * Firebase Realtime Database + Web Speech API
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// ===== Firebase Config =====
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForPublicRTDB",
  authDomain: "smartblindapp-e99f9.firebaseapp.com",
  databaseURL:
    "https://smartblindapp-e99f9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smartblindapp-e99f9",
  storageBucket: "smartblindapp-e99f9.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

// ===== Status Definitions =====
const STATUS = {
  kiri: {
    message: "AWAS KIRI ADA HALANGAN",
    speech: "Awas kiri ada halangan",
    type: "danger",
    icon: "left",
  },
  kanan: {
    message: "AWAS KANAN ADA HALANGAN",
    speech: "Awas kanan ada halangan",
    type: "danger",
    icon: "right",
  },
  depan: {
    message: "AWAS DI DEPAN ADA HALANGAN",
    speech: "Awas di depan ada halangan",
    type: "danger",
    icon: "front",
  },
  aman: {
    message: "JALAN AMAN",
    speech: "Jalan aman",
    type: "safe",
    icon: "safe",
  },
};

// ===== DOM Elements =====
const els = {
  loading: document.getElementById("loading-overlay"),
  connectionBadge: document.getElementById("connection-badge"),
  statusCard: document.getElementById("status-card"),
  statusIndicator: document.getElementById("status-indicator"),
  statusIcon: document.getElementById("status-icon"),
  statusMessage: document.getElementById("status-message"),
  statusRaw: document.getElementById("status-raw"),
  sensorKiri: document.getElementById("sensor-kiri"),
  sensorTengah: document.getElementById("sensor-tengah"),
  sensorKanan: document.getElementById("sensor-kanan"),
  sensorKiriState: document.getElementById("sensor-kiri-state"),
  sensorTengahState: document.getElementById("sensor-tengah-state"),
  sensorKananState: document.getElementById("sensor-kanan-state"),
  btnMute: document.getElementById("btn-mute"),
  btnTest: document.getElementById("btn-test"),
  muteIcon: document.getElementById("mute-icon"),
  muteLabel: document.getElementById("mute-label"),
};

// ===== App State =====
let lastStatus = null;
let isMuted = false;
let voicesReady = false;

// ===== Icons (inline SVG) =====
const ICONS = {
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/><circle cx="6" cy="12" r="2" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
  front: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M8 9h8"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

// ===== Helpers =====
function normalizeStatus(value) {
  if (value == null) return null;
  const str = String(value).trim().toLowerCase();
  return STATUS[str] ? str : null;
}

function hideLoading() {
  els.loading.classList.add("hidden");
}

function setConnected(connected) {
  els.connectionBadge.classList.toggle("connected", connected);
  els.connectionBadge.querySelector(".connection-label").textContent = connected
    ? "ONLINE"
    : "OFFLINE";
}

// ===== Speech =====
function loadVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      voicesReady = true;
      resolve(voices);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      voicesReady = true;
      resolve(speechSynthesis.getVoices());
    };
    setTimeout(() => resolve(speechSynthesis.getVoices()), 500);
  });
}

function getIndonesianVoice(voices) {
  return (
    voices.find((v) => v.lang.startsWith("id")) ||
    voices.find((v) => v.lang.includes("ID")) ||
    voices[0]
  );
}

function speak(text) {
  if (isMuted || !text) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "id-ID";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voices = speechSynthesis.getVoices();
  const idVoice = getIndonesianVoice(voices);
  if (idVoice) utterance.voice = idVoice;

  speechSynthesis.speak(utterance);
}

// ===== UI Updates =====
function updateSensorPanels(status) {
  const panels = [
    { el: els.sensorKiri, stateEl: els.sensorKiriState, dir: "kiri" },
    { el: els.sensorTengah, stateEl: els.sensorTengahState, dir: "depan" },
    { el: els.sensorKanan, stateEl: els.sensorKananState, dir: "kanan" },
  ];

  panels.forEach(({ el, stateEl, dir }) => {
    el.classList.remove("active-danger", "active-safe");
    const isActive = status === dir;
    const isSafe = status === "aman" || !isActive;

    if (isActive) {
      el.classList.add("active-danger");
      stateEl.textContent = "HALANGAN";
    } else if (status === "aman") {
      el.classList.add("active-safe");
      stateEl.textContent = "AMAN";
    } else {
      el.classList.add("active-safe");
      stateEl.textContent = "AMAN";
    }
  });
}

function applyStatus(rawValue) {
  const status = normalizeStatus(rawValue);

  if (!status) {
    els.statusMessage.textContent = "DATA TIDAK VALID";
    els.statusRaw.textContent = String(rawValue ?? "—");
    return;
  }

  const config = STATUS[status];
  const isDanger = config.type === "danger";

  els.statusCard.classList.remove("status-card--safe", "status-card--danger");
  els.statusCard.classList.add(isDanger ? "status-card--danger" : "status-card--safe");

  els.statusIcon.innerHTML = ICONS[config.icon];
  els.statusMessage.textContent = config.message;
  els.statusRaw.textContent = status.toUpperCase();

  updateSensorPanels(status);

  if (lastStatus !== status) {
    speak(config.speech);
    lastStatus = status;
  }
}

// ===== Audio Controls =====
function toggleMute() {
  isMuted = !isMuted;
  els.btnMute.classList.toggle("muted", isMuted);
  els.btnMute.setAttribute("aria-pressed", String(isMuted));
  els.muteIcon.textContent = isMuted ? "🔇" : "🔊";
  els.muteLabel.textContent = isMuted ? "UNMUTE SUARA" : "MUTE SUARA";

  if (isMuted) speechSynthesis.cancel();
}

function testSound() {
  const wasMuted = isMuted;
  isMuted = false;
  speak("Tes suara Smart Blind App berhasil");
  isMuted = wasMuted;
}

// ===== Firebase Realtime (SDK) =====
let firebaseConnected = false;

function initFirebase() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const statusRef = ref(db, "status");

  onValue(
    statusRef,
    (snapshot) => {
      firebaseConnected = true;
      setConnected(true);
      hideLoading();
      applyStatus(snapshot.val());
    },
    (error) => {
      console.error("Firebase SDK error:", error);
      if (!firebaseConnected) {
        setConnected(false);
        els.statusMessage.textContent = "GAGAL TERHUBUNG — COBA LAGI";
        els.statusRaw.textContent = "ERROR";
      }
      hideLoading();
    }
  );
}

// ===== REST Fallback (polling realtime) =====
const REST_URL =
  "https://smartblindapp-e99f9-default-rtdb.asia-southeast1.firebasedatabase.app/status.json";

let restActive = false;

function initRestFallback() {
  if (restActive) return;
  restActive = true;

  async function poll() {
    try {
      const res = await fetch(REST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setConnected(true);
      hideLoading();
      applyStatus(data);
    } catch (err) {
      console.warn("REST poll:", err);
      if (!firebaseConnected) setConnected(false);
    }
    setTimeout(poll, 400);
  }

  poll();
}

// ===== Init =====
async function init() {
  els.btnMute.addEventListener("click", toggleMute);
  els.btnTest.addEventListener("click", testSound);

  await loadVoices();

  try {
    initFirebase();
    initRestFallback();
  } catch (err) {
    console.warn("Firebase SDK init failed:", err);
    initRestFallback();
  }

  setTimeout(() => {
    if (els.loading.classList.contains("hidden")) return;
    hideLoading();
    if (!firebaseConnected) {
      els.statusMessage.textContent = "MENUNGGU DATA SENSOR...";
    }
  }, 6000);

  document.addEventListener(
    "click",
    () => {
      if (speechSynthesis.getVoices().length === 0) loadVoices();
    },
    { once: true }
  );
}

init();
