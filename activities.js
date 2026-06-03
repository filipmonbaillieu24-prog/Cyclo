// Cyclo - Activities & Performance Metrics Module
import { state, elements, config, showToast } from './state.js';

let statsChartInstance = null;

export function setupTcxUploader(loadDashboardDataCallback) {
  const dropzone = elements.tcxDropzone;
  const fileInput = elements.tcxFileInput;
  
  if (!dropzone || !fileInput) return;
  
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
}

export function processTcxFile(file, loadDashboardDataCallback) {
  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith('.tcx') && !nameLower.endsWith('.gpx')) {
    showToast("Alleen TCX- en GPX-bestanden worden ondersteund.", "error");
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    const xmlText = e.target.result;
    
    try {
      showToast("Bestand verwerken...", "info");
      
      const parsedRide = window.ActivityParser.parse(xmlText);
      
      // Update UI metrics
      elements.metricDistance.textContent = parsedRide.distanceKm;
      elements.metricDuration.textContent = parsedRide.durationFormatted;
      elements.metricAscent.textContent = parsedRide.totalAscentMeters;
      elements.metricSpeed.textContent = parsedRide.avgSpeedKmh;
      elements.metricHr.textContent = parsedRide.avgHeartRate || '-';
      elements.metricPower.textContent = parsedRide.avgPowerWatts || '-';
      elements.calculatedRiderScore.textContent = parsedRide.riderScore;
      
      // Renders Leaflet route map
      if (parsedRide.coordinates && parsedRide.coordinates.length > 0) {
        elements.routeMap.style.display = 'block';
        window.ActivityParser.drawRouteOnLeaflet('route-map', parsedRide.coordinates);
      } else {
        elements.routeMap.style.display = 'none';
      }
      
      elements.tcxResultPanel.style.display = 'block';
      
      // Sla op in DB/localStorage
      await saveActivity(parsedRide, file.name, loadDashboardDataCallback);
      
      // Update Rider Score
      await updateUserRiderScore(parsedRide.riderScore);
      
      if (typeof loadDashboardDataCallback === 'function') {
        loadDashboardDataCallback();
      }
      
    } catch (err) {
      console.error(err);
      showToast("Fout bij verwerken bestand: " + err.message, "error");
    }
  };
  
  reader.onerror = () => {
    showToast("Fout bij lezen van bestand.", "error");
  };
  
  reader.readAsText(file);
}

export async function updateUserRiderScore(newScore) {
  const currentScore = state.user.rider_score || 100;
  const updatedScore = Math.max(currentScore, newScore); // Neem de hoogste score als Rider Score
  
  if (config.isDemoMode) {
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    const idx = savedMockProfiles.findIndex(p => p.id === state.user.id);
    
    if (idx !== -1) {
      savedMockProfiles[idx].rider_score = updatedScore;
      localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
    } else {
      // Demo-user-id fallback
      const demoProfile = state.profiles.find(p => p.id === state.user.id);
      if (demoProfile) {
        demoProfile.rider_score = updatedScore;
        savedMockProfiles.push(demoProfile);
        localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
      }
    }
    
    state.user.rider_score = updatedScore;
    elements.widgetUserScoreVal.textContent = updatedScore;
    elements.widgetUserScoreContainer.style.display = 'flex';
    
    showToast(`Rider Score lokaal bijgewerkt naar: ${updatedScore}`, "success");
    return;
  }
  
  try {
    const { error } = await config.supabaseClient
      .from('profiles')
      .update({ rider_score: updatedScore })
      .eq('id', state.user.id);
      
    if (error) throw error;
    
    state.user.rider_score = updatedScore;
    elements.widgetUserScoreVal.textContent = updatedScore;
    elements.widgetUserScoreContainer.style.display = 'flex';
    
    showToast(`Rider Score bijgewerkt naar ${updatedScore}!`, "success");
  } catch (err) {
    console.error("Fout bij opslaan Rider Score:", err);
    showToast("Kon Rider Score niet opslaan in database.", "error");
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
    
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }

  try {
    const { error } = await config.supabaseClient
      .from('activities')
      .insert([activityData]);
      
    if (error) throw error;
    
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    console.error("Fout bij opslaan activiteit:", err);
    showToast("Kon rit niet opslaan in database.", "error");
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
      <div class="leaderboard-score">${profile.rider_score || 100}</div>
    `;

    elements.leaderboardList.appendChild(row);
  });
}

export function renderActivitiesList(loadDashboardDataCallback) {
  if (!elements.activitiesListContainer) return;
  elements.activitiesListContainer.innerHTML = '';

  const myActivities = (state.activities || []).filter(act => act.user_id === state.user.id);

  // Update totalen
  if (myActivities.length > 0) {
    let totalDist = 0;
    let totalAsc = 0;
    
    myActivities.forEach(act => {
      totalDist += parseFloat(act.distance_km || 0);
      totalAsc += parseInt(act.ascent_m || 0);
    });

    elements.profileStatDistance.textContent = totalDist.toFixed(1);
    elements.profileStatAscent.textContent = totalAsc;
    elements.profileStatsContainer.style.display = 'grid';
  } else {
    elements.profileStatsContainer.style.display = 'none';
  }

  // Teken de grafiek
  renderStatsChart();

  if (myActivities.length === 0) {
    elements.activitiesListContainer.innerHTML = `
      <div class="empty-state">
        Je hebt nog geen ritten geüpload. Upload een TCX of GPX bestand hiernaast!
      </div>
    `;
    return;
  }

  myActivities.forEach(act => {
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

    actDiv.innerHTML = `
      <div class="activity-header">
        <div>
          <span class="activity-title" style="cursor:pointer; text-decoration:underline; color:var(--primary);" class="btn-view-activity">${act.name}</span>
          <span class="activity-badge">${act.rider_score} pts</span>
        </div>
        <div class="d-flex align-center gap-8">
          <span class="activity-date">${formattedDate}</span>
          <button class="btn-delete-activity" style="background:none; border:none; color:var(--status-unavailable); cursor:pointer;" title="Rit verwijderen">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
          </button>
        </div>
      </div>
      
      <div class="activity-stats-grid">
        <div class="activity-stat-card">
          <div class="activity-stat-val">${parseFloat(act.distance_km).toFixed(1)}</div>
          <div class="activity-stat-lbl">KM</div>
        </div>
        <div class="activity-stat-card">
          <div class="activity-stat-val">${formattedDur}</div>
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
  
  if (activity.coordinates && activity.coordinates.length > 0) {
    elements.routeMap.style.display = 'block';
    window.ActivityParser.drawRouteOnLeaflet('route-map', activity.coordinates);
  } else {
    elements.routeMap.style.display = 'none';
  }
  
  elements.tcxResultPanel.style.display = 'block';
  elements.routeMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast(`Rit "${activity.name}" geladen op de kaart!`, "success");
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
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: 9 }
          }
        },
        'y-score': {
          type: 'linear',
          position: 'left',
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#d4ff00',
            font: { size: 9 }
          },
          title: {
            display: true,
            text: 'Rider Score',
            color: '#d4ff00',
            font: { size: 10, weight: 'bold' }
          }
        },
        'y-dist': {
          type: 'linear',
          position: 'right',
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            color: '#00F0FF',
            font: { size: 9 }
          },
          title: {
            display: true,
            text: 'Afstand (km)',
            color: '#00F0FF',
            font: { size: 10, weight: 'bold' }
          }
        }
      }
    }
  });
}
