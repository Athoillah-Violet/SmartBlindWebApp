/**
 * Kelola koneksi perangkat — pencarian otomatis (discovery), auto-connect, keepalive, dan reset WiFi
 */

import { STORAGE_KEY } from "./config.js";
import { normalizeDeviceId } from "./helpers.js";
import * as mqttService from "./mqttService.js";
import * as ui from "./uiController.js";
import { resetSpokenCache } from "./speechController.js";

let onStatusMessage = null;
let connectSuccessTimer = null;
let discoveryTimer = null;
let deviceKeepaliveTimer = null;

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

  // Periksa apakah ada deviceId yang sebelumnya tersimpan di localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
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
