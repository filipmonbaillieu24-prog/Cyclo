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
let activeRideId = null;
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
let companionMarkers = {};
let routePolyline = null;
let selectedRouteCoords = null;
let activeRouteCueSheet = null;

// Simulator GPS Interval
let simGpsInterval = null;


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
  myActivities.forEach(a => routesList.push({ id: a.id, name: `Rit: ${a.name}`, coords: a.coordinates, isRide: false }));
  plannedRides.forEach(r => routesList.push({ id: r.id, name: `Geplande rit: ${r.title}`, coords: r.coordinates, isRide: true }));

  if (state.activeRouteBuilderRoute) {
    routesList.push({
      id: 'active-builder',
      name: `🗺️ Route: ${state.activeRouteBuilderRoute.name}`,
      coords: state.activeRouteBuilderRoute.coordinates,
      cueSheet: state.activeRouteBuilderRoute.cueSheet,
      isRide: false
    });
  }

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
    activeRouteCueSheet = selectedRoute ? selectedRoute.cueSheet : null;
    activeRideId = (selectedRoute && selectedRoute.isRide) ? selectedRoute.id : 'free-ride';
    const routeName = selectedRoute 
      ? (selectedRoute.id === 'active-builder' ? selectedRoute.name : (selectedRoute.isRide ? selectedRoute.name.substring(14) : selectedRoute.name.substring(5)))
      : "Vrije Rit";
    
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
    <!-- Navigatiekaart -->
    <div class="bc-map-wrap">
      <div id="bike-computer-map"></div>
    </div>

    <!-- Header -->
    <div class="bc-header">
      <div class="bc-route-title">${routeName}</div>
      <button class="bc-sensor-badge" id="btn-bc-sensors">
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444;" id="bc-sensor-status-dot"></span>
        <span id="bc-sensor-status-lbl">Sensoren</span>
      </button>
    </div>

    <!-- Live Turn-by-Turn Navigatie Banner -->
    <div id="bc-nav-banner" style="display:none; margin: 0; padding: 10px 14px; background: rgba(18, 26, 42, 0.85); border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 8px; align-items: center; gap: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
      <div id="bc-nav-icon" style="font-size:24px;">🗺️</div>
      <div style="display:flex; flex-direction:column; flex:1;">
        <span id="bc-nav-instruction" style="font-size:12px; font-weight:700; color:#fff; text-align:left;">Rechtdoor op de route</span>
        <span id="bc-nav-dist-to" style="font-size:10px; color:var(--text-muted); text-align:left;">—</span>
      </div>
    </div>

    <!-- Bottom Dashboard Overlay -->
    <div class="bc-bottom-dashboard">
      <div class="bc-dashboard-row">
        <!-- Speed Display (Left) -->
        <div class="bc-speed-column">
          <div class="bc-speed-val" id="bc-speed">0.0</div>
          <div class="bc-speed-lbl">km/h</div>
        </div>

        <!-- Metrics Grid (Right) -->
        <div class="bc-metrics-grid-compact">
          <div class="bc-metric-card-compact" id="bc-hr-card">
            <span class="bc-metric-val-compact color-pink" id="bc-hr">—</span>
            <span class="bc-metric-lbl-compact">Hartslag</span>
          </div>
          <div class="bc-metric-card-compact">
            <span class="bc-metric-val-compact color-volt" id="bc-power">—</span>
            <span class="bc-metric-lbl-compact">Vermogen</span>
          </div>
          <div class="bc-metric-card-compact">
            <span class="bc-metric-val-compact color-cyan" id="bc-distance">0.00</span>
            <span class="bc-metric-lbl-compact">Afstand (km)</span>
          </div>
          <div class="bc-metric-card-compact">
            <span class="bc-metric-val-compact" id="bc-duration">00:00</span>
            <span class="bc-metric-lbl-compact">Tijd</span>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="bc-controls">
        <!-- Active state: Pause button only -->
        <button class="bc-btn bc-btn-pause" id="btn-bc-pause" title="Pauzeer">
          <i data-lucide="pause"></i>
        </button>

        <!-- Paused state: Discard, Resume, Save buttons -->
        <div id="bc-paused-controls" style="display: none; width: 100%; justify-content: center; gap: 20px; align-items: center;">
          <!-- Discard Button -->
          <button class="bc-btn bc-btn-discard" id="btn-bc-discard" title="Rit annuleren/verwerpen">
            <i data-lucide="trash-2"></i>
          </button>

          <!-- Resume Button -->
          <button class="bc-btn bc-btn-resume" id="btn-bc-resume" title="Hervat">
            <i data-lucide="play"></i>
          </button>

          <!-- Save Button -->
          <button class="bc-btn bc-btn-save" id="btn-bc-save" title="Rit opslaan">
            <i data-lucide="save"></i>
          </button>
        </div>
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

      // Dynamic GPS watch switcher: Switch between hardware watch and simulator depending on sensor sim status
      if (isRunning && !isPaused) {
        if (isSim) {
          if (!simGpsInterval) {
            if (gpsWatchId !== null) {
              navigator.geolocation.clearWatch(gpsWatchId);
              gpsWatchId = null;
            }
            startGpsSimulation();
          }
        } else {
          if (simGpsInterval) {
            clearInterval(simGpsInterval);
            simGpsInterval = null;
            startGpsWatch();
          }
        }
      }
    }
  });

  // Bind Buttons
  document.getElementById('btn-bc-sensors').addEventListener('click', openSensorDialog);
  document.getElementById('btn-bc-pause').addEventListener('click', pauseRideTracking);

  // Setup Paused Controls (Discard, Resume, Save)
  setupPausedControls();

  // Initialize Map
  initNavigationMap();

  // Start GPS Geolocation
  startGpsWatch();

  // Start Duration Timer
  startDurationTimer();

  // Initialize WebSocket Telemetry Room
  if (state.user) {
    import('./realtime.js').then(realtime => {
      realtime.initTelemetry(activeRideId, state.user.id, (data) => {
        handleIncomingTelemetry(data);
      });
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── 4. GPS & GEOLOCATION WATCH & SIMULATOR ─────────────────────────────────
function startGpsSimulation() {
  if (simGpsInterval) clearInterval(simGpsInterval);

  let simLat = lastCoord ? lastCoord.lat : (bcMap ? bcMap.getCenter().lat : 51.0504);
  let simLng = lastCoord ? lastCoord.lng : (bcMap ? bcMap.getCenter().lng : 3.7378);
  let simAlt = lastCoord ? lastCoord.alt : 15;
  let bearing = Math.random() * 2 * Math.PI;

  let routeIdx = 0;
  if (selectedRouteCoords && selectedRouteCoords.length > 0) {
    simLat = selectedRouteCoords[0].lat;
    simLng = selectedRouteCoords[0].lng;
    simAlt = selectedRouteCoords[0].alt || 15;
  }

  simGpsInterval = setInterval(() => {
    if (isPaused || !isRunning) return;

    let nextLat = simLat;
    let nextLng = simLng;
    let nextAlt = simAlt;
    let currentSpeed = 7 + Math.random() * 4; // m/s (~25-40 km/h)

    if (selectedRouteCoords && selectedRouteCoords.length > 0) {
      routeIdx = (routeIdx + 1) % selectedRouteCoords.length;
      const target = selectedRouteCoords[routeIdx];
      nextLat = target.lat;
      nextLng = target.lng;
      nextAlt = target.alt || 15;

      if (lastCoord) {
        const dist = calculateHaversineDistance(lastCoord.lat, lastCoord.lng, nextLat, nextLng);
        currentSpeed = (dist * 1000) / 2; // 2s interval
      }
    } else {
      bearing += (Math.random() - 0.5) * 0.4;
      const distStep = (currentSpeed * 2) / 1000; // km in 2s
      const dLat = (distStep * Math.cos(bearing)) / 111.1;
      const dLng = (distStep * Math.sin(bearing)) / (111.1 * Math.cos(simLat * Math.PI / 180));

      nextLat = simLat + dLat;
      nextLng = simLng + dLng;
      nextAlt = simAlt + (Math.random() - 0.5) * 1.5;
    }

    simLat = nextLat;
    simLng = nextLng;
    simAlt = nextAlt;

    const mockPosition = {
      coords: {
        latitude: simLat,
        longitude: simLng,
        speed: currentSpeed,
        altitude: simAlt
      },
      timestamp: Date.now()
    };

    onGpsSuccess(mockPosition);
  }, 2000);
}

function onGpsSuccess(position) {
  if (isPaused) return;

  const { latitude, longitude, speed, altitude, accuracy } = position.coords;
  
  // Ignore low-accuracy points (e.g., cell tower triangulation with accuracy > 30m)
  // but only if we already have at least one coordinate locked. This ensures the app centers
  // near the user initially, but filters out jittery jumps once tracking starts.
  if (lastCoord && accuracy !== undefined && accuracy !== null && accuracy > 30) {
    console.log(`[GPS] Negeer lage nauwkeurigheid coördinaat (${accuracy}m afwijking)`);
    return;
  }

  const currentSpeedKmh = speed ? (speed * 3.6) : 0;
  
  // Update Speed display
  const speedEl = document.getElementById('bc-speed');
  if (speedEl) speedEl.textContent = currentSpeedKmh.toFixed(1);

  const alt = altitude !== undefined && altitude !== null ? altitude : null;
  
  let smoothedLat = latitude;
  let smoothedLng = longitude;

  // Apply Exponential Moving Average (alpha = 0.5) to smooth out path jitter
  if (lastCoord) {
    const alpha = 0.5;
    smoothedLat = alpha * latitude + (1 - alpha) * lastCoord.lat;
    smoothedLng = alpha * longitude + (1 - alpha) * lastCoord.lng;
  }

  const newCoord = { lat: smoothedLat, lng: smoothedLng, alt };

  if (lastCoord) {
    const dist = calculateHaversineDistance(lastCoord.lat, lastCoord.lng, newCoord.lat, newCoord.lng);
    // Ignore extreme jumps (> 150m in one single update) to filter GPS telemetry spikes
    if (dist < 0.15) {
      distanceKm += dist;
    }
  }

  lastCoord = newCoord;
  coordsArray.push(newCoord);

  // Update distance UI
  const distEl = document.getElementById('bc-distance');
  if (distEl) distEl.textContent = distanceKm.toFixed(2);

  // Update Leaflet marker and path
  updateMapPosition(newCoord);

  // Update Live Navigation Banner
  updateLiveNavigation();

  // Send Telemetry Update
  if (isRunning && !isPaused && state.user) {
    import('./realtime.js').then(realtime => {
      realtime.sendTelemetry({
        ride_id: activeRideId || 'free-ride',
        user_id: state.user.id,
        lat: newCoord.lat,
        lng: newCoord.lng,
        speed: parseFloat(currentSpeedKmh.toFixed(1)),
        hr: currentHr || 0,
        watts: currentPower || 0
      });
    });
  }
}

function handleIncomingTelemetry(data) {
  if (!bcMap || !data || !data.user_id) return;

  const latLng = [data.lat, data.lng];
  const tooltipContent = `
    <div style="font-weight:700;color:#f8fafc;margin-bottom:2px;font-size:12px;">${data.full_name || '@' + data.username}</div>
    <div style="display:flex;gap:8px;color:#94a3b8;font-size:10px;white-space:nowrap;">
      <span style="color:#ef4444;">❤️ ${data.hr || 0}</span>
      <span style="color:#d4ff00;">⚡ ${data.watts || 0}W</span>
      <span style="color:#00b4d8;">🚴 ${data.speed || 0}</span>
    </div>
  `;

  let marker = companionMarkers[data.user_id];

  if (!marker) {
    // Create custom companion marker icon with avatar image
    const companionIcon = L.divIcon({
      className: 'leaflet-companion-marker-container',
      html: `
        <div class="companion-marker-wrap">
          <img src="${data.avatar_url || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + data.user_id}" class="companion-avatar" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${data.user_id}'" />
          <div class="companion-marker-dot"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    marker = L.marker(latLng, { icon: companionIcon }).addTo(bcMap);
    
    // Bind permanent styled tooltip
    marker.bindTooltip(tooltipContent, {
      permanent: true,
      direction: 'top',
      offset: [0, -32],
      className: 'leaflet-tooltip-companion'
    });

    companionMarkers[data.user_id] = marker;
  } else {
    // Smoothly animate marker position from current to new position
    const startLatLng = marker.getLatLng();
    const endLatLng = L.latLng(latLng[0], latLng[1]);
    
    animateCompanionMarker(marker, startLatLng, endLatLng, 950);
    
    // Update tooltip
    marker.setTooltipContent(tooltipContent);
  }
}

function animateCompanionMarker(marker, startLatLng, endLatLng, duration) {
  const startTime = performance.now();
  
  function tick() {
    const now = performance.now();
    const progress = Math.min((now - startTime) / duration, 1);
    
    const lat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress;
    const lng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress;
    
    marker.setLatLng([lat, lng]);
    
    if (progress < 1) {
      marker._animationFrame = requestAnimationFrame(tick);
    }
  }
  
  if (marker._animationFrame) {
    cancelAnimationFrame(marker._animationFrame);
  }
  tick();
}

function startGpsWatch() {
  if (isSimulatorActive) {
    startGpsSimulation();
    return;
  }

  if (simGpsInterval) {
    clearInterval(simGpsInterval);
    simGpsInterval = null;
  }

  if (!navigator.geolocation) {
    showToast("GPS Geolocation is niet ondersteund door dit apparaat.", "error");
    return;
  }

  const onGpsError = (err) => {
    console.warn("GPS Geolocation watch error:", err.message);
    if (err.code === err.PERMISSION_DENIED) {
      showToast("GPS toegang geweigerd. Schakel locatievoorzieningen in.", "error");
    } else if (err.code === err.TIMEOUT) {
      console.log("GPS watch timeout - device still acquiring lock...");
    } else {
      console.log("GPS error: " + err.message);
    }
  };

  gpsWatchId = navigator.geolocation.watchPosition(
    onGpsSuccess,
    onGpsError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000
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

  // Fallback to user's last recorded ride location if available, or default to Ghent
  let defaultLat = 51.0504;
  let defaultLng = 3.7378;

  if (state.activities && state.activities.length > 0) {
    const lastAct = state.activities.find(a => a.coordinates && a.coordinates.length > 0);
    if (lastAct) {
      defaultLat = lastAct.coordinates[0].lat;
      defaultLng = lastAct.coordinates[0].lng;
    }
  }

  // Create Leaflet Map Instance
  bcMap = L.map('bike-computer-map', {
    zoomControl: false,
    attributionControl: false
  }).setView([defaultLat, defaultLng], 14);

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
    // 1. Try IP Geolocation immediately for fast centering
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data && data.latitude && data.longitude) {
          if (bcMap && !selectedRouteCoords && !lastCoord) {
            bcMap.setView([data.latitude, data.longitude], 14);
          }
        }
      })
      .catch(err => console.warn("IP Geolocation lookup failed:", err));

    // 2. Try actual browser position as well
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
          timeout: 4000
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
  if (simGpsInterval) {
    clearInterval(simGpsInterval);
    simGpsInterval = null;
  }

  // Toggle buttons
  document.getElementById('btn-bc-pause').style.display = 'none';
  document.getElementById('bc-paused-controls').style.display = 'flex';
  
  showToast("Rit gepauzeerd", "info");
}

function resumeRideTracking() {
  if (!isRunning || !isPaused) return;

  isPaused = false;
  startTime = Date.now();

  // Resume GPS Watch
  startGpsWatch();

  // Toggle buttons
  document.getElementById('bc-paused-controls').style.display = 'none';
  document.getElementById('btn-bc-pause').style.display = 'flex';

  showToast("Rit hervat", "success");
}

// ─── 7. PAUSED STATE CONTROLS (Discard, Resume, Save) ───────────────────────
function setupPausedControls() {
  const discardBtn = document.getElementById('btn-bc-discard');
  const resumeBtn = document.getElementById('btn-bc-resume');
  const saveBtn = document.getElementById('btn-bc-save');

  if (discardBtn) {
    discardBtn.addEventListener('click', discardRideTracking);
  }
  if (resumeBtn) {
    resumeBtn.addEventListener('click', resumeRideTracking);
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', saveAndEndRide);
  }
}

function discardRideTracking() {
  if (!confirm("Wilt u deze rit annuleren? Alle opgenomen gegevens worden verwijderd.")) {
    return;
  }
  
  isRunning = false;
  isPaused = false;
  
  // Stop watch and timers
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (simGpsInterval) {
    clearInterval(simGpsInterval);
    simGpsInterval = null;
  }
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

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

  showToast("Rit geannuleerd", "info");
  exitBikeComputerMode();
}



async function saveAndEndRide() {
  isRunning = false;
  isPaused = false;
  
  // Stop watch and timers
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (simGpsInterval) {
    clearInterval(simGpsInterval);
    simGpsInterval = null;
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

  // Disconnect WebSocket Telemetry room
  import('./realtime.js').then(realtime => {
    realtime.disconnectTelemetry();
  });

  // Remove all companion markers from Leaflet map
  Object.keys(companionMarkers).forEach(userId => {
    const marker = companionMarkers[userId];
    if (marker) {
      if (marker._animationFrame) cancelAnimationFrame(marker._animationFrame);
      if (bcMap) marker.removeFrom(bcMap);
    }
  });
  companionMarkers = {};
  selectedRouteCoords = null;
  activeRouteCueSheet = null;

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
      ${!hasBle ? '<p style="color:#ef4444;font-size:12px;margin-bottom:10px;">⚠️ Web Bluetooth wordt niet ondersteund door uw browser. Gebruik Chrome op Android.</p>' : ''}
      <div style="background:rgba(var(--primary-rgb, 99,102,241),0.1);border:1px solid rgba(var(--primary-rgb, 99,102,241),0.3);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--text-muted);line-height:1.5;">
        💡 <strong>Tip:</strong> Zorg dat uw sensor <strong>aanstaat</strong> en in <strong>koppelmodus</strong> staat vóór u klikt.
        Polar-horloges: tik op het horloge → koppelmodus activeren. Na het klikken verschijnt een browservenster — selecteer hier uw sensor.
      </div>

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

// ─── Live Turn-by-Turn Navigatie Update ───────────
function updateLiveNavigation() {
  const banner = document.getElementById('bc-nav-banner');
  const instrEl = document.getElementById('bc-nav-instruction');
  const distToEl = document.getElementById('bc-nav-dist-to');
  const iconEl = document.getElementById('bc-nav-icon');
  
  if (!banner || !instrEl || !distToEl) return;
  
  if (!activeRouteCueSheet || activeRouteCueSheet.length === 0) {
    banner.style.display = 'none';
    return;
  }
  
  banner.style.display = 'flex';
  
  // Find first instruction whose target distance is greater than our current position
  const nextCue = activeRouteCueSheet.find(cue => cue.distanceKm > distanceKm);
  
  if (nextCue) {
    instrEl.textContent = nextCue.text;
    const distRemainingM = Math.round((nextCue.distanceKm - distanceKm) * 1000);
    
    if (distRemainingM <= 50) {
      distToEl.textContent = `Nu: ${nextCue.text}`;
      distToEl.style.color = 'var(--primary)';
    } else if (distRemainingM < 1000) {
      distToEl.textContent = `over ${distRemainingM}m`;
      distToEl.style.color = 'var(--text-muted)';
    } else {
      distToEl.textContent = `over ${(distRemainingM / 1000).toFixed(1)} km`;
      distToEl.style.color = 'var(--text-muted)';
    }
    
    // Choose appropriate emoji icon
    let icon = '🗺️';
    const textLower = nextCue.text.toLowerCase();
    if (textLower.includes('linksaf') || textLower.includes('bocht links')) icon = '⬅️';
    else if (textLower.includes('rechtsaf') || textLower.includes('bocht rechts')) icon = '➡️';
    else if (textLower.includes('rechtdoor')) icon = '⬆️';
    else if (textLower.includes('gravel')) icon = '⚠️';
    else if (textLower.includes('kasseien')) icon = '⚠️';
    else if (textLower.includes('aankomst') || textLower.includes('finish')) icon = '🏁';
    if (iconEl) iconEl.textContent = icon;
    
  } else {
    instrEl.textContent = '🏁 Bestemming bereikt';
    distToEl.textContent = '';
    if (iconEl) iconEl.textContent = '🏁';
  }
}
