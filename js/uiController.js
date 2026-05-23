/** UI — dashboard, connect screen, badge, sensor panels */

import { BADGE, buildTopic } from "./config.js";
import { getStatusConfig, getSensorAlerts } from "./helpers.js";

const ICONS = {
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/><circle cx="6" cy="12" r="2" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
  front: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M8 9h8"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

const MUTE_ICON_ON = `<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>`;
const MUTE_ICON_OFF = `<path d="M11 5L6 9H3v6h3l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;

export const els = {
  loading: document.getElementById("loading-overlay"),
  connectScreen: document.getElementById("connect-screen"),
  dashboard: document.getElementById("dashboard"),
  deviceInput: document.getElementById("device-id-input"),
  connectFeedback: document.getElementById("connect-feedback"),
  btnConnect: document.getElementById("btn-connect-device"),
  btnChangeDevice: document.getElementById("btn-change-device"),
  btnDisconnect: document.getElementById("btn-disconnect"),
  deviceLabel: document.getElementById("device-label"),
  connectionBadge: document.getElementById("connection-badge"),
  footerTopic: document.getElementById("footer-topic"),
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

export function showLoading(text) {
  const t = els.loading?.querySelector(".loading__text");
  if (t && text) t.textContent = text;
  els.loading?.classList.remove("hidden");
}

/** @param {'connecting'|'connected'|'disconnected'} state */
export function setBadgeState(state) {
  const badge = els.connectionBadge;
  if (!badge) return;

  badge.classList.remove("connected", "disconnected", "connecting");
  badge.classList.add(state);

  const label = badge.querySelector(".masthead__connection-label");
  if (!label) return;

  if (state === "connecting") label.textContent = BADGE.CONNECTING;
  else if (state === "connected") label.textContent = BADGE.CONNECTED;
  else label.textContent = BADGE.DISCONNECTED;
}

export function showConnectScreen() {
  els.connectScreen?.classList.remove("hidden");
  els.dashboard?.classList.add("hidden");
  hideLoading();
}

export function showDashboard(deviceId) {
  els.connectScreen?.classList.add("hidden");
  els.dashboard?.classList.remove("hidden");
  if (els.deviceLabel) els.deviceLabel.textContent = deviceId;
  if (els.footerTopic) els.footerTopic.textContent = buildTopic(deviceId);
  hideLoading();
}

export function setDeviceInput(value) {
  if (els.deviceInput) els.deviceInput.value = value ?? "";
}

export function getDeviceInputValue() {
  return els.deviceInput?.value ?? "";
}

export function setConnectLoading(isLoading) {
  if (els.btnConnect) {
    els.btnConnect.disabled = isLoading;
    els.btnConnect.textContent = isLoading ? "Menghubungkan..." : "Hubungkan Perangkat";
  }
  if (els.deviceInput) els.deviceInput.disabled = isLoading;
}

/** @param {'success'|'error'|''} type */
export function showConnectFeedback(message, type = "") {
  const el = els.connectFeedback;
  if (!el) return;
  el.textContent = message;
  el.classList.remove("connect-feedback--success", "connect-feedback--error");
  if (type === "success") el.classList.add("connect-feedback--success");
  if (type === "error") el.classList.add("connect-feedback--error");
}

function updateSensorPanels(statusKey) {
  const alerts = getSensorAlerts(statusKey);
  const isAman = statusKey === "aman";

  const panels = [
    { el: els.sensorKiri, stateEl: els.sensorKiriState, key: "kiri" },
    { el: els.sensorTengah, stateEl: els.sensorTengahState, key: "depan" },
    { el: els.sensorKanan, stateEl: els.sensorKananState, key: "kanan" },
  ];

  panels.forEach(({ el, stateEl, key }) => {
    if (!el || !stateEl) return;
    el.classList.remove("active-danger", "active-safe");
    const danger = !isAman && alerts[key];
    if (danger) {
      el.classList.add("active-danger");
      stateEl.textContent = "Halangan";
    } else {
      el.classList.add("active-safe");
      stateEl.textContent = "Aman";
    }
  });
}

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

export function updateMuteButton(isMuted) {
  els.btnMute?.classList.toggle("muted", isMuted);
  els.btnMute?.setAttribute("aria-pressed", String(isMuted));
  const svg = document.getElementById("mute-icon-svg");
  if (svg) svg.innerHTML = isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON;
  if (els.muteLabel) els.muteLabel.textContent = isMuted ? "Unmute Suara" : "Mute Suara";
}

export function bindConnectForm(onSubmit) {
  els.btnConnect?.addEventListener("click", () => onSubmit(getDeviceInputValue()));
  els.deviceInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSubmit(getDeviceInputValue());
  });
}

export function bindDeviceActions(onChangeDevice, onDisconnect) {
  els.btnChangeDevice?.addEventListener("click", onChangeDevice);
  els.btnDisconnect?.addEventListener("click", onDisconnect);
}

export function bindAudioControls(onMute, onTest) {
  els.btnMute?.addEventListener("click", onMute);
  els.btnTest?.addEventListener("click", onTest);
}

export function resetDashboardUi() {
  applyStatus("aman");
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu data...";
  if (els.statusRaw) els.statusRaw.textContent = "—";
}
