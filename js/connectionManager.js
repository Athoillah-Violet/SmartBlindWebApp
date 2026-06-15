/**
 * Kelola koneksi perangkat — pencarian otomatis (discovery), auto-connect, dan pemilihan perangkat
 */

import { STORAGE_KEY } from "./config.js";
import { normalizeDeviceId } from "./helpers.js";
import * as mqttService from "./mqttService.js";
import * as ui from "./uiController.js";
import { resetSpokenCache } from "./speechController.js";

let onStatusMessage = null;
let connectSuccessTimer = null;
let discoveryTimer = null;

// Map untuk menampung perangkat-perangkat yang sedang online
const discoveredDevices = new Map();

// Flag untuk menandai apakah pencarian perangkat (discovery) sedang aktif berjalan
let discoveryActiveState = false;

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

// Mengelola status koneksi MQTT untuk badge status di header dashboard
function handleMqttState(state) {
  if (state === "connecting") ui.setBadgeState("connecting");
  else if (state === "connected") ui.setBadgeState("connected");
  else ui.setBadgeState("disconnected");
}

/**
 * Inisialisasi Connection Manager saat aplikasi web pertama kali dibuka
 * @param {Function} statusHandler - Callback untuk memproses payload sensor
 */
export function initConnectionManager(statusHandler) {
  onStatusMessage = statusHandler;

  // Bind event tombol pada dashboard (Ganti Device & Putuskan Koneksi)
  ui.bindDeviceActions(handleChangeDevice, handleDisconnect);

  // Periksa apakah ada deviceId yang sebelumnya tersimpan di localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    // Jika ada, langsung lakukan koneksi otomatis ke perangkat tersebut
    connectToDevice(saved, true);
  } else {
    // Jika tidak ada, jalankan proses pencarian perangkat otomatis
    startDiscoveryProcess();
  }
}

/**
 * Memulai proses pencarian perangkat Smart Blind yang online di jaringan MQTT
 */
function startDiscoveryProcess() {
  clearDiscoveryTimer();
  discoveredDevices.clear();
  discoveryActiveState = true;

  // Tampilkan screen login/connect dan atur tampilan loading discovery awal
  ui.showConnectScreen();
  ui.showDiscoveryLoading("Menghubungkan ke broker...");

  // Hubungkan ke broker untuk mencari topic discovery: smartblind/devices
  mqttService.startDiscovery(
    // Callback saat ada perangkat mempublish kehadirannya
    (device) => {
      if (!discoveryActiveState) return;

      if (device.status === "online") {
        // Tambahkan ke Map jika status online
        discoveredDevices.set(device.id, device);
      } else if (device.status === "offline") {
        // Hapus dari Map jika status offline
        discoveredDevices.delete(device.id);
      }

      // Jika antarmuka daftar perangkat sudah tampil, langsung render ulang daftar terbaru
      if (ui.isDeviceListVisible()) {
        ui.renderDeviceList(Array.from(discoveredDevices.values()), selectDevice);
        return;
      }

      // Jika kita baru mendeteksi perangkat pertama setelah daftar kosong
      if (!discoveryTimer) {
        // Beri jeda 500ms sebelum evaluasi untuk menanti barangkali ada perangkat lain yang juga online
        discoveryTimer = setTimeout(evaluateDiscoveredDevices, 500);
      }
    },
    // Callback untuk memantau koneksi MQTT saat discovery
    (state) => {
      handleMqttState(state);
      if (state === "connected") {
        ui.showDiscoveryLoading("Mencari perangkat Smart Blind...");
        // Jalankan window pencarian awal selama 1.5 detik sejak berhasil terhubung ke broker
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

  if (devices.length === 1) {
    // Kasus 1: Hanya ada 1 perangkat ditemukan -> Langsung hubungkan otomatis
    const singleDevice = devices[0];
    selectDevice(singleDevice.id);
  } else if (devices.length > 1) {
    // Kasus 2: Ada lebih dari 1 perangkat -> Tampilkan daftar perangkat agar pengguna dapat memilih
    ui.showDeviceList();
    ui.renderDeviceList(devices, selectDevice);
  } else {
    // Kasus 3: Belum ada perangkat ditemukan -> Tetap cari dan tampilkan instruksi
    ui.showDiscoveryLoading("Mencari perangkat... Nyalakan ESP32 Anda & pastikan terhubung ke WiFi.");
  }
}

/**
 * Menyimpan deviceId terpilih dan menghubungkannya ke dashboard
 * @param {string} deviceId - ID perangkat terpilih
 */
function selectDevice(deviceId) {
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
      onMessage: (raw) => onStatusMessage?.(raw),
      onStateChange: handleMqttState,
    });

    // Pastikan tersimpan di localStorage
    localStorage.setItem(STORAGE_KEY, deviceId);
    ui.hideLoading();

    // Transisi ke tampilan dashboard
    connectSuccessTimer = setTimeout(() => {
      ui.showDashboard(deviceId);
      ui.setBadgeState("connected");
      ui.showWaiting();
    }, isAuto ? 0 : 400); // 400ms jeda visual agar transisi mulus
  } catch (err) {
    console.warn("Koneksi ke perangkat gagal:", err);
    mqttService.disconnectDevice();
    localStorage.removeItem(STORAGE_KEY);
    ui.hideLoading();
    ui.setBadgeState("disconnected");
    
    // Jika koneksi gagal, kembali ke proses discovery
    startDiscoveryProcess();
  }
}

/**
 * Handler saat tombol Ganti Device diklik
 */
function handleChangeDevice() {
  clearSuccessTimer();
  mqttService.disconnectDevice();
  resetSpokenCache();
  
  // Hapus dari localStorage
  localStorage.removeItem(STORAGE_KEY);
  
  ui.resetDashboardUi();
  ui.setBadgeState("disconnected");
  
  // Mulai pencarian ulang
  startDiscoveryProcess();
}

/**
 * Handler saat koneksi diputuskan
 */
function handleDisconnect(clearStorage = true) {
  clearSuccessTimer();
  mqttService.disconnectDevice();
  resetSpokenCache();

  if (clearStorage) {
    localStorage.removeItem(STORAGE_KEY);
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
