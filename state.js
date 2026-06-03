// Cyclo - Global State & Configuration Module

// 1. SELECTEER DOM ELEMENTEN
export const elements = {
  // Navigatie
  logo: document.getElementById('nav-logo'),
  linkHome: document.getElementById('link-home'),
  linkDashboard: document.getElementById('link-dashboard'),
  linkRides: document.getElementById('link-rides'),
  navAuthItem: document.getElementById('nav-auth-item'),
  
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
  widgetUserBiketype: document.getElementById('widget-user-biketype'),
  btnEditProfile: document.getElementById('btn-edit-profile'),
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
  rideModalActivity: document.getElementById('ride-modal-activity'),
  
  // Modal Profiel Bewerken
  profileModal: document.getElementById('profile-modal'),
  btnCloseProfileModal: document.getElementById('btn-close-profile-modal'),
  formEditProfile: document.getElementById('form-edit-profile'),
  profileModalFullname: document.getElementById('profile-modal-fullname'),
  profileModalUsername: document.getElementById('profile-modal-username'),
  profileModalBiketype: document.getElementById('profile-modal-biketype'),
  profileModalAvatar: document.getElementById('profile-modal-avatar'),
  
  // TCX/GPX Uploader
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
  
  // Toast Notificaties
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),
  toastIcon: document.getElementById('toast-icon'),
  
  // Widgets Uitbreidingen
  leaderboardList: document.getElementById('leaderboard-list'),
  activitiesListContainer: document.getElementById('activities-list-container'),
  profileStatsContainer: document.getElementById('profile-stats-container'),
  profileStatDistance: document.getElementById('profile-stat-distance'),
  profileStatAscent: document.getElementById('profile-stat-ascent'),
  routeMap: document.getElementById('route-map')
};

// 2. APPLICATIE STATE
export const state = {
  user: null,               // Profiel van de ingelogde gebruiker
  currentDate: new Date(),  // Maand die de kalender toont
  selectedDate: new Date(), // Geselecteerde dag in de kalender
  availabilities: [],       // Alle beschikbaarheden van deze maand
  rides: [],                // Alle geplande groepsritten van deze maand
  profiles: [],             // Alle gebruikersprofielen (voor avatars & leaderboard)
  activities: [],           // Activiteiten (geüploade ritten) van de ingelogde gebruiker
  selectedStatus: 'available' // Geselecteerde status in de beschikbaarheidswidget
};

// 3. MOCK PROFIELEN VOOR OFFLINE STANDAARD GEBRUIKER
export const MOCK_PROFILES = [
  { 
    id: 'demo-user-id', 
    username: 'demorider', 
    full_name: 'Jij (Demo Rider)', 
    avatar_url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=demo', 
    rider_score: 100,
    bike_type: 'Road'
  }
];

// 4. SUPABASE CREDENTIALS
export const SUPABASE_URL = 'https://znnuvfhtyfjsxwssdkqc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_V4C4Mu-_M9upY-cbDpYeyg_EuSgqPmq';

// Config status (voor mutabele flags zoals demo modus)
export const config = {
  isDemoMode: false,
  supabaseClient: null
};

// 5. TOAST NOTIFICATIE HELPER
export function showToast(message, type = 'info') {
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast active ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  
  elements.toastIcon.setAttribute('data-lucide', iconName);
  lucide.createIcons();
  
  setTimeout(() => {
    elements.toast.classList.remove('active');
  }, 4000);
}

// 6. ROUTING HELPER
export function navigateTo(section, onPageLoad = null) {
  elements.linkHome.classList.remove('active');
  elements.linkDashboard.classList.remove('active');
  if (elements.linkRides) elements.linkRides.classList.remove('active');
  
  elements.sectionHome.classList.remove('active');
  elements.sectionAuth.classList.remove('active');
  elements.sectionDashboard.classList.remove('active');
  
  if (section === 'home') {
    elements.sectionHome.classList.add('active');
    elements.linkHome.classList.add('active');
  } else if (section === 'auth') {
    elements.sectionAuth.classList.add('active');
  } else if (section === 'dashboard') {
    if (!state.user) {
      showToast("Log eerst in om het dashboard te bekijken.", "error");
      elements.sectionAuth.classList.add('active');
    } else {
      elements.sectionDashboard.classList.add('active');
      elements.linkDashboard.classList.add('active');
      if (typeof onPageLoad === 'function') {
        onPageLoad();
      }
    }
  }
}
