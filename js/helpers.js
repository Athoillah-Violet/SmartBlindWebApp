/** Helper functions */

import { MONITORING_DEVICES_KEY, STATUS } from "./config.js";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;

export function normalizeDeviceId(value) {
  if (value == null) return null;
  const id = String(value).trim();
  if (!id || !DEVICE_ID_PATTERN.test(id)) return null;
  return id;
}

export function normalizeStatus(value) {
  if (value == null) return null;
  const str = String(value).trim().toLowerCase().replace(/['"]/g, "");
  return STATUS[str] ? str : null;
}

export function buildMonitoringPageHref(deviceId) {
  const basePath = window.location.protocol === "file:" ? "monitoring.html" : "/monitoring";
  if (!deviceId) return basePath;
  return `${basePath}?deviceId=${encodeURIComponent(deviceId)}`;
}

export function loadMonitoringDevices() {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(MONITORING_DEVICES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((device) => {
        const id = normalizeDeviceId(device?.id);
        if (!id) return null;

        return {
          id,
          name: String(device?.name || "Smart Blind").trim() || "Smart Blind",
          status: device?.status === "offline" ? "offline" : "online",
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

export function saveMonitoringDevices(devices) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MONITORING_DEVICES_KEY, JSON.stringify(devices));
}

export function rememberMonitoringDevice(device) {
  const id = normalizeDeviceId(device?.id);
  if (!id) return [];

  const devices = loadMonitoringDevices();
  const nextDevice = {
    id,
    name: String(device?.name || "Smart Blind").trim() || "Smart Blind",
    status: device?.status === "offline" ? "offline" : "online",
  };

  const existingIndex = devices.findIndex((item) => item.id === id);
  if (existingIndex >= 0) {
    devices[existingIndex] = { ...devices[existingIndex], ...nextDevice };
  } else {
    devices.push(nextDevice);
  }

  saveMonitoringDevices(devices);
  return devices;
}

export function getStatusConfig(statusKey) {
  return STATUS[statusKey] ?? null;
}

/** Sensor mana yang aktif bahaya untuk status gabungan */
export function getSensorAlerts(statusKey) {
  const alerts = { kiri: false, depan: false, kanan: false };

  switch (statusKey) {
    case "kiri":
      alerts.kiri = true;
      break;
    case "kanan":
      alerts.kanan = true;
      break;
    case "depan":
      alerts.depan = true;
      break;
    case "kiri_depan":
      alerts.kiri = alerts.depan = true;
      break;
    case "kanan_depan":
      alerts.kanan = alerts.depan = true;
      break;
    case "kiri_kanan":
      alerts.kiri = alerts.kanan = true;
      break;
    case "bahaya_total":
      alerts.kiri = alerts.depan = alerts.kanan = true;
      break;
    default:
      break;
  }

  return alerts;
}
