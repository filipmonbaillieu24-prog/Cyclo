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
  saveAvailability 
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
      elements.widgetUserName.textContent = currentProfile.full_name;
      elements.widgetUserUsername.textContent = `@${currentProfile.username}`;
      elements.widgetUserAvatar.src = currentProfile.avatar_url;
      elements.widgetUserBiketype.textContent = translateBikeType(currentProfile.bike_type);
      if (currentProfile.rider_score) {
        elements.widgetUserScoreVal.textContent = currentProfile.rider_score;
        elements.widgetUserScoreContainer.style.display = 'flex';
      }
    }
    
    // C. Beschikbaarheden van deze maand ophalen
    const startOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const { data: availabilities, error: aError } = await config.supabaseClient
      .from('availabilities')
      .select('*')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);
      
    if (aError) throw aError;
    state.availabilities = availabilities;
    
    // D. Geplande ritten van deze maand ophalen
    const { data: rides, error: rError } = await config.supabaseClient
      .from('rides')
      .select('*, ride_participants(user_id)')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);
      
    if (rError) throw rError;
    state.rides = rides;
    
    // E. Activiteiten ophalen en UI renderen
    await loadActivities();
    renderCalendar();
    renderRidesList();
    renderActivitiesList(loadDashboardData);
    renderLeaderboard();
    renderPersonalRecords();
    updateRouteDropdown();
    await loadAndRenderFeed();

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
      rider_score: 100, 
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
  
  elements.widgetUserScoreVal.textContent = currentMockProfile.rider_score;
  elements.widgetUserBiketype.textContent = translateBikeType(currentMockProfile.bike_type);
  
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
    renderCalendar();
    renderRidesList();
    renderActivitiesList(loadDashboardData);
    renderLeaderboard();
    renderPersonalRecords();
    updateRouteDropdown();
    loadAndRenderFeed();
  });
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
  elements.logo.addEventListener('click', (e) => { e.preventDefault(); navigateTo('home'); });
  elements.linkHome.addEventListener('click', (e) => { e.preventDefault(); navigateTo('home'); });
  elements.linkDashboard.addEventListener('click', (e) => { e.preventDefault(); navigateTo('dashboard', loadDashboardData); });
  elements.heroBtnStart.addEventListener('click', () => { navigateTo('dashboard', loadDashboardData); });
  
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
  
  // Plannen groepsritten
  elements.btnPlanRide.addEventListener('click', openPlanRideModal);
  elements.btnCloseModal.addEventListener('click', closePlanRideModal);
  elements.rideModal.addEventListener('click', (e) => {
    if (e.target === elements.rideModal) closePlanRideModal();
  });
  elements.formPlanRide.addEventListener('submit', (e) => savePlannedRide(e, loadDashboardData));
  
  // Uploader config
  setupTcxUploader(loadDashboardData);

  // Avatar live preview en presets initialiseren
  setupAvatarEventListeners();
  
  // Navigatie-link naar activiteiten scroll
  if (elements.linkRides) {
    elements.linkRides.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('dashboard', loadDashboardData);
      setTimeout(() => {
        const activitiesPanel = document.getElementById('activities-list-container');
        if (activitiesPanel) {
          activitiesPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }
}

// 5. APPLICATIE INITIALISATIE RUN
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupEventListeners();
  checkUserSession(loadDashboardData);
  // Expose voor ride delete callbacks
  window._loadDashboardData = loadDashboardData;
});
