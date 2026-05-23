/**
 * SmartBlind App — Entry point
 * MQTT realtime + Web Speech API
 */

import { normalizeStatus } from "./helpers.js";
import { applyStatus, hideLoading, setConnection, showInvalidPayload, showWaiting, els, updateMuteButton } from "./ui.js";
import { initSpeech, speakOnStatusChange, speakTest, toggleMute } from "./speech.js";
import { initMqtt } from "./mqtt.js";

let hasReceivedMessage = false;

function handleMqttPayload(raw) {
  const status = normalizeStatus(raw);

  if (!status) {
    showInvalidPayload(raw);
    return;
  }

  hasReceivedMessage = true;
  speakOnStatusChange(status);
  applyStatus(status);
}

function handleConnection(connected) {
  setConnection(connected);
  if (connected) hideLoading();
  else if (!hasReceivedMessage) showWaiting();
}

function bindControls() {
  els.btnMute?.addEventListener("click", () => {
    const muted = toggleMute();
    updateMuteButton(muted);
  });

  els.btnTest?.addEventListener("click", () => {
    speakTest("Tes suara Smart Blind App berhasil");
  });

  document.addEventListener(
    "click",
    () => initSpeech(),
    { once: true }
  );
}

function init() {
  initSpeech();
  bindControls();
  setConnection(false);

  initMqtt({
    onMessage: handleMqttPayload,
    onConnectionChange: handleConnection,
  });

  setTimeout(hideLoading, 4000);
}

init();
