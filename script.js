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
// Mengubah pesan layar dan ucapan suara sesuai permintaan (Tanpa "Awas" dan "Di")
const STATUS = {
  kiri: {
    message: "KIRI ADA HALANGAN",
    speech: "kiri ada halangan",
    type: "danger",
    icon: "left",
  },
  kanan: {
    message: "KANAN ADA HALANGAN",
    speech: "kanan ada halangan",
    type: "danger",
    icon: "right",
  },
  depan: {
    message: "DEPAN ADA HALANGAN",
    speech: "depan ada halangan",
    type: "danger",
    icon: "front",
  },
  aman: {
    message: "JALAN AMAN",
    speech: "jalan aman",
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
  els.connectionBadge.querySelector(".masthead__connection-label").textContent = connected
    ? "Online"
    : "Offline";
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

// Menemukan suara Bahasa Indonesia
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

    if (isActive) {
      el.classList.add("active-danger");
      stateEl.textContent = "Halangan";
    } else {
      el.classList.add("active-safe");
      stateEl.textContent = "Aman";
    }
  });
}

function applyStatus(rawValue) {
  const status = normalizeStatus(rawValue);

  if (!status) {
    els.statusMessage.textContent = "Data tidak valid";
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
const MUTE_ICON_ON = `<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>`;
const MUTE_ICON_OFF = `<path d="M11 5L6 9H3v6h3l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;

function toggleMute() {
  isMuted = !isMuted;
  els.btnMute.classList.toggle("muted", isMuted);
  els.btnMute.setAttribute("aria-pressed", String(isMuted));
  const svg = document.getElementById("mute-icon-svg");
  if (svg) svg.innerHTML = isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON;
  els.muteLabel.textContent = isMuted ? "Unmute Suara" : "Mute Suara";

  if (isMuted) speechSynthesis.cancel();
}

function testSound() {
  const wasMuted = isMuted;
  isMuted = false;
  speak("Tes suara berhasil");
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
        els.statusMessage.textContent = "Gagal terhubung";
        els.statusRaw.textContent = "Error";
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
      els.statusMessage.textContent = "Menunggu data sensor...";
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
