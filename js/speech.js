/** Speech logic — ultra low latency, anti-spam */

import { getStatusConfig } from "./helpers.js";

let lastSpokenStatus = null;
let isMuted = false;
let idVoice = null;

function pickIndonesianVoice(voices) {
  return (
    voices.find((v) => v.lang.startsWith("id")) ||
    voices.find((v) => v.lang.includes("ID")) ||
    voices[0] ||
    null
  );
}

export function initSpeech() {
  const cacheVoice = () => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) idVoice = pickIndonesianVoice(voices);
  };

  cacheVoice();
  speechSynthesis.onvoiceschanged = cacheVoice;
}

/** Bicara hanya jika status berubah (anti-spam) */
export function speakOnStatusChange(statusKey) {
  if (statusKey === lastSpokenStatus) return;
  lastSpokenStatus = statusKey;

  if (isMuted) return;

  const config = getStatusConfig(statusKey);
  if (!config?.speech) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(config.speech);
  utterance.lang = "id-ID";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (idVoice) utterance.voice = idVoice;

  speechSynthesis.speak(utterance);
}

/** Paksa bicara (test suara) — tidak mengubah lastSpokenStatus */
export function speakTest(text) {
  if (isMuted) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "id-ID";
  utterance.rate = 1;
  if (idVoice) utterance.voice = idVoice;
  speechSynthesis.speak(utterance);
}

export function toggleMute() {
  isMuted = !isMuted;
  if (isMuted) speechSynthesis.cancel();
  return isMuted;
}

export function getMuted() {
  return isMuted;
}

export function resetSpokenCache() {
  lastSpokenStatus = null;
}
