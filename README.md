# SmartBlind App

Web app navigasi realtime untuk tunanetra. Data sensor dari **ESP32** diterima via **MQTT WebSocket** — tanpa polling, latency minimal.

## Arsitektur

```
ESP32 + Ultrasonic
       ↓ publish
HiveMQ Broker (wss://broker.hivemq.com:8884/mqtt)
       ↓ subscribe smartblind/status
Web App (HP)
       ↓
UI update + suara (Web Speech API)
```

## MQTT

| Setting | Nilai |
|---------|--------|
| Broker | `wss://broker.hivemq.com:8884/mqtt` |
| Topic subscribe | `smartblind/status` |
| Payload | `kiri` · `kanan` · `depan` · `aman` |

### Contoh publish dari ESP32 (Arduino)

```cpp
client.publish("smartblind/status", "depan");
```

## Status & Suara

| Payload | Tampilan | Suara |
|---------|----------|-------|
| `kiri` | AWAS KIRI ADA HALANGAN | Awas kiri ada halangan |
| `kanan` | AWAS KANAN ADA HALANGAN | Awas kanan ada halangan |
| `depan` | AWAS DI DEPAN ADA HALANGAN | Awas di depan ada halangan |
| `aman` | JALAN AMAN | Jalan aman |

**Anti-spam:** suara hanya keluar saat status **berubah** (`lastSpokenStatus`). Status sama berulang tidak dibaca ulang.

**Prioritas kecepatan:** `speechSynthesis.cancel()` sebelum `speak()` baru agar notifikasi terbaru langsung didengar.

## Struktur Kode

```
SmartBlindApp/
├── index.html
├── style.css
└── js/
    ├── config.js    # MQTT & status config
    ├── helpers.js   # normalize payload
    ├── ui.js        # DOM update
    ├── speech.js    # Web Speech API
    ├── mqtt.js      # MQTT connect & subscribe
    └── app.js       # Entry point
```

## Menjalankan Lokal

```bash
npx serve .
```

Buka `http://localhost:3000` — **wajib HTTP/HTTPS**, bukan `file://`.

Di HP Android: gunakan IP komputer yang sama jaringan WiFi.

## Deploy

- **GitHub Pages** / **Netlify** / **Vercel** — upload folder root (static)
- Tidak perlu backend

## Library

- [MQTT.js](https://unpkg.com/mqtt/dist/mqtt.min.js) via CDN
- Web Speech API (built-in browser)

## Catatan ESP32

Pastikan ESP32 publish ke topic **`smartblind/status`** pada broker yang sama (HiveMQ public atau broker Anda sendiri — jika ganti broker, edit `js/config.js`).

## Lisensi

Proyek edukasi — bebas dimodifikasi.
