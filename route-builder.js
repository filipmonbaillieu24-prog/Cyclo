// Cyclo - Interactieve Route Bouwer
// Gebruikt Leaflet + OSRM (OpenStreetMap Routing Machine) voor fietsroutes
// GPX export compatibel met Garmin Edge, Wahoo ELEMNT, Hammerhead Karoo

import { showToast } from './state.js';

const OSRM_BIKE_URL = 'https://router.project-osrm.org/route/v1/cycling';

let builderMap = null;
let waypoints  = [];
let routeLayer = null;
let waypointMarkers = [];
let currentRoute = null;
let onWaypointChangeCb = null;

// ─── Initialiseer de route-bouwer kaart ───────────
export function initRouteBuilder(containerId, options = {}) {
  onWaypointChangeCb = options.onWaypointChange || null;
  if (builderMap) {
    builderMap.remove();
    builderMap = null;
  }
  
  waypoints = [];
  waypointMarkers = [];
  routeLayer = null;
  currentRoute = null;
  
  const container = document.getElementById(containerId);
  if (!container) return;

  builderMap = L.map(containerId, {
    center: [50.85, 4.35], // België standaard
    zoom: 11,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(builderMap);

  // Klik op kaart = waypoint toevoegen
  builderMap.on('click', (e) => addWaypoint(e.latlng));
  
  updateBuilderUI();
}

// ─── Voeg waypoint toe ────────────────────────────
function addWaypoint(latlng) {
  const idx = waypoints.length;
  waypoints.push(latlng);
  
  // Marker stijl: start=groen, eind=rood, tussen=geel
  const isStart = idx === 0;
  const color   = isStart ? '#4caf50' : '#d4ff00';
  const label   = isStart ? 'S' : String(idx);
  
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;background:${color};border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#000;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
  
  const marker = L.marker(latlng, { icon, draggable: true }).addTo(builderMap);
  
  marker.on('dragend', () => {
    waypoints[idx] = marker.getLatLng();
    calculateRoute();
  });
  
  marker.on('contextmenu', () => {
    // Rechts-klik = verwijder waypoint
    removeWaypoint(idx);
  });
  
  waypointMarkers.push(marker);
  updateLastMarker();
  
  if (waypoints.length >= 2) calculateRoute();
  updateBuilderUI();
}

function updateLastMarker() {
  // Markeer het laatste punt als eindpunt (rood)
  const n = waypointMarkers.length;
  if (n >= 2) {
    const lastMarker = waypointMarkers[n - 1];
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:#ff5252;border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">E</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    lastMarker.setIcon(icon);
    // Herstel vorige eindpunt naar geel als het niet het startpunt is
    if (n >= 3) {
      const prevMarker = waypointMarkers[n - 2];
      const prevIcon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;background:#d4ff00;border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#000;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${n - 2}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      prevMarker.setIcon(prevIcon);
    }
  }
}

function removeWaypoint(idx) {
  waypoints.splice(idx, 1);
  waypointMarkers[idx].remove();
  waypointMarkers.splice(idx, 1);
  if (waypoints.length >= 2) calculateRoute();
  else if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  updateBuilderUI();
}

// ─── Bereken route via OSRM ───────────────────────
async function calculateRoute() {
  if (waypoints.length < 2) return;
  
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url    = `${OSRM_BIKE_URL}/${coords}?overview=full&geometries=geojson&steps=false`;
  
  const statusEl = document.getElementById('route-builder-status');
  if (statusEl) statusEl.textContent = 'Route berekenen...';
  
  try {
    const res  = await fetch(url);
    const data = await res.json();
    
    if (data.code !== 'Ok' || !data.routes?.length) {
      if (statusEl) statusEl.textContent = 'Geen route gevonden.';
      return;
    }
    
    const route = data.routes[0];
    const geoCoords = route.geometry.coordinates; // [lng, lat]
    
    // Verwijder vorige route laag
    if (routeLayer) routeLayer.remove();
    
    // Teken route op kaart
    const latlngs = geoCoords.map(c => [c[1], c[0]]);
    routeLayer = L.polyline(latlngs, {
      color: '#d4ff00',
      weight: 4,
      opacity: 0.85
    }).addTo(builderMap);
    
    builderMap.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
    
    const distKm = (route.distance / 1000);
    const durMin  = route.duration / 60;
    currentRoute = {
      coordinates: geoCoords.map(c => ({ lat: c[1], lng: c[0] })),
      distanceKm: distKm.toFixed(1),
      durationMin: Math.round(durMin),
      name: document.getElementById('route-name-input')?.value || 'Mijn Route'
    };
    
    // Update UI
    const distEl = document.getElementById('route-distance');
    const timeEl = document.getElementById('route-duration');
    if (distEl) distEl.textContent = `${distKm.toFixed(1)} km`;
    if (timeEl) timeEl.textContent = `~${Math.round(durMin)} min`;
    if (statusEl) statusEl.textContent = `✓ Route: ${distKm.toFixed(1)} km`;
    
    const dlBtn = document.getElementById('btn-download-gpx');
    if (dlBtn) dlBtn.style.display = 'block';
    
    // Callback naar app.js
    if (onWaypointChangeCb) onWaypointChangeCb(waypoints.length, distKm, durMin);
    
  } catch (err) {
    console.error('OSRM error:', err);
    if (statusEl) statusEl.textContent = 'Routefout — probeer opnieuw.';
  }
}

// ─── GPX Export ───────────────────────────────────
export function downloadRouteAsGpx(routeName) {
  if (!currentRoute || !currentRoute.coordinates.length) {
    showToast('Teken eerst een route op de kaart.', 'error');
    return;
  }
  
  const name = routeName || document.getElementById('route-name-input')?.value || currentRoute.name || 'Cyclo Route';
  const now  = new Date().toISOString();
  
  const trkpts = currentRoute.coordinates
    .map(c => `    <trkpt lat="${c.lat}" lon="${c.lng}"></trkpt>`)
    .join('\n');
  
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cyclo App" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${name.replace(/\s+/g, '_')}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast(`Route gedownload: ${name}.gpx`, 'success');
}

export function clearRoute() {
  waypoints.forEach((_, i) => waypointMarkers[i]?.remove());
  waypoints = [];
  waypointMarkers = [];
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  currentRoute = null;
  updateBuilderUI();
}

export function undoLastWaypoint() {
  if (waypoints.length === 0) return;
  const idx = waypoints.length - 1;
  waypointMarkers[idx].remove();
  waypoints.splice(idx, 1);
  waypointMarkers.splice(idx, 1);
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  if (waypoints.length >= 2) calculateRoute();
  updateBuilderUI();
}

function updateBuilderUI() {
  const wayptCount = document.getElementById('route-waypoint-count');
  const undoBtn    = document.getElementById('btn-undo-waypoint');
  const clearBtn   = document.getElementById('btn-clear-route');
  
  if (wayptCount) wayptCount.textContent = waypoints.length;
  if (undoBtn)    undoBtn.disabled = waypoints.length === 0;
  if (clearBtn)   clearBtn.disabled = waypoints.length === 0;

  // Callback zonder route data (bij wissen / undo)
  if (onWaypointChangeCb && (!currentRoute || waypoints.length < 2)) {
    onWaypointChangeCb(waypoints.length, 0, 0);
  }
}
