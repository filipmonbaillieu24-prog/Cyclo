/**
 * Cyclo - Core Application Orchestrator (ES6 Module)
 * 
 * Beheert de centrale state, de event loops, de live/offline initialisatie,
 * en fungeert als het centrale startpunt van de webapplicatie.
 */

import { state, elements, config, SUPABASE_URL, SUPABASE_KEY, showToast, navigateTo } from './state.js';
import { 
  checkUserSession, 
  handleLogin, 
  handleRegister, 
  handleLogout, 
  loginMockUser, 
  openEditProfileModal, 
  closeEditProfileModal, 
  saveProfileUpdate,
  translateBikeType,
  setupAvatarEventListeners
} from './auth.js';
import { 
  changeMonth, 
  renderCalendar, 
  updateAvailabilityEditor, 
  saveAvailability,
  selectWeekends,
  clearCalendarSelection,
  saveBulkAvailability
} from './calendar.js';
import { 
  renderRidesList, 
  openPlanRideModal, 
  closePlanRideModal, 
  savePlannedRide,
  updateRouteDropdown
} from './rides.js';
import { 
  setupTcxUploader, 
  loadActivities, 
  renderLeaderboard, 
  renderActivitiesList,
  loadAndRenderFeed,
  renderPersonalRecords
} from './activities.js';
import { setupRealtimeSubscriptions } from './realtime.js';
import { setupZwiftImporter } from './zwift-importer.js';
import { loadSocialFeed, renderFeedCard, searchUsers, followUser, unfollowUser, getFollowStatus, getFollowCounts } from './social.js';
import { initProfileAvatarEditor } from './profile-avatar.js';
import { updateFitnessBaseline, calculateFitnessMetrics, calculatePRs, buildHeatmapData, comparePeriods, calculateMMP, estimateVO2max, compareSeasons, calculateBadges, analyzeTrainingStructure } from './zones.js';
import { renderEquipmentSection, openEquipmentModal } from './equipment.js';
import { checkOnboarding, initHelpButton, renderEmptyState, triggerPageTourIfNew, setCurrentPage } from './onboarding.js';

let activeRealtimeChannel = null;

// 1. INITIALISEER SUPABASE CLIENT
try {
  if (window.supabase && SUPABASE_URL && SUPABASE_KEY && !SUPABASE_KEY.includes('placeholder')) {
    config.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.warn("Supabase credentials niet ingesteld of ongeldig. Demo modus is actief.");
    config.isDemoMode = true;
  }
} catch (e) {
  console.error("Fout bij laden van Supabase client:", e);
  config.isDemoMode = true;
}

// 2. HOOFDFUNCTIE: LAAD ALLE DATA
export async function loadDashboardData() {
  if (config.isDemoMode) {
    loadMockDashboardData();
    return;
  }
  
  try {
    // A. Profielen van alle gebruikers ophalen
    const { data: profiles, error: pError } = await config.supabaseClient
      .from('profiles')
      .select('*');
      
    if (pError) throw pError;
    state.profiles = profiles;
    
    // B. Profiel van huidige ingelogde gebruiker bijwerken in state/UI
    const currentProfile = profiles.find(p => p.id === state.user.id);
    if (currentProfile) {
      state.user = currentProfile;
      if (elements.widgetUserName) elements.widgetUserName.textContent = currentProfile.full_name;
      if (elements.widgetUserUsername) elements.widgetUserUsername.textContent = `@${currentProfile.username}`;
      if (elements.widgetUserAvatar) elements.widgetUserAvatar.src = currentProfile.avatar_url;
      if (elements.widgetUserBiketype) elements.widgetUserBiketype.textContent = translateBikeType(currentProfile.bike_type);
      if (currentProfile.rider_score) {
        if (elements.widgetUserScoreVal) elements.widgetUserScoreVal.textContent = currentProfile.rider_score;
        if (elements.widgetUserScoreContainer) elements.widgetUserScoreContainer.style.display = 'flex';
        // Mijn Ritten sidebar
        const rsp = document.getElementById('rides-score-panel');
        const rsv = document.getElementById('rides-score-val');
        if (rsp) rsp.style.display = 'block';
        if (rsv) rsv.textContent = currentProfile.rider_score;
      }
    }
    
    // C. Beschikbaarheden van deze maand ophalen (niet-fataal)
    const startOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0).toISOString().split('T')[0];
    
    try {
      const { data: availabilities, error: aError } = await config.supabaseClient
        .from('availabilities')
        .select('*')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      if (!aError) state.availabilities = availabilities || [];
      else console.warn('Beschikbaarheden fout (niet-fataal):', aError.message);
    } catch (e) { console.warn('Beschikbaarheden exception:', e); }
    
    // D. Geplande ritten van deze maand ophalen (niet-fataal)
    try {
      const { data: rides, error: rError } = await config.supabaseClient
        .from('rides')
        .select('*, ride_participants(user_id)')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      if (!rError) state.rides = rides || [];
      else console.warn('Ritten fout (niet-fataal):', rError.message);
    } catch (e) { console.warn('Ritten exception:', e); }

    // E. Activiteiten ophalen en UI renderen
    try { await loadActivities(); } catch(e) { console.warn('loadActivities:', e); }

    // ─── Fitness baseline bijwerken na activiteiten laden ─────────
    try { updateFitnessBaseline(state.activities); } catch(e) {}
    try { renderCalendar(); } catch(e) { console.warn('renderCalendar:', e); }
    try { renderRidesList(); } catch(e) { console.warn('renderRidesList:', e); }
    renderActivitiesList(loadDashboardData);
    try { renderLeaderboard(); } catch(e) { console.warn('renderLeaderboard:', e); }
    renderPersonalRecords();
    try { updateRouteDropdown(); } catch(e) { console.warn('updateRouteDropdown:', e); }
    await loadAndRenderFeed();

    // Rider Score herberekenen op basis van alle activiteiten
    _displayRiderScoreFromActivities();

    // Seizoenstatistieken bijwerken
    updateSeasonHeader();

    // Sociale Feed bijwerken
    loadFeedSection();

    // Realtime synchronisatie opzetten (eenmalig)
    if (!activeRealtimeChannel) {
      activeRealtimeChannel = setupRealtimeSubscriptions(loadDashboardData);
    }
    
  } catch (err) {
    console.error("Fout bij ophalen live dashboard data:", err);
    showToast("Fout bij laden live data. Switchen naar demo modus.", "error");
    config.isDemoMode = true;
    loadMockDashboardData();
  }
}

// 3. MOCK DATA VOOR DEMO STAND
export function loadMockDashboardData() {
  let mockProfiles = [
    {
      id: 'demo-user-id',
      username: 'demorider',
      full_name: 'Jij (Demo Rider)',
      avatar_url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=demo',
      rider_score: 0,
      bike_type: 'Road'
    }
  ];
  const extraProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
  
  let profiles = [...mockProfiles];
  extraProfiles.forEach(extra => {
    const idx = profiles.findIndex(p => p.id === extra.id);
    if (idx !== -1) {
      profiles[idx] = extra;
    } else {
      profiles.push(extra);
    }
  });
  state.profiles = profiles;
  
  const savedDemoUser = localStorage.getItem('cyclo_demo_user');
  const currentMockProfile = state.profiles.find(p => p.id === savedDemoUser) || state.profiles[0];
  state.user = currentMockProfile;
  
  if (elements.widgetUserScoreVal) elements.widgetUserScoreVal.textContent = currentMockProfile.rider_score;
  if (elements.widgetUserBiketype) elements.widgetUserBiketype.textContent = translateBikeType(currentMockProfile.bike_type);
  
  if (!localStorage.getItem('cyclo_mock_availabilities')) {
    seedMockAvailabilities();
  }
  
  const savedAvails = JSON.parse(localStorage.getItem('cyclo_mock_availabilities') || '[]');
  const startOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const endOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
  
  state.availabilities = savedAvails.filter(a => {
    const d = new Date(a.date);
    return d >= startOfMonth && d <= endOfMonth;
  });
  
  if (!localStorage.getItem('cyclo_mock_rides')) {
    seedMockRides();
  }
  
  const savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
  state.rides = savedRides.filter(r => {
    const d = new Date(r.date);
    return d >= startOfMonth && d <= endOfMonth;
  });
  
  loadActivities().then(() => {
    try { renderCalendar(); } catch(e) { console.warn('renderCalendar:', e); }
    try { renderRidesList(); } catch(e) { console.warn('renderRidesList:', e); }
    renderActivitiesList(loadDashboardData);
    try { renderLeaderboard(); } catch(e) { console.warn('renderLeaderboard:', e); }
    renderPersonalRecords();
    try { updateRouteDropdown(); } catch(e) { console.warn('updateRouteDropdown:', e); }
    loadAndRenderFeed();

    // Rider Score berekenen en tonen op basis van bestaande ritten
    _displayRiderScoreFromActivities();
  });
}

// Herbereken en toon de Rider Score op basis van alle al geüploade activiteiten
function _displayRiderScoreFromActivities() {
  if (!state.user) return;
  const myActs = (state.activities || []).filter(a => a.user_id === state.user.id);
  if (myActs.length === 0) return;

  const sorted = [...myActs].sort((a, b) => new Date(b.date) - new Date(a.date));
  let weightedSum = 0, weightTotal = 0;
  sorted.forEach((act, i) => {
    const weight = Math.max(0.1, 1.0 - i * 0.1);
    weightedSum += (act.rider_score || 0) * weight;
    weightTotal += weight;
  });
  const avg = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const consistencyBonus = Math.min(30, (myActs.length - 1) * 3);
  const totalKm = myActs.reduce((s, a) => s + parseFloat(a.distance_km || 0), 0);
  const volumeBonus = Math.min(40, totalKm * 0.04);
  const score = Math.max(10, Math.min(1000, Math.round(avg + consistencyBonus + volumeBonus)));

  state.user.rider_score = score;

  // Ook state.profiles bijwerken zodat het klassement de juiste score toont
  const myProfileIdx = state.profiles.findIndex(p => p.id === state.user.id);
  if (myProfileIdx !== -1) {
    state.profiles[myProfileIdx] = { ...state.profiles[myProfileIdx], rider_score: score };
  }

  if (elements.widgetUserScoreVal) elements.widgetUserScoreVal.textContent = score;
  if (elements.widgetUserScoreContainer) elements.widgetUserScoreContainer.style.display = 'flex';
  const rsv = document.getElementById('rides-score-val');
  const rsp = document.getElementById('rides-score-panel');
  if (rsv) rsv.textContent = score;
  if (rsp) rsp.style.display = 'block';

  // Klassement opnieuw renderen met correcte score
  try { renderLeaderboard(); } catch(e) {}
}

function seedMockAvailabilities() {
  const avails = [];
  const today = new Date();
  
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    
    if (dayOfWeek === 0) {
      avails.push({ 
        id: `a-demo-${i}`, 
        user_id: 'demo-user-id', 
        date: dateStr, 
        status: 'available', 
        notes: 'Zondagse koffierit' 
      });
    }
  }
  
  localStorage.setItem('cyclo_mock_availabilities', JSON.stringify(avails));
}

function seedMockRides() {
  const rides = [];
  const today = new Date();
  
  const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (7 - today.getDay()));
  const dateStr1 = d1.toISOString().split('T')[0];
  rides.push({
    id: 'r-demo-1',
    created_by: 'demo-user-id',
    date: dateStr1,
    title: 'Cyclo Opening Ride',
    description: 'Gezamenlijke rit om de app te vieren! Tempo ~28km/u. Iedereen welkom.',
    route_link: 'https://www.komoot.com',
    activity_id: null,
    participants: ['demo-user-id']
  });
  
  localStorage.setItem('cyclo_mock_rides', JSON.stringify(rides));
}

// 4. BIND EVENT LISTENERS
function setupEventListeners() {
  // Navigatie & Home
  elements.logo.addEventListener('click', (e) => { e.preventDefault(); navigateTo(state.user ? 'feed' : 'home'); });
  elements.linkHome.addEventListener('click', (e) => { e.preventDefault(); navigateTo(state.user ? 'feed' : 'home', loadFeedSection); });
  elements.linkDashboard.addEventListener('click', (e) => { e.preventDefault(); navigateTo('dashboard', loadDashboardData); });
  elements.heroBtnStart.addEventListener('click', () => {
    if (state.user) {
      navigateTo('feed', loadFeedSection);
    } else {
      navigateTo('auth');
    }
  });
  
  elements.heroBtnDemo.addEventListener('click', () => {
    config.isDemoMode = true;
    loginMockUser('demo-user-id', loadDashboardData);
    showToast("Demo Modus geactiveerd!", "success");
  });
  
  elements.navAuthItem.addEventListener('click', (e) => {
    if (e.target.id === 'btn-login-nav') {
      e.preventDefault();
      navigateTo('auth');
    }
  });

  // Auth Tabs
  elements.tabLogin.addEventListener('click', () => {
    elements.tabLogin.classList.add('active');
    elements.tabRegister.classList.remove('active');
    elements.formLogin.style.display = 'block';
    elements.formRegister.style.display = 'none';
  });
  
  elements.tabRegister.addEventListener('click', () => {
    elements.tabRegister.classList.add('active');
    elements.tabLogin.classList.remove('active');
    elements.formRegister.style.display = 'block';
    elements.formLogin.style.display = 'none';
  });
  
  elements.authBypassLink.addEventListener('click', (e) => {
    e.preventDefault();
    config.isDemoMode = true;
    loginMockUser('demo-user-id', loadDashboardData);
    showToast("Demo Modus gestart", "success");
  });
  
  // Submit handlers voor Auth & logout
  elements.formLogin.addEventListener('submit', (e) => handleLogin(e, loadDashboardData));
  elements.formRegister.addEventListener('submit', (e) => handleRegister(e, loadDashboardData));
  elements.btnLogout.addEventListener('click', () => handleLogout(loadDashboardData));
  
  // Profile settings modal handlers
  elements.btnEditProfile.addEventListener('click', openEditProfileModal);
  elements.btnCloseProfileModal.addEventListener('click', closeEditProfileModal);
  elements.profileModal.addEventListener('click', (e) => {
    if (e.target === elements.profileModal) closeEditProfileModal();
  });
  elements.formEditProfile.addEventListener('submit', (e) => saveProfileUpdate(e, loadDashboardData));

  // Kalender navigatie
  elements.btnPrevMonth.addEventListener('click', () => changeMonth(-1, loadDashboardData));
  elements.btnNextMonth.addEventListener('click', () => changeMonth(1, loadDashboardData));
  elements.btnToday.addEventListener('click', () => {
    state.currentDate = new Date();
    state.selectedDate = new Date();
    renderCalendar();
    updateAvailabilityEditor();
    loadDashboardData();
  });
  
  // Status knoppen beschikbaarheidswidget
  const statusBtns = [elements.statusBtnAvail, elements.statusBtnTent, elements.statusBtnUnavail];
  statusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      statusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedStatus = btn.dataset.status;
    });
  });
  
  elements.btnSaveAvailability.addEventListener('click', () => saveAvailability(loadDashboardData));

  // Multi-dag selectie knoppen
  const btnWeekends = document.getElementById('btn-select-weekends');
  if (btnWeekends) btnWeekends.addEventListener('click', () => selectWeekends());

  const btnClearSel = document.getElementById('btn-clear-selection');
  if (btnClearSel) btnClearSel.addEventListener('click', () => clearCalendarSelection());

  const btnSaveBulk = document.getElementById('btn-save-bulk');
  if (btnSaveBulk) btnSaveBulk.addEventListener('click', () => saveBulkAvailability(loadDashboardData));

  const btnCancelBulk = document.getElementById('btn-cancel-bulk');
  if (btnCancelBulk) btnCancelBulk.addEventListener('click', () => clearCalendarSelection());
  
  // Plannen groepsritten
  elements.btnPlanRide.addEventListener('click', openPlanRideModal);
  elements.btnCloseModal.addEventListener('click', closePlanRideModal);
  elements.rideModal.addEventListener('click', (e) => {
    if (e.target === elements.rideModal) closePlanRideModal();
  });
  elements.formPlanRide.addEventListener('submit', (e) => savePlannedRide(e, loadDashboardData));
  
  // Uploader config
  setupTcxUploader(loadDashboardData);

  // Zwift auto-importer
  setupZwiftImporter(
    (file, cb) => { import('./activities.js').then(m => m.processTcxFile(file, cb)); },
    loadDashboardData
  );

  // Avatar live preview en presets initialiseren
  setupAvatarEventListeners();

  // ─── Route Builder ────────────────────────────────────────────
  const rbToggle  = document.getElementById('route-builder-toggle');
  const rbContent = document.getElementById('route-builder-content');
  const rbChevron = document.getElementById('route-builder-chevron');
  let routeBuilderInited = false;

  if (rbToggle && rbContent) {
    // Begin ingeklapt
    rbContent.style.display = 'none';

    rbToggle.addEventListener('click', async () => {
      const isOpen = rbContent.style.display !== 'none';
      if (isOpen) {
        rbContent.style.display = 'none';
        if (rbChevron) rbChevron.style.transform = '';
      } else {
        rbContent.style.display = 'block';
        if (rbChevron) rbChevron.style.transform = 'rotate(180deg)';
        // Initialiseer Leaflet kaart de eerste keer
        if (!routeBuilderInited) {
          routeBuilderInited = true;
          try {
            const rb = await import('./route-builder.js');
            rb.initRouteBuilder('route-builder-map', {
              onWaypointChange: (count, distKm, durMin) => {
                const distEl = document.getElementById('route-distance');
                const durEl  = document.getElementById('route-duration');
                const cntEl  = document.getElementById('route-waypoint-count');
                const gpxBtn = document.getElementById('btn-download-gpx');
                const undoBtn = document.getElementById('btn-undo-waypoint');
                const clrBtn  = document.getElementById('btn-clear-route');
                if (distEl) distEl.textContent = distKm > 0 ? distKm.toFixed(1) + ' km' : '—';
                if (durEl)  durEl.textContent  = durMin  > 0 ? Math.floor(durMin) + ' min' : '—';
                if (cntEl)  cntEl.textContent  = count;
                if (gpxBtn)  gpxBtn.style.display  = count >= 2 ? '' : 'none';
                if (undoBtn) undoBtn.disabled = count === 0;
                if (clrBtn)  clrBtn.disabled  = count === 0;
              }
            });
          } catch(e) { console.warn('Route builder init fout:', e); }
        }
      }
    });

    // Undo / clear / download knoppen
    document.getElementById('btn-undo-waypoint')?.addEventListener('click', async () => {
      const rb = await import('./route-builder.js').catch(() => null);
      if (rb?.undoLastWaypoint) rb.undoLastWaypoint();
    });
    document.getElementById('btn-clear-route')?.addEventListener('click', async () => {
      const rb = await import('./route-builder.js').catch(() => null);
      if (rb?.clearRoute) rb.clearRoute();
    });
    document.getElementById('btn-download-gpx')?.addEventListener('click', async () => {
      const nameEl = document.getElementById('route-name-input');
      const name = nameEl?.value || 'Cyclo Route';
      const rb = await import('./route-builder.js').catch(() => null);
      if (rb?.downloadRouteAsGpx) rb.downloadRouteAsGpx(name);
    });
  }

  // ─── Profiel pagina avatar customizer ────────────────────────
  // State voor de avatar op de profielpagina
  const profileAvatarState = { bg: 'transparent', skin: 'f2d3b1', haircolor: '6a4e35', hair: 'short01', eyes: 'variant01', mouth: 'variant01' };

  function buildProfileAvatarUrl() {
    const s = profileAvatarState;
    let url = `https://api.dicebear.com/7.x/adventurer/svg?seed=profile_${s.skin}_${s.hair}_${s.eyes}`;
    if (s.bg !== 'transparent') url += `&backgroundColor=${s.bg}`;
    url += `&skinColor=${s.skin}&hairColor=${s.haircolor}&hair=${s.hair}&eyes=${s.eyes}&mouth=${s.mouth}`;
    return url;
  }

  function updateProfileAvatarPreview() {
    const preview = document.getElementById('profile-page-preview-avatar');
    if (preview) preview.src = buildProfileAvatarUrl();
  }

  // Swatches op profielpagina
  document.querySelectorAll('#profile-swatches-bg .swatch-circle, #profile-swatches-skin .swatch-circle, #profile-swatches-haircolor .swatch-circle').forEach(sw => {
    sw.addEventListener('click', () => {
      const prop = sw.dataset.prop;
      const val  = sw.dataset.val;
      if (prop === 'bg')        profileAvatarState.bg        = val;
      if (prop === 'skin')      profileAvatarState.skin      = val;
      if (prop === 'haircolor') profileAvatarState.haircolor = val;
      const group = sw.closest('.avatar-swatches');
      group?.querySelectorAll('.swatch-circle').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      updateProfileAvatarPreview();
    });
  });

  // Chips op profielpagina
  document.querySelectorAll('.profile-page-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prop = chip.dataset.prop;
      const val  = chip.dataset.val;
      if (prop in profileAvatarState) profileAvatarState[prop] = val;
      const grid = chip.closest('.choice-chips-grid');
      grid?.querySelectorAll('.choice-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      updateProfileAvatarPreview();
    });
  });

  // Preset chips op profielpagina
  document.querySelectorAll('.profile-page-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      const seed = preset.dataset.seed;
      const url  = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
      const preview = document.getElementById('profile-page-preview-avatar');
      if (preview) preview.src = url;
      preset._customUrl = url;
    });
  });

  // Willekeurig avatar op profielpagina
  document.getElementById('btn-profile-randomize')?.addEventListener('click', () => {
    const seed = Math.random().toString(36).substring(2, 8);
    const url  = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
    const preview = document.getElementById('profile-page-preview-avatar');
    if (preview) preview.src = url;
  });


  // Navigatie-link naar Mijn Ritten pagina
  if (elements.linkRides) {
    elements.linkRides.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('rides', loadDashboardData);
    });
  }

  // Profiel knop in nav
  if (elements.linkProfile) {
    elements.linkProfile.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('profile', loadProfilePage);
    });
  }

  // Profiel uitlog knop op profielpagina
  const btnProfileLogout = document.getElementById('btn-profile-page-logout');
  if (btnProfileLogout) {
    btnProfileLogout.addEventListener('click', () => handleLogout(loadDashboardData));
  }

  // Profiel bewerken formulier op profielpagina
  const formProfilePage = document.getElementById('form-profile-page');
  if (formProfilePage) {
    formProfilePage.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullname = document.getElementById('profile-page-fullname-input')?.value;
      const username = document.getElementById('profile-page-username-input')?.value;
      const biketype = document.getElementById('profile-page-biketype-input')?.value;
      const height   = document.getElementById('profile-page-height-input')?.value;
      const weight   = document.getElementById('profile-page-weight-input')?.value;

      // Hergebruik bestaande saveProfileUpdate logica via form-edit-profile
      if (elements.profileModalFullname)  elements.profileModalFullname.value  = fullname || '';
      if (elements.profileModalUsername)  elements.profileModalUsername.value  = username || '';
      if (elements.profileModalBiketype)  elements.profileModalBiketype.value  = biketype || 'Road';
      const heightInput = document.getElementById('profile-modal-height');
      const weightInput = document.getElementById('profile-modal-weight');
      if (heightInput) heightInput.value = height || '';
      if (weightInput) weightInput.value = weight || '';

      const fakeEvent = { preventDefault: () => {} };
      await saveProfileUpdate(fakeEvent, loadDashboardData);
      loadProfilePage();
    });
  }

  // Mobiele navigatie
  const mobLinks = [
    ['mob-link-home',    () => navigateTo(state.user ? 'feed' : 'home', loadFeedSection)],
    ['mob-link-planner', () => navigateTo('dashboard', loadDashboardData)],
    ['mob-link-rides',   () => navigateTo('rides', loadDashboardData)],
    ['mob-link-profile', () => navigateTo('profile', loadProfilePage)],
  ];
  mobLinks.forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
  });

  // Gebruikerszoeken
  const searchInput = document.getElementById('user-search-input');
  const searchResults = document.getElementById('user-search-results');
  if (searchInput && searchResults) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (q.length < 2) { searchResults.style.display = 'none'; return; }
      searchTimer = setTimeout(async () => {
        const users = await searchUsers(q);
        searchResults.style.display = 'block';
        searchResults.innerHTML = users.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);padding:8px;">Geen renners gevonden.</div>'
          : users.map(u => `
            <div class="user-search-result" data-user-id="${u.id}">
              <img src="${u.avatar_url || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + u.id}" alt="${u.full_name}">
              <div>
                <div class="user-search-result-name">${u.full_name}</div>
                <div class="user-search-result-username">@${u.username} &middot; ${u.rider_score || 0} pts</div>
              </div>
              <button class="btn-follow" data-user-id="${u.id}" style="margin-left:auto;">Volgen</button>
            </div>`).join('');
        // Bind follow buttons
        searchResults.querySelectorAll('.btn-follow').forEach(btn => {
          btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await followUser(btn.dataset.userId);
            btn.textContent = '✓ Volgend';
            btn.classList.add('following');
          });
        });
      }, 350);
    });
  }

  // Feed tabs
  const tabAll       = document.getElementById('tab-feed-all');
  const tabFollowing = document.getElementById('tab-feed-following');
  if (tabAll && tabFollowing) {
    tabAll.addEventListener('click', () => {
      tabAll.classList.add('active'); tabFollowing.classList.remove('active');
      loadFeedSection(false);
    });
    tabFollowing.addEventListener('click', () => {
      tabFollowing.classList.add('active'); tabAll.classList.remove('active');
      loadFeedSection(true);
    });
  }

  // ─── Mijn Ritten pagina tabs ─────────────────────────────────
  document.querySelectorAll('.rides-page-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Actieve tab markeren
      document.querySelectorAll('.rides-page-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;

      // Panels tonen/verbergen
      const myContent    = document.getElementById('my-rides-content');
      const clubContent  = document.getElementById('club-rides-content');
      const statsContent = document.getElementById('stats-content');

      if (myContent)    myContent.style.display    = which === 'my'    ? '' : 'none';
      if (clubContent)  clubContent.style.display  = which === 'club'  ? '' : 'none';
      if (statsContent) statsContent.style.display = which === 'stats' ? '' : 'none';

      // Statistieken panel
      const chartPanel = document.getElementById('stats-chart-panel');
      if (chartPanel) chartPanel.style.display = which === 'stats' ? 'block' : 'none';

      // Club rides laden als je dat tabblad opent
      if (which === 'club') {
        loadClubRidesTab();
      }
    });
  });

  // \"Naar Planner\" knop op Mijn Ritten pagina
  const btnGoPlanner = document.getElementById('btn-go-planner');
  if (btnGoPlanner) {
    btnGoPlanner.addEventListener('click', () => navigateTo('dashboard', loadDashboardData));
  }
}

// ─── Club Ritten tab laden ─────────────────────────────────
async function loadClubRidesTab() {
  const list = document.getElementById('club-activities-list');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Laden...</div>';

  let acts = [];
  if (config.isDemoMode) {
    acts = [...(state.activities || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  } else {
    try {
      const { data } = await config.supabaseClient
        .from('activities')
        .select('*, profiles!activities_user_id_fkey(full_name, avatar_url, username)')
        .order('date', { ascending: false })
        .limit(30);
      acts = data || [];
    } catch (_) {
      const { data } = await config.supabaseClient
        .from('activities').select('*').order('date', { ascending: false }).limit(30)
        .catch(() => ({ data: [] }));
      acts = data || [];
    }
  }

  if (!acts.length) {
    list.innerHTML = '<div class="empty-state">Geen ritten van andere leden gevonden.</div>';
    return;
  }

  list.innerHTML = '';
  acts.forEach(act => {
    const profile = act.profiles || state.profiles?.find(p => p.id === act.user_id) || {};
    const name = profile.full_name || 'Onbekend';
    const dur = (() => {
      const s = parseFloat(act.duration_secs || 0);
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
      return h > 0 ? `${h}u ${m}m` : `${m}m`;
    })();
    const card = document.createElement('div');
    card.className = 'activity-item';
    card.innerHTML = `
      <div class="activity-header">
        <div class="activity-type-icon">🚴</div>
        <div style="flex:1;min-width:0;">
          <div class="activity-title">${act.name || 'Rit'}</div>
          <div class="activity-date">${name} · ${new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(new Date(act.date))}</div>
        </div>
        <div class="activity-badge">${act.rider_score || 0} pts</div>
      </div>
      <div class="activity-stats-grid">
        <div class="activity-stat-card"><div class="activity-stat-val color-dist">${parseFloat(act.distance_km||0).toFixed(1)}</div><div class="activity-stat-lbl">km</div></div>
        <div class="activity-stat-card"><div class="activity-stat-val color-time">${dur}</div><div class="activity-stat-lbl">Tijd</div></div>
        <div class="activity-stat-card"><div class="activity-stat-val color-ascent">${act.ascent_m||0}</div><div class="activity-stat-lbl">hm</div></div>
        <div class="activity-stat-card"><div class="activity-stat-val color-speed">${parseFloat(act.avg_speed_kmh||0).toFixed(1)}</div><div class="activity-stat-lbl">km/u</div></div>
      </div>`;

    // Interval tijdlijn toevoegen
    try { renderIntervalTimeline(card, act); } catch(e) {}

    list.appendChild(card);
  });

  // Lege staat als geen activiteiten
  if ((acts||[]).length === 0) {
    renderEmptyState(list, {
      emoji: '📂',
      title: 'Nog geen ritten geüpload',
      desc: 'Upload je eerste .fit, .tcx of .gpx bestand om je trainingsdata te zien.',
      ctaText: '+ Rit uploaden',
      ctaAction: () => elements.tcxFileInput?.click(),
    });
  }
}


// ─── Sociale Feed Laden & Renderen ──────────────────────────────────
export async function loadFeedSection(followingOnly = false) {
  // Update nav avatar
  updateNavProfile();

  // Feed mini-stats
  if (state.user) {
    const feedPanel = document.getElementById('feed-my-stats-panel');
    if (feedPanel) {
      feedPanel.style.display = 'block';
      const myAct = (state.activities || []).filter(a => a.user_id === state.user.id);
      const nameEl = document.getElementById('feed-my-name');
      const unEl   = document.getElementById('feed-my-username');
      const avEl   = document.getElementById('feed-my-avatar');
      const scEl   = document.getElementById('feed-stat-score');
      const rdEl   = document.getElementById('feed-stat-rides');
      if (nameEl) nameEl.textContent = state.user.full_name || '';
      if (unEl)   unEl.textContent   = state.user.username ? '@' + state.user.username : '';
      if (avEl)   avEl.src           = state.user.avatar_url || '';
      if (scEl)   scEl.textContent   = state.user.rider_score || 0;
      if (rdEl)   rdEl.textContent   = myAct.length;

      // Volg statistieken
      if (!config.isDemoMode && state.user) {
        const counts = await getFollowCounts(state.user.id).catch(() => ({ followers: 0, following: 0 }));
        const fwEl = document.getElementById('feed-stat-following');
        const frEl = document.getElementById('feed-stat-followers');
        if (fwEl) fwEl.textContent = counts.following;
        if (frEl) frEl.textContent = counts.followers;
      }
    }
  }

  // Leaderboard renderen
  try { renderLeaderboard(); } catch(e) {}

  // Suggesties (andere renners)
  const suggList = document.getElementById('feed-suggestions-list');
  if (suggList && state.profiles) {
    const others = state.profiles.filter(p => p.id !== state.user?.id).slice(0, 8);
    suggList.innerHTML = others.map(p => `
      <div class="feed-suggestion-row">
        <img src="${p.avatar_url || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + p.id}" alt="${p.full_name}">
        <div>
          <div class="feed-suggestion-name">${p.full_name}</div>
          <div class="feed-suggestion-score">${p.rider_score || 0} pts</div>
        </div>
        <button class="btn-follow btn-sm" data-user-id="${p.id}" style="font-size:10px;padding:3px 10px;">Volgen</button>
      </div>`).join('');
    // Volg knoppen binden
    suggList.querySelectorAll('.btn-follow').forEach(btn => {
      btn.addEventListener('click', async () => {
        await followUser(btn.dataset.userId);
        btn.textContent = '✓'; btn.classList.add('following');
      });
    });
  }

  // Feed activiteiten laden
  const feedList = document.getElementById('social-feed-list');
  if (!feedList) return;
  feedList.innerHTML = '<div class="empty-state">Feed laden...</div>';

  let activities;
  if (config.isDemoMode) {
    // Demo: gebruik alle activiteiten in state (inclusief eigen)
    activities = [...(state.activities || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  } else if (followingOnly) {
    // "Volgend" tab: gevolgden + eigen
    activities = await loadSocialFeed();
    // Voeg eigen activiteiten toe als ze er niet in zitten
    const ownActs = (state.activities || []).filter(a => a.user_id === state.user?.id);
    const existingIds = new Set(activities.map(a => a.id));
    ownActs.forEach(a => { if (!existingIds.has(a.id)) activities.push(a); });
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  } else {
    // "Iedereen" tab: probeer Supabase, val terug op state.activities
    try {
      const { data, error } = await config.supabaseClient
        .from('activities')
        .select('*, profiles!activities_user_id_fkey(full_name, avatar_url, username, rider_score)')
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      activities = data || [];
    } catch (err) {
      // Probeer zonder join als de FK naam anders is
      try {
        const { data } = await config.supabaseClient
          .from('activities')
          .select('*')
          .order('date', { ascending: false })
          .limit(50);
        activities = data || [];
      } catch (_) { activities = []; }
    }
    // Voeg altijd eigen activiteiten toe die misschien ontbreken
    const ownActs = (state.activities || []).filter(a => a.user_id === state.user?.id);
    const existingIds = new Set(activities.map(a => a.id));
    ownActs.forEach(a => { if (!existingIds.has(a.id)) activities.push(a); });
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  if (!activities || activities.length === 0) {
    feedList.innerHTML = '<div class="empty-state">Nog geen activiteiten in je feed.<br>Upload een rit of volg andere renners!</div>';
    return;
  }

  feedList.innerHTML = '';

  // Laad welke gebruikers al gevolgd worden (voor correcte knop-staat)
  let followedIds = new Set();
  if (!config.isDemoMode && state.user) {
    try {
      const { data: myFollows } = await config.supabaseClient
        .from('follows').select('following_id').eq('follower_id', state.user.id);
      (myFollows || []).forEach(f => followedIds.add(f.following_id));
    } catch (_) {}
  }

  for (const act of activities.slice(0, 30)) {
    const profileData = act.profiles || state.profiles?.find(p => p.id === act.user_id);
    const card = renderFeedCard(act, profileData);
    feedList.appendChild(card);
    // Volg-knop: status instellen op basis van huidig volgstatus
    card.querySelectorAll('.btn-follow').forEach(btn => {
      const uid = btn.dataset.userId;
      if (followedIds.has(uid)) {
        btn.innerHTML = '<i data-lucide="user-check" style="width:12px;height:12px;"></i> Volgend';
        btn.classList.add('following');
        btn.addEventListener('click', async () => {
          const ok = await unfollowUser(uid);
          if (ok) {
            followedIds.delete(uid);
            btn.innerHTML = '<i data-lucide="user-plus" style="width:12px;height:12px;"></i> Volgen';
            btn.classList.remove('following');
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        });
      } else {
        btn.addEventListener('click', async () => {
          const ok = await followUser(uid);
          if (ok) {
            followedIds.add(uid);
            btn.innerHTML = '<i data-lucide="user-check" style="width:12px;height:12px;"></i> Volgend';
            btn.classList.add('following');
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        });
      }
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Profiel Pagina Laden ───────────────────────────────────────────
function loadProfilePage() {
  if (!state.user) return;
  const u = state.user;

  // Header info
  const avatarEl  = document.getElementById('profile-page-avatar');
  const previewEl = document.getElementById('profile-page-preview-avatar');
  const nameEl    = document.getElementById('profile-page-name');
  const unEl      = document.getElementById('profile-page-username');
  const ridersEl  = document.getElementById('profile-page-riders');
  const scoreEl   = document.getElementById('profile-page-score');

  if (avatarEl)  avatarEl.src  = u.avatar_url || '';
  if (previewEl) previewEl.src = u.avatar_url || '';
  if (nameEl)    nameEl.textContent = u.full_name || '';
  if (unEl)      unEl.textContent   = u.username ? '@' + u.username : '';
  const myAct = (state.activities || []).filter(a => a.user_id === u.id);
  if (ridersEl)  ridersEl.textContent = myAct.length;
  if (scoreEl)   scoreEl.textContent  = u.rider_score || 0;

  // ─── Analytics secties renderen ────────────────────────────────
  try { renderProfileAnalytics(); } catch(e) { console.warn('renderProfileAnalytics:', e); }

  // Volg stats
  if (!config.isDemoMode) {
    getFollowCounts(u.id).then(counts => {
      const fwEl = document.getElementById('profile-page-following-cnt');
      const frEl = document.getElementById('profile-page-followers-cnt');
      if (fwEl) fwEl.textContent = counts.following;
      if (frEl) frEl.textContent = counts.followers;
    }).catch(() => {});
  }

  // Vul formulier in
  const fnInput = document.getElementById('profile-page-fullname-input');
  const unInput = document.getElementById('profile-page-username-input');
  const btInput = document.getElementById('profile-page-biketype-input');
  const htInput = document.getElementById('profile-page-height-input');
  const wtInput = document.getElementById('profile-page-weight-input');
  if (fnInput) fnInput.value = u.full_name || '';
  if (unInput) unInput.value = u.username || '';
  if (btInput) btInput.value = u.bike_type || 'Road';
  if (htInput) htInput.value = u.height || '';
  if (wtInput) wtInput.value = u.weight || '';

  // Avatar presets binden
  const profilePresets = document.querySelectorAll('#section-profile .avatar-preset-chip');
  profilePresets.forEach(chip => {
    chip.addEventListener('click', () => {
      const seed = chip.dataset.seed;
      const url  = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
      if (previewEl) previewEl.src = url;
      chip._selectedUrl = url;
    });
  });

  // Willekeurig avatar
  const randomBtn = document.getElementById('btn-profile-randomize');
  if (randomBtn) {
    randomBtn.addEventListener('click', () => {
      const seed = Math.random().toString(36).substring(2, 8);
      const url  = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
      if (previewEl) previewEl.src = url;
    });
  }

  // Avatar opslaan
  const saveAvatarBtn = document.getElementById('btn-profile-save-avatar');
  if (saveAvatarBtn) {
    saveAvatarBtn.onclick = async () => {
      const url = previewEl?.src;
      if (!url) return;
      if (elements.profileModalAvatar) elements.profileModalAvatar.value = url;
      const fakeEvent = { preventDefault: () => {} };
      await saveProfileUpdate(fakeEvent, loadDashboardData);
      if (avatarEl) avatarEl.src = url;
      updateNavProfile();
      showToast('Avatar opgeslagen!', 'success');
    };
  }

  // Volledige avatar customizer initialiseren
  initProfileAvatarEditor();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Nav Avatar Updaten ─────────────────────────────────────────────
function updateNavProfile() {
  if (!state.user) return;
  const navAvatar   = document.getElementById('nav-avatar-img');
  const navUsername = document.getElementById('nav-username-label');
  const navAuthItem = elements.navAuthItem;
  const navProfItem = document.getElementById('nav-profile-item');

  if (navAvatar)   navAvatar.src       = state.user.avatar_url || '';
  if (navUsername) navUsername.textContent = state.user.full_name?.split(' ')[0] || '';
  if (navAuthItem) navAuthItem.style.display = 'none';
  if (navProfItem) navProfItem.style.display = 'flex';

  // Toon auth-only elementen
  document.querySelectorAll('.auth-only').forEach(el => {
    el.style.display = el.classList.contains('nav-profile-item') ? 'flex' : '';
  });
}


// ─── Seizoen Header Statistieken ────────────────────────────────────
function updateSeasonHeader() {
  const myActs = (state.activities || []).filter(a => a.user_id === state.user?.id);
  if (!myActs.length) return;

  const totalKm   = myActs.reduce((s, a) => s + parseFloat(a.distance_km || 0), 0);
  const totalHm   = myActs.reduce((s, a) => s + parseInt(a.ascent_m || 0), 0);
  const totalSecs = myActs.reduce((s, a) => s + parseFloat(a.duration_secs || 0), 0);
  const score     = state.user?.rider_score || 0;

  const hours = Math.floor(totalSecs / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}u ${mins}m` : `${mins}m`;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('season-km',    totalKm.toFixed(0) + ' km');
  set('season-rides', myActs.length);
  set('season-hm',    totalHm.toLocaleString('nl-NL') + ' m');
  set('season-time',  timeStr);
  set('season-score', score);
}
// 5. APPLICATIE INITIALISATIE RUN
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupEventListeners();
  checkUserSession(loadDashboardData);
  // Expose voor ride delete callbacks
  window._loadDashboardData = loadDashboardData;

  // ── Supabase auth state watcher ──────────────────────────────────────
  // Luistert naar sessie-wijzigingen (inloggen, uitloggen, email-bevestiging,
  // token-refresh). Zo worden data en RLS altijd correct geladen met de
  // actuele sessie, ook bij nieuwe gebruikers die na registratie inloggen.
  if (!config.isDemoMode && config.supabaseClient) {
    let lastUserId = null; // Voorkom dubbele herlaad bij zelfde gebruiker

    config.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth]', event, session?.user?.id);

      if (event === 'SIGNED_IN' && session?.user) {
        // Voorkom dubbele herlaad als de sessie al actief was
        if (lastUserId === session.user.id) return;
        lastUserId = session.user.id;

        try {
          // Wacht even zodat Supabase triggers (profile aanmaken) klaar zijn
          await new Promise(r => setTimeout(r, 800));

          // Haal profiel op met verse sessie-token
          const { data: profile, error } = await config.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && !error) {
            // Stel de gebruiker in en herlaad alle data
            const { setUser } = await import('./auth.js');
            setUser(profile, loadDashboardData);
          } else {
            // Profiel ontbreekt nog (trigger niet klaar) — doe checkUserSession
            await checkUserSession(loadDashboardData);
          }
        } catch (err) {
          console.warn('[Auth] Fout bij herinitialisatie na SIGNED_IN:', err);
        }

      } else if (event === 'SIGNED_OUT') {
        lastUserId = null;
        // Reset state en toon inlogscherm
        const { setUser } = await import('./auth.js');
        setUser(null, loadDashboardData);

      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Token vernieuwd — herlaad data stil op de achtergrond
        if (lastUserId === session.user.id) {
          // Herlaad alleen data, niet het volledige setUser
          loadDashboardData();
        }
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ANALYTICS RENDERING — Heatmap, PR Tracker, Fitness Grafiek, Vergelijking
// ════════════════════════════════════════════════════════════════════════════

// Wordt aangeroepen wanneer de profielpagina zichtbaar wordt
export function renderProfileAnalytics() {
  const acts = state.activities || [];
  if (!acts.length) return;

  renderActivityHeatmap(acts);
  renderPRTracker(acts);
  renderFitnessChart(acts);
  renderPeriodComparison(acts);

  // Nieuwe analytics
  try { renderVO2max(acts); }       catch(e) { console.warn('VO2max:', e); }
  try { renderMMPCurve(acts); }     catch(e) { console.warn('MMP:', e); }
  try { renderSeasonChart(acts); }  catch(e) { console.warn('Season:', e); }
  try { renderBadgeWall(acts); }    catch(e) { console.warn('Badges:', e); }
  try { renderEquipmentSection(); } catch(e) { console.warn('Equipment:', e); }

  // Equipment knop
  const addEqBtn = document.getElementById('btn-add-equipment');
  if (addEqBtn && !addEqBtn._eqBound) {
    addEqBtn._eqBound = true;
    addEqBtn.addEventListener('click', () => openEquipmentModal());
  }
}

// ─── Activiteiten Heatmap ────────────────────────────────────────────────────
function renderActivityHeatmap(activities) {
  const container = document.getElementById('activity-heatmap');
  if (!container) return;
  container.innerHTML = '';

  const heatData = buildHeatmapData(activities);
  const today    = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1); // 1 jan dit jaar

  // Bereken startdag (maandag voor 1 jan)
  const startOffset = (startDate.getDay() + 6) % 7; // 0=ma
  startDate.setDate(startDate.getDate() - startOffset);

  const MONTHS = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';

  // Tooltip element
  let tooltip = document.getElementById('heatmap-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'heatmap-tooltip';
    tooltip.className = 'heatmap-tooltip';
    document.body.appendChild(tooltip);
  }

  const curYear = today.getFullYear();
  const endDate = new Date(curYear, 11, 31);
  let d = new Date(startDate);

  while (d <= endDate) {
    const ds = d.toISOString().split('T')[0];
    const info = heatData[ds];
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    const km = info ? info.km : 0;
    const level = km === 0 ? 0 : km < 30 ? 1 : km < 60 ? 2 : km < 100 ? 3 : 4;
    cell.dataset.level = level;
    cell.dataset.date  = ds;

    cell.addEventListener('mouseenter', (e) => {
      const txt = info
        ? `${ds}: ${info.count} rit(ten) · ${info.km.toFixed(0)} km`
        : `${ds}: geen activiteit`;
      tooltip.textContent = txt;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top  = (e.clientY - 28) + 'px';
    });
    cell.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

    grid.appendChild(cell);
    d.setDate(d.getDate() + 1);
  }

  container.appendChild(grid);
}

// ─── PR Tracker ──────────────────────────────────────────────────────────────
function renderPRTracker(activities) {
  const grid = document.getElementById('pr-tracker-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const prs = calculatePRs(activities);
  if (prs.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Upload ritten om je PR\'s te zien.</div>';
    return;
  }

  for (const pr of prs) {
    const b = pr.best;
    const card = document.createElement('div');
    card.className = 'pr-card';
    card.innerHTML = `
      <div class="pr-bucket-label">${pr.bucket}<span class="pr-count-badge">${pr.count}×</span></div>
      <div class="pr-stat-row"><span class="pr-stat-lbl">Beste afstand</span><span class="pr-stat-val">${b.distance.toFixed(1)} km</span></div>
      <div class="pr-stat-row"><span class="pr-stat-lbl">Topsnelheid gem.</span><span class="pr-stat-val">${b.speed.toFixed(1)} km/u</span></div>
      ${b.ascent > 0 ? `<div class="pr-stat-row"><span class="pr-stat-lbl">Max hoogtemeters</span><span class="pr-stat-val">${b.ascent} m</span></div>` : ''}
      ${b.power > 0  ? `<div class="pr-stat-row"><span class="pr-stat-lbl">Max gem. vermogen</span><span class="pr-stat-val">${b.power} W</span></div>` : ''}
    `;
    grid.appendChild(card);
  }
}

// ─── CTL / ATL / TSB Fitness Grafiek ─────────────────────────────────────────
let _fitnessChart = null;
function renderFitnessChart(activities) {
  const canvas = document.getElementById('fitness-chart');
  const pills  = document.getElementById('fitness-pills');
  if (!canvas || !pills) return;

  const metrics = calculateFitnessMetrics(activities);
  if (!metrics.length) return;

  const latest = metrics[metrics.length - 1];
  const tsb    = latest.tsb;

  // Status bepalen
  let status = 'neutral', statusLabel = 'Neutraal';
  if      (tsb > 10)              { status = 'fresh';   statusLabel = `🟢 Fris (+${tsb})`; }
  else if (tsb < -10)             { status = 'tired';   statusLabel = `🔴 Vermoeid (${tsb})`; }
  else if (tsb >= 0 && tsb <= 10) { status = 'optimal'; statusLabel = `⚡ Optimale vorm (+${tsb})`; }
  else                            { status = 'tired';   statusLabel = `🟡 Licht vermoeid (${tsb})`; }

  pills.innerHTML = `
    <div class="fitness-pill"><span class="fitness-pill-val" style="color:#60a5fa;">${latest.ctl.toFixed(0)}</span><span class="fitness-pill-lbl">CTL / Fitheid</span></div>
    <div class="fitness-pill"><span class="fitness-pill-val" style="color:#f87171;">${latest.atl.toFixed(0)}</span><span class="fitness-pill-lbl">ATL / Vermoeidheid</span></div>
    <div class="fitness-pill"><span class="fitness-pill-val" style="color:${tsb >= 0 ? '#4ade80' : '#f87171'};">${tsb >= 0 ? '+' : ''}${tsb.toFixed(0)}</span><span class="fitness-pill-lbl">TSB / Vorm</span></div>
    <div class="fitness-status-label ${status}">${statusLabel}</div>
  `;

  // Destroy vorige chart instance
  if (_fitnessChart) { _fitnessChart.destroy(); _fitnessChart = null; }
  if (typeof Chart === 'undefined') return;

  _fitnessChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: metrics.map(m => m.date.slice(5)), // MM-DD
      datasets: [
        { label: 'CTL (Fitheid)',     data: metrics.map(m => m.ctl), borderColor: '#60a5fa', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4 },
        { label: 'ATL (Vermoeidheid)',data: metrics.map(m => m.atl), borderColor: '#f87171', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [4,3], pointRadius: 0, tension: 0.4 },
        { label: 'TSB (Vorm)',        data: metrics.map(m => m.tsb), borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.07)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true },
      ]
    },
    options: {
      responsive: true, animation: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 }, boxWidth: 20 } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 } },                   grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ─── Periode Vergelijking ────────────────────────────────────────────────────
function renderPeriodComparison(activities) {
  const section = document.getElementById('period-comparison-section');
  const content = document.getElementById('period-comparison-content');
  if (!section || !content) return;

  const cmp = comparePeriods(activities, 30);
  if (cmp.current.ritten === 0 && cmp.previous.ritten === 0) return;

  section.style.display = 'block';

  const arrow = (pct) => pct > 5 ? '↑' : pct < -5 ? '↓' : '→';
  const cls   = (pct) => pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat';

  const stats = [
    { label: 'km',    val: cmp.current.km.toFixed(0),    diff: cmp.diff.km    },
    { label: 'Ritten',val: cmp.current.ritten,           diff: cmp.diff.ritten },
    { label: 'Uren',  val: cmp.current.uren.toFixed(1),  diff: cmp.diff.uren  },
    { label: 'Hoogte',val: cmp.current.asc + 'm',        diff: cmp.diff.asc   },
  ];

  content.innerHTML = stats.map(s => `
    <div class="period-stat">
      <div class="period-stat-val">${s.val}</div>
      <div class="period-stat-lbl">${s.label}</div>
      <div class="period-stat-diff ${cls(s.diff)}">${arrow(s.diff)} ${Math.abs(s.diff)}%</div>
    </div>
  `).join('');
}

// ─── VO₂max Renderen ──────────────────────────────────────────────────────────
function renderVO2max(activities) {
  const container = document.getElementById('vo2max-card-container');
  if (!container) return;
  const result = estimateVO2max(activities, state.user);
  if (!result) { container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Onvoldoende data voor VO₂max schatting.</div>'; return; }
  const descs = { 'Laag':'Verbetering mogelijk met duurtraining.', 'Matig':'Goede basis. Intervaltraining helpt.', 'Goed':'Boven het gemiddelde. Goed bezig!', 'Excellent':'Hoog niveau. Competitief fietser.', 'Hoog':'Uitmuntend. Professioneel niveau.', 'Elite':'Elite niveau. Exceptioneel!' };
  container.innerHTML = `
    <div class="vo2max-card">
      <div class="vo2max-ring" style="border-color:${result.color};color:${result.color};">
        <span class="vo2max-val">${result.vo2max}</span>
        <span class="vo2max-unit">ml/kg/min</span>
      </div>
      <div class="vo2max-info">
        <div class="vo2max-cat" style="color:${result.color};">${result.category}</div>
        <div class="vo2max-method">Methode: ${result.method}</div>
        <div class="vo2max-desc">${descs[result.category] || ''}</div>
      </div>
    </div>`;
}

// ─── MMP Vermogenscurve ───────────────────────────────────────────────────────
let _mmpChart = null;
function renderMMPCurve(activities) {
  const section   = document.getElementById('mmp-section');
  const topStats  = document.getElementById('mmp-top-stats');
  const canvas    = document.getElementById('mmp-chart');
  const noteEl    = document.getElementById('mmp-estimate-note');
  if (!section || !canvas) return;

  const mmp = calculateMMP(activities);
  if (!mmp) return;
  section.style.display = 'block';

  const keyPoints = [{ label:'5s',i:0},{ label:'1m',i:3},{ label:'5m',i:4},{ label:'20m',i:6},{ label:'60m',i:8}];
  if (topStats) {
    topStats.innerHTML = keyPoints.map(kp => `
      <div class="mmp-stat">
        <span class="mmp-stat-val">${mmp[kp.i]?.power || '-'}</span>
        <span class="mmp-stat-lbl">${kp.label}</span>
      </div>`).join('');
  }

  const hasEstimates = mmp.some(p => p.isEstimate);
  if (noteEl) noteEl.style.display = hasEstimates ? 'block' : 'none';

  if (_mmpChart) { _mmpChart.destroy(); _mmpChart = null; }
  if (typeof Chart === 'undefined') return;

  _mmpChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: mmp.map(p => p.label),
      datasets: [{
        label: 'MMP (W)',
        data: mmp.map(p => p.power),
        borderColor: 'rgba(212,255,0,0.9)',
        backgroundColor: 'rgba(212,255,0,0.08)',
        borderWidth: 2, pointRadius: 4, pointBackgroundColor: 'rgba(212,255,0,0.8)', tension: 0.4, fill: true,
        segment: { borderDash: (ctx) => mmp[ctx.p0DataIndex]?.isEstimate ? [4,4] : [] }
      }]
    },
    options: {
      responsive: true, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}W${mmp[ctx.dataIndex]?.wkg ? ' · ' + mmp[ctx.dataIndex].wkg + ' W/kg' : ''}` } } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ─── Seizoensvergelijking Chart ───────────────────────────────────────────────
let _seasonChart = null;
let _seasonData  = null;
let _seasonMetric = 'km';

function renderSeasonChart(activities) {
  const canvas = document.getElementById('season-chart');
  if (!canvas) return;
  _seasonData = compareSeasons(activities);
  _drawSeasonChart();

  ['km','ritten'].forEach(metric => {
    const btn = document.getElementById(`season-btn-${metric}`);
    if (btn && !btn._seasonBound) {
      btn._seasonBound = true;
      btn.addEventListener('click', () => {
        _seasonMetric = metric;
        document.querySelectorAll('.season-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.metric === metric));
        _drawSeasonChart();
      });
    }
  });
}

function _drawSeasonChart() {
  const canvas = document.getElementById('season-chart');
  if (!canvas || !_seasonData) return;
  if (_seasonChart) { _seasonChart.destroy(); _seasonChart = null; }
  if (typeof Chart === 'undefined') return;

  const thisData = _seasonMetric === 'km' ? _seasonData.thisSeason : _seasonData.thisSeason.map((_, i) => {
    // Cumulatieve ritten
    return i + 1;
  });

  // Bouw cumulatieve ritten apart
  let _seasonRides = { this: [], last: [] };
  if (_seasonMetric !== 'km') {
    // Gebruik activities direct
    // (simplified: toon gewoon de km data maar schaal anders — voor ritten gebruiken we apart)
  }

  _seasonChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: _seasonData.labels,
      datasets: [
        {
          label: `${_seasonData.currentYear}`,
          data: _seasonData.thisSeason,
          borderColor: 'rgba(212,255,0,0.9)', backgroundColor: 'rgba(212,255,0,0.07)',
          borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true,
        },
        {
          label: `${_seasonData.lastYear}`,
          data: _seasonData.lastSeason,
          borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent',
          borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, tension: 0.3,
        },
      ]
    },
    options: {
      responsive: true, animation: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 }, boxWidth: 20 } },
        tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} km` } },
        annotation: _seasonData.currentWeek ? {} : {}
      },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 8 }, maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ─── Badge Wall ───────────────────────────────────────────────────────────────
function renderBadgeWall(activities) {
  const wall      = document.getElementById('badge-wall');
  const countEl   = document.getElementById('badge-earned-count');
  if (!wall) return;
  wall.innerHTML = '';

  const badges  = calculateBadges(activities);
  const earned  = badges.filter(b => b.earned).length;
  if (countEl) countEl.textContent = `${earned}/${badges.length} verdiend`;

  for (const badge of badges) {
    const chip = document.createElement('div');
    chip.className = `badge-chip${badge.earned ? ' earned' : ''}`;
    chip.title = badge.desc;
    chip.innerHTML = `
      ${badge.earned ? '<span class="badge-earned-check">✓</span>' : ''}
      <span class="badge-emoji">${badge.emoji}</span>
      <span class="badge-name">${badge.name}</span>
      <span class="badge-desc">${badge.desc}</span>
    `;
    wall.appendChild(chip);
  }
}

// ─── Global window hooks (voor auth.js bridge) ────────────────────────────────
window._checkOnboarding = checkOnboarding;
window._initHelpButton  = initHelpButton;

// ─── Lege staat helpers ───────────────────────────────────────────────────────
export function renderEmptyFeed() {
  const el = document.getElementById('activities-list');
  if (el && el.children.length === 0) {
    renderEmptyState(el, {
      emoji: '🚴',
      title: 'Nog geen activiteiten',
      desc: 'Upload je eerste .fit, .tcx of .gpx bestand om je stats te zien.',
      ctaText: 'Ga naar Mijn Ritten',
      ctaAction: () => document.getElementById('link-rides')?.click(),
    });
  }
}

export function renderEmptyLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  if (el && el.children.length === 0) {
    renderEmptyState(el, {
      emoji: '🏆',
      title: 'Leaderboard is leeg',
      desc: 'Upload ritten om op het leaderboard te komen.',
    });
  }
}

// ─── Interval tijdlijn renderen in activiteitenkaart ─────────────────────────
export function renderIntervalTimeline(container, activity) {
  if (!container || !activity) return;
  const struct = analyzeTrainingStructure(activity);
  if (!struct) return;

  const wrap = document.createElement('div');
  wrap.className = 'interval-timeline-wrap';
  wrap.innerHTML = `
    <div class="interval-timeline-label">
      Trainingsstructuur
      <span class="interval-estimate-tag">schatting</span>
    </div>
    <div class="interval-bar" id="ibar-${activity.id || Math.random()}"></div>
    <div class="interval-legend" id="ileg-${activity.id || Math.random()}"></div>
  `;

  const bar = wrap.querySelector('[id^="ibar-"]');
  const leg = wrap.querySelector('[id^="ileg-"]');
  const seen = new Set();

  struct.segments.forEach(seg => {
    const segEl = document.createElement('div');
    segEl.className = 'interval-seg';
    segEl.style.cssText = `width:${seg.pct * 100}%;background:${seg.color};`;
    segEl.innerHTML = `<div class="interval-seg-tooltip">${seg.label} · ${seg.desc}</div>`;
    bar.appendChild(segEl);

    if (!seen.has(seg.label)) {
      seen.add(seg.label);
      const dot = document.createElement('div');
      dot.className = 'interval-legend-item';
      dot.innerHTML = `<div class="interval-legend-dot" style="background:${seg.color};"></div><span>${seg.label}</span>`;
      leg.appendChild(dot);
    }
  });

  container.appendChild(wrap);
}