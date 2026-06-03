/**
 * Cyclo - Core Application Logic
 * 
 * Beheert state, routing, authenticatie (Supabase met fallback naar Demo Mode),
 * de interactieve maandkalender, ritplanner en TCX uploads.
 */

// 1. SELECTEER DOM ELEMENTEN
const elements = {
  // Navigatie
  logo: document.getElementById('nav-logo'),
  linkHome: document.getElementById('link-home'),
  linkDashboard: document.getElementById('link-dashboard'),
  linkRides: document.getElementById('link-rides'),
  navAuthItem: document.getElementById('nav-auth-item'),
  btnLeaveNav: null, // Wordt dynamisch beheerd
  
  // Secties (SPA)
  sectionHome: document.getElementById('section-home'),
  sectionAuth: document.getElementById('section-auth'),
  sectionDashboard: document.getElementById('section-dashboard'),
  
  // Hero Knoppen
  heroBtnStart: document.getElementById('hero-btn-start'),
  heroBtnDemo: document.getElementById('hero-btn-demo'),
  
  // Auth Formulier
  tabLogin: document.getElementById('tab-login'),
  tabRegister: document.getElementById('tab-register'),
  formLogin: document.getElementById('form-login'),
  formRegister: document.getElementById('form-register'),
  authBypassLink: document.getElementById('auth-bypass-link'),
  
  // Kalender
  calendarMonthYear: document.getElementById('calendar-month-year'),
  btnPrevMonth: document.getElementById('btn-prev-month'),
  btnToday: document.getElementById('btn-today'),
  btnNextMonth: document.getElementById('btn-next-month'),
  calendarDaysGrid: document.getElementById('calendar-days-grid'),
  
  // Widgets / Sidebar
  widgetUserName: document.getElementById('widget-user-name'),
  widgetUserUsername: document.getElementById('widget-user-username'),
  widgetUserAvatar: document.getElementById('widget-user-avatar'),
  widgetUserScoreContainer: document.getElementById('widget-user-score-container'),
  widgetUserScoreVal: document.getElementById('widget-user-score-val'),
  btnLogout: document.getElementById('btn-logout'),
  
  // Beschikbaarheid Editor
  availabilityEditorPanel: document.getElementById('availability-editor-panel'),
  selectedDateStr: document.getElementById('selected-date-str'),
  statusBtnAvail: document.getElementById('status-btn-avail'),
  statusBtnTent: document.getElementById('status-btn-tent'),
  statusBtnUnavail: document.getElementById('status-btn-unavail'),
  availabilityNotes: document.getElementById('availability-notes'),
  btnSaveAvailability: document.getElementById('btn-save-availability'),
  
  // Ritten
  btnPlanRide: document.getElementById('btn-plan-ride'),
  ridesListContainer: document.getElementById('rides-list-container'),
  
  // Modal Groepsrit Plannen
  rideModal: document.getElementById('ride-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  formPlanRide: document.getElementById('form-plan-ride'),
  rideModalDate: document.getElementById('ride-modal-date'),
  rideModalTitle: document.getElementById('ride-modal-title'),
  rideModalDesc: document.getElementById('ride-modal-desc'),
  rideModalRoute: document.getElementById('ride-modal-route'),
  
  // TCX Uploader
  tcxDropzone: document.getElementById('tcx-dropzone'),
  tcxFileInput: document.getElementById('tcx-file-input'),
  tcxResultPanel: document.getElementById('tcx-result-panel'),
  calculatedRiderScore: document.getElementById('calculated-rider-score'),
  metricDistance: document.getElementById('metric-distance'),
  metricDuration: document.getElementById('metric-duration'),
  metricAscent: document.getElementById('metric-ascent'),
  metricSpeed: document.getElementById('metric-speed'),
  metricHr: document.getElementById('metric-hr'),
  metricPower: document.getElementById('metric-power'),
  routeMapCanvas: document.getElementById('route-map-canvas'),
  
  // Toast Notificaties
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),
  toastIcon: document.getElementById('toast-icon'),
  
  // Nieuwe uitbreidingen elements
  leaderboardList: document.getElementById('leaderboard-list'),
  activitiesListContainer: document.getElementById('activities-list-container'),
  profileStatsContainer: document.getElementById('profile-stats-container'),
  profileStatDistance: document.getElementById('profile-stat-distance'),
  profileStatAscent: document.getElementById('profile-stat-ascent'),
  routeMap: document.getElementById('route-map')
};

// 2. SUPABASE INITIALISATIE
const SUPABASE_URL = 'https://znnuvfhtyfjsxwssdkqc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_V4C4Mu-_M9upY-cbDpYeyg_EuSgqPmq';

let supabaseClient = null;
let isDemoMode = false;

try {
  // Controleer of de Supabase SDK geladen is en we geldige keys hebben
  if (window.supabase && SUPABASE_URL && SUPABASE_KEY && !SUPABASE_KEY.includes('placeholder')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    // Indien de key ongeldig is, activeer Demo Modus
    console.warn("Supabase credentials niet ingesteld of ongeldig. Demo modus is actief.");
    isDemoMode = true;
  }
} catch (e) {
  console.error("Fout bij laden van Supabase client:", e);
  isDemoMode = true;
}

// 3. APPLICATIE STATE
const state = {
  user: null,          // Huidige ingelogde gebruiker profile
  currentDate: new Date(), // Datum die de kalender momenteel toont
  selectedDate: new Date(), // Geselecteerde datum in de kalender
  availabilities: [],  // Beschikbaarheden van alle gebruikers voor deze maand
  rides: [],           // Geplande ritten
  profiles: [],        // Alle gebruikersprofielen (voor avatars etc.)
  selectedStatus: 'available' // Huidig geselecteerde status in editor
};

// MOCK DATA VOOR DEMO MODUS (Alleen actieve demo-gebruiker)
const MOCK_PROFILES = [
  { id: 'demo-user-id', username: 'demorider', full_name: 'Jij (Demo Rider)', avatar_url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=demo', rider_score: 100 }
];

// 4. BOOTSTRAP / INITIALISATIE RUN
document.addEventListener('DOMContentLoaded', () => {
  // Initialiseer Lucide Icons
  lucide.createIcons();
  
  // Event listeners binden
  setupEventListeners();
  
  // Controleer of de gebruiker al ingelogd is
  checkUserSession();
});

// 5. EVENT LISTENERS SETUP
function setupEventListeners() {
  // Navigatie
  elements.logo.addEventListener('click', (e) => { e.preventDefault(); navigateTo('home'); });
  elements.linkHome.addEventListener('click', (e) => { e.preventDefault(); navigateTo('home'); });
  elements.linkDashboard.addEventListener('click', (e) => { e.preventDefault(); navigateTo('dashboard'); });
  elements.heroBtnStart.addEventListener('click', () => { navigateTo('dashboard'); });
  elements.heroBtnDemo.addEventListener('click', () => {
    isDemoMode = true;
    loginMockUser('demo-user-id');
    showToast("Demo Modus geactiveerd!", "success");
  });
  
  // Auth-knop in navbar
  elements.navAuthItem.addEventListener('click', (e) => {
    if (e.target.id === 'btn-login-nav') {
      e.preventDefault();
      navigateTo('auth');
    }
  });

  // Auth Tabs wissel
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
  
  // Auth bypass link (direct in demo modus gaan)
  elements.authBypassLink.addEventListener('click', (e) => {
    e.preventDefault();
    isDemoMode = true;
    loginMockUser('demo-user-id');
    showToast("Demo Modus gestart", "success");
  });
  
  // Auth Submit formulieren
  elements.formLogin.addEventListener('submit', handleLogin);
  elements.formRegister.addEventListener('submit', handleRegister);
  elements.btnLogout.addEventListener('click', handleLogout);
  
  // Kalender navigatie
  elements.btnPrevMonth.addEventListener('click', () => changeMonth(-1));
  elements.btnNextMonth.addEventListener('click', () => changeMonth(1));
  elements.btnToday.addEventListener('click', () => {
    state.currentDate = new Date();
    state.selectedDate = new Date();
    renderCalendar();
    updateAvailabilityEditor();
  });
  
  // Status knoppen in beschikbaarheidswidget
  const statusBtns = [elements.statusBtnAvail, elements.statusBtnTent, elements.statusBtnUnavail];
  statusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      statusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedStatus = btn.dataset.status;
    });
  });
  
  // Beschikbaarheid opslaan
  elements.btnSaveAvailability.addEventListener('click', saveAvailability);
  
  // Rit Plannen Modal triggers
  elements.btnPlanRide.addEventListener('click', openPlanRideModal);
  elements.btnCloseModal.addEventListener('click', closePlanRideModal);
  elements.rideModal.addEventListener('click', (e) => {
    if (e.target === elements.rideModal) closePlanRideModal();
  });
  elements.formPlanRide.addEventListener('submit', savePlannedRide);
  
  // TCX Drag & Drop & Upload
  setupTcxUploader();
  
  // Rittenhistorie link in navbar
  if (elements.linkRides) {
    elements.linkRides.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('dashboard');
      setTimeout(() => {
        const activitiesPanel = document.getElementById('activities-list-container');
        if (activitiesPanel) {
          activitiesPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }
}

// 6. ROUTING (SPA)
function navigateTo(section) {
  // Reset classes in menu
  elements.linkHome.classList.remove('active');
  elements.linkDashboard.classList.remove('active');
  if (elements.linkRides) elements.linkRides.classList.remove('active');
  
  // Activeer sectie
  elements.sectionHome.classList.remove('active');
  elements.sectionAuth.classList.remove('active');
  elements.sectionDashboard.classList.remove('active');
  
  if (section === 'home') {
    elements.sectionHome.classList.add('active');
    elements.linkHome.classList.add('active');
  } else if (section === 'auth') {
    elements.sectionAuth.classList.add('active');
  } else if (section === 'dashboard') {
    // Dashboard vereist authenticatie
    if (!state.user) {
      showToast("Log eerst in om de kalender te bekijken.", "error");
      elements.sectionAuth.classList.add('active');
    } else {
      elements.sectionDashboard.classList.add('active');
      elements.linkDashboard.classList.add('active');
      // Render kalender en haal gegevens op
      renderCalendar();
      loadDashboardData();
    }
  }
}

// 7. TOAST NOTIFICATIE
function showToast(message, type = 'info') {
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast active ${type}`;
  
  // Pas het icoon aan
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  
  elements.toastIcon.setAttribute('data-lucide', iconName);
  lucide.createIcons();
  
  setTimeout(() => {
    elements.toast.classList.remove('active');
  }, 4000);
}

// 8. AUTHENTICATIE LOGICA (Supabase & Mock Fallback)
async function checkUserSession() {
  if (isDemoMode) {
    const savedUser = localStorage.getItem('cyclo_demo_user');
    if (savedUser) {
      loginMockUser(savedUser);
    }
    return;
  }
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      // Ingelogd in Supabase, haal profiel
      const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (error) throw error;
      
      setUser(profile);
    } else {
      // Probeer te kijken of er een demo user is opgeslagen
      const savedUser = localStorage.getItem('cyclo_demo_user');
      if (savedUser) {
        isDemoMode = true;
        loginMockUser(savedUser);
      } else {
        setUser(null);
      }
    }
  } catch (e) {
    console.error("Fout bij controleren van sessie:", e);
    isDemoMode = true;
    const savedUser = localStorage.getItem('cyclo_demo_user');
    if (savedUser) loginMockUser(savedUser);
  }
}

function setUser(userProfile) {
  state.user = userProfile;
  
  if (userProfile) {
    // Update navbar
    elements.navAuthItem.innerHTML = `<a href="#" class="nav-link" id="nav-btn-logout-link">${userProfile.full_name} (${userProfile.username})</a>`;
    
    // Bind logout link event
    document.getElementById('nav-btn-logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
    
    // Update sidebar widget info
    elements.widgetUserName.textContent = userProfile.full_name;
    elements.widgetUserUsername.textContent = `@${userProfile.username}`;
    elements.widgetUserAvatar.src = userProfile.avatar_url;
    
    if (userProfile.rider_score) {
      elements.widgetUserScoreVal.textContent = userProfile.rider_score;
      elements.widgetUserScoreContainer.style.display = 'flex';
    } else {
      elements.widgetUserScoreContainer.style.display = 'none';
    }
    
    // Toon rittenlink
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'block');
    
    // Ga naar dashboard
    navigateTo('dashboard');
  } else {
    // Uitgelogd
    elements.navAuthItem.innerHTML = `<a href="#" class="btn btn-primary btn-sm" id="btn-login-nav">Inloggen</a>`;
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
    navigateTo('home');
  }
}

// Inloggen
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  if (isDemoMode) {
    // Mock login
    const found = MOCK_PROFILES.find(p => p.username === email || email.includes(p.username));
    const userId = found ? found.id : 'demo-user-id';
    loginMockUser(userId);
    showToast("Mock ingelogd!", "success");
    return;
  }
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    // Haal profiel
    const { data: profile, error: pError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
      
    if (pError) throw pError;
    
    setUser(profile);
    showToast(`Welkom terug, ${profile.full_name}!`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Registreren
async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const fullname = document.getElementById('register-fullname').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  
  if (isDemoMode) {
    // Mock registreren
    const newId = `user-${Date.now()}`;
    const newProfile = {
      id: newId,
      username: username.toLowerCase().replace(/\s+/g, ''),
      full_name: fullname,
      avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
      rider_score: 100
    };
    
    // Opslaan in mock profiles
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    savedMockProfiles.push(newProfile);
    localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
    
    loginMockUser(newId);
    showToast("Account aangemaakt in Demo modus!", "success");
    return;
  }
  
  try {
    // In Supabase registreren
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          full_name: fullname,
          avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
        }
      }
    });
    
    if (error) throw error;
    
    showToast("Registratie succesvol! Controleer eventueel je e-mail.", "success");
    
    // Automatisch inloggen als Supabase directe logins toestaat
    if (data.user) {
      setTimeout(async () => {
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id).single();
        if (profile) setUser(profile);
      }, 1000);
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Uitloggen
async function handleLogout() {
  if (isDemoMode) {
    localStorage.removeItem('cyclo_demo_user');
    setUser(null);
    showToast("Uitgelogd uit demo modus.", "info");
    return;
  }
  
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    
    // Verwijder demo user mocht die er zijn
    localStorage.removeItem('cyclo_demo_user');
    setUser(null);
    showToast("Succesvol uitgelogd.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Hulpfunctie om mock gebruiker in te loggen
function loginMockUser(userId) {
  let profiles = [...MOCK_PROFILES];
  // Laad eventueel extra geregistreerde mock profiles
  const extraProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
  profiles = [...profiles, ...extraProfiles];
  
  const user = profiles.find(p => p.id === userId) || profiles[0];
  localStorage.setItem('cyclo_demo_user', user.id);
  
  state.profiles = profiles;
  setUser(user);
}


// 9. HAAL DATA OP VOOR HET DASHBOARD
async function loadDashboardData() {
  if (isDemoMode) {
    loadMockDashboardData();
    return;
  }
  
  try {
    // 1. Haal alle profielen op (voor avatars)
    const { data: profiles, error: pError } = await supabaseClient
      .from('profiles')
      .select('*');
      
    if (pError) throw pError;
    state.profiles = profiles;
    
    // Update de state van de ingelogde gebruiker uit de database (voor bijv updated score)
    const currentProfile = profiles.find(p => p.id === state.user.id);
    if (currentProfile) {
      state.user = currentProfile;
      elements.widgetUserUserName.textContent = currentProfile.full_name;
      elements.widgetUserAvatar.src = currentProfile.avatar_url;
      if (currentProfile.rider_score) {
        elements.widgetUserScoreVal.textContent = currentProfile.rider_score;
        elements.widgetUserScoreContainer.style.display = 'flex';
      }
    }
    
    // 2. Haal de beschikbaarheid op van deze maand
    const startOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const { data: availabilities, error: aError } = await supabaseClient
      .from('availabilities')
      .select('*')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);
      
    if (aError) throw aError;
    state.availabilities = availabilities;
    
    // 3. Haal geplande ritten op van deze maand
    const { data: rides, error: rError } = await supabaseClient
      .from('rides')
      .select('*, ride_participants(user_id)')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);
      
    if (rError) throw rError;
    state.rides = rides;
    
    // Laad activiteiten en render alles
    await loadActivities();
    renderCalendar();
    renderRidesList();
    renderActivitiesList();
    renderLeaderboard();
  } catch (err) {
    console.error("Fout bij ophalen dashboard data:", err);
    showToast("Fout bij laden van live data. Switchen naar demo data.", "error");
    isDemoMode = true;
    loadMockDashboardData();
  }
}

// Laad mock-data voor demo modus
function loadMockDashboardData() {
  // Zorg dat we profiles in de state hebben
  let mockProfiles = [...MOCK_PROFILES];
  const extraProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
  state.profiles = [...mockProfiles, ...extraProfiles];
  
  // Update rider score van ingelogde user
  const savedDemoUser = localStorage.getItem('cyclo_demo_user');
  const currentMockProfile = state.profiles.find(p => p.id === savedDemoUser) || state.profiles[0];
  state.user = currentMockProfile;
  elements.widgetUserScoreVal.textContent = currentMockProfile.rider_score;
  
  // Initialiseer mock availabilities in localStorage als ze niet bestaan
  if (!localStorage.getItem('cyclo_mock_availabilities')) {
    seedMockAvailabilities();
  }
  
  // Laad mock availabilities
  const savedAvails = JSON.parse(localStorage.getItem('cyclo_mock_availabilities') || '[]');
  const startOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const endOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
  
  state.availabilities = savedAvails.filter(a => {
    const d = new Date(a.date);
    return d >= startOfMonth && d <= endOfMonth;
  });
  
  // Initialiseer mock rides in localStorage als ze niet bestaan
  if (!localStorage.getItem('cyclo_mock_rides')) {
    seedMockRides();
  }
  
  // Laad mock rides
  const savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
  state.rides = savedRides.filter(r => {
    const d = new Date(r.date);
    return d >= startOfMonth && d <= endOfMonth;
  });
  
  loadActivities();
  renderCalendar();
  renderRidesList();
  renderActivitiesList();
  renderLeaderboard();
}

// Genereert test beschikbaarheid in demo modus
function seedMockAvailabilities() {
  const avails = [];
  const today = new Date();
  
  // Genereer enkele beschikbare zondagen voor de demo-gebruiker
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    
    if (dayOfWeek === 0) {
      avails.push({ id: `a-demo-${i}`, user_id: 'demo-user-id', date: dateStr, status: 'available', notes: 'Zondagse koffierit' });
    }
  }
  
  localStorage.setItem('cyclo_mock_availabilities', JSON.stringify(avails));
}

// Genereert test groepsritten in demo modus
function seedMockRides() {
  const rides = [];
  const today = new Date();
  
  // Een rit voor komende zondag
  const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (7 - today.getDay()));
  const dateStr1 = d1.toISOString().split('T')[0];
  rides.push({
    id: 'r-demo-1',
    created_by: 'demo-user-id',
    date: dateStr1,
    title: 'Cyclo Opening Ride',
    description: 'Gezamenlijke rit om de app te vieren! Tempo ~28km/u. Iedereen welkom.',
    route_link: 'https://www.komoot.com',
    participants: ['demo-user-id']
  });
  
  localStorage.setItem('cyclo_mock_rides', JSON.stringify(rides));
}


// 10. KALENDER LOGICA
function changeMonth(direction) {
  state.currentDate.setMonth(state.currentDate.getMonth() + direction);
  renderCalendar();
  loadDashboardData();
}

function renderCalendar() {
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  
  // Set titel (Maand Jaar in het Nederlands)
  const monthNames = [
    "Januari", "Februari", "Maart", "April", "Mei", "Juni", 
    "Juli", "Augustus", "September", "Oktober", "November", "December"
  ];
  elements.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
  
  // Wis grid
  elements.calendarDaysGrid.innerHTML = '';
  
  // Eerste dag en aantal dagen in de maand
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is zondag
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Pas firstDayIndex aan voor Europese weergave (maandag t/m zondag)
  // JS: 0=zo, 1=ma, 2=di, 3=wo, 4=do, 5=vr, 6=za
  // EU: 0=ma, 1=di, 2=wo, 3=do, 4=vr, 5=za, 6=zo
  let startOffset = firstDayIndex - 1;
  if (startOffset < 0) startOffset = 6; // zondag wordt index 6
  
  // Dagen van de vorige maand
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const dayVal = prevMonthTotalDays - i;
    const prevMonthDate = new Date(year, month - 1, dayVal);
    createCalendarDayCell(dayVal, prevMonthDate, true);
  }
  
  // Dagen van de huidige maand
  const today = new Date();
  for (let i = 1; i <= totalDays; i++) {
    const cellDate = new Date(year, month, i);
    createCalendarDayCell(i, cellDate, false);
  }
  
  // Dagen van de volgende maand om grid te vullen tot veelvoud van 7 (meestal 42 cellen)
  const currentGridCells = startOffset + totalDays;
  const nextMonthCellsNeeded = 42 - currentGridCells;
  
  for (let i = 1; i <= nextMonthCellsNeeded; i++) {
    const nextMonthDate = new Date(year, month + 1, i);
    createCalendarDayCell(i, nextMonthDate, true);
  }
}

function createCalendarDayCell(dayNumber, date, isOtherMonth) {
  const cell = document.createElement('div');
  cell.classList.add('calendar-day');
  
  const dateStr = date.toISOString().split('T')[0];
  cell.dataset.date = dateStr;
  
  if (isOtherMonth) {
    cell.classList.add('other-month');
  }
  
  // Vandaag markering
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateStr === todayStr) {
    cell.classList.add('today');
  }
  
  // Geselecteerde dag markering
  const selectedStr = state.selectedDate.toISOString().split('T')[0];
  if (dateStr === selectedStr) {
    cell.classList.add('selected');
  }
  
  // Cijfer tonen
  const numberEl = document.createElement('div');
  numberEl.classList.add('day-number');
  numberEl.textContent = dayNumber;
  cell.appendChild(numberEl);
  
  // Beschikbaarheden van de dag opzoeken
  const dayAvails = state.availabilities.filter(a => a.date === dateStr);
  
  // Filter beschikbaarheid van ingelogde gebruiker eruit
  const myAvail = dayAvails.find(a => a.user_id === state.user.id);
  if (myAvail) {
    const indicator = document.createElement('div');
    indicator.className = `availability-indicator indicator-${myAvail.status}`;
    cell.appendChild(indicator);
  }
  
  // Vrienden die ook kunnen tonen
  const otherAvails = dayAvails.filter(a => a.user_id !== state.user.id && (a.status === 'available' || a.status === 'tentative'));
  
  if (otherAvails.length > 0) {
    const avatarList = document.createElement('div');
    avatarList.classList.add('avatar-list');
    
    // Toon max 3 avatars om kalender grid clean te houden
    otherAvails.slice(0, 3).forEach(avail => {
      const profile = state.profiles.find(p => p.id === avail.user_id);
      if (profile) {
        const img = document.createElement('img');
        img.src = profile.avatar_url;
        img.alt = profile.full_name;
        img.className = 'avatar';
        // Tooltip hint
        img.title = `${profile.full_name} (${avail.status === 'available' ? 'Kan' : 'Misschien'})${avail.notes ? ': ' + avail.notes : ''}`;
        avatarList.appendChild(img);
      }
    });
    
    // Indien er meer dan 3 renners zijn
    if (otherAvails.length > 3) {
      const moreCount = document.createElement('div');
      moreCount.style.fontSize = '9px';
      moreCount.style.fontWeight = '700';
      moreCount.style.color = 'var(--text-secondary)';
      moreCount.style.alignSelf = 'center';
      moreCount.style.marginLeft = '4px';
      moreCount.textContent = `+${otherAvails.length - 3}`;
      avatarList.appendChild(moreCount);
    }
    
    cell.appendChild(avatarList);
  }
  
  // Click event voor dag selectie
  cell.addEventListener('click', () => {
    // Verwijder 'selected' class van alle andere cellen
    document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    
    state.selectedDate = new Date(dateStr);
    updateAvailabilityEditor();
  });
  
  elements.calendarDaysGrid.appendChild(cell);
}


// 11. BESCHIKBAARHEID EDITOR LOGICA
function updateAvailabilityEditor() {
  const dateStr = state.selectedDate.toISOString().split('T')[0];
  
  // Format datum mooi in het Nederlands
  const opt = { weekday: 'long', day: 'numeric', month: 'long' };
  const formatter = new Intl.DateTimeFormat('nl-NL', opt);
  elements.selectedDateStr.textContent = formatter.format(state.selectedDate);
  
  // Haal eigen beschikbaarheid op van deze datum
  const myAvail = state.availabilities.find(a => a.date === dateStr && a.user_id === state.user.id);
  
  // Reset knoppen
  const btns = [elements.statusBtnAvail, elements.statusBtnTent, elements.statusBtnUnavail];
  btns.forEach(b => b.classList.remove('active'));
  
  if (myAvail) {
    state.selectedStatus = myAvail.status;
    const activeBtn = btns.find(b => b.dataset.status === myAvail.status);
    if (activeBtn) activeBtn.classList.add('active');
    elements.availabilityNotes.value = myAvail.notes || '';
  } else {
    // Standaard selecteer "Kan Fietsen" en leeg notitieveld
    state.selectedStatus = 'available';
    elements.statusBtnAvail.classList.add('active');
    elements.availabilityNotes.value = '';
  }
}

async function saveAvailability() {
  const dateStr = state.selectedDate.toISOString().split('T')[0];
  const notes = elements.availabilityNotes.value;
  
  if (isDemoMode) {
    // Sla op in localStorage mock-tabel
    let savedAvails = JSON.parse(localStorage.getItem('cyclo_mock_availabilities') || '[]');
    
    // Check of er al eentje bestaat
    const idx = savedAvails.findIndex(a => a.date === dateStr && a.user_id === state.user.id);
    
    if (state.selectedStatus === 'unavail') {
      // Als ze niet kunnen, kunnen we er ook voor kiezen om het te verwijderen of als status 'unavailable' te zetten
      // We zetten het als 'unavailable' of verwijderen de beschikbaarheidsmarker uit de DB.
      // Laten we de record verwijderen om de DB/kalender clean te houden als ze gewoon niet kunnen.
      if (idx !== -1) {
        savedAvails.splice(idx, 1);
      }
    } else {
      const availData = {
        id: idx !== -1 ? savedAvails[idx].id : `a-user-${Date.now()}`,
        user_id: state.user.id,
        date: dateStr,
        status: state.selectedStatus,
        notes: notes
      };
      
      if (idx !== -1) {
        savedAvails[idx] = availData;
      } else {
        savedAvails.push(availData);
      }
    }
    
    localStorage.setItem('cyclo_mock_availabilities', JSON.stringify(savedAvails));
    showToast("Beschikbaarheid opgeslagen!", "success");
    loadMockDashboardData(); // Herlaad
    return;
  }
  
  try {
    const myAvail = state.availabilities.find(a => a.date === dateStr && a.user_id === state.user.id);
    
    if (state.selectedStatus === 'unavail') {
      // Verwijder record
      if (myAvail) {
        const { error } = await supabaseClient
          .from('availabilities')
          .delete()
          .eq('id', myAvail.id);
        if (error) throw error;
      }
    } else {
      // Insert of Update
      const record = {
        user_id: state.user.id,
        date: dateStr,
        status: state.selectedStatus,
        notes: notes
      };
      
      if (myAvail) {
        const { error } = await supabaseClient
          .from('availabilities')
          .update({ status: state.selectedStatus, notes: notes })
          .eq('id', myAvail.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient
          .from('availabilities')
          .insert([record]);
        if (error) throw error;
      }
    }
    
    showToast("Beschikbaarheid bijgewerkt!", "success");
    loadDashboardData();
  } catch (err) {
    showToast(err.message, "error");
  }
}


// 12. GEPLANDE RITTEN LOGICA
function renderRidesList() {
  elements.ridesListContainer.innerHTML = '';
  
  if (state.rides.length === 0) {
    elements.ridesListContainer.innerHTML = `
      <div class="empty-state">
        Er zijn nog geen ritten gepland voor deze maand.
      </div>
    `;
    return;
  }
  
  // Sorteer ritten op datum
  const sortedRides = [...state.rides].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  sortedRides.forEach(ride => {
    const rideDiv = document.createElement('div');
    rideDiv.classList.add('ride-item');
    
    // Format datum
    const opt = { day: 'numeric', month: 'long' };
    const dateFormatted = new Intl.DateTimeFormat('nl-NL', opt).format(new Date(ride.date));
    
    // Bepaal deelnemers
    let rideParticipants = [];
    if (isDemoMode) {
      rideParticipants = ride.participants || [];
    } else {
      rideParticipants = ride.ride_participants ? ride.ride_participants.map(p => p.user_id) : [];
    }
    
    const isParticipating = rideParticipants.includes(state.user.id);
    
    // Bouw html van avatars
    let avatarsHtml = '';
    rideParticipants.forEach(userId => {
      const p = state.profiles.find(prof => prof.id === userId);
      if (p) {
        avatarsHtml += `<img src="${p.avatar_url}" alt="${p.full_name}" class="avatar" title="${p.full_name}">`;
      }
    });
    
    const routeHtml = ride.route_link ? 
      `<a href="${ride.route_link}" target="_blank" class="nav-link" style="color:var(--secondary); text-decoration:underline; font-size:12px; margin-top: 4px; display:inline-block;"><i data-lucide="map" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Bekijk GPX/Route</a>` : '';
      
    rideDiv.innerHTML = `
      <div class="d-flex justify-between align-center">
        <div class="ride-date">${dateFormatted.toUpperCase()}</div>
        <button class="btn btn-secondary btn-sm btn-join-ride" data-id="${ride.id}">
          ${isParticipating ? '<i data-lucide="x-circle"></i> Afmelden' : '<i data-lucide="check"></i> Deelnemen'}
        </button>
      </div>
      <div class="ride-title">${ride.title}</div>
      <p style="font-size: 13px; line-height: 1.4;">${ride.description}</p>
      ${routeHtml}
      
      <div class="ride-participants">
        <span style="font-size: 11px; color: var(--text-muted);">${rideParticipants.length} deelnemer(s):</span>
        <div class="ride-participants-avatars">
          ${avatarsHtml}
        </div>
      </div>
    `;
    
    // Bind click event aan deelnemen knop
    rideDiv.querySelector('.btn-join-ride').addEventListener('click', () => toggleRideParticipation(ride.id, isParticipating));
    
    elements.ridesListContainer.appendChild(rideDiv);
  });
  
  lucide.createIcons();
}

async function toggleRideParticipation(rideId, isParticipating) {
  if (isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
    const idx = savedRides.findIndex(r => r.id === rideId);
    
    if (idx !== -1) {
      let participants = savedRides[idx].participants || [];
      if (isParticipating) {
        // Verwijder mij
        participants = participants.filter(id => id !== state.user.id);
      } else {
        // Voeg mij toe
        if (!participants.includes(state.user.id)) {
          participants.push(state.user.id);
        }
      }
      savedRides[idx].participants = participants;
      localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
      
      showToast(isParticipating ? "Afgemeld voor de rit." : "Aangemeld voor de rit!", "success");
      loadMockDashboardData();
    }
    return;
  }
  
  try {
    if (isParticipating) {
      // Afmelden uit ride_participants tabel
      const { error } = await supabaseClient
        .from('ride_participants')
        .delete()
        .eq('ride_id', rideId)
        .eq('user_id', state.user.id);
      if (error) throw error;
      
      showToast("Afgemeld voor de rit.", "info");
    } else {
      // Deelnemen
      const { error } = await supabaseClient
        .from('ride_participants')
        .insert([{ ride_id: rideId, user_id: state.user.id }]);
      if (error) throw error;
      
      showToast("Succesvol aangemeld voor de rit!", "success");
    }
    
    loadDashboardData();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Modal openen en sluiten
function openPlanRideModal() {
  // Vul datum in met de geselecteerde kalenderdatum
  const selectedStr = state.selectedDate.toISOString().split('T')[0];
  elements.rideModalDate.value = selectedStr;
  
  elements.rideModal.classList.add('active');
}

function closePlanRideModal() {
  elements.rideModal.classList.remove('active');
  elements.formPlanRide.reset();
}

async function savePlannedRide(e) {
  e.preventDefault();
  
  const date = elements.rideModalDate.value;
  const title = elements.rideModalTitle.value;
  const description = elements.rideModalDesc.value;
  const routeLink = elements.rideModalRoute.value;
  
  if (isDemoMode) {
    let savedRides = JSON.parse(localStorage.getItem('cyclo_mock_rides') || '[]');
    const newRide = {
      id: `r-user-${Date.now()}`,
      created_by: state.user.id,
      date: date,
      title: title,
      description: description,
      route_link: routeLink,
      participants: [state.user.id] // De maker doet meteen mee
    };
    
    savedRides.push(newRide);
    localStorage.setItem('cyclo_mock_rides', JSON.stringify(savedRides));
    
    showToast("Groepsrit succesvol gepland!", "success");
    closePlanRideModal();
    loadMockDashboardData();
    return;
  }
  
  try {
    // 1. Maak de rit aan
    const { data: ride, error: rError } = await supabaseClient
      .from('rides')
      .insert([{
        created_by: state.user.id,
        date: date,
        title: title,
        description: description,
        route_link: routeLink
      }])
      .select()
      .single();
      
    if (rError) throw rError;
    
    // 2. Voeg de maker direct toe als deelnemer
    const { error: pError } = await supabaseClient
      .from('ride_participants')
      .insert([{ ride_id: ride.id, user_id: state.user.id }]);
      
    if (pError) throw pError;
    
    showToast("Groepsrit succesvol gepland!", "success");
    closePlanRideModal();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, "error");
  }
}


// 13. TCX UPLOADER EN RIDER SCORE LOGICA
function setupTcxUploader() {
  const dropzone = elements.tcxDropzone;
  const fileInput = elements.tcxFileInput;
  
  // Klik event om file input te triggeren
  dropzone.addEventListener('click', () => fileInput.click());
  
  // Drag & drop events
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
      processTcxFile(e.dataTransfer.files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length > 0) {
      processTcxFile(fileInput.files[0]);
    }
  });
}

function processTcxFile(file) {
  if (!file.name.endsWith('.tcx')) {
    showToast("Alleen TCX-bestanden worden ondersteund.", "error");
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    const xmlText = e.target.result;
    
    try {
      showToast("Bestand inlezen...", "info");
      
      // Parseer TCX met onze parser module
      const parsedRide = window.TcxParser.parse(xmlText);
      
      // Toon resultaten in de UI
      elements.metricDistance.textContent = parsedRide.distanceKm;
      elements.metricDuration.textContent = parsedRide.durationFormatted;
      elements.metricAscent.textContent = parsedRide.totalAscentMeters;
      elements.metricSpeed.textContent = parsedRide.avgSpeedKmh;
      elements.metricHr.textContent = parsedRide.avgHeartRate || '-';
      elements.metricPower.textContent = parsedRide.avgPowerWatts || '-';
      
      elements.calculatedRiderScore.textContent = parsedRide.riderScore;
      
      // Teken de route op Leaflet kaart
      if (parsedRide.coordinates && parsedRide.coordinates.length > 0) {
        elements.routeMap.style.display = 'block';
        window.TcxParser.drawRouteOnLeaflet('route-map', parsedRide.coordinates);
      } else {
        elements.routeMap.style.display = 'none';
      }
      
      // Panel tonen
      elements.tcxResultPanel.style.display = 'block';
      
      // 1. Sla de activiteit op in de database of localStorage
      await saveActivity(parsedRide, file.name);
      
      // 2. Rider score updaten voor de gebruiker
      await updateUserRiderScore(parsedRide.riderScore);
      
    } catch (err) {
      console.error(err);
      showToast("Fout bij verwerken TCX-bestand: " + err.message, "error");
    }
  };
  
  reader.onerror = () => {
    showToast("Fout bij lezen van bestand.", "error");
  };
  
  reader.readAsText(file);
}

async function updateUserRiderScore(newScore) {
  // We updaten de cumulatieve Rider Score van de gebruiker.
  // In dit concept tellen we de nieuwe score op bij de bestaande score (of nemen een gewogen gemiddelde).
  // Laten we de score gewoon verhogen of direct overschrijven als de score hoger is dan de huidige.
  const currentScore = state.user.rider_score || 100;
  const updatedScore = Math.max(currentScore, newScore); // Of berekening: Math.round(currentScore * 0.7 + newScore * 0.3)
  
  if (isDemoMode) {
    // In demo modus updaten we in de mock profielen tabel
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    const idx = savedMockProfiles.findIndex(p => p.id === state.user.id);
    
    if (idx !== -1) {
      savedMockProfiles[idx].rider_score = updatedScore;
      localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
    } else {
      // Het is de standaard demo-user-id
      const demoProfile = MOCK_PROFILES.find(p => p.id === state.user.id);
      if (demoProfile) {
        demoProfile.rider_score = updatedScore;
        // Opslaan in extra profiles
        savedMockProfiles.push(demoProfile);
        localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
      }
    }
    
    state.user.rider_score = updatedScore;
    elements.widgetUserScoreVal.textContent = updatedScore;
    elements.widgetUserScoreContainer.style.display = 'flex';
    
    showToast(`Rit verwerkt! Je nieuwe Rider Score is: ${updatedScore}`, "success");
    return;
  }
  
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ rider_score: updatedScore })
      .eq('id', state.user.id);
      
    if (error) throw error;
    
    state.user.rider_score = updatedScore;
    elements.widgetUserScoreVal.textContent = updatedScore;
    elements.widgetUserScoreContainer.style.display = 'flex';
    
    showToast(`Geweldig! Je Rider Score is bijgewerkt naar ${updatedScore}`, "success");
  } catch (err) {
    console.error("Fout bij opslaan Rider Score:", err);
    showToast("Kon Rider Score niet updaten in database.", "error");
  }
}


// 14. LEADERBOARD, RITTENHISTORIE EN LEAFLET HELPER FUNCTIES

// Slaat de geüploade rit permanent op
async function saveActivity(parsedRide, fileName) {
  const activityData = {
    user_id: state.user.id,
    name: fileName.replace('.tcx', '').replace(/[-_]/g, ' '),
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

  if (isDemoMode) {
    let mockActivities = JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
    activityData.id = `act-${Date.now()}`;
    mockActivities.push(activityData);
    localStorage.setItem('cyclo_mock_activities', JSON.stringify(mockActivities));
    
    // Herlaad
    loadMockDashboardData();
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('activities')
      .insert([activityData]);
      
    if (error) throw error;
    
    loadDashboardData();
  } catch (err) {
    console.error("Fout bij opslaan activiteit:", err);
    showToast("Kon rit niet opslaan in database.", "error");
  }
}

// Laadt alle activiteiten van de ingelogde gebruiker en vrienden
async function loadActivities() {
  if (isDemoMode) {
    const mockActivities = JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
    state.activities = mockActivities;
    return;
  }

  try {
    const { data: activities, error } = await supabaseClient
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

// Rendert het klassement (Leaderboard) op basis van Rider Scores
function renderLeaderboard() {
  if (!elements.leaderboardList) return;
  elements.leaderboardList.innerHTML = '';

  // Sorteer profielen op rider score descending
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

// Rendert de geüploade rittenlijst (Mijn Rittenhistorie)
function renderActivitiesList() {
  if (!elements.activitiesListContainer) return;
  elements.activitiesListContainer.innerHTML = '';

  // Filter activiteiten van de huidige gebruiker
  const myActivities = (state.activities || []).filter(act => act.user_id === state.user.id);

  // Update profiel totalen
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

  if (myActivities.length === 0) {
    elements.activitiesListContainer.innerHTML = `
      <div class="empty-state">
        Je hebt nog geen ritten geüpload. Upload een TCX bestand hiernaast!
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

    // Bereken uren/minuten
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

    // Klik event op de ritnaam om deze weer te geven op de kaart en in de upload panel
    actDiv.querySelector('.activity-title').addEventListener('click', () => showActivityDetails(act));
    
    // Klik event voor verwijderen
    actDiv.querySelector('.btn-delete-activity').addEventListener('click', () => deleteActivity(act.id));

    elements.activitiesListContainer.appendChild(actDiv);
  });

  lucide.createIcons();
}

// Toont details van een geselecteerde rit in het upload panel en tekent de Leaflet routekaart
function showActivityDetails(activity) {
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
  
  // Teken de route
  if (activity.coordinates && activity.coordinates.length > 0) {
    elements.routeMap.style.display = 'block';
    window.TcxParser.drawRouteOnLeaflet('route-map', activity.coordinates);
  } else {
    elements.routeMap.style.display = 'none';
  }
  
  elements.tcxResultPanel.style.display = 'block';
  showToast(`Rit "${activity.name}" geladen op de kaart!`, "success");
}

// Verwijdert een activiteit uit de rittenhistorie
async function deleteActivity(activityId) {
  if (!confirm("Weet je zeker dat je deze rit wilt verwijderen? Dit zal je Rider Score mogelijk ook verlagen.")) return;

  if (isDemoMode) {
    let mockActivities = JSON.parse(localStorage.getItem('cyclo_mock_activities') || '[]');
    
    // Zoek activiteit om de score te verminderen
    const act = mockActivities.find(a => a.id === activityId);
    let scoreDiff = 0;
    if (act) scoreDiff = act.rider_score;
    
    mockActivities = mockActivities.filter(a => a.id !== activityId);
    localStorage.setItem('cyclo_mock_activities', JSON.stringify(mockActivities));
    
    // Verlaag Rider Score
    const newScore = Math.max(100, (state.user.rider_score || 100) - scoreDiff);
    await updateUserRiderScore(newScore);
    
    showToast("Rit succesvol verwijderd.", "info");
    loadMockDashboardData();
    return;
  }

  try {
    // Zoek de activiteit op om de score te bepalen
    const act = state.activities.find(a => a.id === activityId);
    let scoreDiff = 0;
    if (act) scoreDiff = act.rider_score;

    const { error } = await supabaseClient
      .from('activities')
      .delete()
      .eq('id', activityId);
      
    if (error) throw error;
    
    // Verlaag Rider Score
    const newScore = Math.max(100, (state.user.rider_score || 100) - scoreDiff);
    await updateUserRiderScore(newScore);
    
    showToast("Rit succesvol verwijderd uit database.", "info");
    loadDashboardData();
  } catch (err) {
    console.error("Fout bij verwijderen activiteit:", err);
    showToast("Kon rit niet verwijderen uit database.", "error");
  }
}
