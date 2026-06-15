/**
 * monitoringApp.js - Mengelola logika monitoring lokasi GPS & status sensor realtime
 */

import { MQTT_BROKER, TOPIC_PREFIX } from "./config.js";
import { normalizeStatus, getStatusConfig } from "./helpers.js";

// ====== State Aplikasi ======
let client = null;
let map = null;
let marker = null;
let activeDeviceId = null;
let targetSuffix = null; // 4 Karakter terakhir dari Kode Monitoring yang dicari
let isConnecting = false;

// ====== Konstanta Ikon untuk Peta Leaflet ======
const ICONS = {
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/><circle cx="6" cy="12" r="2" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
  front: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M8 9h8"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

// ====== DOM Elements ======
const els = {
  connectScreen: document.getElementById("connect-screen"),
  dashboard: document.getElementById("dashboard"),
  codeInput: document.getElementById("monitoring-code-input"),
  btnConnect: document.getElementById("btn-connect-monitoring"),
  btnDisconnect: document.getElementById("btn-disconnect-monitoring"),
  connectFeedback: document.getElementById("connect-feedback"),
  deviceNameDisplay: document.getElementById("device-name-display"),
  deviceCodeLabel: document.getElementById("device-code-label"),
  connectionBadge: document.getElementById("connection-badge"),
  valLatitude: document.getElementById("val-latitude"),
  valLongitude: document.getElementById("val-longitude"),
  valTimestamp: document.getElementById("val-timestamp"),
  statusCard: document.getElementById("status-card"),
  statusIcon: document.getElementById("status-icon"),
  statusMessage: document.getElementById("status-message"),
  statusRaw: document.getElementById("status-raw"),
};

// ====== Inisialisasi Peta Leaflet ======
function initMap(lat, lng) {
  if (map) {
    map.remove();
  }
  // Buat objek peta Leaflet dengan auto-center ke koordinat awal
  map = L.map("map").setView([lat, lng], 16);

  // Load tile layer OpenStreetMap gratisan
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  // Buat marker untuk menandai lokasi pengguna
  marker = L.marker([lat, lng]).addTo(map);
}

// ====== Update Posisi Marker & Peta ======
function updateMapLocation(lat, lng) {
  if (!map) {
    initMap(lat, lng);
    return;
  }
  
  const newLatLng = new L.LatLng(lat, lng);
  marker.setLatLng(newLatLng);
  map.setView(newLatLng, 16); // Auto-center
}

// ====== Kelola Badge Koneksi MQTT ======
function setBadgeState(state) {
  const badge = els.connectionBadge;
  if (!badge) return;

  badge.className = "masthead__status " + state;
  const label = badge.querySelector(".masthead__connection-label");
  if (!label) return;

  if (state === "connecting") label.textContent = "Connecting...";
  else if (state === "connected") label.textContent = "Connected";
  else label.textContent = "Disconnected";
}

// ====== Render UI Status Sensor ======
function applySensorStatus(statusKey) {
  const config = getStatusConfig(statusKey);
  if (!config) return;

  const isDanger = config.type === "danger";

  els.statusCard?.classList.remove("status-card--safe", "status-card--danger");
  els.statusCard?.classList.add(isDanger ? "status-card--danger" : "status-card--safe");

  if (els.statusIcon) els.statusIcon.innerHTML = ICONS[config.icon] || "";
  if (els.statusMessage) els.statusMessage.textContent = config.message;
  if (els.statusRaw) els.statusRaw.textContent = statusKey.toUpperCase();
}

// ====== Sambungkan ke MQTT Broker ======
function connectMonitoring(monitoringCode) {
  if (isConnecting) return;
  isConnecting = true;

  // Bersihkan input kode: hapus "SB-" dan trim whitespace
  const cleanCode = monitoringCode.trim().toUpperCase();
  if (!cleanCode.startsWith("SB-") || cleanCode.length < 5) {
    showFeedback("Kode Monitoring tidak valid. Format: SB-XXXX", "error");
    isConnecting = false;
    return;
  }

  // Ambil 4 karakter terakhir sebagai suffix pencarian
  targetSuffix = cleanCode.split("-")[1].trim();
  if (!targetSuffix) {
    showFeedback("Kode Monitoring tidak valid.", "error");
    isConnecting = false;
    return;
  }

  showFeedback("Menghubungkan ke broker...", "");
  setBadgeState("connecting");

  // Inisialisasi MQTT Connection
  client = mqtt.connect(MQTT_BROKER, {
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    keepalive: 30,
  });

  client.on("connect", () => {
    setBadgeState("connected");
    showFeedback("Mencari perangkat dengan kode " + cleanCode + "...", "");
    
    // Subscribe ke topic penemuan perangkat
    client.subscribe("smartblind/devices", { qos: 0 });
  });

  client.on("message", (topic, payload) => {
    // 1. Logika Discovery Perangkat
    if (topic === "smartblind/devices" && !activeDeviceId) {
      try {
        const device = JSON.parse(payload.toString());
        // Periksa apakah ID perangkat berakhir dengan targetSuffix
        if (device && device.id && device.id.toUpperCase().endsWith(targetSuffix)) {
          // Perangkat ditemukan!
          activeDeviceId = device.id;
          
          // Unsubscribe dari discovery topic
          client.unsubscribe("smartblind/devices");

          // Subscribe ke status & lokasi perangkat tersebut
          client.subscribe(`smartblind/${activeDeviceId}/status`, { qos: 0 });
          client.subscribe(`smartblind/${activeDeviceId}/location`, { qos: 0 });

          // Ubah tampilan ke dashboard monitoring
          showDashboard(device.name || "Smart Blind Stick", cleanCode);
        }
      } catch (err) {
        console.warn("Gagal memproses registrasi perangkat:", err);
      }
      return;
    }

    // 2. Logika Payload Status Sensor
    if (activeDeviceId && topic === `smartblind/${activeDeviceId}/status`) {
      const statusKey = normalizeStatus(payload.toString());
      if (statusKey) {
        applySensorStatus(statusKey);
      }
      return;
    }

    // 3. Logika Payload GPS Lokasi
    if (activeDeviceId && topic === `smartblind/${activeDeviceId}/location`) {
      try {
        const loc = JSON.parse(payload.toString());
        if (loc && loc.lat !== undefined && loc.lng !== undefined) {
          // Update teks koordinat
          if (els.valLatitude) els.valLatitude.textContent = Number(loc.lat).toFixed(6);
          if (els.valLongitude) els.valLongitude.textContent = Number(loc.lng).toFixed(6);
          
          // Update timestamp update terakhir
          if (els.valTimestamp) {
            const date = loc.timestamp ? new Date(loc.timestamp * 1000) : new Date();
            els.valTimestamp.textContent = date.toLocaleTimeString("id-ID") + " · " + date.toLocaleDateString("id-ID");
          }

          // Update Leaflet peta
          updateMapLocation(loc.lat, loc.lng);
        }
      } catch (err) {
        console.warn("Gagal memproses data lokasi:", err);
      }
    }
  });

  client.on("reconnect", () => {
    setBadgeState("connecting");
  });

  client.on("offline", () => {
    setBadgeState("disconnected");
  });

  client.on("error", (err) => {
    console.error("MQTT Error:", err);
    showFeedback("Gagal terhubung ke server MQTT.", "error");
    setBadgeState("disconnected");
    isConnecting = false;
  });
}

// ====== Tampilkan Feedback Koneksi ======
function showFeedback(message, type = "") {
  if (!els.connectFeedback) return;
  els.connectFeedback.textContent = message;
  els.connectFeedback.className = "connect-feedback";
  if (type === "success") els.connectFeedback.classList.add("connect-feedback--success");
  if (type === "error") els.connectFeedback.classList.add("connect-feedback--error");
}

// ====== Navigasi Tampilan Pemantauan ======
function showDashboard(deviceName, code) {
  els.connectScreen?.classList.add("hidden");
  els.dashboard?.classList.remove("hidden");
  
  if (els.deviceNameDisplay) els.deviceNameDisplay.textContent = deviceName;
  if (els.deviceCodeLabel) els.deviceCodeLabel.textContent = code;
}

function disconnectMonitoring() {
  if (client) {
    if (activeDeviceId) {
      client.unsubscribe(`smartblind/${activeDeviceId}/status`);
      client.unsubscribe(`smartblind/${activeDeviceId}/location`);
    }
    client.end(true);
  }
  
  // Reset state
  client = null;
  activeDeviceId = null;
  targetSuffix = null;
  isConnecting = false;
  
  if (map) {
    map.remove();
    map = null;
    marker = null;
  }

  // Tampilkan kembali screen awal
  els.dashboard?.classList.add("hidden");
  els.connectScreen?.classList.remove("hidden");
  showFeedback("", "");
  
  if (els.codeInput) els.codeInput.value = "";
}

// ====== Registrasi Event Listener ======
function init() {
  els.btnConnect?.addEventListener("click", () => {
    if (els.codeInput) {
      connectMonitoring(els.codeInput.value);
    }
  });

  els.codeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      connectMonitoring(els.codeInput.value);
    }
  });

  els.btnDisconnect?.addEventListener("click", disconnectMonitoring);
}

document.addEventListener("DOMContentLoaded", init);
init(); // fallback
