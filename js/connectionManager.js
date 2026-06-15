/**
 * Kelola koneksi perangkat — pencarian otomatis (discovery), auto-connect, keepalive, dan reset WiFi
 */

import { STORAGE_KEY } from "./config.js";
import { buildMonitoringPageHref, normalizeDeviceId, rememberMonitoringDevice } from "./helpers.js";
import * as mqttService from "./mqttService.js";
import * as ui from "./uiController.js";
import { resetSpokenCache } from "./speechController.js";

let onStatusMessage = null;
let connectSuccessTimer = null;
let discoveryTimer = null;
let deviceKeepaliveTimer = null;

// State Geolocation GPS
let gpsWatchId = null;
let lastGpsData = null;
let gpsPublishInterval = null;

// Map untuk menampung perangkat-perangkat yang sedang online di jaringan
const discoveredDevices = new Map();

// Flag untuk menandai apakah pencarian perangkat (discovery) sedang aktif berjalan
let discoveryActiveState = false;

// Batas waktu keepalive (12 detik tanpa data sensor MQTT = Offline)
const KEEPALIVE_TIMEOUT = 12000;

// Membersihkan timer transisi koneksi sukses
function clearSuccessTimer() {
  if (connectSuccessTimer) {
    clearTimeout(connectSuccessTimer);
    connectSuccessTimer = null;
  }
}

// Membersihkan timer pencarian perangkat
function clearDiscoveryTimer() {
  if (discoveryTimer) {
    clearTimeout(discoveryTimer);
    discoveryTimer = null;
  }
}

// Membersihkan timer keepalive perangkat aktif
function clearDeviceKeepalive() {
  if (deviceKeepaliveTimer) {
    clearTimeout(deviceKeepaliveTimer);
    deviceKeepaliveTimer = null;
  }
}

// Mengelola status koneksi MQTT untuk badge status broker di header dashboard
function handleMqttState(state) {
  if (state === "connecting") ui.setBadgeState("connecting");
  else if (state === "connected") ui.setBadgeState("connected");
  else ui.setBadgeState("disconnected");
}

// Memperbarui dan mereset timer keepalive untuk mendeteksi keaktifan perangkat
function resetDeviceKeepalive() {
  clearDeviceKeepalive();
  
  // Tandai perangkat sebagai Online (hijau)
  ui.setDeviceStatus("online");

  // Jalankan timer untuk mendeteksi jika perangkat tidak mengirimkan data dalam 12 detik
  deviceKeepaliveTimer = setTimeout(() => {
    // Tandai perangkat sebagai Offline (merah) jika batas waktu terlampaui
    ui.setDeviceStatus("offline");
  }, KEEPALIVE_TIMEOUT);
}

/**
 * Inisialisasi Connection Manager saat aplikasi web pertama kali dibuka
 * @param {Function} statusHandler - Callback untuk memproses payload sensor
 */
export function initConnectionManager(statusHandler) {
  onStatusMessage = statusHandler;

  // Bind event tombol pada dashboard (Ganti Perangkat, Reset WiFi, & Putuskan Koneksi)
  ui.bindDeviceActions(handleChangeDevice, handleResetWifi, handleDisconnect);
  
  // Bind event tombol modal konfirmasi
  ui.bindModalActions(confirmResetWifi, cancelResetWifi);

  // Bind event tombol modal izin lokasi wajib
  ui.bindLocationPermissionActions(handleActivateLocation, handleLaterLocation);

  // Periksa apakah ada deviceId yang sebelumnya tersimpan di localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  updateMonitoringEntryLink(saved);
  if (saved) {
    // Jalankan pengecekan apakah perangkat tersimpan masih online
    checkSavedDeviceAndConnect(saved);
  } else {
    // Jika tidak ada data tersimpan, langsung jalankan proses pencarian perangkat
    startDiscoveryProcess();
  }
}

/**
 * Memeriksa apakah perangkat yang terakhir digunakan (tersimpan di localStorage) masih online
 * @param {string} savedDeviceId - ID perangkat yang tersimpan
 */
function checkSavedDeviceAndConnect(savedDeviceId) {
  clearDiscoveryTimer();
  discoveredDevices.clear();
  discoveryActiveState = true;

  ui.showConnectScreen();
  ui.showDiscoveryLoading("Memeriksa status perangkat terakhir...");

  let checked = false;

  // Set timeout batas waktu pengecekan keaktifan perangkat selama 1500ms
  const checkTimer = setTimeout(() => {
    if (checked) return;
    checked = true;

    // Periksa hasil pencarian
    const device = discoveredDevices.get(savedDeviceId);
    if (device && device.status === "online") {
      // Jika masih online, langsung hubungkan otomatis
      selectDevice(savedDeviceId);
    } else {
      // Jika offline, hapus penyimpanan terakhir dan tampilkan halaman pencarian perangkat
      localStorage.removeItem(STORAGE_KEY);
      stopDiscoveryProcess();
      startDiscoveryProcess();
    }
  }, 1500);

  // Jalankan pencarian MQTT
  mqttService.startDiscovery(
    (device) => {
      if (!discoveryActiveState) return;

      if (device.status === "online") {
        discoveredDevices.set(device.id, device);
      } else if (device.status === "offline") {
        discoveredDevices.delete(device.id);
      }

      // Optimasi: Jika perangkat yang dicari ditemukan online sebelum 1.5 detik, langsung connect
      if (device.id === savedDeviceId && device.status === "online" && !checked) {
        checked = true;
        clearTimeout(checkTimer);
        selectDevice(savedDeviceId);
      }
    },
    (state) => {
      handleMqttState(state);
      if (state !== "connected" && state !== "connecting") {
        ui.showDiscoveryLoading("Gagal terhubung ke broker...");
      }
    }
  ).catch((err) => {
    console.error("Gagal memeriksa keaktifan perangkat:", err);
    clearTimeout(checkTimer);
    startDiscoveryProcess();
  });
}

/**
 * Memulai proses pencarian perangkat Smart Blind yang online di jaringan MQTT
 */
function startDiscoveryProcess() {
  clearDiscoveryTimer();
  discoveredDevices.clear();
  discoveryActiveState = true;

  // Tampilkan screen connect/discovery awal
  ui.showConnectScreen();
  ui.showDiscoveryLoading("Menghubungkan ke broker...");

  // Hubungkan ke broker untuk mencari topic discovery: smartblind/devices
  mqttService.startDiscovery(
    // Callback saat ada perangkat mempublish kehadirannya
    (device) => {
      if (!discoveryActiveState) return;

      if (device.status === "online") {
        discoveredDevices.set(device.id, device);
      } else if (device.status === "offline") {
        discoveredDevices.delete(device.id);
      }

      // Jika antarmuka daftar perangkat sudah tampil, langsung render ulang daftar terbaru
      if (ui.isDeviceListVisible()) {
        ui.renderDeviceList(Array.from(discoveredDevices.values()), selectDevice);
        return;
      }

      // Jika kita mendeteksi perangkat pertama setelah daftar kosong
      if (!discoveryTimer) {
        // Beri jeda 500ms sebelum merender untuk menanti perangkat lain
        discoveryTimer = setTimeout(evaluateDiscoveredDevices, 500);
      }
    },
    // Callback untuk memantau koneksi MQTT saat discovery
    (state) => {
      handleMqttState(state);
      if (state === "connected") {
        ui.showDiscoveryLoading("Mencari perangkat Smart Blind...");
        // Jalankan window pencarian awal selama 1.5 detik sejak terhubung ke broker
        if (!discoveryTimer && discoveredDevices.size === 0) {
          discoveryTimer = setTimeout(evaluateDiscoveredDevices, 1500);
        }
      } else if (state === "connecting") {
        ui.showDiscoveryLoading("Menghubungkan ke broker...");
      } else {
        ui.showDiscoveryLoading("Gagal terhubung ke broker. Mencoba kembali...");
      }
    }
  ).catch((err) => {
    console.error("Gagal memulai discovery MQTT:", err);
    ui.showDiscoveryLoading("Gagal memulai pencarian. Silakan hubungkan internet Anda.");
  });
}

/**
 * Mengevaluasi perangkat yang ditemukan setelah window pencarian selesai
 */
function evaluateDiscoveredDevices() {
  clearDiscoveryTimer();
  if (!discoveryActiveState) return;

  const devices = Array.from(discoveredDevices.values());

  if (devices.length >= 1) {
    // Selalu tampilkan daftar perangkat berbentuk card modern agar pengguna bisa memilih
    ui.showDeviceList();
    ui.renderDeviceList(devices, selectDevice);
  } else {
    // Jika belum ada perangkat ditemukan
    ui.showDiscoveryLoading("Mencari perangkat... Nyalakan ESP32 Anda & pastikan terhubung ke WiFi.");
  }
}

/**
 * Menyimpan deviceId terpilih dan menghubungkannya ke dashboard
 * @param {string} deviceId - ID perangkat terpilih
 */
function selectDevice(deviceId) {
  const selectedDevice = discoveredDevices.get(deviceId) ?? {
    id: deviceId,
    name: "Smart Blind",
    status: "online",
  };

  rememberMonitoringDevice(selectedDevice);
  updateMonitoringEntryLink(deviceId);

  // Simpan ID perangkat terpilih ke localStorage.deviceId (STORAGE_KEY)
  localStorage.setItem(STORAGE_KEY, deviceId);
  
  // Hentikan proses discovery
  stopDiscoveryProcess();
  
  // Hubungkan ke perangkat untuk monitoring status
  connectToDevice(deviceId, false);
}

/**
 * Menghentikan proses pencarian perangkat
 */
function stopDiscoveryProcess() {
  discoveryActiveState = false;
  clearDiscoveryTimer();
  mqttService.disconnectDevice();
}

/**
 * Menghubungkan aplikasi ke topic status perangkat tertentu
 * @param {string} rawId - ID perangkat mentah
 * @param {boolean} isAuto - Apakah ini koneksi otomatis sejak awal buka web
 */
async function connectToDevice(rawId, isAuto = false) {
  clearSuccessTimer();
  clearDeviceKeepalive();
  stopDiscoveryProcess();

  const deviceId = normalizeDeviceId(rawId);
  if (!deviceId) {
    localStorage.removeItem(STORAGE_KEY);
    startDiscoveryProcess();
    return;
  }

  // Tampilkan loading overlay global saat bersiap masuk ke dashboard
  ui.showLoading("Menghubungkan ke perangkat...");
  ui.setBadgeState("connecting");

  try {
    // Sambungkan ke topic: smartblind/{deviceId}/status
    await mqttService.connectDevice(deviceId, {
      onMessage: (raw) => {
        // Setiap kali ada data masuk, tandai perangkat sebagai Online dan perbarui timer keepalive
        resetDeviceKeepalive();
        onStatusMessage?.(raw);
      },
      onStateChange: handleMqttState,
    });

    // Mulai/jalankan timer keepalive pertama kali
    resetDeviceKeepalive();

    // Periksa GPS/lokasi perangkat untuk izin monitoring wajib aktif
    checkLocationPermissionAndStart(deviceId);

    // Pastikan tersimpan di localStorage
    localStorage.setItem(STORAGE_KEY, deviceId);
    ui.hideLoading();

    // Transisi ke tampilan dashboard
    connectSuccessTimer = setTimeout(() => {
      ui.showDashboard(deviceId);
      ui.setBadgeState("connected");
      ui.showWaiting();
    }, isAuto ? 0 : 400);
  } catch (err) {
    console.warn("Koneksi ke perangkat gagal:", err);
    mqttService.disconnectDevice();
    localStorage.removeItem(STORAGE_KEY);
    ui.hideLoading();
    ui.setBadgeState("disconnected");
    stopGpsTracking();
    
    // Jika koneksi gagal, kembali ke proses discovery
    startDiscoveryProcess();
  }
}

/**
 * Handler saat tombol Ganti Perangkat diklik
 */
function handleChangeDevice() {
  clearSuccessTimer();
  clearDeviceKeepalive();
  stopGpsTracking();
  mqttService.disconnectDevice();
  resetSpokenCache();
  
  // Hapus dari localStorage
  localStorage.removeItem(STORAGE_KEY);
  updateMonitoringEntryLink(null);
  
  ui.resetDashboardUi();
  ui.setBadgeState("disconnected");
  
  // Mulai pencarian ulang
  startDiscoveryProcess();
}

/**
 * Handler saat tombol Reset WiFi diklik - Menampilkan Modal Konfirmasi
 */
function handleResetWifi() {
  ui.showResetWifiModal(true);
}

/**
 * Batalkan reset WiFi - Menyembunyikan Modal Konfirmasi
 */
function cancelResetWifi() {
  ui.showResetWifiModal(false);
}

/**
 * Konfirmasi reset WiFi - Mengirim publish MQTT command reset_wifi
 */
async function confirmResetWifi() {
  // Sembunyikan modal
  ui.showResetWifiModal(false);
  
  const activeId = mqttService.getActiveDeviceId();
  if (!activeId) return;

  try {
    ui.showLoading("Mengirim perintah reset...");
    
    // Publish MQTT ke topic smartblind/{deviceId}/command dengan payload reset_wifi
    await mqttService.publishCommand(activeId, "reset_wifi");
    
    ui.hideLoading();
    
    // Tampilkan notifikasi Toast Sukses
    ui.showToast("Perangkat sedang menghapus konfigurasi WiFi dan akan restart.", "success");
  } catch (err) {
    console.error("Gagal mengirim perintah reset:", err);
    ui.hideLoading();
    ui.showToast("Gagal mengirim perintah reset WiFi ke perangkat.", "error");
  }
}

/**
 * Handler saat koneksi diputuskan
 */
function handleDisconnect(clearStorage = true) {
  clearSuccessTimer();
  clearDeviceKeepalive();
  stopGpsTracking();
  mqttService.disconnectDevice();
  resetSpokenCache();

  if (clearStorage) {
    localStorage.removeItem(STORAGE_KEY);
    updateMonitoringEntryLink(null);
  }

  ui.resetDashboardUi();
  ui.setBadgeState("disconnected");
  
  // Kembali ke halaman awal pencarian
  startDiscoveryProcess();
}

/**
 * Mendapatkan ID perangkat yang saat ini tersimpan di localStorage
 * @returns {string|null}
 */
export function getSavedDeviceId() {
  return localStorage.getItem(STORAGE_KEY);
}

// ====== LOGIKA GPS GEOLOCATION & TRACKING ======

let pendingGpsDeviceId = null;
let lastSentLat = null;
let lastSentLng = null;

function updateMonitoringEntryLink(deviceId) {
  const link = document.getElementById("btn-open-monitoring-page");
  if (!link) return;
  link.setAttribute("href", buildMonitoringPageHref(deviceId));
}

// Memeriksa izin lokasi browser dan menampilkan modal konfirmasi jika diperlukan
function checkLocationPermissionAndStart(deviceId) {
  pendingGpsDeviceId = deviceId;

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted") {
        // Jika sudah diizinkan, langsung aktifkan Geolocation
        startGpsTracking(deviceId);
      } else if (result.state === "prompt") {
        // Jika belum ditanyakan, tampilkan modal popup konfirmasi
        ui.showLocationPermissionModal(true);
      } else {
        // Jika diblokir/denied, nonaktifkan monitoring lokasi
        console.warn("Akses lokasi diblokir oleh pengguna di pengaturan browser.");
        stopGpsTracking();
        ui.showToast("Lokasi belum aktif. Monitoring GPS dinonaktifkan, navigasi tetap berjalan.", "error");
      }
    });
  } else {
    // Fallback: Tampilkan modal popup konfirmasi
    ui.showLocationPermissionModal(true);
  }
}

// Handler saat pengguna menyetujui akses lokasi di modal
function handleActivateLocation() {
  ui.showLocationPermissionModal(false);
  if (pendingGpsDeviceId) {
    // Minta posisi sekali untuk memicu prompt browser
    navigator.geolocation.getCurrentPosition(
      () => {
        // Sukses: Mulai pelacakan realtime
        startGpsTracking(pendingGpsDeviceId);
        ui.showToast("Monitoring GPS aktif untuk perangkat ini.", "success");
      },
      (err) => {
        console.warn("Akses lokasi ditolak setelah prompt browser:", err);
        stopGpsTracking();
        ui.showToast("Akses lokasi ditolak. Monitoring GPS dinonaktifkan.", "error");
      },
      { enableHighAccuracy: false, maximumAge: 5000, timeout: 15000 }
    );
  }
}

// Handler saat pengguna memilih "Nanti Saja" di modal
function handleLaterLocation() {
  ui.showLocationPermissionModal(false);
  stopGpsTracking();
  ui.showToast("Monitoring GPS dinonaktifkan untuk sementara.", "error");
}

/**
 * Menghitung jarak antar koordinat dalam meter menggunakan formula Haversine
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius Bumi dalam meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Jarak dalam meter
}

/**
 * Mempublikasikan data lokasi GPS ke topic MQTT
 */
function publishGpsLocation(deviceId, lat, lng, accuracy, timestamp) {
  const topic = `smartblind/${deviceId}/location`;
  const payload = {
    latitude: lat,
    longitude: lng,
    accuracy: Math.round(accuracy),
    timestamp: timestamp,
    deviceId: deviceId,
  };
  mqttService.publishLocation(topic, payload);
  lastSentLat = lat;
  lastSentLng = lng;
}

/**
 * Memulai pemantauan lokasi GPS browser secara periodik dan hemat baterai
 * @param {string} deviceId - ID perangkat aktif
 */
function startGpsTracking(deviceId) {
  if (!navigator.geolocation) {
    console.warn("Geolocation API tidak didukung oleh browser ini.");
    ui.showToast("Browser ini belum mendukung akses lokasi realtime.", "error");
    return;
  }

  stopGpsTracking();

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const timestamp = Math.floor(position.timestamp / 1000);

      lastGpsData = { lat, lng, accuracy, timestamp };

      // Cek apakah ada pergeseran lebih dari 10 meter dari posisi terakhir
      if (lastSentLat !== null && lastSentLng !== null) {
        const distance = calculateDistance(lastSentLat, lastSentLng, lat, lng);
        if (distance > 10) {
          // Kirim lokasi secara instan karena pengguna bergerak > 10m
          publishGpsLocation(deviceId, lat, lng, accuracy, timestamp);
        }
      } else {
        // Kirim pertama kali
        publishGpsLocation(deviceId, lat, lng, accuracy, timestamp);
      }
    },
    (err) => {
      console.warn("Gagal mendapatkan koordinat GPS:", err);
    },
    {
      enableHighAccuracy: false,
      maximumAge: 5000,
      timeout: 15000,
    }
  );

  resetGpsInterval(deviceId);
}

// Reset dan jadwalkan interval pengiriman lokasi 5 detik
function resetGpsInterval(deviceId) {
  if (gpsPublishInterval) {
    clearInterval(gpsPublishInterval);
  }
  gpsPublishInterval = setInterval(() => {
    if (lastGpsData) {
      publishGpsLocation(
        deviceId,
        lastGpsData.lat,
        lastGpsData.lng,
        lastGpsData.accuracy,
        lastGpsData.timestamp
      );
    }
  }, 5000);
}

/**
 * Menghentikan pemantauan lokasi GPS browser
 */
function stopGpsTracking() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (gpsPublishInterval !== null) {
    clearInterval(gpsPublishInterval);
    gpsPublishInterval = null;
  }
  lastGpsData = null;
  lastSentLat = null;
  lastSentLng = null;
  pendingGpsDeviceId = null;
}
