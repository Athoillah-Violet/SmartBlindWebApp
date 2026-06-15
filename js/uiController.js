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
  // Elemen pencarian perangkat (auto discovery)
  discoveryLoading: document.getElementById("discovery-loading"),
  deviceListWrapper: document.getElementById("device-list-wrapper"),
  deviceList: document.getElementById("device-list"),
  connectSubtitle: document.getElementById("connect-subtitle"),
  connectFeedback: document.getElementById("connect-feedback"),
  btnChangeDevice: document.getElementById("btn-change-device"),
  btnResetWifi: document.getElementById("btn-reset-wifi"), // Tombol Reset WiFi
  btnDisconnect: document.getElementById("btn-disconnect"),
  deviceLabel: document.getElementById("device-label"),
  deviceStatusBadge: document.getElementById("device-status-badge"), // Badge status online/offline perangkat
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
  // Elemen Modal & Toast Baru
  resetWifiModal: document.getElementById("reset-wifi-modal"),
  btnModalConfirm: document.getElementById("btn-modal-confirm"),
  btnModalCancel: document.getElementById("btn-modal-cancel"),
  toastContainer: document.getElementById("toast-container"),
  // Elemen Modal Izin Lokasi Wajib
  locationPermissionModal: document.getElementById("location-permission-modal"),
  btnLocationActivate: document.getElementById("btn-location-activate"),
  btnLocationLater: document.getElementById("btn-location-later"),
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

// Menampilkan status loading pencarian perangkat dengan pesan tertentu
export function showDiscoveryLoading(message) {
  els.deviceListWrapper?.classList.add("hidden");
  els.discoveryLoading?.classList.remove("hidden");
  if (els.connectSubtitle) {
    els.connectSubtitle.textContent = "Mencari perangkat Smart Blind yang sedang online...";
  }
  const feedback = els.discoveryLoading?.querySelector(".connect-feedback");
  if (feedback) {
    feedback.textContent = message;
  }
}

// Menampilkan daftar perangkat dan menyembunyikan status loading
export function showDeviceList() {
  els.discoveryLoading?.classList.add("hidden");
  els.deviceListWrapper?.classList.remove("hidden");
  if (els.connectSubtitle) {
    els.connectSubtitle.textContent = "Ditemukan beberapa perangkat Smart Blind. Silakan pilih salah satu.";
  }
}

// Mengecek apakah antarmuka daftar perangkat sedang aktif/terlihat
export function isDeviceListVisible() {
  return !els.deviceListWrapper?.classList.contains("hidden");
}

/**
 * Merender daftar perangkat yang ditemukan ke dalam list UI berbentuk Card modern
 * @param {Array} devices - Daftar objek perangkat ({ id, name, status })
 * @param {Function} onSelectDevice - Callback saat perangkat dipilih/dihubungkan
 */
export function renderDeviceList(devices, onSelectDevice) {
  if (!els.deviceList) return;
  els.deviceList.innerHTML = "";

  devices.forEach((device) => {
    const card = document.createElement("li");
    card.className = "device-card glass";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Perangkat ${device.name || "Smart Blind Stick"} dengan ID ${device.id}, status ${device.status || "offline"}. Hubungkan.`);
    
    // Menentukan class status dot (online/offline)
    const statusClass = device.status === "online" ? "online" : "offline";
    const statusLabel = device.status === "online" ? "Online" : "Offline";

    card.innerHTML = `
      <div class="device-card__header">
        <span class="device-card__name">${device.name || "Smart Blind Stick"}</span>
        <div class="device-card__status">
          <span class="device-card__status-dot ${statusClass}"></span>
          <span class="device-card__status-text">${statusLabel}</span>
        </div>
      </div>
      <div class="device-card__body">
        <span class="device-card__id-label">Device ID</span>
        <span class="device-card__id-value">${device.id}</span>
      </div>
      <button type="button" class="btn btn--dark btn--full" style="margin-top: 0.5rem;">Hubungkan</button>
    `;

    // Handler koneksi saat card diklik
    const handleConnect = (e) => {
      e.stopPropagation();
      onSelectDevice(device.id);
    };

    // Daftarkan event listener
    card.addEventListener("click", handleConnect);
    const btn = card.querySelector("button");
    btn?.addEventListener("click", handleConnect);
    
    // Aksesibilitas keyboard menggunakan Enter/Space
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectDevice(device.id);
      }
    });

    els.deviceList.appendChild(card);
  });
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

// Menampilkan atau menyembunyikan modal konfirmasi reset WiFi
export function showResetWifiModal(show) {
  if (show) {
    els.resetWifiModal?.classList.remove("hidden");
  } else {
    els.resetWifiModal?.classList.add("hidden");
  }
}

// Menampilkan notifikasi Toast mengambang di bagian bawah layar
export function showToast(message, type = "success") {
  if (!els.toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  els.toastContainer.appendChild(toast);

  // Efek memudar dan menghapus toast otomatis setelah 4 detik
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, 12px)";
    toast.style.transition = "opacity 0.3s, transform 0.3s";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Memperbarui badge status keaktifan perangkat (online/offline) di dashboard
export function setDeviceStatus(status) {
  const el = els.deviceStatusBadge;
  if (!el) return;

  el.className = `device-status-badge ${status}`;
  el.textContent = status === "online" ? "Online" : "Offline";
}

export function bindDeviceActions(onChangeDevice, onResetWifi, onDisconnect) {
  els.btnChangeDevice?.addEventListener("click", onChangeDevice);
  els.btnResetWifi?.addEventListener("click", onResetWifi);
  els.btnDisconnect?.addEventListener("click", onDisconnect);
}

export function bindModalActions(onConfirm, onCancel) {
  els.btnModalConfirm?.addEventListener("click", onConfirm);
  els.btnModalCancel?.addEventListener("click", onCancel);
}

export function bindAudioControls(onMute, onTest) {
  els.btnMute?.addEventListener("click", onMute);
  els.btnTest?.addEventListener("click", onTest);
}

export function resetDashboardUi() {
  applyStatus("aman");
  setDeviceStatus("offline");
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu data...";
  if (els.statusRaw) els.statusRaw.textContent = "—";
}

// Menampilkan atau menyembunyikan modal konfirmasi izin akses lokasi wajib
export function showLocationPermissionModal(show) {
  if (show) {
    els.locationPermissionModal?.classList.remove("hidden");
  } else {
    els.locationPermissionModal?.classList.add("hidden");
  }
}

// Meregistrasikan event listener klik tombol konfirmasi izin lokasi (aktifkan, nanti saja)
export function bindLocationPermissionActions(onActivate, onLater) {
  els.btnLocationActivate?.addEventListener("click", onActivate);
  els.btnLocationLater?.addEventListener("click", onLater);
}
