// Cyclo - Bluetooth LE (BLE) Sensor Connection Engine
import { showToast } from './state.js';

let hrDevice = null;
let hrCharacteristic = null;
let powerDevice = null;
let powerCharacteristic = null;

let simInterval = null;
let isSimulatorActive = false;

// Callbacks
let hrCallback = null;
let powerCallback = null;
let statusCallback = null;

export function registerCallbacks({ onHeartRate, onPower, onStatus }) {
  if (onHeartRate) hrCallback = onHeartRate;
  if (onPower) powerCallback = onPower;
  if (onStatus) statusCallback = onStatus;
}

// ─── 1. Web Bluetooth Heart Rate connection ──────────────────────────────
export async function connectHeartRate() {
  if (isSimulatorActive) stopSimulator();

  if (!navigator.bluetooth) {
    showToast("Web Bluetooth wordt niet ondersteund door uw browser/apparaat.", "error");
    updateStatus("HR: Niet ondersteund", false);
    return false;
  }

  try {
    updateStatus("HR: Koppelen...", false);
    hrDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });

    hrDevice.addEventListener('gattserverdisconnected', onHeartRateDisconnected);

    const server = await hrDevice.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    hrCharacteristic = await service.getCharacteristic('heart_rate_measurement');
    
    await hrCharacteristic.startNotifications();
    hrCharacteristic.addEventListener('characteristicvaluechanged', handleHeartRateValueChanged);

    updateStatus("HR: Gekoppeld", true);
    showToast("Hartslagsensor succesvol gekoppeld!", "success");
    return true;

  } catch (err) {
    console.error("HR BLE error:", err);
    updateStatus("HR: Verbinding mislukt", false);
    showToast("HR koppelen mislukt: " + err.message, "error");
    return false;
  }
}

function handleHeartRateValueChanged(event) {
  const value = event.target.value;
  // GATT Heart Rate measurement parser
  const flags = value.getUint8(0);
  const rate16Bits = flags & 0x01;
  let heartRate = 0;
  
  if (rate16Bits) {
    heartRate = value.getUint16(1, true);
  } else {
    heartRate = value.getUint8(1);
  }

  if (hrCallback) hrCallback(heartRate);
}

function onHeartRateDisconnected() {
  updateStatus("HR: Verbinding verbroken", false);
  showToast("Hartslagsensor verbinding verbroken.", "error");
  hrDevice = null;
  hrCharacteristic = null;
}

// ─── 2. Web Bluetooth Cycling Power connection ────────────────────────────
export async function connectCyclingPower() {
  if (isSimulatorActive) stopSimulator();

  if (!navigator.bluetooth) {
    showToast("Web Bluetooth wordt niet ondersteund door uw browser/apparaat.", "error");
    updateStatus("Power: Niet ondersteund", false);
    return false;
  }

  try {
    updateStatus("Power: Koppelen...", false);
    powerDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['cycling_power'] }]
    });

    powerDevice.addEventListener('gattserverdisconnected', onCyclingPowerDisconnected);

    const server = await powerDevice.gatt.connect();
    const service = await server.getPrimaryService('cycling_power');
    powerCharacteristic = await service.getCharacteristic('cycling_power_measurement');
    
    await powerCharacteristic.startNotifications();
    powerCharacteristic.addEventListener('characteristicvaluechanged', handleCyclingPowerValueChanged);

    updateStatus("Power: Gekoppeld", true);
    showToast("Vermogensmeter succesvol gekoppeld!", "success");
    return true;

  } catch (err) {
    console.error("Power BLE error:", err);
    updateStatus("Power: Verbinding mislukt", false);
    showToast("Vermogensmeter koppelen mislukt: " + err.message, "error");
    return false;
  }
}

function handleCyclingPowerValueChanged(event) {
  const value = event.target.value;
  // GATT Cycling Power measurement parser
  // Instantaneous power is represented as a signed 16-bit integer at bytes 2-3
  const power = value.getUint16(2, true);
  if (powerCallback) powerCallback(power);
}

function onCyclingPowerDisconnected() {
  updateStatus("Power: Verbinding verbroken", false);
  showToast("Vermogensmeter verbinding verbroken.", "error");
  powerDevice = null;
  powerCharacteristic = null;
}

// ─── 3. Mock Sensor Simulator ─────────────────────────────────────────────
export function startSimulator() {
  disconnectAll();
  isSimulatorActive = true;
  updateStatus("Sensor Simulator Actief", true);
  showToast("Sensorsimulator gestart!", "info");

  let currentHr = 130;
  let currentPower = 180;

  simInterval = setInterval(() => {
    // Simuleer een random walk
    currentHr += Math.floor(Math.random() * 5) - 2;
    currentHr = Math.max(110, Math.min(185, currentHr));

    currentPower += Math.floor(Math.random() * 21) - 10;
    currentPower = Math.max(120, Math.min(380, currentPower));

    if (hrCallback) hrCallback(currentHr);
    if (powerCallback) powerCallback(currentPower);
  }, 1000);
}

export function stopSimulator() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  isSimulatorActive = false;
  updateStatus("Sensoren: Ontkoppeld", false);
}

// ─── 4. Helpers ───────────────────────────────────────────────────────────
function updateStatus(text, connected) {
  if (statusCallback) {
    statusCallback(text, connected, isSimulatorActive);
  }
}

export function disconnectAll() {
  stopSimulator();
  
  if (hrCharacteristic) {
    try { hrCharacteristic.stopNotifications(); } catch (e) {}
    hrCharacteristic = null;
  }
  if (hrDevice && hrDevice.gatt.connected) {
    hrDevice.gatt.disconnect();
  }
  hrDevice = null;

  if (powerCharacteristic) {
    try { powerCharacteristic.stopNotifications(); } catch (e) {}
    powerCharacteristic = null;
  }
  if (powerDevice && powerDevice.gatt.connected) {
    powerDevice.gatt.disconnect();
  }
  powerDevice = null;

  updateStatus("Ontkoppeld", false);
}
export function isHeartRateConnected() {
  return !!(hrDevice && hrDevice.gatt && hrDevice.gatt.connected);
}
export function isCyclingPowerConnected() {
  return !!(powerDevice && powerDevice.gatt && powerDevice.gatt.connected);
}
export { isSimulatorActive };
