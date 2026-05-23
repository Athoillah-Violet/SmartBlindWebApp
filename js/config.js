/** Konstanta MQTT & definisi status */

export const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";
export const TOPIC_PREFIX = "smartblind";
export const STORAGE_KEY = "smartblind_device_id";

export const BADGE = {
  CONNECTING: "Connecting...",
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
};

/** Topic: smartblind/{DEVICE_ID}/status */
export function buildTopic(deviceId) {
  return `${TOPIC_PREFIX}/${deviceId}/status`;
}

export const STATUS = {
  kiri_depan: {
    message: "AWAS KIRI DAN DEPAN ADA HALANGAN",
    speech: "Awas kiri dan depan ada halangan",
    type: "danger",
    icon: "left",
  },
  kanan_depan: {
    message: "AWAS DEPAN DAN KANAN ADA HALANGAN",
    speech: "Awas depan dan kanan ada halangan",
    type: "danger",
    icon: "right",
  },
  kiri_kanan: {
    message: "AWAS KIRI DAN KANAN ADA HALANGAN",
    speech: "Awas kiri dan kanan ada halangan",
    type: "danger",
    icon: "front",
  },
  bahaya_total: {
    message: "AWAS BANYAK HALANGAN DI SEKITAR",
    speech: "Awas banyak halangan di sekitar",
    type: "danger",
    icon: "front",
  },
  kiri: {
    message: "AWAS KIRI ADA HALANGAN",
    speech: "Awas kiri ada halangan",
    type: "danger",
    icon: "left",
  },
  kanan: {
    message: "AWAS KANAN ADA HALANGAN",
    speech: "Awas kanan ada halangan",
    type: "danger",
    icon: "right",
  },
  depan: {
    message: "AWAS DI DEPAN ADA HALANGAN",
    speech: "Awas di depan ada halangan",
    type: "danger",
    icon: "front",
  },
  aman: {
    message: "JALAN AMAN",
    speech: "Jalan aman",
    type: "safe",
    icon: "safe",
  },
};
