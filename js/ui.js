/** UI update logic — tanpa delay, langsung render */

import { getStatusConfig } from "./helpers.js";

const ICONS = {
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/><circle cx="6" cy="12" r="2" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
  front: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M8 9h8"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

export const els = {
  loading: document.getElementById("loading-overlay"),
  connectionBadge: document.getElementById("connection-badge"),
  statusCard: document.getElementById("status-card"),
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

export function hideLoading() {
  els.loading?.classList.add("hidden");
}

export function setConnection(connected) {
  const badge = els.connectionBadge;
  if (!badge) return;

  badge.classList.toggle("connected", connected);
  badge.classList.toggle("disconnected", !connected);

  const label = badge.querySelector(".masthead__connection-label");
  if (label) label.textContent = connected ? "Online" : "Offline";
}

function updateSensorPanels(status) {
  const panels = [
    { el: els.sensorKiri, stateEl: els.sensorKiriState, dir: "kiri" },
    { el: els.sensorTengah, stateEl: els.sensorTengahState, dir: "depan" },
    { el: els.sensorKanan, stateEl: els.sensorKananState, dir: "kanan" },
  ];

  panels.forEach(({ el, stateEl, dir }) => {
    if (!el || !stateEl) return;
    el.classList.remove("active-danger", "active-safe");
    if (status === dir) {
      el.classList.add("active-danger");
      stateEl.textContent = "Halangan";
    } else {
      el.classList.add("active-safe");
      stateEl.textContent = "Aman";
    }
  });
}

/** Update UI segera saat payload MQTT masuk */
export function applyStatus(statusKey) {
  const config = getStatusConfig(statusKey);
  if (!config) return false;

  const isDanger = config.type === "danger";

  els.statusCard?.classList.remove("status-card--safe", "status-card--danger");
  els.statusCard?.classList.add(isDanger ? "status-card--danger" : "status-card--safe");

  if (els.statusIcon) els.statusIcon.innerHTML = ICONS[config.icon];
  if (els.statusMessage) els.statusMessage.textContent = config.message;
  if (els.statusRaw) els.statusRaw.textContent = statusKey.toUpperCase();

  updateSensorPanels(statusKey);
  return true;
}

export function showInvalidPayload(raw) {
  if (els.statusMessage) els.statusMessage.textContent = "Data tidak valid";
  if (els.statusRaw) els.statusRaw.textContent = String(raw ?? "—");
}

export function showWaiting() {
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu data sensor...";
}

const MUTE_ICON_ON = `<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>`;
const MUTE_ICON_OFF = `<path d="M11 5L6 9H3v6h3l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;

export function updateMuteButton(isMuted) {
  els.btnMute?.classList.toggle("muted", isMuted);
  els.btnMute?.setAttribute("aria-pressed", String(isMuted));
  const svg = document.getElementById("mute-icon-svg");
  if (svg) svg.innerHTML = isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON;
  if (els.muteLabel) els.muteLabel.textContent = isMuted ? "Unmute Suara" : "Mute Suara";
}
