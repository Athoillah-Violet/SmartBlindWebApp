/** MQTT WebSocket — subscribe realtime, auto reconnect */

import { MQTT_BROKER, MQTT_TOPIC } from "./config.js";

let client = null;

/**
 * @param {object} handlers
 * @param {(payload: string) => void} handlers.onMessage
 * @param {(connected: boolean) => void} handlers.onConnectionChange
 */
export function initMqtt(handlers) {
  if (typeof mqtt === "undefined") {
    console.error("MQTT library belum dimuat");
    handlers.onConnectionChange(false);
    return;
  }

  client = mqtt.connect(MQTT_BROKER, {
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    keepalive: 30,
  });

  client.on("connect", () => {
    client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
      if (err) {
        console.error("Subscribe error:", err);
        handlers.onConnectionChange(false);
        return;
      }
      handlers.onConnectionChange(true);
    });
  });

  client.on("message", (_topic, payload) => {
    handlers.onMessage(payload.toString());
  });

  client.on("reconnect", () => {
    handlers.onConnectionChange(false);
  });

  client.on("offline", () => {
    handlers.onConnectionChange(false);
  });

  client.on("close", () => {
    handlers.onConnectionChange(false);
  });

  client.on("error", (err) => {
    console.error("MQTT error:", err);
    handlers.onConnectionChange(false);
  });
}

export function disconnectMqtt() {
  if (client) {
    client.end(true);
    client = null;
  }
}
