// Cyclo - Group Rides Module
import { state, elements, config, showToast } from './state.js';

// ─────────────────────────────────────────────
//  Weer API (Open-Meteo, gratis, geen key)
// ─────────────────────────────────────────────
const WMO_CODES = {
  0: { label: 'Helder', emoji: '☀️' },
  1: { label: 'Overwegend helder', emoji: '🌤️' },
  2: { label: 'Bewolkt', emoji: '⛅' },
  3: { label: 'Bewolkt', emoji: '☁️' },
  45: { label: 'Mist', emoji: '🌫️' },
  48: { label: 'Rijp', emoji: '🌫️' },
  51: { label: 'Lichte motregen', emoji: '🌦️' },
  53: { label: 'Motregen', emoji: '🌧️' },
  55: { label: 'Zware motregen', emoji: '🌧️' },
  61: { label: 'Lichte regen', emoji: '🌦️' },
  63: { label: 'Regen', emoji: '🌧️' },
  65: { label: 'Zware regen', emoji: '🌧️' },
  71: { label: 'Lichte sneeuw', emoji: '🌨️' },
  73: { label: 'Sneeuw', emoji: '❄️' },
  75: { label: 'Zware sneeuw', emoji: '❄️' },
  80: { label: 'Regenbui', emoji: '🌦️' },
  81: { label: 'Regenbui', emoji: '🌧️' },
  82: { label: 'Zware bui', emoji: '⛈️' },
  85: { label: 'Sneeuwbui', emoji: '🌨️' },
  95: { label: 'Onweer', emoji: '⛈️' },
  99: { label: 'Onweer + hagel', emoji: '⛈️' }
};

const WEATHER_CACHE_KEY = 'cyclo_weather_cache';
const WEATHER_CACHE_TTL = 60 * 60 * 1000; // 1 uur

async function fetchWeatherForDate(dateStr) {
  // Cache check
  try {
    const cache = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || '{}');
    const cached = cache[dateStr];
    if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL) return cached.data;
  } catch(_) {}

  // Belgisch gemiddelde coördinaten (Brussel)
  const lat = 50.85;
  const lon = 4.35;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Europe/Brussels&start_date=${dateStr}&end_date=${dateStr}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.daily;
    if (!d || !d.time || !d.time[0]) return null;

    const data = {
      code: d.weathercode[0],
      maxTemp: Math.round(d.temperature_2m_max[0]),
      minTemp: Math.round(d.temperature_2m_min[0]),
      precip: d.precipitation_probability_max[0],
      wind: Math.round(d.windspeed_10m_max[0])
    };

    // Sla op in cache
    try {
      const cache = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || '{}');
      cache[dateStr] = { ts: Date.now(), data };
      // Max 30 dagen cache bijhouden
      const keys = Object.keys(cache);
      if (keys.length > 30) delete cache[keys[0]];
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
    } catch(_) {}

    return data;
  } catch(e) {
    console.warn('Weer ophalen mislukt:', e.message);
    return null;
  }
}

function renderWeatherBadge(weather) {
  if (!weather) return '';
  const wmo = WMO_CODES[weather.code] || { label: '?', emoji: '🌡️' };
  return `
    <div class="weather-badge">
      <span class="weather-emoji">${wmo.emoji}</span>
      <span class="weather-temp">${weather.maxTemp}°</span>
      <span class="weather-detail">${weather.precip}% regen · ${weather.wind} km/u wind</span>
    </div>`;
}

// ─────────────────────────────────────────────
//  Moeilijkheidsgraad
// ─────────────────────────────────────────────
function getDifficultyBadge(distKm, ascentM) {
  if (!distKm) return '';
  const dist = parseFloat(distKm);
  const asc = parseInt(ascentM || 0);
  let level, color;
  if (dist < 40 && asc < 300) { level = 'Rustig'; color = '#4caf50'; }
  else if (dist < 80 && asc < 800) { level = 'Matig'; color = '#ff9800'; }
  else if (dist < 130 && asc < 1500) { level = 'Pittig'; color = '#f44336'; }
  else { level = 'Zwaar'; color = '#9c27b0'; }
  return `<span class="difficulty-badge" style="background:${color}20;border-color:${color}50;color:${color};">${level}</span>`;
}

// ─────────────────────────────────────────────
//  iCal export
// ─────────────────────────────────────────────
export function exportRideToIcal(ride) {
  const dateStr = ride.date.replace(/-/g, '');
  const dtStart = `${dateStr}T090000`;
  const dtEnd = `${dateStr}T120000`;
  const uid = `cyclo-${ride.id}@cyclo-app.be`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const desc = (ride.description || '').replace(/\n/g, '\\n').substring(0, 200);
  const url = ride.route_link ? `\nURL:${ride.route_link}` : '';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cyclo App//NL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART;TZID=Europe/Brussels:${dtStart}`,
    `DTEND;TZID=Europe/Brussels:${dtEnd}`,
    `DTSTAMP:${now}`,
    `UID:${uid}`,
    `SUMMARY:🚴 ${ride.title}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:Cyclo Groepsrit${url}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `cyclo-${ride.title.replace(/\s+/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  showToast('iCal gedownload! Importeer in je kalender-app.', 'success');
}

// Edit-modus: sla rit-id op als we bewerken in plaats van aanmaken
let editingRideId = null;

export async function renderRidesList() {
  elements.ridesListContainer.innerHTML = '';

  if (state.rides.length === 0) {
    elements.ridesListContainer.innerHTML = `
      <div class="empty-state">
        Er zijn nog geen ritten gepland voor deze maand.
      </div>
    `;
    return;
  }

  const sortedRides = [...state.rides].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Haal weer op voor alle ritten (parallel)
  const today = new Date().toISOString().split('T')[0];
  const weatherMap = {};
  await Promise.all(sortedRides.map(async ride => {
    if (ride.date >= today) {
      weatherMap[ride.date] = await fetchWeatherForDate(ride.date);
    }
  }));

  sortedRides.forEach(ride => {
    const rideDiv = document.createElement('div');
    rideDiv.classList.add('ride-item');

    const opt = { day: 'numeric', month: 'long', weekday: 'long' };
    const dateFormatted = new Intl.DateTimeFormat('nl-NL', opt).format(new Date(ride.date));

    let rideParticipants = [];
    if (config.isDemoMode) {
      rideParticipants = ride.participants || [];
    } else {
      rideParticipants = ride.ride_participants ? ride.ride_participants.map(p => p.user_id) : [];
    }

    const maxPart = ride.max_participants || null;
    const isFull = maxPart && rideParticipants.length >= maxPart;
    const isParticipating = state.user ? rideParticipants.includes(state.user.id) : false;
    const isCreator = state.user && ride.created_by === state.user.id;

    // Deelnemers-avatars (overlappend)
    let avatarsHtml = rideParticipants.map(userId => {
      const p = state.profiles.find(prof => prof.id === userId);
      return p ? `<img src="${p.avatar_url}" alt="${p.full_name}" class="avatar participant-avatar" title="${p.full_name}">` : '';
    }).join('');

    // Route badge
    let routeHtml = '';
    if (ride.activity_id) {
      routeHtml = `<a href="#" class="nav-link view-coupled-route-btn" data-activity-id="${ride.activity_id}" data-ride-title="${ride.title}" style="color:var(--primary);text-decoration:underline;font-size:12px;margin-top:4px;display:inline-block;"><i data-lucide="map" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Bekijk Route</a>`;
    } else if (ride.route_link) {
      routeHtml = `<a href="${ride.route_link}" target="_blank" class="nav-link" style="color:var(--secondary);text-decoration:underline;font-size:12px;margin-top:4px;display:inline-block;"><i data-lucide="external-link" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Route bekijken</a>`;
    }

    // Meta badges + difficulty
    const diffBadge = getDifficultyBadge(ride.expected_distance_km, null);
    let metaBadgesHtml = '';
    if (ride.expected_distance_km) metaBadgesHtml += `<span class="ride-meta-badge"><i data-lucide="map-pin" style="width:10px;height:10px;display:inline;vertical-align:middle;margin-right:2px;"></i>${ride.expected_distance_km} km</span>`;
    if (ride.expected_speed_kmh) metaBadgesHtml += `<span class="ride-meta-badge"><i data-lucide="zap" style="width:10px;height:10px;display:inline;vertical-align:middle;margin-right:2px;"></i>~${ride.expected_speed_kmh} km/u</span>`;
    if (diffBadge) metaBadgesHtml += diffBadge;

    // Capaciteitsbalk
    const capacityHtml = maxPart ? (() => {
      const pct = Math.min(100, Math.round(rideParticipants.length / maxPart * 100));
      const barColor = pct >= 100 ? '#f44336' : pct >= 75 ? '#ff9800' : 'var(--primary)';
      return `
        <div class="capacity-bar-wrap">
          <div class="capacity-bar" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${rideParticipants.length}/${maxPart} deelnemers${isFull ? ' · <span style="color:#f44336;">VOL</span>' : ''}</div>`;
    })() : `<div style="font-size:11px;color:var(--text-muted);">${rideParticipants.length} deelnemer(s)</div>`;

    // Weer badge
    const weather = weatherMap[ride.date];
    const weatherHtml = renderWeatherBadge(weather);

    // Join knop
    let joinBtnHtml = '';
    if (state.user) {
      if (isFull && !isParticipating) {
        joinBtnHtml = `<button class="btn btn-secondary btn-sm btn-join-ride" data-id="${ride.id}" disabled style="opacity:.5;cursor:not-allowed;"><i data-lucide="users"></i> Vol</button>`;
      } else {
        joinBtnHtml = `<button class="btn ${isParticipating ? 'btn-secondary' : 'btn-primary'} btn-sm btn-join-ride" data-id="${ride.id}">${isParticipating ? '<i data-lucide="x-circle"></i> Afmelden' : '<i data-lucide="check"></i> Deelnemen'}</button>`;
      }
    }

    rideDiv.innerHTML = `
      <div class="ride-card-header">
        <div>
          <div class="ride-date">${dateFormatted.toUpperCase()}</div>
          <div class="ride-title">${ride.title}</div>
        </div>
        <div class="d-flex gap-8 align-center">
          ${weatherHtml}
          ${isCreator ? `
            <button class="btn btn-secondary btn-sm btn-edit-ride" data-id="${ride.id}" title="Bewerken" style="padding:3px 8px;"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>
            <button class="btn btn-secondary btn-sm btn-delete-ride" data-id="${ride.id}" title="Verwijderen" style="padding:3px 8px;color:var(--status-unavailable);"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
          ` : ''}
        </div>
      </div>

      ${metaBadgesHtml ? `<div class="d-flex gap-8 mt-2 flex-wrap">${metaBadgesHtml}</div>` : ''}
      <p style="font-size:13px;line-height:1.5;margin:8px 0 6px;color:var(--text-secondary);">${ride.description}</p>
      ${routeHtml}

      <div class="ride-footer">
        <div class="ride-participants-block">
          <div class="participant-avatars">${avatarsHtml || '<span style="font-size:11px;color:var(--text-muted);">Nog geen deelnemers</span>'}</div>
          ${capacityHtml}
        </div>
        <div class="ride-actions">
          ${joinBtnHtml}
          <button class="btn btn-secondary btn-sm btn-ical-ride" data-id="${ride.id}" title="Exporteer naar Kalender" style="padding:3px 8px;">
            <i data-lucide="calendar-plus" style="width:12px;height:12px;"></i>
          </button>
        </div>
      </div>
    `;

      const joinBtn = rideDiv.querySelector('.btn-join-ride');
      if (joinBtn && !joinBtn.disabled) {
        joinBtn.addEventListener('click', async () => {
          joinBtn.disabled = true;
          await toggleRideParticipation(ride.id, isParticipating, renderRidesList);
          joinBtn.disabled = false;
        });
      }
    if (isCreator) {
      rideDiv.querySelector('.btn-edit-ride')?.addEventListener('click', () => openPlanRideModal(ride));
      rideDiv.querySelector('.btn-delete-ride')?.addEventListener('click', () => deleteRide(ride.id));
    }
    if (ride.activity_id) {
      rideDiv.querySelector('.view-coupled-route-btn')?.addEventListener('click', (e) => { e.preventDefault(); showCoupledRoute(ride.activity_id, ride.title); });
    }
    rideDiv.querySelector('.btn-ical-ride')?.addEventListener('click', () => exportRideToIcal(ride));

    elements.ridesListContainer.appendChild(rideDiv);
  });

  lucide.createIcons();
}

async function showCoupledRoute(activityId, rideTitle) {
  // Zoek activiteit
  const act = state.activities.find(a => a.id === activityId);
  if (act && act.coordinates && act.coordinates.length > 0) {
    elements.routeMap.style.display = 'block';
    elements.tcxResultPanel.style.display = 'block';
    
    // Vul metrics in met gekoppelde rit data
    elements.metricDistance.textContent = parseFloat(act.distance_km).toFixed(1);
    
    const durSec = parseFloat(act.duration_secs || 0);
    const hours = Math.floor(durSec / 3600);
    const minutes = Math.floor((durSec % 3600) / 60);
    const seconds = Math.floor(durSec % 60);
    elements.metricDuration.textContent = hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
    
    elements.metricAscent.textContent = act.ascent_m;
    elements.metricSpeed.textContent = parseFloat(act.avg_speed_kmh).toFixed(1);
    elements.metricHr.textContent = act.avg_heart_rate || '-';
    elements.metricPower.textContent = act.avg_power_watts || '-';
    elements.calculatedRiderScore.textContent = act.rider_score;

    window.ActivityParser.drawRouteOnLeaflet('route-map', act.coordinates);
    
    // Scroll naar map
    elements.routeMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`Route voor "${rideTitle}" geladen op de kaart!`, "success");
  } else {
    // Probeer in live database te zoeken
    if (!config.isDemoMode) {
      try {
        showToast("Route ophalen...", "info");
        const { data: dbAct, error } = await config.supabaseClient
          .from('activities')
          .select('*')
          .eq('id', activityId)
          .single();
          
        if (error) throw error;
        
        if (dbAct && dbAct.coordinates && dbAct.coordinates.length > 0) {
          elements.routeMap.style.display = 'block';
          elements.tcxResultPanel.style.display = 'block';
          
          elements.metricDistance.textContent = parseFloat(dbAct.distance_km).toFixed(1);
          const durSec = parseFloat(dbAct.duration_secs || 0);
          const hours = Math.floor(durSec / 3600);
          const minutes = Math.floor((durSec % 3600) / 60);
          elements.metricDuration.textContent = hours > 0 ? `${hours}u ${minutes}m` : `${minutes}m`;
          elements.metricAscent.textContent = dbAct.ascent_m;
          elements.metricSpeed.textContent = parseFloat(dbAct.avg_speed_kmh).toFixed(1);
          elements.metricHr.textContent = dbAct.avg_heart_rate || '-';
          elements.metricPower.textContent = dbAct.avg_power_watts || '-';
          elements.calculatedRiderScore.textContent = dbAct.rider_score;

          window.ActivityParser.drawRouteOnLeaflet('route-map', dbAct.coordinates);
          elements.routeMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showToast(`Route voor "${rideTitle}" geladen!`, "success");
        } else {
          showToast("Geen GPS coördinaten beschikbaar voor deze gekoppelde route.", "error");
        }
      } catch (err) {
        console.error("Fout bij ophalen gekoppelde route:", err);
        showToast("Route kon niet worden ingeladen.", "error");
      }
    } else {
      showToast("Route coördinaten niet gevonden in demo modus.", "error");
    }
  }
}

export async function toggleRideParticipation(rideId, isParticipating, callbackFn) {
  // ─── Optimistische lokale state update ──────────────────────────────
  // Pas state.rides meteen aan zodat de UI instant reageert
  const rideInState = state.rides.find(r => r.id === rideId);
  if (rideInState) {
    if (!rideInState.ride_participants) rideInState.ride_participants = [];
    if (isParticipating) {
      // Verwijder uit lijst
      rideInState.ride_participants = rideInState.ride_participants.filter(p => p.user_id !== state.user.id);
    } else {
      // Voeg toe
      rideInState.ride_participants.push({ user_id: state.user.id });
    }
  }

  // ─── Herrender direct (optimistisch) ────────────────────────────────
  try { renderRidesList(); } catch(e) {}

  // ─── Demo mode ──────────────────────────────────────────────────────
  if (config.isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
    const idx = savedRides.findIndex(r => r.id === rideId);
    if (idx !== -1) {
      let participants = savedRides[idx].participants || [];
      if (isParticipating) {
        participants = participants.filter(id => id !== state.user.id);
      } else {
        if (!participants.includes(state.user.id)) participants.push(state.user.id);
      }
      savedRides[idx].participants = participants;
      localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
      addFeedEntry(isParticipating ? 'left_ride' : 'joined_ride', {
        ride_id: rideId, ride_title: savedRides[idx].title
      });
      showToast(isParticipating ? 'Afgemeld voor de rit.' : 'Aangemeld voor de rit!', 'success');
      if (typeof callbackFn === 'function') callbackFn();
    }
    return;
  }

  // ─── Live Supabase ───────────────────────────────────────────────────
  try {
    const ride = state.rides.find(r => r.id === rideId);
    if (isParticipating) {
      const { error } = await config.supabaseClient
        .from('ride_participants')
        .delete()
        .eq('ride_id', rideId)
        .eq('user_id', state.user.id);
      if (error) throw error;
      await addFeedEntry('left_ride', { ride_id: rideId, ride_title: ride?.title });
      showToast('Afgemeld voor de rit.', 'info');
    } else {
      const { error } = await config.supabaseClient
        .from('ride_participants')
        .insert([{ ride_id: rideId, user_id: state.user.id }]);
      if (error) throw error;
      await addFeedEntry('joined_ride', { ride_id: rideId, ride_title: ride?.title });
      showToast('Succesvol aangemeld voor de rit!', 'success');
    }
    // Herlaad de deelnemers van DEZE rit direct uit de DB voor garantie
    // (realtime subscription kan anders de optimistische update overschrijven)
    try {
      const { data: freshParticipants } = await config.supabaseClient
        .from('ride_participants')
        .select('user_id')
        .eq('ride_id', rideId);
      if (freshParticipants !== null && rideInState) {
        rideInState.ride_participants = freshParticipants;
      }
    } catch(e) { console.warn('Deelnemers herladen mislukt:', e); }
    // Herrender met gegarandeerd correcte data
    try { await renderRidesList(); } catch(e) {}
  } catch (err) {
    // ─── Revert optimistische update bij fout ────────────────────────
    if (rideInState) {
      if (isParticipating) {
        // Was deelnemer, zet terug
        rideInState.ride_participants.push({ user_id: state.user.id });
      } else {
        // Was geen deelnemer, verwijder terug
        rideInState.ride_participants = rideInState.ride_participants.filter(p => p.user_id !== state.user.id);
      }
      try { renderRidesList(); } catch(e) {}
    }
    showToast(err.message, 'error');
  }
}

export async function deleteRide(rideId, loadDashboardDataCallback) {
  if (!confirm("Weet je zeker dat je deze groepsrit wilt verwijderen? Alle deelnemers worden ook verwijderd.")) return;

  if (config.isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
    savedRides = savedRides.filter(r => r.id !== rideId);
    localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
    showToast("Groepsrit verwijderd.", "info");
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    // Herlaad dashboard
    window._loadDashboardData && window._loadDashboardData();
    return;
  }

  try {
    const { error } = await config.supabaseClient
      .from('rides')
      .delete()
      .eq('id', rideId);
    if (error) throw error;

    showToast("Groepsrit succesvol verwijderd.", "info");
    window._loadDashboardData && window._loadDashboardData();
  } catch (err) {
    showToast("Fout bij verwijderen: " + err.message, "error");
  }
}

export function openPlanRideModal(rideToEdit = null) {
  editingRideId = rideToEdit ? rideToEdit.id : null;

  const selectedStr = state.selectedDate.toISOString().split('T')[0];
  elements.rideModalDate.value = rideToEdit ? rideToEdit.date : selectedStr;
  elements.rideModalTitle.value = rideToEdit ? rideToEdit.title : '';
  elements.rideModalDesc.value = rideToEdit ? (rideToEdit.description || '') : '';
  elements.rideModalRoute.value = rideToEdit ? (rideToEdit.route_link || '') : '';

  // Verwachte km en tempo
  const distInput = document.getElementById('ride-modal-expected-distance');
  const speedInput = document.getElementById('ride-modal-expected-speed');
  if (distInput) distInput.value = rideToEdit ? (rideToEdit.expected_distance_km || '') : '';
  if (speedInput) speedInput.value = rideToEdit ? (rideToEdit.expected_speed_kmh || '') : '';

  // Titelbalk aanpassen
  const modalTitle = document.getElementById('ride-modal-title-header');
  if (modalTitle) modalTitle.textContent = rideToEdit ? 'Groepsrit Bewerken' : 'Groepsrit Plannen';

  // Update dropdown
  updateRouteDropdown();
  if (rideToEdit && rideToEdit.activity_id) {
    elements.rideModalActivity.value = rideToEdit.activity_id;
  }
  
  elements.rideModal.classList.add('active');
}

export function closePlanRideModal() {
  editingRideId = null;
  elements.rideModal.classList.remove('active');
  elements.formPlanRide.reset();
}

export async function savePlannedRide(e, loadDashboardDataCallback) {
  e.preventDefault();
  
  const date = elements.rideModalDate.value;
  const title = elements.rideModalTitle.value.trim();
  const description = elements.rideModalDesc.value.trim();
  const routeLink = elements.rideModalRoute.value.trim();
  const activityId = elements.rideModalActivity.value || null;
  const expectedDist = parseFloat(document.getElementById('ride-modal-expected-distance')?.value) || null;
  const expectedSpeed = parseFloat(document.getElementById('ride-modal-expected-speed')?.value) || null;

  if (config.isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');

    if (editingRideId) {
      // Update bestaande rit
      const idx = savedRides.findIndex(r => r.id === editingRideId);
      if (idx !== -1) {
        savedRides[idx] = {
          ...savedRides[idx],
          date, title, description,
          route_link: routeLink,
          activity_id: activityId,
          expected_distance_km: expectedDist,
          expected_speed_kmh: expectedSpeed
        };
      }
      showToast("Groepsrit bijgewerkt!", "success");
    } else {
      // Nieuwe rit aanmaken
      const newRide = {
        id: `r-user-${Date.now()}`,
        created_by: state.user.id,
        date, title, description,
        route_link: routeLink,
        activity_id: activityId,
        expected_distance_km: expectedDist,
        expected_speed_kmh: expectedSpeed,
        participants: [state.user.id]
      };
      savedRides.push(newRide);
      showToast("Groepsrit succesvol gepland!", "success");
    }
    
    localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
    closePlanRideModal();
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }
  
  try {
    const rideData = {
      date, title, description,
      route_link: routeLink,
      activity_id: activityId,
      expected_distance_km: expectedDist,
      expected_speed_kmh: expectedSpeed
    };

    if (editingRideId) {
      const { error } = await config.supabaseClient
        .from('rides')
        .update(rideData)
        .eq('id', editingRideId);
      if (error) throw error;
      showToast("Groepsrit succesvol bijgewerkt!", "success");
    } else {
      const { data: ride, error: rError } = await config.supabaseClient
        .from('rides')
        .insert([{ created_by: state.user.id, ...rideData }])
        .select()
        .single();
        
      if (rError) throw rError;
      
      const { error: pError } = await config.supabaseClient
        .from('ride_participants')
        .insert([{ ride_id: ride.id, user_id: state.user.id }]);
        
      if (pError) throw pError;
      showToast("Groepsrit succesvol gepland!", "success");
    }
    
    closePlanRideModal();
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    showToast(err.message, "error");
  }
}

export function updateRouteDropdown() {
  const dropdown = elements.rideModalActivity;
  if (!dropdown) return;
  
  dropdown.innerHTML = '<option value="">-- Geen route gekoppeld --</option>';
  
  const myActivities = (state.activities || []).filter(a => a.user_id === state.user.id);
  
  myActivities.forEach(act => {
    const opt = document.createElement('option');
    opt.value = act.id;
    const formattedDate = new Date(act.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    opt.textContent = `${act.name} (${formattedDate} - ${parseFloat(act.distance_km).toFixed(1)} km)`;
    dropdown.appendChild(opt);
  });
}

// Feed entry toevoegen (intern hulpfunctie)
export async function addFeedEntry(type, payload) {
  if (config.isDemoMode) {
    let feed = JSON.parse(localStorage.getItem('cyclo_mock_feed') || '[]');
    feed.unshift({
      id: `f-${Date.now()}`,
      user_id: state.user.id,
      type,
      payload,
      created_at: new Date().toISOString()
    });
    // Max 50 entries bijhouden
    if (feed.length > 50) feed = feed.slice(0, 50);
    localStorage.setItem('cyclo_mock_feed', JSON.stringify(feed));
    return;
  }

  try {
    await config.supabaseClient
      .from('activity_feed')
      .insert([{ user_id: state.user.id, type, payload }]);
  } catch (err) {
    console.warn("Feed entry kon niet worden opgeslagen:", err.message);
  }
}
