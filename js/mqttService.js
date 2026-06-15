/** MQTT WebSocket — topic dinamis per device, realtime */

import { MQTT_BROKER, buildTopic, TOPIC_PREFIX } from "./config.js";

let client = null;
let activeTopic = null;
let activeDeviceId = null;
let messageHandler = null;
let stateHandler = null;
// Flag untuk menandai apakah pencarian perangkat (discovery) sedang berjalan aktif
let discoveryActive = false;

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
 * Memulai pencarian perangkat Smart Blind secara otomatis melalui MQTT topic smartblind/devices
 * @param {(device: { id: string, name: string, status: string }) => void} onDeviceDiscovered - Callback saat perangkat ditemukan
 * @param {(state: string) => void} onStateChange - Callback status koneksi MQTT
 * @returns {Promise<void>}
 */
export function startDiscovery(onDeviceDiscovered, onStateChange) {
  return new Promise((resolve, reject) => {
    if (typeof mqtt === "undefined") {
      reject(new Error("MQTT library tidak tersedia"));
      return;
    }

    // Putuskan koneksi sebelumnya sebelum memulai pencarian baru
    disconnectDevice();
    discoveryActive = true;
    activeTopic = "smartblind/devices";
    stateHandler = onStateChange;

    emitState("connecting");

    // Lakukan koneksi ke broker MQTT
    client = mqtt.connect(MQTT_BROKER, {
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 8000,
      keepalive: 30,
    });

    client.on("connect", () => {
      // Subscribe untuk mencari perangkat Smart Blind yang sedang online
      client.subscribe(activeTopic, { qos: 0 }, (err) => {
        if (err) {
          emitState("disconnected");
          reject(err);
          return;
        }
        emitState("connected");
        resolve();
      });
    });

    client.on("message", (topic, payload) => {
      // Hanya proses pesan dari topic smartblind/devices
      if (topic === "smartblind/devices") {
        try {
          const data = JSON.parse(payload.toString());
          if (data && data.id) {
            onDeviceDiscovered(data);
          }
        } catch (err) {
          console.warn("Gagal melakukan parsing data perangkat:", err);
        }
      }
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
      console.error("MQTT discovery error:", err);
      emitState("disconnected");
    });
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
      // Subscribe ke topic status berdasarkan device yang aktif
      subscribeToTopic(finishOk, finishErr);
    });

    client.on("message", (topic, payload) => {
      // Hanya proses pesan jika bukan dari topic discovery
      if (topic !== "smartblind/devices") {
        messageHandler?.(payload.toString());
      }
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
  discoveryActive = false;
}

export function getActiveTopic() {
  return activeTopic;
}

export function getActiveDeviceId() {
  return activeDeviceId;
}

/**
 * Mempublikasikan perintah (command) MQTT ke perangkat tertentu
 * @param {string} deviceId - ID perangkat tujuan
 * @param {string} command - Payload perintah (misal: 'reset_wifi')
 * @returns {Promise<void>}
 */
export function publishCommand(deviceId, command) {
  return new Promise((resolve, reject) => {
    if (!client) {
      reject(new Error("Client MQTT belum terhubung/aktif"));
      return;
    }

    const topic = `${TOPIC_PREFIX}/${deviceId}/command`;
    // Gunakan QoS 1 untuk memastikan pesan sampai ke broker
    client.publish(topic, command, { qos: 1 }, (err) => {
      if (err) {
        console.error(`Gagal mempublish command ke ${topic}:`, err);
        reject(err);
      } else {
        console.log(`Berhasil mempublish command '${command}' ke ${topic}`);
        resolve();
      }
    });
  });
}

/**
 * Mempublikasikan data lokasi GPS ke topic tertentu secara realtime
 * @param {string} topic - Topic lokasi tujuan (smartblind/{deviceId}/location)
 * @param {object} payload - Objek data lokasi { deviceId, lat, lng, timestamp }
 */
export function publishLocation(topic, payload) {
  if (!client) return;
  // Gunakan QoS 0 agar ringan dan responsif untuk update koordinat periodik
  client.publish(topic, JSON.stringify(payload), { qos: 0 });
}
