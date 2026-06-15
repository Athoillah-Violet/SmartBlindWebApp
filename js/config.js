/** Konstanta MQTT & definisi status */

export const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";
export const TOPIC_PREFIX = "smartblind";
// Kunci penyimpanan localStorage untuk menyimpan ID perangkat yang terpilih/aktif
export const STORAGE_KEY = "deviceId";
export const MONITORING_DEVICES_KEY = "smartblind.monitoring.devices";

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
    message: "KIRI DAN DEPAN ADA HALANGAN",
    speech: "kiri dan depan ada halangan",
    type: "danger",
    icon: "left",
  },
  kanan_depan: {
    message: "DEPAN DAN KANAN ADA HALANGAN",
    speech: "depan dan kanan ada halangan",
    type: "danger",
    icon: "right",
  },
  kiri_kanan: {
    message: "KIRI DAN KANAN ADA HALANGAN",
    speech: "kiri dan kanan ada halangan",
    type: "danger",
    icon: "front",
  },
  bahaya_total: {
    message: "BANYAK HALANGAN DI SEKITAR",
    speech: "banyak halangan disekitar",
    type: "danger",
    icon: "front",
  },
  kiri: {
    message: "KIRI ADA HALANGAN",
    speech: "kiri ada halangan",
    type: "danger",
    icon: "left",
  },
  kanan: {
    message: "KANAN ADA HALANGAN",
    speech: "kanan ada halangan",
    type: "danger",
    icon: "right",
  },
  depan: {
    message: "DEPAN ADA HALANGAN",
    speech: "depan ada halangan",
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
