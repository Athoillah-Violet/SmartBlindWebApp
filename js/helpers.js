/** Helper functions */

import { STATUS } from "./config.js";

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
