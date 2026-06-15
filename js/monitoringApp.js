/**
 * monitoringApp.js - Logika halaman monitoring GPS realtime & status sensor pendamping
 */

import { MQTT_BROKER, TOPIC_PREFIX } from "./config.js";
import { normalizeStatus, getStatusConfig } from "./helpers.js";

// ====== State Pemantauan ======
let client = null;
let map = null;
let marker = null;
let activeDeviceId = null;
let deviceKeepaliveTimer = null;

// Track koordinat terakhir untuk optimasi reverse geocoding
let lastGeocodedLat = null;
let lastGeocodedLng = null;

// Map perangkat online untuk selector: deviceId -> deviceData
const onlineDevices = new Map();

// ====== Konstanta Ikon Peta Leaflet ======
const ICONS = {
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/><circle cx="6" cy="12" r="2" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
  front: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M8 9h8"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

// ====== DOM Elements ======
const els = {
  connectionBadge: document.getElementById("connection-badge"),
  deviceSelector: document.getElementById("device-selector"),
  valAddress: document.getElementById("val-address"),
  valLatitude: document.getElementById("val-latitude"),
  valLongitude: document.getElementById("val-longitude"),
  valAccuracy: document.getElementById("val-accuracy"),
  valTimestamp: document.getElementById("val-timestamp"),
  valDeviceStatus: document.getElementById("val-device-status"),
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
  map = L.map("map").setView([lat, lng], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  marker = L.marker([lat, lng]).addTo(map);
}

// ====== Peta Bergerak Mengikuti Posisi Terbaru ======
function updateMapLocation(lat, lng) {
  if (!map) {
    initMap(lat, lng);
    return;
  }
  const newLatLng = new L.LatLng(lat, lng);
  marker.setLatLng(newLatLng);
  map.setView(newLatLng, 16); // Auto center
}

// ====== Formula Haversine untuk Menghitung Jarak (Meter) ======
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ====== Reverse Geocoding via Nominatim OSM (Hemat Kuota/Baterai) ======
async function reverseGeocode(lat, lng) {
  // Hanya panggil API jika posisi bergeser lebih dari 15 meter dari pencarian terakhir
  if (lastGeocodedLat !== null && lastGeocodedLng !== null) {
    const distance = calculateDistance(lastGeocodedLat, lastGeocodedLng, lat, lng);
    if (distance < 15) return;
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name && els.valAddress) {
        els.valAddress.textContent = data.display_name;
        lastGeocodedLat = lat;
        lastGeocodedLng = lng;
      }
    }
  } catch (err) {
    console.error("Gagal mendapatkan reverse geocode:", err);
  }
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

// ====== Kelola Status Keaktifan Tongkat (Online/Offline) ======
function updateDeviceStatusBadge(status) {
  const badge = els.valDeviceStatus;
  if (!badge) return;

  badge.className = `device-status-badge ${status}`;
  badge.textContent = status.toUpperCase();
}

function resetKeepaliveTimer() {
  if (deviceKeepaliveTimer) {
    clearTimeout(deviceKeepaliveTimer);
  }
  updateDeviceStatusBadge("online");

  deviceKeepaliveTimer = setTimeout(() => {
    updateDeviceStatusBadge("offline");
  }, 12000); // 12 detik tanpa data sensor/lokasi = Offline
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

// ====== Update Dropdown Selector Perangkat Dinamis ======
function updateSelectorUi() {
  if (!els.deviceSelector) return;

  // Simpan nilai pilihan saat ini agar tidak ter-reset
  const currentValue = els.deviceSelector.value;

  els.deviceSelector.innerHTML = "";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent =
    onlineDevices.size === 0
      ? "-- Mencari perangkat online... --"
      : "-- Pilih Perangkat Smart Blind --";
  els.deviceSelector.appendChild(defaultOpt);

  onlineDevices.forEach((device) => {
    const opt = document.createElement("option");
    opt.value = device.id;
    // Format Kode: SB-XXXX (4 karakter terakhir Device ID)
    const code = `SB-${device.id.slice(-4)}`;
    opt.textContent = `${device.name || "Smart Blind Stick"} (${code})`;
    els.deviceSelector.appendChild(opt);
  });

  // Pulihkan nilai terpilih jika perangkatnya masih online
  if (onlineDevices.has(currentValue)) {
    els.deviceSelector.value = currentValue;
  } else if (currentValue === activeDeviceId && activeDeviceId !== null) {
    // Perangkat yang aktif terpilih offline/keluar dari list
    disconnectActiveDevice();
  }
}

// ====== Berlangganan / Pindah Monitoring Perangkat ======
function subscribeToDevice(deviceId) {
  disconnectActiveDevice();

  activeDeviceId = deviceId;
  updateDeviceStatusBadge("online");

  // Subscribe ke status & lokasi perangkat baru
  client.subscribe(`smartblind/${deviceId}/status`, { qos: 0 });
  client.subscribe(`smartblind/${deviceId}/location`, { qos: 0 });

  // Reset tampilan panel pemantau
  if (els.valAddress) els.valAddress.textContent = "Mencari alamat...";
  if (els.valLatitude) els.valLatitude.textContent = "—";
  if (els.valLongitude) els.valLongitude.textContent = "—";
  if (els.valAccuracy) els.valAccuracy.textContent = "—";
  if (els.valTimestamp) els.valTimestamp.textContent = "—";

  applySensorStatus("aman");
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu data sensor...";
  if (els.statusRaw) els.statusRaw.textContent = "—";
  
  resetKeepaliveTimer();
}

// ====== Putuskan Pemantauan Perangkat Aktif ======
function disconnectActiveDevice() {
  if (activeDeviceId && client) {
    client.unsubscribe(`smartblind/${activeDeviceId}/status`);
    client.unsubscribe(`smartblind/${activeDeviceId}/location`);
  }

  activeDeviceId = null;
  lastGeocodedLat = null;
  lastGeocodedLng = null;

  if (deviceKeepaliveTimer) {
    clearTimeout(deviceKeepaliveTimer);
    deviceKeepaliveTimer = null;
  }

  updateDeviceStatusBadge("offline");

  // Reset peta
  if (map) {
    map.remove();
    map = null;
    marker = null;
  }

  // Reset UI Info
  if (els.valAddress) els.valAddress.textContent = "Silakan pilih perangkat di atas.";
  if (els.valLatitude) els.valLatitude.textContent = "—";
  if (els.valLongitude) els.valLongitude.textContent = "—";
  if (els.valAccuracy) els.valAccuracy.textContent = "—";
  if (els.valTimestamp) els.valTimestamp.textContent = "—";

  applySensorStatus("aman");
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu pilihan perangkat...";
  if (els.statusRaw) els.statusRaw.textContent = "—";
}

// ====== Koneksi Awal Pemantauan ======
function initMqtt() {
  setBadgeState("connecting");

  client = mqtt.connect(MQTT_BROKER, {
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    keepalive: 30,
  });

  client.on("connect", () => {
    setBadgeState("connected");
    // Berlangganan topic discovery untuk memantau perangkat yang online
    client.subscribe("smartblind/devices", { qos: 0 });
  });

  client.on("message", (topic, payload) => {
    // 1. Discovery Perangkat
    if (topic === "smartblind/devices") {
      try {
        const device = JSON.parse(payload.toString());
        if (device && device.id) {
          if (device.status === "online") {
            onlineDevices.set(device.id, device);
          } else {
            onlineDevices.delete(device.id);
          }
          updateSelectorUi();
        }
      } catch (err) {
        console.warn("Gagal parsing registrasi perangkat:", err);
      }
      return;
    }

    // 2. Data Status Sensor Realtime
    if (activeDeviceId && topic === `smartblind/${activeDeviceId}/status`) {
      resetKeepaliveTimer();
      const statusKey = normalizeStatus(payload.toString());
      if (statusKey) {
        applySensorStatus(statusKey);
      }
      return;
    }

    // 3. Data Lokasi GPS Realtime
    if (activeDeviceId && topic === `smartblind/${activeDeviceId}/location`) {
      resetKeepaliveTimer();
      try {
        const loc = JSON.parse(payload.toString());
        if (loc && loc.latitude !== undefined && loc.longitude !== undefined) {
          // Update teks koordinat & akurasi
          if (els.valLatitude) els.valLatitude.textContent = Number(loc.latitude).toFixed(6);
          if (els.valLongitude) els.valLongitude.textContent = Number(loc.longitude).toFixed(6);
          if (els.valAccuracy) els.valAccuracy.textContent = `±${loc.accuracy || 0} Meter`;
          
          // Update timestamp
          if (els.valTimestamp) {
            const date = loc.timestamp ? new Date(loc.timestamp * 1000) : new Date();
            els.valTimestamp.textContent = date.toLocaleTimeString("id-ID") + " WIB";
          }

          // Update Leaflet peta
          updateMapLocation(loc.latitude, loc.longitude);
          
          // Jalankan reverse geocoding alamat
          reverseGeocode(loc.latitude, loc.longitude);
        }
      } catch (err) {
        console.warn("Gagal parsing data lokasi:", err);
      }
    }
  });

  client.on("reconnect", () => setBadgeState("connecting"));
  client.on("offline", () => setBadgeState("disconnected"));
  client.on("close", () => setBadgeState("disconnected"));
}

// ====== Registrasi Event Listener ======
function init() {
  // Bind perubahan selektor perangkat
  els.deviceSelector?.addEventListener("change", (e) => {
    const selectedId = e.target.value;
    if (selectedId) {
      subscribeToDevice(selectedId);
    } else {
      disconnectActiveDevice();
    }
  });

  els.btnDisconnect?.addEventListener("click", () => {
    if (els.deviceSelector) els.deviceSelector.value = "";
    disconnectActiveDevice();
  });

  // Hubungkan MQTT
  initMqtt();
  
  // Set UI Awal
  disconnectActiveDevice();
}

document.addEventListener("DOMContentLoaded", init);
init(); // fallback
