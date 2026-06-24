// Cyclo - Activities & Performance Metrics Module
import { state, elements, config, showToast } from './state.js';
import { addFeedEntry } from './rides.js';

let statsChartInstance = null;
let elevationChartInstance = null;

// ─────────────────────────────────────────────
//  Activiteiten filter state
// ─────────────────────────────────────────────
let filterState = {
  period: 'all',   // all | 30d | 90d | year
  sort: 'date'     // date | distance | score | speed
};

export function setupTcxUploader(loadDashboardDataCallback) {
  const dropzone = elements.tcxDropzone;
  const fileInput = elements.tcxFileInput;
  
  if (!dropzone || !fileInput) return;
  
  // Accepteer meer bestandsformaten
  fileInput.accept = '.tcx,.gpx,.fit,.kml';

  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processTcxFile(e.dataTransfer.files[0], loadDashboardDataCallback);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length > 0) {
      processTcxFile(fileInput.files[0], loadDashboardDataCallback);
    }
  });

  // Filter / sort knoppen
  const filterBar = document.getElementById('activity-filter-bar');
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter-period], [data-filter-sort]');
      if (!btn) return;
      if (btn.dataset.filterPeriod !== undefined) {
        filterBar.querySelectorAll('[data-filter-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterState.period = btn.dataset.filterPeriod;
      }
      if (btn.dataset.filterSort !== undefined) {
        filterBar.querySelectorAll('[data-filter-sort]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterState.sort = btn.dataset.filterSort;
      }
      renderActivitiesList(loadDashboardDataCallback);
    });
  }

  // Tab switching: Mijn Ritten / Club Ritten
  const tabMyRides   = document.getElementById('tab-my-rides');
  const tabClubRides = document.getElementById('tab-club-rides');
  const myContent    = document.getElementById('my-rides-content');
  const clubContent  = document.getElementById('club-rides-content');

  if (tabMyRides && tabClubRides) {
    tabMyRides.addEventListener('click', () => {
      tabMyRides.classList.add('active');
      tabClubRides.classList.remove('active');
      if (myContent)   myContent.style.display   = 'block';
      if (clubContent) clubContent.style.display  = 'none';
    });

    tabClubRides.addEventListener('click', () => {
      tabClubRides.classList.add('active');
      tabMyRides.classList.remove('active');
      if (clubContent) clubContent.style.display  = 'block';
      if (myContent)   myContent.style.display    = 'none';
      renderClubActivities();
    });
  }
}

export function processTcxFile(file, loadDashboardDataCallback) {
  const nameLower = file.name.toLowerCase();
  const isFit = nameLower.endsWith('.fit');
  const isXml = nameLower.endsWith('.tcx') || nameLower.endsWith('.gpx') || nameLower.endsWith('.kml');

  if (!isFit && !isXml) {
    showToast("Ondersteunde formaten: TCX, GPX, FIT, KML.", "error");
    return;
  }

  showToast("Bestand verwerken...", "info");

  if (isFit) {
    // FIT: lees als ArrayBuffer (binair)
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsedRide = await window.ActivityParser.parseFit(e.target.result);
        await _applyParsedRide(parsedRide, file.name, loadDashboardDataCallback);
      } catch (err) {
        console.error(err);
        showToast("FIT fout: " + err.message, "error");
      }
    };
    reader.onerror = () => showToast("Fout bij lezen van FIT bestand.", "error");
    reader.readAsArrayBuffer(file);
  } else {
    // TCX / GPX / KML: lees als tekst
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsedRide = window.ActivityParser.parse(e.target.result);
        await _applyParsedRide(parsedRide, file.name, loadDashboardDataCallback);
      } catch (err) {
        console.error(err);
        showToast("Fout bij verwerken bestand: " + err.message, "error");
      }
    };
    reader.onerror = () => showToast("Fout bij lezen van bestand.", "error");
    reader.readAsText(file);
  }
}

async function _applyParsedRide(parsedRide, fileName, loadDashboardDataCallback) {
  // Update UI metrics
  elements.metricDistance.textContent = parsedRide.distanceKm;
  elements.metricDuration.textContent = parsedRide.durationFormatted;
  elements.metricAscent.textContent = parsedRide.totalAscentMeters;
  elements.metricSpeed.textContent = parsedRide.avgSpeedKmh;
  elements.metricHr.textContent = parsedRide.avgHeartRate || '-';
  elements.metricPower.textContent = parsedRide.avgPowerWatts || '-';
  elements.calculatedRiderScore.textContent = parsedRide.riderScore;

  updateWkgDisplay(parsedRide.avgPowerWatts);

  // Route op kaart
  if (parsedRide.coordinates && parsedRide.coordinates.length > 0) {
    elements.routeMap.style.display = 'block';
    window.ActivityParser.drawRouteOnLeaflet('route-map', parsedRide.coordinates);

    // Hoogteprofiel
    const elevProfile = window.ActivityParser.buildElevationProfile(parsedRide.coordinates);
    if (elevProfile) renderElevationChart(elevProfile);
  } else {
    elements.routeMap.style.display = 'none';
  }

  elements.tcxResultPanel.style.display = 'block';

  await saveActivity(parsedRide, fileName, loadDashboardDataCallback);
  await updateUserRiderScore(parsedRide.riderScore);
  await addFeedEntry('uploaded_activity', {
    name: fileName.replace(/\.(tcx|gpx|fit|kml)$/i, ''),
    distance_km: parsedRide.distanceKm,
    rider_score: parsedRide.riderScore
  });

  if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
}

function updateWkgDisplay(avgPowerWatts) {
  const wkgEl = document.getElementById('metric-wkg');
  if (!wkgEl) return;
  const weight = state.user?.weight;
  if (avgPowerWatts && weight && weight > 0) {
    wkgEl.textContent = (avgPowerWatts / weight).toFixed(2);
    const wkgCard = document.getElementById('metric-wkg-card');
    if (wkgCard) wkgCard.style.display = 'block';
  } else {
    const wkgCard = document.getElementById('metric-wkg-card');
    if (wkgCard) wkgCard.style.display = 'none';
  }
}

export async function updateUserRiderScore(newRideScore) {
  // Bereken de totale Rider Score op basis van ALLE ritten
  const allMyActivities = (state.activities || []).filter(a => a.user_id === state.user?.id);

  let computedScore;
  if (allMyActivities.length === 0) {
    // Geen ritten: gebruik de score van de zojuist geüploade rit
    computedScore = newRideScore;
  } else {
    // Gewogen gemiddelde: recentere ritten wegen zwaarder
    // Sorteer op datum (nieuwste eerst)
    const sorted = [...allMyActivities].sort((a, b) => new Date(b.date) - new Date(a.date));

    let weightedSum = 0;
    let weightTotal = 0;
    sorted.forEach((act, i) => {
      // Gewicht daalt met 10% per oudere rit (nieuwste = 1.0, 2e = 0.9, ...)
      const weight = Math.max(0.1, 1.0 - i * 0.1);
      const score  = act.rider_score || 0;
      weightedSum  += score * weight;
      weightTotal  += weight;
    });
    const avg = weightTotal > 0 ? weightedSum / weightTotal : newRideScore;

    // Consistentiebonus: elke extra rit geeft +3 pts (max +30)
    const consistencyBonus = Math.min(30, (allMyActivities.length - 1) * 3);

    // Volumebonus: totale km van alle ritten (gecapped op +40)
    const totalKm = allMyActivities.reduce((s, a) => s + parseFloat(a.distance_km || 0), 0);
    const volumeBonus = Math.min(40, totalKm * 0.04);

    computedScore = Math.round(avg + consistencyBonus + volumeBonus);
  }

  const finalScore = Math.max(10, Math.min(1000, computedScore));

  // Delta berekenen (verschil t.o.v. huidige opgeslagen score)
  const previousScore = state.user.rider_score || 0;
  const delta = finalScore - previousScore;

  // Helper: update alle score-widgets in de UI
  function _updateScoreWidgets(score, diff) {
    state.user.rider_score = score;
    // Planner sidebar widget
    if (elements.widgetUserScoreVal) elements.widgetUserScoreVal.textContent = score;
    if (elements.widgetUserScoreContainer) elements.widgetUserScoreContainer.style.display = 'flex';
    // Mijn Ritten sidebar
    const rsv = document.getElementById('rides-score-val');
    const rsp = document.getElementById('rides-score-panel');
    const rsd = document.getElementById('rides-score-delta');
    if (rsv) rsv.textContent = score;
    if (rsp) rsp.style.display = 'block';
    if (rsd && diff !== 0) {
      const positive = diff > 0;
      rsd.textContent = `${positive ? '▲' : '▼'} ${positive ? '+' : ''}${diff} pts`;
      rsd.style.color  = positive ? 'var(--status-available)' : 'var(--status-unavailable)';
    } else if (rsd) {
      rsd.textContent = previousScore === 0 ? '' : '= geen wijziging';
      rsd.style.color = 'var(--text-muted)';
    }
  }

  if (config.isDemoMode) {
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    const idx = savedMockProfiles.findIndex(p => p.id === state.user.id);
    if (idx !== -1) {
      savedMockProfiles[idx].rider_score = finalScore;
    } else {
      const demoProfile = { ...(state.profiles.find(p => p.id === state.user.id) || state.user) };
      demoProfile.rider_score = finalScore;
      savedMockProfiles.push(demoProfile);
    }
    localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
    _updateScoreWidgets(finalScore, delta);
    return;
  }

  try {
    const { error } = await config.supabaseClient
      .from('profiles')
      .update({ rider_score: finalScore })
      .eq('id', state.user.id);
    if (error) throw error;
    _updateScoreWidgets(finalScore, delta);
  } catch (err) {
    console.error('Fout bij opslaan Rider Score:', err);
    showToast('Kon Rider Score niet opslaan.', 'error');
  }
}

export async function saveActivity(parsedRide, fileName, loadDashboardDataCallback) {
  const cleanName = fileName.replace(/\.(tcx|gpx)$/i, '').replace(/[-_]/g, ' ');
  const activityData = {
    user_id: state.user.id,
    name: cleanName,
    date: parsedRide.startTime ? parsedRide.startTime.toISOString() : new Date().toISOString(),
    distance_km: parsedRide.distanceKm,
    duration_secs: parsedRide.totalTimeSeconds,
    ascent_m: parsedRide.totalAscentMeters,
    avg_speed_kmh: parsedRide.avgSpeedKmh,
    avg_heart_rate: parsedRide.avgHeartRate,
    avg_power_watts: parsedRide.avgPowerWatts,
    rider_score: parsedRide.riderScore,
    coordinates: parsedRide.coordinates
  };

  if (config.isDemoMode) {
    let mockActivities = JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
    activityData.id = `act-${Date.now()}`;
    mockActivities.push(activityData);
    localStorage.setItem('cyclo_mock_activities', JSON.stringify(mockActivities));

    // Direct in state zetten zodat updateUserRiderScore de nieuwe rit al ziet
    state.activities = mockActivities;

    // Update persoonlijke records
    await updatePersonalRecords([...mockActivities]);

    // Update component wear
    try {
      const { updateEquipmentWearForRide } = await import('./equipment.js');
      await updateEquipmentWearForRide(activityData.distance_km, activityData.date);
    } catch (err) {
      console.warn('Kon component wear niet bijwerken:', err);
    }

    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }

  try {
    const { data: newAct, error } = await config.supabaseClient
      .from('activities')
      .insert([activityData])
      .select()
      .single();

    if (error) throw error;

    // Direct in state zetten zodat updateUserRiderScore de nieuwe rit al ziet
    if (newAct) state.activities = [newAct, ...(state.activities || [])];

    // Update persoonlijke records na opslaan
    const allActivities = await loadActivitiesRaw();
    await updatePersonalRecords(allActivities);

    // Update component wear
    try {
      const { updateEquipmentWearForRide } = await import('./equipment.js');
      await updateEquipmentWearForRide(activityData.distance_km, activityData.date);
    } catch (err) {
      console.warn('Kon component wear niet bijwerken:', err);
    }

    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    console.error('Fout bij opslaan activiteit:', err);
    showToast('Kon rit niet opslaan in database.', 'error');
  }
}

export async function loadActivities() {
  if (config.isDemoMode) {
    const mockActivities = JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
    state.activities = mockActivities;
    return;
  }

  try {
    const { data: activities, error } = await config.supabaseClient
      .from('activities')
      .select('*')
      .order('date', { ascending: false });
      
    if (error) throw error;
    state.activities = activities;
  } catch (err) {
    console.error("Fout bij laden activiteiten:", err);
    state.activities = [];
  }
}

async function loadActivitiesRaw() {
  if (config.isDemoMode) {
    return JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
  }
  try {
    const { data } = await config.supabaseClient
      .from('activities')
      .select('*')
      .eq('user_id', state.user.id);
    return data || [];
  } catch { return []; }
}

// ─────────────────────────────────────────────
//  Persoonlijke records
// ─────────────────────────────────────────────
export async function updatePersonalRecords(allActivities) {
  const myActivities = allActivities.filter(a => a.user_id === state.user.id);
  if (myActivities.length === 0) return;

  const prDist = Math.max(...myActivities.map(a => parseFloat(a.distance_km) || 0));
  const prSpeed = Math.max(...myActivities.map(a => parseFloat(a.avg_speed_kmh) || 0));
  const prAscent = Math.max(...myActivities.map(a => parseInt(a.ascent_m) || 0));
  
  const weight = state.user?.weight;
  let prWkg = null;
  if (weight && weight > 0) {
    const activitiesWithPower = myActivities.filter(a => a.avg_power_watts && a.avg_power_watts > 0);
    if (activitiesWithPower.length > 0) {
      prWkg = Math.max(...activitiesWithPower.map(a => a.avg_power_watts / weight));
    }
  }

  const prData = {
    pr_distance_km: prDist > 0 ? prDist : null,
    pr_speed_kmh: prSpeed > 0 ? prSpeed : null,
    pr_ascent_m: prAscent > 0 ? prAscent : null,
    pr_wkg: prWkg ? parseFloat(prWkg.toFixed(2)) : null
  };

  // Sla op in state
  state.user.pr_distance_km = prData.pr_distance_km;
  state.user.pr_speed_kmh = prData.pr_speed_kmh;
  state.user.pr_ascent_m = prData.pr_ascent_m;
  state.user.pr_wkg = prData.pr_wkg;

  if (config.isDemoMode) {
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    const idx = savedMockProfiles.findIndex(p => p.id === state.user.id);
    if (idx !== -1) {
      savedMockProfiles[idx] = { ...savedMockProfiles[idx], ...prData };
    } else {
      savedMockProfiles.push({ ...state.user, ...prData });
    }
    localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
  } else {
    try {
      await config.supabaseClient
        .from('profiles')
        .update(prData)
        .eq('id', state.user.id);
    } catch (err) {
      console.warn("PR update mislukt:", err.message);
    }
  }

  // Render PR-blok opnieuw
  renderPersonalRecords();
}

export function renderPersonalRecords() {
  const prContainer = document.getElementById('pr-container');
  if (!prContainer) return;

  const pr = state.user;
  const hasPr = pr.pr_distance_km || pr.pr_speed_kmh || pr.pr_ascent_m || pr.pr_wkg;

  if (!hasPr) {
    prContainer.style.display = 'none';
    return;
  }

  prContainer.style.display = 'block';
  prContainer.innerHTML = `
    <h4 class="widget-title" style="font-size: 12px; margin-bottom: 10px;">
      <i data-lucide="award" style="color: var(--primary);"></i> Persoonlijke Records
    </h4>
    <div class="pr-grid">
      ${pr.pr_distance_km ? `
        <div class="pr-card">
          <div class="pr-icon">🏅</div>
          <div class="pr-val">${parseFloat(pr.pr_distance_km).toFixed(1)}<span class="pr-unit">km</span></div>
          <div class="pr-lbl">Langste rit</div>
        </div>` : ''}
      ${pr.pr_speed_kmh ? `
        <div class="pr-card">
          <div class="pr-icon">⚡</div>
          <div class="pr-val">${parseFloat(pr.pr_speed_kmh).toFixed(1)}<span class="pr-unit">km/u</span></div>
          <div class="pr-lbl">Snelste gem.</div>
        </div>` : ''}
      ${pr.pr_ascent_m ? `
        <div class="pr-card">
          <div class="pr-icon">⛰️</div>
          <div class="pr-val">${pr.pr_ascent_m}<span class="pr-unit">m</span></div>
          <div class="pr-lbl">Meeste hoogte</div>
        </div>` : ''}
      ${pr.pr_wkg ? `
        <div class="pr-card">
          <div class="pr-icon">💪</div>
          <div class="pr-val">${parseFloat(pr.pr_wkg).toFixed(2)}<span class="pr-unit">W/kg</span></div>
          <div class="pr-lbl">Best vermogen</div>
        </div>` : ''}
    </div>
  `;
  lucide.createIcons();
}

export function renderLeaderboard() {
  if (!elements.leaderboardList) return;
  elements.leaderboardList.innerHTML = '';

  const sortedProfiles = [...state.profiles].sort((a, b) => (b.rider_score || 0) - (a.rider_score || 0));

  if (sortedProfiles.length === 0) {
    elements.leaderboardList.innerHTML = '<div class="empty-state" style="font-size:12px;">Geen renners gevonden.</div>';
    return;
  }

  sortedProfiles.forEach((profile, index) => {
    const rank = index + 1;
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    
    let medalClass = '';
    if (rank === 1) medalClass = 'rank-1';
    else if (rank === 2) medalClass = 'rank-2';
    else if (rank === 3) medalClass = 'rank-3';

    row.innerHTML = `
      <div class="leaderboard-rank ${medalClass}">${rank}</div>
      <img src="${profile.avatar_url}" alt="Avatar" class="leaderboard-avatar">
      <div class="leaderboard-info">
        <div class="leaderboard-name">${profile.full_name}</div>
        <div class="leaderboard-username">@${profile.username}</div>
      </div>
      <div class="leaderboard-score">${profile.rider_score || 0}</div>
    `;

    elements.leaderboardList.appendChild(row);
  });
}

// ─────────────────────────────────────────────
//  Activiteiten feed
// ─────────────────────────────────────────────
export async function loadAndRenderFeed() {
  const feedContainer = document.getElementById('activity-feed-list');
  if (!feedContainer) return;

  let feedEntries = [];

  if (config.isDemoMode) {
    feedEntries = JSON.parse(localStorage.getItem('cyclo_mock_feed') || '[]');
  } else {
    try {
      const { data, error } = await config.supabaseClient
        .from('activity_feed')
        .select('*, profiles(full_name, avatar_url, username)')
        .order('created_at', { ascending: false })
        .limit(15);
      if (!error) feedEntries = data || [];
    } catch (err) {
      console.warn("Feed kon niet worden geladen:", err.message);
    }
  }

  if (feedEntries.length === 0) {
    feedContainer.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 8px;">Nog geen clubactiviteit.</div>';
    return;
  }

  feedContainer.innerHTML = feedEntries.slice(0, 10).map(entry => {
    const profile = config.isDemoMode
      ? state.profiles.find(p => p.id === entry.user_id)
      : entry.profiles;

    const name = profile?.full_name || 'Onbekend';
    const avatar = profile?.avatar_url || '';
    const timeAgo = formatTimeAgo(new Date(entry.created_at));
    const activityId = entry.payload?.activity_id || null;
    const kudoCount = entry.kudos_count || 0;
    const myKudo = entry.my_kudo || false;

    let icon = '🚴';
    let text = '';
    const p = entry.payload || {};

    switch (entry.type) {
      case 'uploaded_activity':
        icon = '📤';
        text = `heeft een rit geüpload${p.name ? ` <strong>${p.name}</strong>` : ''}${p.distance_km ? ` (${p.distance_km} km)` : ''}`;
        break;
      case 'joined_ride':
        icon = '✅';
        text = `meldt zich aan voor <strong>${p.ride_title || 'een rit'}</strong>`;
        break;
      case 'left_ride':
        icon = '❌';
        text = `meldt zich af voor <strong>${p.ride_title || 'een rit'}</strong>`;
        break;
      case 'new_pr':
        icon = '🏆';
        text = `heeft een nieuw persoonlijk record!`;
        break;
      default:
        text = entry.type;
    }

    const kudoBtnHtml = state.user ? `
      <button class="kudo-btn ${myKudo ? 'active' : ''}" data-entry-id="${entry.id}" data-activity-id="${activityId || ''}" data-my-kudo="${myKudo}" title="${myKudo ? 'Kudo verwijderen' : 'Kudo geven'}">
        👍 <span class="kudo-count">${kudoCount}</span>
      </button>` : '';

    return `
      <div class="feed-entry">
        ${avatar ? `<img src="${avatar}" alt="${name}" class="feed-avatar">` : `<div class="feed-icon">${icon}</div>`}
        <div class="feed-body">
          <div class="feed-text"><strong>${name}</strong> ${text}</div>
          <div class="feed-meta">
            <span class="feed-time">${timeAgo}</span>
            ${kudoBtnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Kudo event listeners koppelen
  feedContainer.querySelectorAll('.kudo-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const actId = btn.dataset.activityId;
      const myKudo = btn.dataset.myKudo === 'true';
      if (!actId) return;
      await toggleKudos(actId, myKudo, btn);
    });
  });
}

function formatTimeAgo(date) {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Zojuist';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m geleden`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}u geleden`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d geleden`;
}

// ─────────────────────────────────────────────
//  Kudos
// ─────────────────────────────────────────────
export async function toggleKudos(activityId, myKudo, btnEl) {
  if (config.isDemoMode) {
    let kudos = JSON.parse(localStorage.getItem('cyclo_mock_kudos') || '[]');
    if (myKudo) {
      kudos = kudos.filter(k => !(k.activity_id === activityId && k.user_id === state.user.id));
    } else {
      kudos.push({ activity_id: activityId, user_id: state.user.id, created_at: new Date().toISOString() });
    }
    localStorage.setItem('cyclo_mock_kudos', JSON.stringify(kudos));
    // Update knop
    const count = kudos.filter(k => k.activity_id === activityId).length;
    btnEl.classList.toggle('active', !myKudo);
    btnEl.dataset.myKudo = String(!myKudo);
    btnEl.querySelector('.kudo-count').textContent = count;
    return;
  }

  try {
    if (myKudo) {
      await config.supabaseClient.from('kudos')
        .delete()
        .eq('activity_id', activityId)
        .eq('user_id', state.user.id);
    } else {
      await config.supabaseClient.from('kudos')
        .insert([{ activity_id: activityId, user_id: state.user.id }]);
    }
    // Haal nieuwe count op
    const { count } = await config.supabaseClient.from('kudos')
      .select('*', { count: 'exact', head: true })
      .eq('activity_id', activityId);
    btnEl.classList.toggle('active', !myKudo);
    btnEl.dataset.myKudo = String(!myKudo);
    btnEl.querySelector('.kudo-count').textContent = count || 0;
  } catch (err) {
    console.warn('Kudo fout:', err.message);
  }
}

// ─────────────────────────────────────────────
//  Hoogteprofiel grafiek
// ─────────────────────────────────────────────
export function renderElevationChart(elevProfile) {
  const panel = document.getElementById('elevation-chart-panel');
  const canvas = document.getElementById('elevation-chart');
  if (!panel || !canvas) return;

  panel.style.display = 'block';

  if (elevationChartInstance) {
    elevationChartInstance.destroy();
    elevationChartInstance = null;
  }

  const ctx = canvas.getContext('2d');

  // Gradient fill: donkerblauw → volt groen
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(212, 255, 0, 0.5)');
  gradient.addColorStop(1, 'rgba(212, 255, 0, 0.02)');

  elevationChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: elevProfile.distances,
      datasets: [{
        label: 'Hoogte (m)',
        data: elevProfile.altitudes,
        borderColor: '#d4ff00',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: gradient,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${items[0].label} km`,
            label: (item) => `${item.raw} m hoogte`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: 'rgba(255,255,255,0.4)',
            font: { size: 9 },
            maxTicksLimit: 8,
            callback: (val, i, ticks) => {
              const label = elevProfile.distances[i];
              return label !== undefined ? `${label}km` : '';
            }
          }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 9 } },
          title: { display: true, text: 'Hoogte (m)', color: '#d4ff00', font: { size: 9 } }
        }
      }
    }
  });

  // Toon stats naast de grafiek
  const statsEl = document.getElementById('elevation-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="elev-stat">⬆️ ${elevProfile.totalAscent}m</span>
      <span class="elev-stat">⬇️ ${elevProfile.totalDescent}m</span>
      <span class="elev-stat">🏔️ Max ${elevProfile.maxAlt}m</span>
      <span class="elev-stat">🏞️ Min ${elevProfile.minAlt}m</span>
    `;
  }
}

// ─────────────────────────────────────────────
//  Activiteiten lijst (met filter)
// ─────────────────────────────────────────────
export function renderActivitiesList(loadDashboardDataCallback) {
  if (!elements.activitiesListContainer) return;
  elements.activitiesListContainer.innerHTML = '';

  const allMyActivities = (state.activities || []).filter(act => act.user_id === state.user.id);

  // Filter op periode
  const now = new Date();
  let filtered = allMyActivities.filter(act => {
    const actDate = new Date(act.date);
    if (filterState.period === '30d') return (now - actDate) <= 30 * 86400000;
    if (filterState.period === '90d') return (now - actDate) <= 90 * 86400000;
    if (filterState.period === 'year') return actDate.getFullYear() === now.getFullYear();
    return true;
  });

  // Sortering
  filtered.sort((a, b) => {
    if (filterState.sort === 'distance') return parseFloat(b.distance_km) - parseFloat(a.distance_km);
    if (filterState.sort === 'score') return (b.rider_score || 0) - (a.rider_score || 0);
    if (filterState.sort === 'speed') return parseFloat(b.avg_speed_kmh) - parseFloat(a.avg_speed_kmh);
    return new Date(b.date) - new Date(a.date); // default: datum
  });

  // Update totalen (altijd op basis van alle activiteiten, niet gefilterd)
  const profileStatsEmpty = document.getElementById('profile-stats-empty');
  if (allMyActivities.length > 0) {
    let totalDist = 0;
    let totalAsc = 0;
    allMyActivities.forEach(act => {
      totalDist += parseFloat(act.distance_km || 0);
      totalAsc += parseInt(act.ascent_m || 0);
    });
    if (elements.profileStatDistance) elements.profileStatDistance.textContent = totalDist.toFixed(1);
    if (elements.profileStatAscent) elements.profileStatAscent.textContent = totalAsc;
    if (elements.profileStatsContainer) elements.profileStatsContainer.style.display = 'grid';
    if (profileStatsEmpty) profileStatsEmpty.style.display = 'none';

    // Rider Score tonen in Mijn Ritten sidebar
    const rideScorePanel = document.getElementById('rides-score-panel');
    const rideScoreVal = document.getElementById('rides-score-val');
    if (rideScorePanel && state.user?.rider_score) {
      rideScorePanel.style.display = 'block';
      if (rideScoreVal) rideScoreVal.textContent = state.user.rider_score;
    }
  } else {
    if (elements.profileStatsContainer) elements.profileStatsContainer.style.display = 'none';
    if (profileStatsEmpty) profileStatsEmpty.style.display = 'block';
    const rideScorePanel = document.getElementById('rides-score-panel');
    if (rideScorePanel) rideScorePanel.style.display = 'none';
  }

  // Persoonlijke records tonen
  renderPersonalRecords();

  // Teken de grafiek
  renderStatsChart();

  if (filtered.length === 0) {
    elements.activitiesListContainer.innerHTML = `
      <div class="empty-state">
        ${allMyActivities.length === 0
          ? 'Je hebt nog geen ritten geüpload. Upload een TCX of GPX bestand hiernaast!'
          : 'Geen ritten gevonden voor dit filter.'}
      </div>
    `;
    return;
  }

  const weight = state.user?.weight;

  filtered.forEach(act => {
    const actDiv = document.createElement('div');
    actDiv.className = 'activity-item';
    
    const formattedDate = new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(act.date));

    const durSec = parseFloat(act.duration_secs || 0);
    const hours = Math.floor(durSec / 3600);
    const minutes = Math.floor((durSec % 3600) / 60);
    const formattedDur = hours > 0 ? `${hours}u ${minutes}m` : `${minutes}m`;

    // W/kg berekenen
    let wkgHtml = '';
    if (act.avg_power_watts && weight && weight > 0) {
      const wkg = (act.avg_power_watts / weight).toFixed(2);
      wkgHtml = `<span class="activity-badge" style="background: rgba(255,200,0,0.12); color: #ffd700; border-color: rgba(255,200,0,0.3);">⚡ ${wkg} W/kg</span>`;
    }

    actDiv.innerHTML = `
      <div class="activity-header">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
            <span class="activity-title" style="cursor:pointer;" title="Klik voor details">${act.name}</span>
            <span class="activity-badge">${act.rider_score} pts</span>
            ${wkgHtml}
          </div>
          <div class="activity-date" style="margin-top:4px;">${formattedDate}</div>
        </div>
        <button class="btn-delete-activity" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;border-radius:6px;transition:color .15s,background .15s;flex-shrink:0;" title="Rit verwijderen"
          onmouseover="this.style.color='var(--status-unavailable)';this.style.background='rgba(255,80,80,0.08)'"
          onmouseout="this.style.color='var(--text-muted)';this.style.background='none'">
          <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
        </button>
      </div>

      <div class="activity-stats-grid">
        <div class="activity-stat-card">
          <div class="activity-stat-val color-dist">${parseFloat(act.distance_km).toFixed(1)}</div>
          <div class="activity-stat-lbl">KM</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val color-time">${formattedDur}</div>
          <div class="activity-stat-lbl">Tijd</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val color-ascent">${act.ascent_m}m</div>
          <div class="activity-stat-lbl">Hoogte</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val color-speed">${parseFloat(act.avg_speed_kmh).toFixed(1)}</div>
          <div class="activity-stat-lbl">km/u</div>
        </div>
      </div>
    `;

    actDiv.querySelector('.activity-title').addEventListener('click', () => showActivityDetails(act));
    actDiv.querySelector('.btn-delete-activity').addEventListener('click', () => deleteActivity(act.id, loadDashboardDataCallback));

    elements.activitiesListContainer.appendChild(actDiv);
  });

  lucide.createIcons();
}

export function showActivityDetails(activity) {
  elements.metricDistance.textContent = parseFloat(activity.distance_km).toFixed(1);
  
  const durSec = parseFloat(activity.duration_secs || 0);
  const hours = Math.floor(durSec / 3600);
  const minutes = Math.floor((durSec % 3600) / 60);
  const seconds = Math.floor(durSec % 60);
  elements.metricDuration.textContent = hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
  
  elements.metricAscent.textContent = activity.ascent_m;
  elements.metricSpeed.textContent = parseFloat(activity.avg_speed_kmh).toFixed(1);
  elements.metricHr.textContent = activity.avg_heart_rate || '-';
  elements.metricPower.textContent = activity.avg_power_watts || '-';
  elements.calculatedRiderScore.textContent = activity.rider_score;

  // W/kg
  updateWkgDisplay(activity.avg_power_watts);
  
  if (activity.coordinates && activity.coordinates.length > 0) {
    elements.routeMap.style.display = 'block';
    window.ActivityParser.drawRouteOnLeaflet('route-map', activity.coordinates);
  } else {
    elements.routeMap.style.display = 'none';
  }
  
  elements.tcxResultPanel.style.display = 'block';

  // Navigeer eerst naar Mijn Ritten pagina als we er niet al zijn
  const ridesSection = document.getElementById('section-rides');
  if (ridesSection && !ridesSection.classList.contains('active')) {
    import('./state.js').then(({ navigateTo }) => navigateTo('rides'));
    setTimeout(() => elements.routeMap.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  } else {
    elements.routeMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  showToast(`Rit "${activity.name}" geladen!`, "success");
}

export async function deleteActivity(activityId, loadDashboardDataCallback) {
  if (!confirm("Weet je zeker dat je deze rit wilt verwijderen? Dit zal je Rider Score ook verlagen.")) return;

  if (config.isDemoMode) {
    let mockActivities = JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
    const act = mockActivities.find(a => a.id === activityId);
    let scoreDiff = 0;
    if (act) scoreDiff = act.rider_score;
    
    mockActivities = mockActivities.filter(a => a.id !== activityId);
    localStorage.setItem('cyclo_mock_activities', JSON.stringify(mockActivities));
    
    const newScore = Math.max(100, (state.user.rider_score || 100) - scoreDiff);
    await updateUserRiderScore(newScore);
    
    // PR's herberekenen
    await updatePersonalRecords(mockActivities);

    showToast("Rit succesvol verwijderd.", "info");
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }

  try {
    const act = state.activities.find(a => a.id === activityId);
    let scoreDiff = 0;
    if (act) scoreDiff = act.rider_score;

    const { error } = await config.supabaseClient
      .from('activities')
      .delete()
      .eq('id', activityId);
      
    if (error) throw error;
    
    const newScore = Math.max(100, (state.user.rider_score || 100) - scoreDiff);
    await updateUserRiderScore(newScore);

    // PR's herberekenen
    const allActivities = await loadActivitiesRaw();
    await updatePersonalRecords(allActivities);
    
    showToast("Rit verwijderd uit database.", "info");
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    console.error("Fout bij verwijderen activiteit:", err);
    showToast("Kon rit niet verwijderen uit database.", "error");
  }
}

export function renderStatsChart() {
  const chartCanvas = document.getElementById('stats-chart');
  if (!chartCanvas) return;

  const chartPanel = document.getElementById('stats-chart-panel');
  
  const myActivities = (state.activities || []).filter(act => act.user_id === state.user.id);
  
  if (myActivities.length === 0) {
    if (chartPanel) chartPanel.style.display = 'none';
    return;
  }
  
  if (chartPanel) chartPanel.style.display = 'block';

  // Sorteer op datum oplopend
  const chronoActivities = [...myActivities].sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = chronoActivities.map(act => {
    return new Date(act.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  });
  
  const scoreData = chronoActivities.map(act => act.rider_score);
  const distanceData = chronoActivities.map(act => parseFloat(act.distance_km));

  if (statsChartInstance) {
    statsChartInstance.destroy();
  }

  const ctx = chartCanvas.getContext('2d');
  statsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Rider Score',
          type: 'line',
          data: scoreData,
          borderColor: '#d4ff00',
          borderWidth: 2,
          pointBackgroundColor: '#d4ff00',
          pointBorderColor: '#fff',
          pointHoverRadius: 6,
          fill: false,
          yAxisID: 'y-score',
          tension: 0.3
        },
        {
          label: 'Afstand (km)',
          type: 'bar',
          data: distanceData,
          backgroundColor: 'rgba(0, 240, 255, 0.25)',
          borderColor: '#00F0FF',
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y-dist'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { size: 10 }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 9 } }
        },
        'y-score': {
          type: 'linear',
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#d4ff00', font: { size: 9 } },
          title: { display: true, text: 'Rider Score', color: '#d4ff00', font: { size: 10, weight: 'bold' } }
        },
        'y-dist': {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#00F0FF', font: { size: 9 } },
          title: { display: true, text: 'Afstand (km)', color: '#00F0FF', font: { size: 10, weight: 'bold' } }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
//  Club Ritten: activiteiten van alle leden
// ─────────────────────────────────────────────
export function renderClubActivities() {
  const container = document.getElementById('club-activities-list');
  if (!container) return;

  // Alle activiteiten behalve die van de ingelogde gebruiker, nieuwste eerst
  const allOthers = (state.activities || [])
    .filter(act => act.user_id !== state.user?.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allOthers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:28px;margin-bottom:12px;">🚴</div>
        Nog geen ritten van andere leden.
        <div style="font-size:11px;margin-top:8px;color:var(--text-muted);">
          Nodig vrienden uit om zich aan te sluiten!
        </div>
      </div>`;
    return;
  }

  container.innerHTML = '';

  allOthers.forEach(act => {
    const profile = state.profiles.find(p => p.id === act.user_id);
    const name    = profile?.full_name || 'Onbekend lid';
    const avatar  = profile?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${act.user_id}`;
    const score   = profile?.rider_score || act.rider_score || '-';

    const formattedDate = new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date(act.date));

    const durSec = parseFloat(act.duration_secs || 0);
    const hours  = Math.floor(durSec / 3600);
    const mins   = Math.floor((durSec % 3600) / 60);
    const dur    = hours > 0 ? `${hours}u ${mins}m` : `${mins}m`;

    const card = document.createElement('div');
    card.className = 'club-activity-card';
    card.innerHTML = `
      <div class="club-act-header">
        <div class="d-flex align-center gap-10">
          <img src="${avatar}" alt="${name}" class="club-act-avatar" title="${name}">
          <div>
            <div class="club-act-name">${name}</div>
            <div class="club-act-date">${formattedDate}</div>
          </div>
        </div>
        <div class="score-badge" style="margin:0;padding:5px 10px;">
          <div style="font-size:16px;">${act.rider_score}</div>
          <span>pts</span>
        </div>
      </div>

      <div class="club-act-title">${act.name}</div>

      <div class="activity-stats-grid" style="margin-top:10px;">
        <div class="activity-stat-card">
          <div class="activity-stat-val">${parseFloat(act.distance_km).toFixed(1)}</div>
          <div class="activity-stat-lbl">KM</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val">${dur}</div>
          <div class="activity-stat-lbl">Tijd</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val">${act.ascent_m}m</div>
          <div class="activity-stat-lbl">Hoogte</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val">${parseFloat(act.avg_speed_kmh).toFixed(1)}</div>
          <div class="activity-stat-lbl">km/u</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}
