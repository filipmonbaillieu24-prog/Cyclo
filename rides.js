// Cyclo - Group Rides Module
import { state, elements, config, showToast } from './state.js';

export function renderRidesList() {
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
  
  sortedRides.forEach(ride => {
    const rideDiv = document.createElement('div');
    rideDiv.classList.add('ride-item');
    
    const opt = { day: 'numeric', month: 'long' };
    const dateFormatted = new Intl.DateTimeFormat('nl-NL', opt).format(new Date(ride.date));
    
    let rideParticipants = [];
    if (config.isDemoMode) {
      rideParticipants = ride.participants || [];
    } else {
      rideParticipants = ride.ride_participants ? ride.ride_participants.map(p => p.user_id) : [];
    }
    
    const isParticipating = state.user ? rideParticipants.includes(state.user.id) : false;
    
    let avatarsHtml = '';
    rideParticipants.forEach(userId => {
      const p = state.profiles.find(prof => prof.id === userId);
      if (p) {
        avatarsHtml += `<img src="${p.avatar_url}" alt="${p.full_name}" class="avatar" title="${p.full_name}">`;
      }
    });
    
    // Check of er een route gekoppeld is of een link
    let routeHtml = '';
    if (ride.activity_id) {
      routeHtml = `<a href="#" class="nav-link view-coupled-route-btn" data-activity-id="${ride.activity_id}" data-ride-title="${ride.title}" style="color:var(--primary); text-decoration:underline; font-size:12px; margin-top: 4px; display:inline-block;"><i data-lucide="map" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Bekijk Route op Kaart</a>`;
    } else if (ride.route_link) {
      routeHtml = `<a href="${ride.route_link}" target="_blank" class="nav-link" style="color:var(--secondary); text-decoration:underline; font-size:12px; margin-top: 4px; display:inline-block;"><i data-lucide="external-link" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Bekijk GPX/Route (Link)</a>`;
    }
      
    rideDiv.innerHTML = `
      <div class="d-flex justify-between align-center">
        <div class="ride-date">${dateFormatted.toUpperCase()}</div>
        ${state.user ? `
        <button class="btn btn-secondary btn-sm btn-join-ride" data-id="${ride.id}">
          ${isParticipating ? '<i data-lucide="x-circle"></i> Afmelden' : '<i data-lucide="check"></i> Deelnemen'}
        </button>` : ''}
      </div>
      <div class="ride-title">${ride.title}</div>
      <p style="font-size: 13px; line-height: 1.4; margin-bottom: 6px;">${ride.description}</p>
      ${routeHtml}
      
      <div class="ride-participants">
        <span style="font-size: 11px; color: var(--text-muted);">${rideParticipants.length} deelnemer(s):</span>
        <div class="ride-participants-avatars">
          ${avatarsHtml}
        </div>
      </div>
    `;
    
    if (state.user) {
      rideDiv.querySelector('.btn-join-ride').addEventListener('click', () => toggleRideParticipation(ride.id, isParticipating));
    }

    // Klik event voor de gekoppelde route
    if (ride.activity_id) {
      rideDiv.querySelector('.view-coupled-route-btn').addEventListener('click', (e) => {
        e.preventDefault();
        showCoupledRoute(ride.activity_id, ride.title);
      });
    }
    
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

export async function toggleRideParticipation(rideId, isParticipating, loadDashboardDataCallback) {
  if (config.isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
    const idx = savedRides.findIndex(r => r.id === rideId);
    
    if (idx !== -1) {
      let participants = savedRides[idx].participants || [];
      if (isParticipating) {
        participants = participants.filter(id => id !== state.user.id);
      } else {
        if (!participants.includes(state.user.id)) {
          participants.push(state.user.id);
        }
      }
      savedRides[idx].participants = participants;
      localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
      
      showToast(isParticipating ? "Afgemeld voor de rit." : "Aangemeld voor de rit!", "success");
      if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    }
    return;
  }
  
  try {
    if (isParticipating) {
      const { error } = await config.supabaseClient
        .from('ride_participants')
        .delete()
        .eq('ride_id', rideId)
        .eq('user_id', state.user.id);
      if (error) throw error;
      
      showToast("Afgemeld voor de rit.", "info");
    } else {
      const { error } = await config.supabaseClient
        .from('ride_participants')
        .insert([{ ride_id: rideId, user_id: state.user.id }]);
      if (error) throw error;
      
      showToast("Succesvol aangemeld voor de rit!", "success");
    }
    
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    showToast(err.message, "error");
  }
}

export function openPlanRideModal() {
  const selectedStr = state.selectedDate.toISOString().split('T')[0];
  elements.rideModalDate.value = selectedStr;
  
  // Update dropdown
  updateRouteDropdown();
  
  elements.rideModal.classList.add('active');
}

export function closePlanRideModal() {
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
  
  if (config.isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
    const newRide = {
      id: `r-user-${Date.now()}`,
      created_by: state.user.id,
      date: date,
      title: title,
      description: description,
      route_link: routeLink,
      activity_id: activityId,
      participants: [state.user.id]
    };
    
    savedRides.push(newRide);
    localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
    
    showToast("Groepsrit succesvol gepland!", "success");
    closePlanRideModal();
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }
  
  try {
    const { data: ride, error: rError } = await config.supabaseClient
      .from('rides')
      .insert([{
        created_by: state.user.id,
        date: date,
        title: title,
        description: description,
        route_link: routeLink,
        activity_id: activityId
      }])
      .select()
      .single();
      
    if (rError) throw rError;
    
    const { error: pError } = await config.supabaseClient
      .from('ride_participants')
      .insert([{ ride_id: ride.id, user_id: state.user.id }]);
      
    if (pError) throw pError;
    
    showToast("Groepsrit succesvol gepland!", "success");
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
