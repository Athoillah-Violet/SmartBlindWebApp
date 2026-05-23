# SmartBlind App

Web app navigasi realtime untuk tunanetra. ESP32 publish status via **MQTT** — web app subscribe per **Device ID**.

## Arsitektur

```
ESP32 → MQTT publish smartblind/{DEVICE_ID}/status
              ↓
        Web App (subscribe)
              ↓
        UI + suara (Web Speech API)
```

## Connect Device

1. Buka web app → halaman **Connect Smart Blind**
2. Masukkan ID perangkat (contoh: `SB-001`)
3. Klik **Hubungkan Perangkat**
4. Berhasil → **PERANGKAT TERHUBUNG** → dashboard aktif
5. Gagal → **ID SMART BLIND TIDAK VALID**

ID tersimpan di `localStorage` — buka ulang otomatis reconnect.

## MQTT

| Setting | Nilai |
|---------|--------|
| Broker | `wss://broker.hivemq.com:8884/mqtt` |
| Topic | `smartblind/{DEVICE_ID}/status` |
| Contoh | `smartblind/SB-001/status` |

### ESP32 (Arduino)

```cpp
// Ganti SB-001 dengan ID perangkat Anda
client.publish("smartblind/SB-001/status", "depan");
```

## Status & Suara

| Payload | Suara |
|---------|--------|
| `kiri` | Awas kiri ada halangan |
| `kanan` | Awas kanan ada halangan |
| `depan` | Awas di depan ada halangan |
| `kiri_depan` | Awas kiri dan depan ada halangan |
| `kanan_depan` | Awas depan dan kanan ada halangan |
| `kiri_kanan` | Awas kiri dan kanan ada halangan |
| `bahaya_total` | Awas banyak halangan di sekitar |
| `aman` | Jalan aman |

Anti-spam: suara hanya saat status **berubah**.

## Struktur Kode

```
js/
├── config.js              # Broker, topic builder, status
├── helpers.js             # Normalisasi ID & payload
├── mqttService.js         # MQTT connect / subscribe / disconnect
├── speechController.js    # Web Speech API
├── uiController.js        # DOM & tampilan
├── connectionManager.js   # Flow device + localStorage
└── app.js                 # Entry point
```

## Deploy

Static hosting: GitHub Pages, Netlify, Vercel — folder root.

```bash
npx serve .
```

Wajib `http://` atau `https://`, bukan `file://`.
