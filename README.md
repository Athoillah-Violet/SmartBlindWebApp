# SmartBlind App

Web app navigasi pintar untuk tunanetra dengan tema **cyberpunk anime futuristic**. Terhubung realtime ke Firebase Realtime Database dan memberikan umpan suara otomatis via Web Speech API.

![SmartBlind](https://img.shields.io/badge/Realtime-Firebase-FFCA28?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Vercel%20%7C%20Netlify-00F0FF?style=flat-square)

## Fitur

- **Status realtime** dari path `status` di Firebase
- **Suara otomatis** (Bahasa Indonesia) saat status berubah
- **Indikator visual** merah (bahaya) / hijau (aman) dengan animasi pulse
- **3 panel sensor**: Kiri, Tengah, Kanan
- **Kontrol audio**: mute/unmute & test suara
- **Loading screen** saat menghubungkan Firebase
- **Mobile friendly** untuk Android

## Status Database

| Nilai Firebase | Tampilan UI | Suara |
|----------------|-------------|-------|
| `kiri` | AWAS KIRI ADA HALANGAN | Awas kiri ada halangan |
| `kanan` | AWAS KANAN ADA HALANGAN | Awas kanan ada halangan |
| `depan` | AWAS DI DEPAN ADA HALANGAN | Awas di depan ada halangan |
| `aman` | JALAN AMAN | Jalan aman |

## Firebase

**Database URL:**
```
https://smartblindapp-e99f9-default-rtdb.asia-southeast1.firebasedatabase.app/
```

**Path:** `status`

### Aturan Firebase (Realtime Database Rules)

Pastikan rules mengizinkan **read** untuk aplikasi web:

```json
{
  "rules": {
    "status": {
      ".read": true,
      ".write": false
    }
  }
}
```

> Untuk produksi, batasi `.read` dengan autentikasi jika diperlukan.

### Konfigurasi API Key (opsional)

Jika koneksi Firebase SDK gagal, buka [Firebase Console](https://console.firebase.google.com/) → Project **smartblindapp-e99f9** → Project settings → Web app → salin `apiKey` dan ganti di `script.js` pada `firebaseConfig.apiKey`.

Aplikasi juga memiliki **REST fallback** otomatis jika SDK tidak tersedia.

## Menjalankan Lokal

### Opsi 1: Live Server (VS Code)
1. Install extension **Live Server**
2. Klik kanan `index.html` → **Open with Live Server**

### Opsi 2: Python
```bash
cd SmartBlindApp
python -m http.server 8080
```
Buka `http://localhost:8080`

### Opsi 3: Node (npx)
```bash
npx serve .
```

> **Penting:** Buka via `http://` (bukan `file://`) agar Firebase dan Speech API berfungsi.

## Deploy Gratis

### Vercel
1. Push project ke GitHub
2. Import repo di [vercel.com](https://vercel.com)
3. Framework: **Other** (static)
4. Deploy

### Netlify
1. Push ke GitHub
2. Import di [netlify.com](https://netlify.com)
3. Publish directory: `/` (root)
4. Deploy

File `vercel.json` dan `netlify.toml` sudah disertakan.

## Struktur Project

```
SmartBlindApp/
├── index.html      # Halaman utama
├── style.css       # Tema cyberpunk + glassmorphism
├── script.js       # Firebase + Speech + UI logic
├── vercel.json     # Config deploy Vercel
├── netlify.toml    # Config deploy Netlify
├── .gitignore
└── README.md
```

## Teknologi

- HTML5, CSS3, JavaScript (ES Modules)
- Firebase Realtime Database SDK v11
- Web Speech API (`SpeechSynthesisUtterance`)
- Google Fonts: Orbitron, Rajdhani

## Lisensi

Project edukasi — bebas digunakan dan dimodifikasi.
