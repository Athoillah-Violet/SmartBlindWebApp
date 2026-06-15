/**
 * monitoringApp.js - Logika halaman monitoring GPS realtime & status sensor pendamping
 */

import { MQTT_BROKER, STORAGE_KEY } from "./config.js";
import {
  getStatusConfig,
  loadMonitoringDevices,
  normalizeDeviceId,
  normalizeStatus,
  rememberMonitoringDevice,
} from "./helpers.js";

const DISCOVERY_TOPIC = "smartblind/devices";
const KEEPALIVE_TIMEOUT = 12000;
const DEFAULT_COORDS = { lat: -5.3644, lng: 105.2449 };

let client = null;
let map = null;
let marker = null;
let activeDeviceId = null;
let deviceKeepaliveTimer = null;
let lastGeocodedLat = null;
let lastGeocodedLng = null;
let reverseGeocodeController = null;

const authorizedDevices = new Map();

const ICONS = {
  left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/><circle cx="6" cy="12" r="2" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
  front: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M8 9h8"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

const els = {
  connectionBadge: document.getElementById("connection-badge"),
  deviceSelector: document.getElementById("device-selector"),
  deviceListEmpty: document.getElementById("device-list-empty"),
  deviceListNote: document.getElementById("device-list-note"),
  activeDeviceLabel: document.getElementById("active-device-label"),
  valAddress: document.getElementById("val-address"),
  valLatitude: document.getElementById("val-latitude"),
  valLongitude: document.getElementById("val-longitude"),
  valAccuracy: document.getElementById("val-accuracy"),
  valTimestamp: document.getElementById("val-timestamp"),
  statusCard: document.getElementById("status-card"),
  statusIcon: document.getElementById("status-icon"),
  statusMessage: document.getElementById("status-message"),
  statusRaw: document.getElementById("status-raw"),
};

function setAddressLines(value) {
  if (!els.valAddress) return;
  els.valAddress.textContent = "";

  const lines = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

  if (lines.length === 0) {
    els.valAddress.textContent = "Alamat belum tersedia.";
    return;
  }

  const fragment = document.createDocumentFragment();
  lines.slice(0, 5).forEach((line) => {
    const row = document.createElement("span");
    row.className = "monitoring-address__line";
    row.textContent = line;
    fragment.appendChild(row);
  });
  els.valAddress.appendChild(fragment);
}

function setMapDeviceLabel(text) {
  if (els.activeDeviceLabel) {
    els.activeDeviceLabel.textContent = text;
  }
}

function setBadgeState(state) {
  const badge = els.connectionBadge;
  if (!badge) return;

  badge.className = `masthead__status ${state}`;
  const label = badge.querySelector(".masthead__connection-label");
  if (!label) return;

  if (state === "connecting") label.textContent = "Connecting...";
  else if (state === "connected") label.textContent = "Connected";
  else label.textContent = "Disconnected";
}

function clearKeepaliveTimer() {
  if (deviceKeepaliveTimer) {
    clearTimeout(deviceKeepaliveTimer);
    deviceKeepaliveTimer = null;
  }
}

function resetKeepaliveTimer() {
  clearKeepaliveTimer();

  deviceKeepaliveTimer = setTimeout(() => {
    if (activeDeviceId && authorizedDevices.has(activeDeviceId)) {
      const device = authorizedDevices.get(activeDeviceId);
      authorizedDevices.set(activeDeviceId, { ...device, status: "offline" });
      renderDeviceList();
    }
  }, KEEPALIVE_TIMEOUT);
}

function initDefaultMap() {
  if (map) return;

  map = L.map("map").setView([DEFAULT_COORDS.lat, DEFAULT_COORDS.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  marker = L.marker([DEFAULT_COORDS.lat, DEFAULT_COORDS.lng], { opacity: 0.6 }).addTo(map);
  marker.bindPopup("Menunggu data lokasi perangkat...");

  setTimeout(() => map.invalidateSize(), 100);
}

function updateMapLocation(lat, lng) {
  initDefaultMap();

  const point = new L.LatLng(lat, lng);
  marker.setLatLng(point);
  marker.setOpacity(1);
  marker.bindPopup("Lokasi pengguna Smart Blind");
  map.setView(point, Math.max(map.getZoom(), 16), { animate: true });
  map.invalidateSize();
}

function resetMapState() {
  initDefaultMap();
  marker.setLatLng([DEFAULT_COORDS.lat, DEFAULT_COORDS.lng]);
  marker.setOpacity(0.6);
  marker.bindPopup("Menunggu pilihan perangkat...");
  map.setView([DEFAULT_COORDS.lat, DEFAULT_COORDS.lng], 13);
  map.invalidateSize();
}

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

async function reverseGeocode(lat, lng) {
  if (lastGeocodedLat !== null && lastGeocodedLng !== null) {
    const distance = calculateDistance(lastGeocodedLat, lastGeocodedLng, lat, lng);
    if (distance < 15) return;
  }

  try {
    reverseGeocodeController?.abort();
    reverseGeocodeController = new AbortController();

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
        signal: reverseGeocodeController.signal,
      }
    );

    if (!res.ok) return;
    const data = await res.json();
    if (!data?.display_name) return;

    setAddressLines(data.display_name);
    lastGeocodedLat = lat;
    lastGeocodedLng = lng;
  } catch (err) {
    if (err?.name !== "AbortError") {
      console.error("Gagal mendapatkan reverse geocode:", err);
    }
  }
}

function applySensorStatus(statusKey) {
  const config = getStatusConfig(statusKey);
  if (!config) return;

  const isDanger = config.type === "danger";

  els.statusCard?.classList.remove("status-card--safe", "status-card--danger");
  els.statusCard?.classList.add(isDanger ? "status-card--danger" : "status-card--safe");

  if (els.statusIcon) els.statusIcon.innerHTML = ICONS[config.icon] || "";
  if (els.statusMessage) els.statusMessage.textContent = config.message;
  if (els.statusRaw) els.statusRaw.textContent = statusKey.replaceAll("_", " ").toUpperCase();
}

function resetMonitoringPanels() {
  setAddressLines("Silakan pilih perangkat di atas.");
  if (els.valLatitude) els.valLatitude.textContent = "—";
  if (els.valLongitude) els.valLongitude.textContent = "—";
  if (els.valAccuracy) els.valAccuracy.textContent = "—";
  if (els.valTimestamp) els.valTimestamp.textContent = "—";
  applySensorStatus("aman");
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu pilihan perangkat...";
  if (els.statusRaw) els.statusRaw.textContent = "—";
}

function showLocationUnavailable(reason = "Lokasi tidak tersedia", timestampValue = null) {
  setAddressLines(reason);
  if (els.valLatitude) els.valLatitude.textContent = "—";
  if (els.valLongitude) els.valLongitude.textContent = "—";
  if (els.valAccuracy) els.valAccuracy.textContent = "GPS nonaktif";
  if (els.valTimestamp) {
    els.valTimestamp.textContent = timestampValue ? formatTimestamp(timestampValue) : "—";
  }
  resetMapState();
}

function formatTimestamp(timestampValue) {
  const numeric = Number(timestampValue);
  const value = Number.isFinite(numeric) && numeric > 0
    ? (numeric > 1e12 ? numeric : numeric * 1000)
    : Date.now();

  const formatted = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

  return `${formatted} WIB`;
}

function syncAuthorizedDevices() {
  const savedDeviceId = normalizeDeviceId(localStorage.getItem(STORAGE_KEY));
  if (savedDeviceId) {
    rememberMonitoringDevice({ id: savedDeviceId, name: "Smart Blind", status: "offline" });
  }

  const persistedDevices = loadMonitoringDevices();
  const knownStatuses = new Map(
    Array.from(authorizedDevices.entries()).map(([id, device]) => [id, device.status])
  );

  authorizedDevices.clear();

  persistedDevices.forEach((device) => {
    authorizedDevices.set(device.id, {
      ...device,
      status: knownStatuses.get(device.id) || device.status || "offline",
    });
  });
}

function updateRouteDevice(deviceId) {
  try {
    const url = new URL(window.location.href);
    if (deviceId) {
      url.searchParams.set("deviceId", deviceId);
    } else {
      url.searchParams.delete("deviceId");
    }
    window.history.replaceState({}, "", url);
  } catch (_) {
    /* ignore URL updates in unsupported environments */
  }
}

function getDeviceDisplay(device) {
  return `${device.name || "Smart Blind"} · ${device.id}`;
}

function renderDeviceList() {
  if (!els.deviceSelector) return;

  syncAuthorizedDevices();
  els.deviceSelector.textContent = "";

  const devices = Array.from(authorizedDevices.values());
  const hasDevices = devices.length > 0;

  els.deviceListEmpty?.classList.toggle("is-visible", !hasDevices);
  if (els.deviceListNote) {
    els.deviceListNote.classList.toggle("hidden", !hasDevices);
  }

  devices.forEach((device) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "monitoring-device-item";
    if (device.id === activeDeviceId) {
      button.classList.add("is-active");
      button.setAttribute("aria-selected", "true");
    } else {
      button.setAttribute("aria-selected", "false");
    }
    button.dataset.deviceId = device.id;

    const statusClass = device.status === "online" ? "online" : "offline";
    button.innerHTML = `
      <div class="monitoring-device-item__main">
        <div class="monitoring-device-item__name">${device.name || "Smart Blind"}</div>
        <div class="monitoring-device-item__id">${device.id}</div>
      </div>
      <div class="monitoring-device-item__status ${statusClass}">
        <span class="monitoring-device-item__status-dot"></span>
        <span>${statusClass}</span>
      </div>
    `;

    button.addEventListener("click", () => subscribeToDevice(device.id));
    els.deviceSelector.appendChild(button);
  });
}

function subscribeTopics(deviceId) {
  if (!client || !client.connected || !deviceId) return;
  client.subscribe(`smartblind/${deviceId}/status`, { qos: 0 });
  client.subscribe(`smartblind/${deviceId}/location`, { qos: 0 });
}

function unsubscribeTopics(deviceId) {
  if (!client || !deviceId) return;
  client.unsubscribe(`smartblind/${deviceId}/status`);
  client.unsubscribe(`smartblind/${deviceId}/location`);
}

function subscribeToDevice(rawDeviceId) {
  const deviceId = normalizeDeviceId(rawDeviceId);
  if (!deviceId || !authorizedDevices.has(deviceId)) return;

  if (activeDeviceId && activeDeviceId !== deviceId) {
    unsubscribeTopics(activeDeviceId);
  }

  activeDeviceId = deviceId;
  lastGeocodedLat = null;
  lastGeocodedLng = null;

  const device = authorizedDevices.get(deviceId);
  setMapDeviceLabel(getDeviceDisplay(device));
  setAddressLines("Menunggu lokasi terbaru...");
  if (els.valLatitude) els.valLatitude.textContent = "—";
  if (els.valLongitude) els.valLongitude.textContent = "—";
  if (els.valAccuracy) els.valAccuracy.textContent = "—";
  if (els.valTimestamp) els.valTimestamp.textContent = "—";
  applySensorStatus("aman");
  if (els.statusMessage) els.statusMessage.textContent = "Menunggu data sensor...";
  if (els.statusRaw) els.statusRaw.textContent = "—";
  updateRouteDevice(deviceId);
  renderDeviceList();
  subscribeTopics(deviceId);
}

function disconnectActiveDevice() {
  if (activeDeviceId) {
    unsubscribeTopics(activeDeviceId);
  }

  activeDeviceId = null;
  lastGeocodedLat = null;
  lastGeocodedLng = null;
  reverseGeocodeController?.abort();
  clearKeepaliveTimer();
  setMapDeviceLabel("Belum ada perangkat dipilih");
  resetMapState();
  resetMonitoringPanels();
  updateRouteDevice(null);
  renderDeviceList();
}

function handleDiscoveryMessage(payload) {
  try {
    const device = JSON.parse(payload.toString());
    const id = normalizeDeviceId(device?.id);
    if (!id || !authorizedDevices.has(id)) return;

    const current = authorizedDevices.get(id);
    const nextStatus = device?.status === "offline" ? "offline" : "online";
    const updated = {
      ...current,
      name: String(device?.name || current.name || "Smart Blind").trim() || "Smart Blind",
      status: nextStatus,
    };

    authorizedDevices.set(id, updated);
    rememberMonitoringDevice(updated);

    renderDeviceList();
  } catch (err) {
    console.warn("Gagal parsing registrasi perangkat:", err);
  }
}

function handleStatusMessage(payload) {
  resetKeepaliveTimer();

  if (activeDeviceId && authorizedDevices.has(activeDeviceId)) {
    const activeDevice = authorizedDevices.get(activeDeviceId);
    authorizedDevices.set(activeDeviceId, { ...activeDevice, status: "online" });
    renderDeviceList();
  }

  const statusKey = normalizeStatus(payload.toString());
  if (statusKey) {
    applySensorStatus(statusKey);
  }
}

function handleLocationMessage(payload) {
  resetKeepaliveTimer();

  if (activeDeviceId && authorizedDevices.has(activeDeviceId)) {
    const activeDevice = authorizedDevices.get(activeDeviceId);
    authorizedDevices.set(activeDeviceId, { ...activeDevice, status: "online" });
    renderDeviceList();
  }

  try {
    const loc = JSON.parse(payload.toString());
    if (loc?.available === false) {
      showLocationUnavailable(loc?.reason || "Lokasi tidak tersedia", loc?.timestamp);
      return;
    }

    const latitude = Number(loc?.latitude);
    const longitude = Number(loc?.longitude);
    const accuracy = Number(loc?.accuracy ?? 0);
    const timestamp = Number(loc?.timestamp);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (Number.isFinite(accuracy) && accuracy > 80) {
      showLocationUnavailable("Akurasi GPS terlalu lemah", timestamp);
      return;
    }

    if (els.valLatitude) els.valLatitude.textContent = latitude.toFixed(6);
    if (els.valLongitude) els.valLongitude.textContent = longitude.toFixed(6);
    if (els.valAccuracy) {
      const roundedAccuracy = Number.isFinite(accuracy) ? Math.max(1, Math.round(accuracy)) : 0;
      els.valAccuracy.textContent = `±${roundedAccuracy} Meter`;
    }
    if (els.valTimestamp) {
      els.valTimestamp.textContent = formatTimestamp(timestamp);
    }

    updateMapLocation(latitude, longitude);
    reverseGeocode(latitude, longitude);
  } catch (err) {
    console.warn("Gagal parsing data lokasi:", err);
  }
}

function initMqtt() {
  if (typeof mqtt === "undefined") {
    setBadgeState("disconnected");
    return;
  }

  setBadgeState("connecting");

  client = mqtt.connect(MQTT_BROKER, {
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    keepalive: 30,
  });

  client.on("connect", () => {
    setBadgeState("connected");
    client.subscribe(DISCOVERY_TOPIC, { qos: 0 });

    const urlParams = new URLSearchParams(window.location.search);
    const targetDeviceId = normalizeDeviceId(urlParams.get("deviceId"));
    if (targetDeviceId && authorizedDevices.has(targetDeviceId)) {
      subscribeToDevice(targetDeviceId);
      return;
    }

    if (authorizedDevices.size === 1) {
      subscribeToDevice(Array.from(authorizedDevices.keys())[0]);
    }
  });

  client.on("message", (topic, payload) => {
    if (topic === DISCOVERY_TOPIC) {
      handleDiscoveryMessage(payload);
      return;
    }

    if (!activeDeviceId) return;

    if (topic === `smartblind/${activeDeviceId}/status`) {
      handleStatusMessage(payload);
      return;
    }

    if (topic === `smartblind/${activeDeviceId}/location`) {
      handleLocationMessage(payload);
    }
  });

  client.on("reconnect", () => setBadgeState("connecting"));
  client.on("offline", () => setBadgeState("disconnected"));
  client.on("close", () => setBadgeState("disconnected"));
}

function init() {
  syncAuthorizedDevices();
  initDefaultMap();
  resetMonitoringPanels();
  renderDeviceList();
  setMapDeviceLabel("Belum ada perangkat dipilih");
  initMqtt();
}

document.addEventListener("DOMContentLoaded", init, { once: true });
