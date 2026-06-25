// Cyclo - Interactieve Route Bouwer
// Gebruikt Leaflet + OSRM (OpenStreetMap Routing Machine) voor fietsroutes
// GPX export compatibel met Garmin Edge, Wahoo ELEMNT, Hammerhead Karoo

import { showToast } from './state.js';

const OSRM_BIKE_URL = 'https://router.project-osrm.org/route/v1/cycling';

const SURFACE_COLORS = {
  asphalt: '#38bdf8',    // Sky Blue
  gravel: '#fb923c',     // Warm Orange
  cobblestone: '#ef4444',// Red
  cycleway: '#4ade80'    // Bright Green
};

let builderMap = null;
let waypoints  = [];
let routeLayer = null; // Leaflet FeatureGroup for multi-colored polylines
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
  
  // Maak feature group voor route segmenten
  routeLayer = L.featureGroup().addTo(builderMap);
  
  updateBuilderUI();
}

// ─── Voeg waypoint toe ────────────────────────────
function addWaypoint(latlng) {
  const idx = waypoints.length;
  waypoints.push(latlng);
  
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
    removeWaypoint(idx);
  });
  
  waypointMarkers.push(marker);
  updateLastMarker();
  
  if (waypoints.length >= 2) calculateRoute();
  updateBuilderUI();
}

function updateLastMarker() {
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
  if (routeLayer) routeLayer.clearLayers();
  
  reindexMarkers();
  
  if (waypoints.length >= 2) {
    calculateRoute();
  } else {
    currentRoute = null;
    const container = document.getElementById('route-surface-container');
    if (container) container.style.display = 'none';
    updateBuilderUI();
  }
}

function reindexMarkers() {
  waypointMarkers.forEach((marker, idx) => {
    const isStart = idx === 0;
    const isEnd = idx === waypointMarkers.length - 1;
    const color = isStart ? '#4caf50' : (isEnd ? '#ff5252' : '#d4ff00');
    const label = isStart ? 'S' : (isEnd ? 'E' : String(idx));
    const textColor = isEnd ? '#fff' : '#000';
    
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:${color};border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:${textColor};box-shadow:0 2px 6px rgba(0,0,0,0.4);">${label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    marker.setIcon(icon);
    
    marker.off('dragend');
    marker.on('dragend', () => {
      waypoints[idx] = marker.getLatLng();
      calculateRoute();
    });
    
    marker.off('contextmenu');
    marker.on('contextmenu', () => {
      removeWaypoint(idx);
    });
  });
}

// ─── Oppervlakte Classificatie & Overpass ──────────
function classifySurface(tags) {
  if (!tags) return 'asphalt';
  const highway = (tags.highway || '').toLowerCase();
  const surface = (tags.surface || '').toLowerCase();
  
  if (highway === 'cycleway' || (highway === 'path' && tags.bicycle === 'designated')) {
    return 'cycleway';
  }
  if (surface.includes('cobblestone') || surface === 'sett' || surface === 'pebblestone') {
    return 'cobblestone';
  }
  
  const gravelTypes = ['gravel', 'unpaved', 'fine_gravel', 'dirt', 'earth', 'grass', 'compacted', 'ground', 'wood', 'sand'];
  if (gravelTypes.includes(surface) || surface.includes('dirt') || surface.includes('sand')) {
    return 'gravel';
  }
  
  return 'asphalt';
}

// ─── Bereken route via OSRM ───────────────────────
async function calculateRoute() {
  if (waypoints.length < 2) return;
  
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url    = `${OSRM_BIKE_URL}/${coords}?overview=full&geometries=geojson&steps=false&annotations=nodes`;
  
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
    
    if (routeLayer) routeLayer.clearLayers();
    
    if (statusEl) statusEl.textContent = 'Wegdek analyseren...';
    
    // Map coordinates to OSM Node IDs returned by OSRM annotations
    const mappedNodes = [];
    if (route.legs) {
      route.legs.forEach((leg, legIdx) => {
        const legNodes = leg.annotation?.nodes || [];
        if (legIdx === 0) {
          mappedNodes.push(null); // start
        }
        legNodes.forEach(node => mappedNodes.push(node));
        mappedNodes.push(null); // end
      });
    }
    
    // Query OSM Overpass API to get way tags for these nodes
    const nodeToTags = new Map();
    const uniqueNodes = [...new Set(mappedNodes)].filter(id => id !== null && id !== undefined && !isNaN(id));
    
    if (uniqueNodes.length > 0 && navigator.onLine) {
      try {
        const query = `[out:json][timeout:15];node(id:${uniqueNodes.join(',')});way(bn);out body;`;
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        if (overpassRes.ok) {
          const overpassData = await overpassRes.json();
          if (overpassData.elements) {
            for (const el of overpassData.elements) {
              if (el.type === 'way' && el.nodes && el.tags) {
                for (const nodeId of el.nodes) {
                  const existing = nodeToTags.get(nodeId);
                  if (!existing || (!existing.surface && el.tags.surface)) {
                    nodeToTags.set(nodeId, el.tags);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Overpass fetch failed:', err);
      }
    }
    
    // Determine surface type for each point on the route
    const pointSurfaces = [];
    for (let i = 0; i < geoCoords.length; i++) {
      const nodeId = mappedNodes[i];
      if (nodeId && nodeToTags.has(nodeId)) {
        pointSurfaces.push(classifySurface(nodeToTags.get(nodeId)));
      } else {
        pointSurfaces.push(null);
      }
    }
    
    // Propagate known surface types to fill null values
    let lastKnown = 'asphalt';
    for (let i = 0; i < pointSurfaces.length; i++) {
      if (pointSurfaces[i]) {
        lastKnown = pointSurfaces[i];
        break;
      }
    }
    for (let i = 0; i < pointSurfaces.length; i++) {
      if (!pointSurfaces[i]) {
        pointSurfaces[i] = lastKnown;
      } else {
        lastKnown = pointSurfaces[i];
      }
    }
    
    // Draw multi-colored polyline segments
    let currentRun = [ [geoCoords[0][1], geoCoords[0][0]] ];
    let currentType = pointSurfaces[0];
    
    for (let i = 1; i < geoCoords.length; i++) {
      const pt = [geoCoords[i][1], geoCoords[i][0]];
      const type = pointSurfaces[i];
      currentRun.push(pt);
      
      if (type !== currentType || i === geoCoords.length - 1) {
        L.polyline(currentRun, {
          color: SURFACE_COLORS[currentType] || SURFACE_COLORS.asphalt,
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(routeLayer);
        
        currentRun = [pt];
        currentType = type;
      }
    }
    
    // Fit bounds of the layer group
    if (routeLayer.getLayers().length > 0) {
      builderMap.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
    }
    
    // Calculate distance-weighted breakdown
    let totalDist = 0;
    const distByType = { asphalt: 0, gravel: 0, cobblestone: 0, cycleway: 0 };
    
    for (let i = 0; i < geoCoords.length - 1; i++) {
      const p1 = L.latLng(geoCoords[i][1], geoCoords[i][0]);
      const p2 = L.latLng(geoCoords[i+1][1], geoCoords[i+1][0]);
      const d = p1.distanceTo(p2);
      
      const type = pointSurfaces[i+1] || 'asphalt';
      if (distByType.hasOwnProperty(type)) {
        distByType[type] += d;
      } else {
        distByType.asphalt += d;
      }
      totalDist += d;
    }
    
    const distKm = (route.distance / 1000);
    const durMin  = route.duration / 60;
    currentRoute = {
      coordinates: geoCoords.map(c => ({ lat: c[1], lng: c[0] })),
      distanceKm: distKm.toFixed(1),
      durationMin: Math.round(durMin),
      name: document.getElementById('route-name-input')?.value || 'Mijn Route'
    };
    
    // Update stats UI
    const distEl = document.getElementById('route-distance');
    const timeEl = document.getElementById('route-duration');
    if (distEl) distEl.textContent = `${distKm.toFixed(1)} km`;
    if (timeEl) timeEl.textContent = `~${Math.round(durMin)} min`;
    if (statusEl) statusEl.textContent = `✓ Route berekend en geanalyseerd`;
    
    // Render progress bar breakdown
    const container = document.getElementById('route-surface-container');
    const statsEl = document.getElementById('route-surface-stats');
    const barEl = document.getElementById('route-surface-bar');
    
    if (container && statsEl && barEl) {
      if (totalDist > 0) {
        container.style.display = 'block';
        barEl.innerHTML = '';
        
        const labels = [];
        const typesOrdered = ['asphalt', 'gravel', 'cobblestone', 'cycleway'];
        const nameMap = {
          asphalt: 'Asfalt',
          gravel: 'Gravel',
          cobblestone: 'Kasseien',
          cycleway: 'Fietspad'
        };
        
        typesOrdered.forEach(t => {
          const dist = distByType[t];
          if (dist > 0) {
            const pct = Math.round((dist / totalDist) * 100);
            if (pct > 0) {
              labels.push(`${pct}% ${nameMap[t]}`);
              
              const segment = document.createElement('div');
              segment.style.width = `${pct}%`;
              segment.style.backgroundColor = SURFACE_COLORS[t];
              segment.style.height = '100%';
              segment.title = `${nameMap[t]}: ${pct}% (${(dist/1000).toFixed(1)} km)`;
              barEl.appendChild(segment);
            }
          }
        });
        
        statsEl.textContent = labels.join(', ');
      } else {
        container.style.display = 'none';
      }
    }
    
    const dlBtn = document.getElementById('btn-download-gpx');
    if (dlBtn) dlBtn.style.display = 'block';
    
    if (onWaypointChangeCb) onWaypointChangeCb(waypoints.length, distKm, durMin);
    
  } catch (err) {
    console.error('OSRM or Overpass error:', err);
    if (statusEl) statusEl.textContent = 'Fout bij analyse — probeer opnieuw.';
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
  if (routeLayer) routeLayer.clearLayers();
  currentRoute = null;
  
  const container = document.getElementById('route-surface-container');
  if (container) container.style.display = 'none';
  
  updateBuilderUI();
}

export function undoLastWaypoint() {
  if (waypoints.length === 0) return;
  const idx = waypoints.length - 1;
  waypointMarkers[idx].remove();
  waypoints.splice(idx, 1);
  waypointMarkers.splice(idx, 1);
  if (routeLayer) routeLayer.clearLayers();
  
  if (waypoints.length >= 2) {
    calculateRoute();
  } else {
    currentRoute = null;
    const container = document.getElementById('route-surface-container');
    if (container) container.style.display = 'none';
    updateBuilderUI();
  }
}

// ─── GPX Import & Downsampling ────────────────────
function downsampleCoords(coords, maxPoints = 15) {
  if (coords.length <= maxPoints) return coords;
  
  // Calculate total length along the track
  let totalLength = 0;
  const dists = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = L.latLng(coords[i].lat, coords[i].lng);
    const p2 = L.latLng(coords[i+1].lat, coords[i+1].lng);
    const d = p1.distanceTo(p2);
    totalLength += d;
    dists.push(totalLength);
  }
  
  const step = totalLength / (maxPoints - 1);
  const result = [coords[0]];
  
  let targetDist = step;
  for (let i = 1; i < coords.length - 1; i++) {
    if (dists[i] >= targetDist) {
      result.push(coords[i]);
      targetDist += step;
    }
  }
  
  result.push(coords[coords.length - 1]);
  return result;
}

export function importGpxRoute(gpxText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
  const trkpts = xmlDoc.querySelectorAll('trkpt');
  
  const coords = [];
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lng = parseFloat(pt.getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lng)) {
      coords.push({ lat, lng });
    }
  });
  
  if (coords.length < 2) {
    showToast('Geen geldige GPS-coördinaten gevonden in GPX.', 'error');
    return;
  }
  
  // Find route name
  const nameNode = xmlDoc.querySelector('trk > name') || xmlDoc.querySelector('name');
  const routeName = nameNode ? nameNode.textContent.trim() : 'Geïmporteerde Route';
  const nameInput = document.getElementById('route-name-input');
  if (nameInput) nameInput.value = routeName;
  
  // Clear any existing route
  clearRoute();
  
  // Downsample to max 15 points
  const downsampled = downsampleCoords(coords, 15);
  
  // Place markers
  downsampled.forEach((pt, idx) => {
    const isStart = idx === 0;
    const isEnd = idx === downsampled.length - 1;
    const color = isStart ? '#4caf50' : (isEnd ? '#ff5252' : '#d4ff00');
    const label = isStart ? 'S' : (isEnd ? 'E' : String(idx));
    const textColor = isEnd ? '#fff' : '#000';
    
    const latlng = L.latLng(pt.lat, pt.lng);
    waypoints.push(latlng);
    
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:${color};border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:${textColor};box-shadow:0 2px 6px rgba(0,0,0,0.4);">${label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    
    const marker = L.marker(latlng, { icon, draggable: true }).addTo(builderMap);
    
    marker.on('dragend', () => {
      waypoints[idx] = marker.getLatLng();
      calculateRoute();
    });
    
    marker.on('contextmenu', () => {
      removeWaypoint(idx);
    });
    
    waypointMarkers.push(marker);
  });
  
  calculateRoute();
  updateBuilderUI();
  
  showToast(`GPX geïmporteerd: ${routeName}`, 'success');
}

function updateBuilderUI() {
  const wayptCount = document.getElementById('route-waypoint-count');
  const undoBtn    = document.getElementById('btn-undo-waypoint');
  const clearBtn   = document.getElementById('btn-clear-route');
  
  if (wayptCount) wayptCount.textContent = waypoints.length;
  if (undoBtn)    undoBtn.disabled = waypoints.length === 0;
  if (clearBtn)   clearBtn.disabled = waypoints.length === 0;

  if (onWaypointChangeCb && (!currentRoute || waypoints.length < 2)) {
    onWaypointChangeCb(waypoints.length, 0, 0);
  }
}
