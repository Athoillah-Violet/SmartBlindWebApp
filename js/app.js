/**
 * SmartBlind App — Entry point
 * MQTT dinamis per device + Web Speech API
 */

import { normalizeStatus } from "./helpers.js";
import * as ui from "./uiController.js";
import {
  initSpeech,
  speakOnStatusChange,
  speakTest,
  toggleMute,
} from "./speechController.js";
import { initConnectionManager } from "./connectionManager.js";

let hasReceivedMessage = false;

function handleStatusPayload(raw) {
  const status = normalizeStatus(raw);

  if (!status) {
    ui.showInvalidPayload(raw);
    return;
  }

  hasReceivedMessage = true;
  speakOnStatusChange(status);
  ui.applyStatus(status);
}

function bindAudioControls() {
  ui.bindAudioControls(
    () => ui.updateMuteButton(toggleMute()),
    () => speakTest("Tes suara Smart Blind App berhasil")
  );

  document.addEventListener("click", () => initSpeech(), { once: true });
}

function init() {
  initSpeech();
  bindAudioControls();
  ui.hideLoading();
  initConnectionManager(handleStatusPayload);
}

init();
