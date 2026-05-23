/** MQTT WebSocket — topic dinamis per device, realtime */

import { MQTT_BROKER, buildTopic } from "./config.js";

let client = null;
let activeTopic = null;
let activeDeviceId = null;
let messageHandler = null;
let stateHandler = null;

function emitState(state) {
  stateHandler?.(state);
}

function subscribeToTopic(onFirstSuccess, onFirstFail) {
  if (!client || !activeTopic) return;

  client.subscribe(activeTopic, { qos: 0 }, (err) => {
    if (err) {
      onFirstFail?.(err);
      emitState("disconnected");
      return;
    }
    onFirstSuccess?.();
    emitState("connected");
  });
}

/**
 * Connect & subscribe ke smartblind/{deviceId}/status
 * @returns {Promise<{ topic: string, deviceId: string }>}
 */
export function connectDevice(deviceId, handlers) {
  return new Promise((resolve, reject) => {
    if (typeof mqtt === "undefined") {
      reject(new Error("MQTT library tidak tersedia"));
      return;
    }

    disconnectDevice();

    activeDeviceId = deviceId;
    activeTopic = buildTopic(deviceId);
    messageHandler = handlers.onMessage;
    stateHandler = handlers.onStateChange;

    emitState("connecting");

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      disconnectDevice();
      reject(new Error("Koneksi MQTT timeout"));
    }, 10000);

    const finishOk = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ topic: activeTopic, deviceId: activeDeviceId });
    };

    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      disconnectDevice();
      reject(err);
    };

    client = mqtt.connect(MQTT_BROKER, {
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 8000,
      keepalive: 30,
    });

    client.on("connect", () => {
      subscribeToTopic(finishOk, finishErr);
    });

    client.on("message", (_topic, payload) => {
      messageHandler?.(payload.toString());
    });

    client.on("reconnect", () => {
      emitState("connecting");
    });

    client.on("offline", () => {
      emitState("disconnected");
    });

    client.on("close", () => {
      emitState("disconnected");
    });

    client.on("error", (err) => {
      console.error("MQTT error:", err);
      finishErr(err);
    });
  });
}

export function disconnectDevice() {
  if (client && activeTopic) {
    try {
      client.unsubscribe(activeTopic);
    } catch (_) {
      /* ignore */
    }
  }

  if (client) {
    client.removeAllListeners();
    client.end(true);
  }

  client = null;
  activeTopic = null;
  activeDeviceId = null;
  messageHandler = null;
}

export function getActiveTopic() {
  return activeTopic;
}

export function getActiveDeviceId() {
  return activeDeviceId;
}
