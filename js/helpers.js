/** Helper functions */

import { STATUS } from "./config.js";

export function normalizeStatus(value) {
  if (value == null) return null;
  const str = String(value).trim().toLowerCase().replace(/['"]/g, "");
  return STATUS[str] ? str : null;
}

export function getStatusConfig(statusKey) {
  return STATUS[statusKey] ?? null;
}
