/** Konstanta MQTT & definisi status */

export const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";
export const MQTT_TOPIC = "smartblind/status";

export const STATUS = {
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
