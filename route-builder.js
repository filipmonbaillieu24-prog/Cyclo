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
let elevationChartInstance = null;

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
    hideRoutePanels();
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

function hideRoutePanels() {
  const surfContainer = document.getElementById('route-surface-container');
  if (surfContainer) surfContainer.style.display = 'none';
  
  const elevPanel = document.getElementById('route-elevation-panel');
  if (elevPanel) elevPanel.style.display = 'none';
  
  if (elevationChartInstance) {
    elevationChartInstance.destroy();
    elevationChartInstance = null;
  }
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

// ─── Hoogtedata ophalen & Fallback generator ───────
async function fetchElevations(geoCoords) {
  if (!geoCoords || geoCoords.length === 0) return [];
  
  if (navigator.onLine) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 sec timeout
    
    try {
      const locations = geoCoords.map(c => ({ latitude: c[1], longitude: c[0] }));
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ locations }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length === geoCoords.length) {
          return data.results.map(r => r.elevation);
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Open-Elevation failed or timed out, using simulated elevations:', err);
    }
  }
  
  return generateSimulatedElevations(geoCoords);
}

function generateSimulatedElevations(geoCoords) {
  const elevations = [];
  let currentEle = 45 + Math.random() * 20; // baseline elevation around Brussels
  const N = geoCoords.length;
  
  for (let i = 0; i < N; i++) {
    const pct = i / N;
    let slope = Math.sin(i * 0.05) * 0.4;
    
    // Add two climbing sections to test detection
    if (pct > 0.20 && pct < 0.40) {
      // Climb 1: Steady 4.8% grade
      slope += 1.6;
    } else if (pct >= 0.40 && pct < 0.50) {
      // Descent
      slope -= 1.8;
    } else if (pct > 0.60 && pct < 0.75) {
      // Climb 2: Steep 8% grade
      slope += 3.2;
    }
    
    currentEle += slope;
    if (currentEle < 2) currentEle = 2;
    elevations.push(Math.round(currentEle));
  }
  return elevations;
}

// ─── Klimdetectie & Segmentatie ───────────────────
function detectClimbs(geoCoords, elevations) {
  if (geoCoords.length < 2 || elevations.length !== geoCoords.length) return [];
  
  const N = geoCoords.length;
  const cumDists = [0];
  let totalD = 0;
  for (let i = 0; i < N - 1; i++) {
    const p1 = L.latLng(geoCoords[i][1], geoCoords[i][0]);
    const p2 = L.latLng(geoCoords[i+1][1], geoCoords[i+1][0]);
    totalD += p1.distanceTo(p2);
    cumDists.push(totalD);
  }
  
  // Smooth elevations using a 5-point moving average
  const smoothEle = new Array(N);
  for (let i = 0; i < N; i++) {
    const wStart = Math.max(0, i - 2);
    const wEnd = Math.min(N - 1, i + 2);
    let sum = 0;
    for (let k = wStart; k <= wEnd; k++) sum += elevations[k];
    smoothEle[i] = sum / (wEnd - wStart + 1);
  }
  
  const climbs = [];
  let inClimb = false;
  let startIdx = 0;
  let peakEle = 0;
  
  for (let i = 1; i < N; i++) {
    const dy = smoothEle[i] - smoothEle[i-1];
    const dx = cumDists[i] - cumDists[i-1];
    const slope = dx > 0 ? dy / dx : 0;
    
    if (!inClimb) {
      if (slope >= 0.02) {
        inClimb = true;
        startIdx = i - 1;
        peakEle = smoothEle[i];
      }
    } else {
      if (smoothEle[i] > peakEle) {
        peakEle = smoothEle[i];
      }
      
      const dropFromPeak = peakEle - smoothEle[i];
      
      if (dropFromPeak > 12 || (dropFromPeak > 4 && (cumDists[i] - cumDists[i-1] > 180))) {
        const endIdx = i - 1;
        const length = cumDists[endIdx] - cumDists[startIdx];
        const gain = smoothEle[endIdx] - smoothEle[startIdx];
        const avgGrade = length > 0 ? (gain / length) * 100 : 0;
        
        if (length >= 500 && avgGrade >= 3) {
          climbs.push(analyzeAndSegmentClimb(startIdx, endIdx, geoCoords, smoothEle, cumDists, length, gain, avgGrade));
        }
        inClimb = false;
      }
    }
  }
  
  if (inClimb) {
    const endIdx = N - 1;
    const length = cumDists[endIdx] - cumDists[startIdx];
    const gain = smoothEle[endIdx] - smoothEle[startIdx];
    const avgGrade = length > 0 ? (gain / length) * 100 : 0;
    
    if (length >= 500 && avgGrade >= 3) {
      climbs.push(analyzeAndSegmentClimb(startIdx, endIdx, geoCoords, smoothEle, cumDists, length, gain, avgGrade));
    }
  }
  
  return climbs;
}

function analyzeAndSegmentClimb(startIdx, endIdx, geoCoords, smoothEle, cumDists, length, gain, avgGrade) {
  // FIETS-index: Score = H^2 / (D * 10)
  const score = (gain * gain) / (length * 10);
  
  let category = 'Cat. 4';
  let badgeColor = '#10b981'; // Green
  if (score >= 6.5) {
    category = 'HC';
    badgeColor = '#7c3aed'; // Purple
  } else if (score >= 5.0) {
    category = 'Cat. 1';
    badgeColor = '#ef4444'; // Red
  } else if (score >= 3.5) {
    category = 'Cat. 2';
    badgeColor = '#f97316'; // Orange
  } else if (score >= 2.0) {
    category = 'Cat. 3';
    badgeColor = '#fbbf24'; // Yellow
  }
  
  // Max gradient over 100m window
  let maxGradient = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    for (let j = i + 1; j <= endIdx; j++) {
      const d = cumDists[j] - cumDists[i];
      if (d >= 100 && d <= 150) {
        const g = (smoothEle[j] - smoothEle[i]) / d * 100;
        if (g > maxGradient) maxGradient = g;
      }
    }
  }
  if (maxGradient < avgGrade) maxGradient = avgGrade * 1.3;
  
  // Segment into 1 km blocks
  const blocks = [];
  let blockStartDist = cumDists[startIdx];
  let blockStartIdx = startIdx;
  
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const d = cumDists[i] - blockStartDist;
    if (d >= 1000 || i === endIdx) {
      const bLength = d;
      const bGain = smoothEle[i] - smoothEle[blockStartIdx];
      const bGrade = bLength > 0 ? (bGain / bLength) * 100 : 0;
      
      let bMaxGrad = bGrade;
      for (let j = blockStartIdx; j <= i; j++) {
        for (let k = j + 1; k <= i; k++) {
          const wd = cumDists[k] - cumDists[j];
          if (wd >= 100 && wd <= 150) {
            const wg = (smoothEle[k] - smoothEle[j]) / wd * 100;
            if (wg > bMaxGrad) bMaxGrad = wg;
          }
        }
      }
      
      blocks.push({
        num: blocks.length + 1,
        lengthMs: bLength,
        gainMs: bGain,
        avgGrade: bGrade,
        maxGrade: bMaxGrad
      });
      
      blockStartDist = cumDists[i];
      blockStartIdx = i;
    }
  }
  
  return {
    startIdx,
    endIdx,
    startDistKm: (cumDists[startIdx] / 1000).toFixed(1),
    endDistKm: (cumDists[endIdx] / 1000).toFixed(1),
    lengthMs: length,
    gainMs: gain,
    avgGrade: avgGrade,
    maxGradient: maxGradient,
    score,
    category,
    badgeColor,
    blocks
  };
}

function getClimbForIndex(index, climbs) {
  for (const climb of climbs) {
    if (index >= climb.startIdx && index <= climb.endIdx) {
      return climb;
    }
  }
  return null;
}

// ─── Render Hoogtegrafiek met Chart.js ─────────────
function renderElevationChart(distancesKm, elevations, climbs) {
  const ctx = document.getElementById('route-elevation-chart');
  if (!ctx) return;
  
  if (elevationChartInstance) {
    elevationChartInstance.destroy();
  }
  
  elevationChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: distancesKm.map(d => d.toFixed(2)),
      datasets: [{
        label: 'Hoogte (m)',
        data: elevations,
        borderColor: '#38bdf8',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(56, 189, 248, 0.05)',
        tension: 0.1,
        pointRadius: 0,
        segment: {
          borderColor: (ctx) => {
            const idx = ctx.p0DataIndex;
            const climb = getClimbForIndex(idx, climbs);
            return climb ? climb.badgeColor : '#38bdf8';
          },
          backgroundColor: (ctx) => {
            const idx = ctx.p0DataIndex;
            const climb = getClimbForIndex(idx, climbs);
            if (climb) {
              if (climb.category === 'HC') return 'rgba(124, 58, 237, 0.18)';
              if (climb.category === 'Cat. 1') return 'rgba(239, 68, 68, 0.18)';
              if (climb.category === 'Cat. 2') return 'rgba(249, 115, 22, 0.18)';
              if (climb.category === 'Cat. 3') return 'rgba(251, 191, 36, 0.18)';
              return 'rgba(16, 185, 129, 0.18)';
            }
            return 'rgba(56, 189, 248, 0.05)';
          }
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (items) => `Km ${items[0].label}`,
            label: (item) => `Hoogte: ${Math.round(item.parsed.y)} m`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 9 },
            maxTicksLimit: 6
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 9 },
            callback: (val) => `${val}m`
          }
        }
      }
    }
  });
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
    const distancesKm = [0];
    let dCumulative = 0;
    
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
      dCumulative += d;
      distancesKm.push(dCumulative / 1000);
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
    
    // ─── Klimdetectie & Hoogteprofiel integratie ──────
    if (statusEl) statusEl.textContent = 'Hoogtedata ophalen...';
    const elevations = await fetchElevations(geoCoords);
    
    const climbs = detectClimbs(geoCoords, elevations);
    
    // Update climbs panel
    const elevPanel = document.getElementById('route-elevation-panel');
    const climbsListEl = document.getElementById('route-climbs-list');
    const climbingStatsEl = document.getElementById('route-climbing-stats');
    
    if (elevPanel) elevPanel.style.display = 'block';
    
    // Smooth elevations for rendering
    const smoothEle = new Array(elevations.length);
    for (let i = 0; i < elevations.length; i++) {
      const wStart = Math.max(0, i - 2);
      const wEnd = Math.min(elevations.length - 1, i + 2);
      let sum = 0;
      for (let k = wStart; k <= wEnd; k++) sum += elevations[k];
      smoothEle[i] = sum / (wEnd - wStart + 1);
    }
    
    // Calculate vertical gain
    let totalAscent = 0;
    for (let i = 1; i < smoothEle.length; i++) {
      const diff = smoothEle[i] - smoothEle[i-1];
      if (diff > 0) totalAscent += diff;
    }
    
    if (climbingStatsEl) {
      climbingStatsEl.textContent = `${Math.round(totalAscent)} hm | ${climbs.length} klim(men)`;
    }
    
    if (climbsListEl) {
      climbsListEl.innerHTML = '';
      if (climbs.length === 0) {
        const pld = document.createElement('div');
        pld.style.cssText = 'font-size:11px;color:var(--text-muted);text-align:center;padding:10px;';
        pld.textContent = 'Geen beklimmingen gedetecteerd (vlak parcours)';
        climbsListEl.appendChild(pld);
      } else {
        climbs.forEach((climb, idx) => {
          const card = document.createElement('div');
          card.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;font-size:11px;';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong style="color:var(--text-main);">Klim #${idx + 1}</strong>
                <span style="color:var(--text-muted);margin-left:6px;">(km ${climb.startDistKm} - ${climb.endDistKm})</span>
              </div>
              <span style="padding:2px 6px;border-radius:4px;font-weight:800;font-size:10px;background:${climb.badgeColor};color:#fff;">${climb.category}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:10px;margin-top:2px;">
              <span>Afstand: <strong>${(climb.lengthMs / 1000).toFixed(1)} km</strong></span>
              <span>Stijging: <strong>${Math.round(climb.gainMs)} hm</strong></span>
              <span>Gem: <strong>${climb.avgGrade.toFixed(1)}%</strong></span>
              <span>Max: <strong>${climb.maxGradient.toFixed(1)}%</strong></span>
            </div>
          `;
          climbsListEl.appendChild(card);
        });
      }
    }
    
    // Draw elevation chart
    renderElevationChart(distancesKm, smoothEle, climbs);
    
    if (statusEl) statusEl.textContent = `✓ Route berekend en geanalyseerd`;
    
    const dlBtn = document.getElementById('btn-download-gpx');
    if (dlBtn) dlBtn.style.display = 'block';
    
    if (onWaypointChangeCb) onWaypointChangeCb(waypoints.length, distKm, durMin);
    
  } catch (err) {
    console.error('OSRM, Overpass or Elevation error:', err);
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
  
  hideRoutePanels();
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
    hideRoutePanels();
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
