/** Kelola koneksi perangkat — localStorage, flow connect/disconnect */

import { STORAGE_KEY } from "./config.js";
import { normalizeDeviceId } from "./helpers.js";
import * as mqttService from "./mqttService.js";
import * as ui from "./uiController.js";
import { resetSpokenCache } from "./speechController.js";

let onStatusMessage = null;
let connectSuccessTimer = null;

function clearSuccessTimer() {
  if (connectSuccessTimer) {
    clearTimeout(connectSuccessTimer);
    connectSuccessTimer = null;
  }
}

function handleMqttState(state) {
  if (state === "connecting") ui.setBadgeState("connecting");
  else if (state === "connected") ui.setBadgeState("connected");
  else ui.setBadgeState("disconnected");
}

export function initConnectionManager(statusHandler) {
  onStatusMessage = statusHandler;

  ui.bindConnectForm((rawId) => connectToDevice(rawId, false));
  ui.bindDeviceActions(handleChangeDevice, handleDisconnect);

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    ui.setDeviceInput(saved);
    connectToDevice(saved, true);
  } else {
    ui.showConnectScreen();
    ui.setBadgeState("disconnected");
  }
}

async function connectToDevice(rawId, isAuto = false) {
  clearSuccessTimer();

  const deviceId = normalizeDeviceId(rawId);
  if (!deviceId) {
    ui.showConnectFeedback("ID SMART BLIND TIDAK VALID", "error");
    ui.setConnectLoading(false);
    return;
  }

  if (!isAuto) {
    ui.showConnectFeedback("", "");
  }

  ui.setConnectLoading(true);
  ui.setBadgeState("connecting");

  if (!isAuto) {
    ui.showConnectFeedback("Menghubungkan perangkat...", "");
  }

  try {
    await mqttService.connectDevice(deviceId, {
      onMessage: (raw) => onStatusMessage?.(raw),
      onStateChange: handleMqttState,
    });

    localStorage.setItem(STORAGE_KEY, deviceId);
    ui.showConnectFeedback("PERANGKAT TERHUBUNG", "success");
    ui.setConnectLoading(false);

    connectSuccessTimer = setTimeout(() => {
      ui.showDashboard(deviceId);
      ui.setBadgeState("connected");
      ui.showWaiting();
    }, isAuto ? 0 : 600);
  } catch (err) {
    console.warn("Connect failed:", err);
    mqttService.disconnectDevice();
    localStorage.removeItem(STORAGE_KEY);
    ui.showConnectFeedback("ID SMART BLIND TIDAK VALID", "error");
    ui.setConnectLoading(false);
    ui.setBadgeState("disconnected");
    if (isAuto) ui.showConnectScreen();
  }
}

function handleChangeDevice() {
  clearSuccessTimer();
  mqttService.disconnectDevice();
  resetSpokenCache();
  localStorage.removeItem(STORAGE_KEY);
  ui.resetDashboardUi();
  ui.setDeviceInput("");
  ui.setBadgeState("disconnected");
  ui.showConnectFeedback("", "");
  ui.showConnectScreen();
  ui.setConnectLoading(false);
}

function handleDisconnect(clearStorage = true) {
  clearSuccessTimer();
  mqttService.disconnectDevice();
  resetSpokenCache();

  if (clearStorage) {
    localStorage.removeItem(STORAGE_KEY);
  }

  ui.resetDashboardUi();
  ui.setBadgeState("disconnected");
  ui.showConnectScreen();
  ui.showConnectFeedback("", "");
  ui.setConnectLoading(false);
}

export function getSavedDeviceId() {
  return localStorage.getItem(STORAGE_KEY);
}
