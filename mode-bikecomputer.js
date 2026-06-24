// Cyclo - Fullscreen Mobile Bike Computer Module (ES6 Module)
import { state, config, showToast } from './state.js';
import { saveActivity } from './activities.js';
import { loadDashboardData } from './app.js';
import {
  registerCallbacks,
  connectHeartRate,
  connectCyclingPower,
  startSimulator,
  stopSimulator,
  disconnectAll,
  isSimulatorActive,
  isHeartRateConnected,
  isCyclingPowerConnected
} from './ble-sensors.js';

// Live Tracking State
let isRunning = false;
let isPaused = false;
let startTime = null;
let elapsedTimeOffset = 0; // seconds
let durationInterval = null;

let gpsWatchId = null;
let distanceKm = 0;
let lastCoord = null;
let coordsArray = []; // [{lat, lng, alt}, ...]

let heartRateValues = [];
let powerValues = [];
let currentHr = null;
let currentPower = null;

let wakeLock = null;

// Map & Routing
let bcMap = null;
let bikePathPolyline = null;
let locatorMarker = null;
let routePolyline = null;
let selectedRouteCoords = null;

// Long Press Save Button
let longPressTimer = null;
let longPressStart = null;
const LONG_PRESS_DURATION = 3000; // 3 seconds

// ─── 1. ENTRY POINT: Start Bike Computer Mode ─────────────────────────────
export function startBikeComputerMode() {
  const container = document.getElementById('bike-computer-container');
  if (!container) return;

  // Verberg standaard app elementen
  document.querySelector('header').style.display = 'none';
  const bottomNav = document.getElementById('mobile-bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';
  document.querySelector('main').style.display = 'none';

  // Toon container
  container.style.display = 'flex';

  renderSetupPanel();
}

// ─── 2. SETUP PANEL: Select Route & Start ─────────────────────────────────
function renderSetupPanel() {
  const container = document.getElementById('bike-computer-container');
  
  // Verzamel routes
  const myActivities = (state.activities || []).filter(a => a.user_id === state.user?.id && a.coordinates && a.coordinates.length > 0);
  const plannedRides = (state.rides || []).filter(r => r.coordinates && r.coordinates.length > 0); // hypothetical GPX routes linked to rides

  // Combineer routes
  const routesList = [];
  myActivities.forEach(a => routesList.push({ id: a.id, name: `Rit: ${a.name}`, coords: a.coordinates }));
  plannedRides.forEach(r => routesList.push({ id: r.id, name: `Geplande rit: ${r.title}`, coords: r.coordinates }));

  container.innerHTML = `
    <div class="bc-setup-panel">
      <div style="font-size: 54px; margin-bottom: 8px;">🚴</div>
      <h2 class="bc-setup-title">Fietscomputer Modus</h2>
      <p style="font-size: 13px; color: var(--text-secondary); text-align: center; max-width: 280px; margin-bottom: 24px; line-height: 1.5;">
        Selecteer een route om te navigeren of kies voor een vrije rit om direct te starten.
      </p>

      <label style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px;">Kies Route / GPX</label>
      <select id="bc-route-select" class="form-control bc-select-control">
        <option value="">-- Vrije Rit (Geen Route) --</option>
        ${routesList.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
      </select>

      <button class="btn btn-primary" id="btn-bc-start-ride" style="width: 100%; max-width: 320px; padding: 14px; border-radius: var(--radius-lg); font-size: 15px; font-weight: 700;">
        <i data-lucide="play" style="width: 16px; height: 16px; fill: var(--text-on-primary);"></i> Start Training
      </button>
      
      <button class="btn btn-secondary" id="btn-bc-exit" style="width: 100%; max-width: 320px; padding: 14px; border-radius: var(--radius-lg); font-size: 15px; margin-top: 10px;">
        ✕ Annuleren
      </button>
    </div>
  `;

  // Bind Events
  document.getElementById('btn-bc-start-ride').addEventListener('click', () => {
    const select = document.getElementById('bc-route-select');
    const selectedId = select.value;
    const selectedRoute = routesList.find(r => r.id === selectedId);
    selectedRouteCoords = selectedRoute ? selectedRoute.coords : null;
    const routeName = selectedRoute ? selectedRoute.name.substring(5) : "Vrije Rit";
    
    startRideTracking(routeName);
  });

  document.getElementById('btn-bc-exit').addEventListener('click', exitBikeComputerMode);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── 3. LIVE TRACKING VIEW ────────────────────────────────────────────────
function startRideTracking(routeName) {
  isRunning = true;
  isPaused = false;
  startTime = Date.now();
  elapsedTimeOffset = 0;
  distanceKm = 0;
  lastCoord = null;
  coordsArray = [];
  heartRateValues = [];
  powerValues = [];
  currentHr = null;
  currentPower = null;

  // Request Wake Lock
  requestScreenWakeLock();

  const container = document.getElementById('bike-computer-container');
  container.innerHTML = `
    <!-- Header -->
    <div class="bc-header">
      <div class="bc-route-title">${routeName}</div>
      <button class="bc-sensor-badge" id="btn-bc-sensors">
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444;" id="bc-sensor-status-dot"></span>
        <span id="bc-sensor-status-lbl">Sensoren</span>
      </button>
    </div>

    <!-- Speed Display -->
    <div class="bc-speed-box">
      <div class="bc-speed-val" id="bc-speed">0.0</div>
      <div class="bc-speed-lbl">km/h</div>
    </div>

    <!-- Grid -->
    <div class="bc-metrics-grid">
      <div class="bc-metric-card" id="bc-hr-card">
        <div class="bc-metric-val color-pink" id="bc-hr">—</div>
        <div class="bc-metric-lbl">Hartslag (bpm)</div>
      </div>
      <div class="bc-metric-card">
        <div class="bc-metric-val color-volt" id="bc-power">—</div>
        <div class="bc-metric-lbl">Vermogen (W)</div>
      </div>
      <div class="bc-metric-card">
        <div class="bc-metric-val color-cyan" id="bc-distance">0.00</div>
        <div class="bc-metric-lbl">Afstand (km)</div>
      </div>
      <div class="bc-metric-card">
        <div class="bc-metric-val" id="bc-duration">00:00</div>
        <div class="bc-metric-lbl">Tijd</div>
      </div>
    </div>

    <!-- Navigatiekaart -->
    <div class="bc-map-wrap">
      <div id="bike-computer-map"></div>
    </div>

    <!-- Controls -->
    <div class="bc-controls">
      <!-- Pause/Resume Button -->
      <button class="bc-btn bc-btn-pause" id="btn-bc-pause" title="Pauzeer">
        <i data-lucide="pause"></i>
      </button>
      <button class="bc-btn bc-btn-resume" id="btn-bc-resume" title="Hervat" style="display: none;">
        <i data-lucide="play"></i>
      </button>

      <!-- Stop/Save (Long press 3s) -->
      <div class="bc-btn-stop-wrapper">
        <svg class="bc-progress-ring" width="80" height="80">
          <circle class="bc-progress-ring-circle" stroke-width="4" fill="transparent" r="36" cx="40" cy="40"/>
        </svg>
        <button class="bc-btn-stop" id="btn-bc-stop" title="Stop & Sla op">
          <i data-lucide="square" style="width:20px;height:20px;fill:#fff;"></i>
        </button>
      </div>
    </div>
  `;

  // Init Sensor Callbacks
  registerCallbacks({
    onHeartRate: (bpm) => {
      currentHr = bpm;
      heartRateValues.push(bpm);
      const hrEl = document.getElementById('bc-hr');
      const hrCard = document.getElementById('bc-hr-card');
      if (hrEl) hrEl.textContent = bpm;
      if (hrCard) hrCard.classList.add('pulsing-hr');
    },
    onPower: (watts) => {
      currentPower = watts;
      powerValues.push(watts);
      const pwrEl = document.getElementById('bc-power');
      if (pwrEl) pwrEl.textContent = watts;
    },
    onStatus: (text, connected, isSim) => {
      const dot = document.getElementById('bc-sensor-status-dot');
      const lbl = document.getElementById('bc-sensor-status-lbl');
      const badge = document.getElementById('btn-bc-sensors');
      if (dot && lbl && badge) {
        dot.style.backgroundColor = connected ? 'var(--primary)' : '#ef4444';
        lbl.textContent = isSim ? "Simulator" : text;
        badge.classList.toggle('connected', connected);
      }
    }
  });

  // Bind Buttons
  document.getElementById('btn-bc-sensors').addEventListener('click', openSensorDialog);
  document.getElementById('btn-bc-pause').addEventListener('click', pauseRideTracking);
  document.getElementById('btn-bc-resume').addEventListener('click', resumeRideTracking);

  // Setup Long-Press Save Buttons
  setupLongPressSave();

  // Initialize Map
  initNavigationMap();

  // Start GPS Geolocation
  startGpsWatch();

  // Start Duration Timer
  startDurationTimer();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── 4. GPS & GEOLOCATION WATCH ──────────────────────────────────────────
function startGpsWatch() {
  if (!navigator.geolocation) {
    showToast("GPS Geolocation is niet ondersteund door dit apparaat.", "error");
    return;
  }

  const onGpsSuccess = (position) => {
    if (isPaused) return;

    const { latitude, longitude, speed, altitude } = position.coords;
    const currentSpeedKmh = speed ? (speed * 3.6) : 0;
    
    // Update Speed display
    const speedEl = document.getElementById('bc-speed');
    if (speedEl) speedEl.textContent = currentSpeedKmh.toFixed(1);

    const alt = altitude !== undefined && altitude !== null ? altitude : null;
    const newCoord = { lat: latitude, lng: longitude, alt };

    if (lastCoord) {
      // Haversine distance
      const dist = calculateHaversineDistance(lastCoord.lat, lastCoord.lng, newCoord.lat, newCoord.lng);
      distanceKm += dist;
    }

    lastCoord = newCoord;
    coordsArray.push(newCoord);

    // Update distance UI
    const distEl = document.getElementById('bc-distance');
    if (distEl) distEl.textContent = distanceKm.toFixed(2);

    // Update Leaflet marker and path
    updateMapPosition(newCoord);
  };

  const onGpsError = (err) => {
    console.warn("GPS Geolocation error (high accuracy):", err.message);
    if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
      showToast("Wachten op GPS signaal...", "info");
      
      // Clear active watch and restart with lower accuracy fallback
      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
      }
      gpsWatchId = navigator.geolocation.watchPosition(
        onGpsSuccess,
        (err2) => {
          console.error("GPS Geolocation fallback error:", err2.message);
          showToast("GPS fout: " + err2.message, "error");
        },
        {
          enableHighAccuracy: false,
          maximumAge: 5000,
          timeout: 15000
        }
      );
    } else {
      showToast("GPS fout: " + err.message, "error");
    }
  };

  gpsWatchId = navigator.geolocation.watchPosition(
    onGpsSuccess,
    onGpsError,
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 8000
    }
  );
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ─── 5. LEAFLET MAP OPERATIONS ────────────────────────────────────────────
function initNavigationMap() {
  if (typeof L === 'undefined') {
    console.error("Leaflet CDN is niet geladen.");
    return;
  }

  // Create Leaflet Map Instance
  bcMap = L.map('bike-computer-map', {
    zoomControl: false,
    attributionControl: false
  }).setView([51.0504, 3.7378], 14); // Default to Ghent, Belgium

  // Add dark maps layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(bcMap);

  // If a route was selected, render it
  if (selectedRouteCoords && selectedRouteCoords.length > 0) {
    const latLngs = selectedRouteCoords.map(c => [c.lat, c.lng]);
    routePolyline = L.polyline(latLngs, {
      color: 'rgba(0, 240, 255, 0.65)', // Cyan route path
      weight: 5,
      opacity: 0.8
    }).addTo(bcMap);

    bcMap.fitBounds(routePolyline.getBounds(), { padding: [15, 15] });
  } else {
    // Get current position immediately to center the map
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latLng = [pos.coords.latitude, pos.coords.longitude];
          if (bcMap && !selectedRouteCoords && !lastCoord) {
            bcMap.setView(latLng, 15);
          }
        },
        (err) => {
          console.warn("Initial position check failed:", err.message);
        },
        {
          enableHighAccuracy: false,
          maximumAge: 10000,
          timeout: 5000
        }
      );
    }
  }

  // Path polyline for the currently recorded path
  bikePathPolyline = L.polyline([], {
    color: 'var(--primary)', // Volt Green path
    weight: 4,
    opacity: 0.95
  }).addTo(bcMap);
}

function updateMapPosition(newCoord) {
  if (!bcMap) return;

  const latLng = [newCoord.lat, newCoord.lng];

  // Add coordinates to the recorded path polyline
  if (bikePathPolyline) {
    bikePathPolyline.addLatLng(latLng);
  }

  // Move or add locator marker
  if (!locatorMarker) {
    const locatorIcon = L.divIcon({
      className: 'leaflet-bike-location-marker-container',
      html: '<div class="leaflet-bike-location-marker"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    locatorMarker = L.marker(latLng, { icon: locatorIcon }).addTo(bcMap);
    bcMap.setView(latLng, 16);
  } else {
    locatorMarker.setLatLng(latLng);
    // Smoothly pan map to follow cyclist
    bcMap.panTo(latLng);
  }
}

// ─── 6. DURATION TIMER & CONTROLS ──────────────────────────────────────────
function startDurationTimer() {
  durationInterval = setInterval(() => {
    if (isPaused) return;
    
    const totalSecs = Math.floor((Date.now() - startTime) / 1000) + elapsedTimeOffset;
    
    const durEl = document.getElementById('bc-duration');
    if (durEl) {
      const hours = Math.floor(totalSecs / 3600);
      const minutes = Math.floor((totalSecs % 3600) / 60);
      const seconds = Math.floor(totalSecs % 60);
      
      const hDisplay = hours > 0 ? `${hours}:` : '';
      const mDisplay = minutes < 10 && hours > 0 ? `0${minutes}:` : `${minutes}:`;
      const sDisplay = seconds < 10 ? `0${seconds}` : `${seconds}`;
      
      durEl.textContent = `${hDisplay}${mDisplay}${sDisplay}`;
    }
  }, 1000);
}

function pauseRideTracking() {
  if (!isRunning || isPaused) return;
  
  isPaused = true;
  elapsedTimeOffset += Math.floor((Date.now() - startTime) / 1000);
  
  // Pause GPS Watch
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }

  // Toggle buttons
  document.getElementById('btn-bc-pause').style.display = 'none';
  document.getElementById('btn-bc-resume').style.display = 'flex';
  
  showToast("Rit gepauzeerd", "info");
}

function resumeRideTracking() {
  if (!isRunning || !isPaused) return;

  isPaused = false;
  startTime = Date.now();

  // Resume GPS Watch
  startGpsWatch();

  // Toggle buttons
  document.getElementById('btn-bc-resume').style.display = 'none';
  document.getElementById('btn-bc-pause').style.display = 'flex';

  showToast("Rit hervat", "success");
}

// ─── 7. LONG PRESS STOP/SAVE LOGIC ─────────────────────────────────────────
function setupLongPressSave() {
  const stopBtn = document.getElementById('btn-bc-stop');
  const circle = document.querySelector('.bc-progress-ring-circle');
  if (!stopBtn || !circle) return;

  const startPress = (e) => {
    e.preventDefault();
    if (!isRunning) return;

    longPressStart = Date.now();
    circle.style.transition = `stroke-dashoffset ${LONG_PRESS_DURATION}ms linear`;
    circle.style.strokeDashoffset = '0'; // Fill path

    longPressTimer = setTimeout(() => {
      // Completed 3 seconds! Save ride
      saveAndEndRide();
    }, LONG_PRESS_DURATION);
  };

  const cancelPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    circle.style.transition = 'stroke-dashoffset 0.15s ease';
    circle.style.strokeDashoffset = '226'; // Reset path
    longPressStart = null;
  };

  // Touch Events (mobile first)
  stopBtn.addEventListener('touchstart', startPress);
  stopBtn.addEventListener('touchend', cancelPress);
  stopBtn.addEventListener('touchcancel', cancelPress);
  
  // Mouse Events fallback
  stopBtn.addEventListener('mousedown', startPress);
  stopBtn.addEventListener('mouseup', cancelPress);
  stopBtn.addEventListener('mouseleave', cancelPress);
}

async function saveAndEndRide() {
  isRunning = false;
  
  // Stop watch and timers
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

  // Calculate final metrics
  const totalTimeSeconds = Math.max(1, Math.floor((Date.now() - startTime) / 1000) + elapsedTimeOffset);
  const avgHeartRate = heartRateValues.length > 0 ? Math.round(heartRateValues.reduce((s, x) => s + x, 0) / heartRateValues.length) : null;
  const avgPowerWatts = powerValues.length > 0 ? Math.round(powerValues.reduce((s, x) => s + x, 0) / powerValues.length) : null;
  
  // Compute altitude gain
  let totalAscent = 0;
  let prevAlt = null;
  coordsArray.forEach(c => {
    if (c.alt !== null && c.alt !== undefined && !isNaN(c.alt)) {
      if (prevAlt !== null && c.alt > prevAlt) {
        totalAscent += (c.alt - prevAlt);
      }
      prevAlt = c.alt;
    }
  });

  // Calculate speed
  const hours = totalTimeSeconds / 3600;
  const avgSpeedKmh = parseFloat((distanceKm / hours).toFixed(1)) || 0;

  // Build temporary parsedRide structure for calculation
  const parsedRide = {
    startTime: new Date(Date.now() - totalTimeSeconds * 1000),
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    totalTimeSeconds,
    totalAscentMeters: Math.round(totalAscent),
    avgSpeedKmh,
    avgHeartRate,
    avgPowerWatts,
    riderScore: 0,
    coordinates: coordsArray
  };

  // Calculate Rider Score
  if (typeof window.ActivityParser !== 'undefined') {
    parsedRide.riderScore = window.ActivityParser.calculateRiderScore(parsedRide);
  } else {
    // Basic fallback formula
    parsedRide.riderScore = Math.round((distanceKm * 2) + (avgSpeedKmh * 1.5));
  }

  showToast("Ritgegevens verwerken...", "info");

  // Save activity
  const fileName = `Mobiele Rit ${new Date().toLocaleDateString('nl-NL')}`;
  await saveActivity(parsedRide, fileName, loadDashboardData);

  // Release Wake Lock
  releaseScreenWakeLock();

  // Disconnect BLE
  disconnectAll();

  // Reset Leaflet Map
  if (bcMap) {
    bcMap.remove();
    bcMap = null;
    bikePathPolyline = null;
    locatorMarker = null;
    routePolyline = null;
  }

  showToast("Rit succesvol opgeslagen!", "success");
  
  // Exit back to platform
  exitBikeComputerMode();
}

function exitBikeComputerMode() {
  // Release lock
  releaseScreenWakeLock();
  disconnectAll();

  // Hide container
  const container = document.getElementById('bike-computer-container');
  if (container) container.style.display = 'none';

  // Restore elements
  document.querySelector('header').style.display = 'block';
  const bottomNav = document.getElementById('mobile-bottom-nav');
  if (bottomNav) bottomNav.style.display = 'flex';
  document.querySelector('main').style.display = 'block';

  // Return to Ritten history page on platform
  const ridesLink = document.getElementById('mob-link-rides');
  if (ridesLink) {
    ridesLink.click();
  }
}

// ─── 8. WAKE LOCK API ──────────────────────────────────────────────────────
async function requestScreenWakeLock() {
  if (!('wakeLock' in navigator)) {
    console.warn("Screen Wake Lock API wordt niet ondersteund door uw browser.");
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log("Wake Lock geactiveerd.");
  } catch (err) {
    console.warn("Kon Wake Lock niet activeren:", err.message);
  }
}

function releaseScreenWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
      console.log("Wake Lock vrijgegeven.");
    });
  }
}

// ─── 9. SENSOR DIALOG POPUP ────────────────────────────────────────────────
function openSensorDialog() {
  // Remove existing
  document.getElementById('bc-sensor-popup')?.remove();

  const modal = document.createElement('div');
  modal.id = 'bc-sensor-popup';
  modal.className = 'bc-sensor-modal';
  
  const hasBle = !!navigator.bluetooth;

  modal.innerHTML = `
    <div class="bc-sensor-box">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h3>Koppel Sensoren</h3>
        <button style="background:none; border:none; color:var(--text-muted); font-size:20px; cursor:pointer;" id="btn-bc-close-sensors">✕</button>
      </div>
      <p>Verbind uw BLE hartslagmeter of vermogensmeter met Cyclo.</p>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        <div class="bc-sensor-option" id="opt-bc-hr">
          <span class="bc-sensor-option-name">❤️ Hartslagmeter (BLE)</span>
          <span class="bc-sensor-option-status" id="lbl-bc-hr-status">Niet verbonden</span>
        </div>
        <div class="bc-sensor-option" id="opt-bc-power">
          <span class="bc-sensor-option-name">⚡ Vermogensmeter (BLE)</span>
          <span class="bc-sensor-option-status" id="lbl-bc-power-status">Niet verbonden</span>
        </div>
        <div class="bc-sensor-option" id="opt-bc-sim">
          <span class="bc-sensor-option-name">🤖 Simulator Modus (Mock)</span>
          <span class="bc-sensor-option-status" id="lbl-bc-sim-status">Inactief</span>
        </div>
      </div>
      
      <button class="btn btn-secondary w-full" id="btn-bc-close-sensors-btn">Sluiten</button>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('btn-bc-close-sensors').onclick = close;
  document.getElementById('btn-bc-close-sensors-btn').onclick = close;

  // Initialize status labels
  const hrLabel = document.getElementById('lbl-bc-hr-status');
  const powerLabel = document.getElementById('lbl-bc-power-status');
  const simLabel = document.getElementById('lbl-bc-sim-status');
  const hrOpt = document.getElementById('opt-bc-hr');
  const pwrOpt = document.getElementById('opt-bc-power');
  const simOpt = document.getElementById('opt-bc-sim');

  if (isSimulatorActive) {
    simLabel.textContent = "Actief";
    simOpt.classList.add('active');
    hrLabel.textContent = "Gesimuleerd";
    powerLabel.textContent = "Gesimuleerd";
    hrOpt.classList.add('active');
    pwrOpt.classList.add('active');
  } else {
    if (isHeartRateConnected()) {
      hrLabel.textContent = "Gekoppeld";
      hrOpt.classList.add('active');
    }
    if (isCyclingPowerConnected()) {
      powerLabel.textContent = "Gekoppeld";
      pwrOpt.classList.add('active');
    }
  }

  // Bind BLE Clicks
  hrOpt.addEventListener('click', async () => {
    if (!hasBle) {
      showToast("Web Bluetooth niet ondersteund", "error");
      return;
    }
    hrLabel.textContent = "Koppelen...";
    const success = await connectHeartRate();
    if (success) {
      hrLabel.textContent = "Gekoppeld";
      hrOpt.classList.add('active');
    } else {
      hrLabel.textContent = "Fout";
    }
  });

  pwrOpt.addEventListener('click', async () => {
    if (!hasBle) {
      showToast("Web Bluetooth niet ondersteund", "error");
      return;
    }
    powerLabel.textContent = "Koppelen...";
    const success = await connectCyclingPower();
    if (success) {
      powerLabel.textContent = "Gekoppeld";
      pwrOpt.classList.add('active');
    } else {
      powerLabel.textContent = "Fout";
    }
  });

  simOpt.addEventListener('click', () => {
    if (isSimulatorActive) {
      stopSimulator();
      simLabel.textContent = "Inactief";
      simOpt.classList.remove('active');
    } else {
      startSimulator();
      simLabel.textContent = "Actief";
      simOpt.classList.add('active');
      
      // Update BLE lists visual
      hrLabel.textContent = "Gesimuleerd";
      powerLabel.textContent = "Gesimuleerd";
      hrOpt.classList.add('active');
      pwrOpt.classList.add('active');
    }
  });
}
