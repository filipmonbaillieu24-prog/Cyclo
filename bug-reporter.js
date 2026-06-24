// Cyclo - Automated Bug Reporter Module (ES6 Module)
import { state, config, showToast } from './state.js';

// 1. CONSOLE BUFFER INTERCEPTOR
// Keep track of the last 15 console log/error/warn messages
const consoleLogs = [];
const MAX_LOGS = 15;

function pushToLogBuffer(type, args) {
  try {
    const message = args
      .map(arg => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      })
      .join(' ');
    
    const timestamp = new Date().toISOString().substring(11, 19);
    consoleLogs.push(`[${timestamp}] [${type}] ${message}`);
    
    if (consoleLogs.length > MAX_LOGS) {
      consoleLogs.shift();
    }
  } catch (e) {
    // Avoid infinite loops if something goes wrong in the interceptor
  }
}

// Intercept original console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
  pushToLogBuffer('LOG', args);
  originalLog.apply(console, args);
};

console.error = function(...args) {
  pushToLogBuffer('ERROR', args);
  originalError.apply(console, args);
};

console.warn = function(...args) {
  pushToLogBuffer('WARN', args);
  originalWarn.apply(console, args);
};

// 2. HELPER FUNCTIONS FOR METADATA COLLECTION
function getOS() {
  const userAgent = window.navigator.userAgent;
  let os = "Unknown OS";
  if (userAgent.indexOf("Windows NT 10.0") !== -1) os = "Windows 10/11";
  else if (userAgent.indexOf("Windows NT 6.2") !== -1) os = "Windows 8";
  else if (userAgent.indexOf("Windows NT 6.1") !== -1) os = "Windows 7";
  else if (userAgent.indexOf("Macintosh") !== -1) os = "macOS";
  else if (userAgent.indexOf("iPhone") !== -1 || userAgent.indexOf("iPad") !== -1) os = "iOS";
  else if (userAgent.indexOf("Android") !== -1) os = "Android";
  else if (userAgent.indexOf("Linux") !== -1) os = "Linux";
  return os;
}

function getActivePage() {
  const sections = {
    'section-home': 'Home/Landing',
    'section-feed': 'Sociale Feed',
    'section-auth': 'Inloggen/Registreren',
    'section-dashboard': 'Planner Dashboard',
    'section-rides': 'Mijn Ritten',
    'section-profile': 'Profiel'
  };
  for (const [id, name] of Object.entries(sections)) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('active')) {
      return name;
    }
  }
  return 'Onbekend';
}

function getActiveBike() {
  let bikeName = "Geen";
  if (state.user) {
    if (state.equipment && state.equipment.length > 0) {
      const defaultBike = state.equipment.find(e => e.is_default);
      if (defaultBike) {
        bikeName = defaultBike.name;
      } else {
        bikeName = state.equipment[0].name;
      }
    } else if (state.user.bike_type) {
      const bikeTranslations = {
        'Road': 'Racefiets',
        'Gravel': 'Gravelbike',
        'MTB': 'Mountainbike',
        'E-Bike': 'Elektrische Fiets'
      };
      bikeName = bikeTranslations[state.user.bike_type] || state.user.bike_type;
    }
  }
  return bikeName;
}

function collectSystemMetadata() {
  const screenInfo = `${window.innerWidth}x${window.innerHeight} (scherm: ${window.screen.width}x${window.screen.height})`;
  const bikeName = getActiveBike();
  
  // Build a minimal, safe app state snapshot
  const stateSnapshot = {
    isDemoMode: config.isDemoMode,
    selectedDate: state.selectedDate ? state.selectedDate.toISOString().split('T')[0] : null,
    selectedStatus: state.selectedStatus || 'available',
    hasUser: !!state.user
  };
  
  if (state.user) {
    stateSnapshot.user = {
      username: state.user.username,
      rider_score: state.user.rider_score || 0,
      bike_type: state.user.bike_type
    };
  }

  return {
    current_page: getActivePage(),
    user_agent: navigator.userAgent,
    os: getOS(),
    screen_resolution: screenInfo,
    active_bike: bikeName,
    app_state_snapshot: stateSnapshot,
    console_logs: [...consoleLogs],
    timestamp: new Date().toISOString()
  };
}

// 3. UI INJECTION & EVENT HANDLERS
function injectBugReporterUI() {
  if (document.getElementById('btn-bug-trigger')) return;

  // Append Trigger Button
  const triggerBtn = document.createElement('button');
  triggerBtn.id = 'btn-bug-trigger';
  triggerBtn.className = 'bug-reporter-trigger';
  triggerBtn.title = 'Meld een fout / Bug melden';
  triggerBtn.innerHTML = `<i data-lucide="bug"></i>`;
  document.body.appendChild(triggerBtn);

  // Append Modal Overlay & Structure
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'bug-modal';
  modalOverlay.className = 'bug-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="bug-modal-box">
      <div class="bug-modal-header">
        <h3><i data-lucide="bug"></i> Fout Rapporteren</h3>
        <button class="bug-modal-close" id="btn-close-bug-modal">&times;</button>
      </div>
      <div class="bug-modal-body" id="bug-modal-body-content">
        <!-- Will be filled dynamically (Form or Status screens) -->
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  // Bind Open Trigger
  triggerBtn.addEventListener('click', () => {
    openBugModal();
  });

  // Render Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function openBugModal() {
  const modal = document.getElementById('bug-modal');
  if (!modal) return;

  renderBugForm();
  modal.classList.add('active');
}

function closeBugModal() {
  const modal = document.getElementById('bug-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function renderBugForm() {
  const bodyContent = document.getElementById('bug-modal-body-content');
  if (!bodyContent) return;

  const metadata = collectSystemMetadata();

  bodyContent.innerHTML = `
    <form id="form-report-bug">
      <div class="bug-metadata-preview-banner">
        <div class="bug-metadata-title">
          <i data-lucide="info" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> Systeem Context
        </div>
        <div class="bug-metadata-grid">
          <div class="bug-metadata-item">Pagina: <strong>${metadata.current_page}</strong></div>
          <div class="bug-metadata-item">OS: <strong>${metadata.os}</strong></div>
          <div class="bug-metadata-item">Scherm: <strong>${window.innerWidth}x${window.innerHeight}</strong></div>
          <div class="bug-metadata-item">Fiets: <strong>${metadata.active_bike}</strong></div>
        </div>
      </div>
      
      <div class="form-group">
        <label for="bug-category">Categorie</label>
        <select id="bug-category" class="form-control" required style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass);">
          <option value="" disabled selected>Kies een categorie...</option>
          <option value="GPS/Live Tracking">GPS / Live Tracking</option>
          <option value="Bluetooth/Sensoren">Bluetooth / Sensoren</option>
          <option value="Route-Builder">Route Builder</option>
          <option value="UI/Layout">UI / Layout</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="bug-title">Titel</label>
        <input type="text" id="bug-title" class="form-control" placeholder="Bijv. Kaart laadt niet in routebouwer" required>
      </div>
      
      <div class="form-group">
        <label for="bug-steps">Stappen om te reproduceren</label>
        <textarea id="bug-steps" class="form-control" rows="3" placeholder="1. Open de Planner&#10;2. Klik op Route Bouwer&#10;3. Zie dat de Leaflet-kaart zwart blijft" required></textarea>
      </div>
      
      <div class="form-group">
        <label for="bug-priority">Prioriteit</label>
        <select id="bug-priority" class="form-control" required style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass);">
          <option value="Laag">Laag</option>
          <option value="Medium" selected>Medium</option>
          <option value="Hoog">Hoog</option>
          <option value="Kritiek">Kritiek</option>
        </select>
      </div>
      
      <div class="bug-button-group">
        <button type="button" class="bug-btn-secondary" id="btn-cancel-bug">Annuleren</button>
        <button type="submit" class="bug-btn-primary" id="btn-submit-bug">
          <i data-lucide="send" style="width:14px;height:14px;"></i> Verstuur
        </button>
      </div>
    </form>
  `;

  // Bind Form Events
  const form = document.getElementById('form-report-bug');
  form.addEventListener('submit', handleBugSubmit);

  const cancelBtn = document.getElementById('btn-cancel-bug');
  cancelBtn.addEventListener('click', closeBugModal);

  const closeBtn = document.getElementById('btn-close-bug-modal');
  if (closeBtn) {
    // Re-bind just in case
    closeBtn.onclick = closeBugModal;
  }

  // Refresh Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

async function handleBugSubmit(e) {
  e.preventDefault();
  
  const category = document.getElementById('bug-category').value;
  const title = document.getElementById('bug-title').value.trim();
  const steps = document.getElementById('bug-steps').value.trim();
  const priority = document.getElementById('bug-priority').value;

  const submitBtn = document.getElementById('btn-submit-bug');
  if (submitBtn) submitBtn.disabled = true;

  // Show Loading Spinner
  renderLoading();

  // Aggregate Metadata
  const metadata = collectSystemMetadata();

  // Create unique ticket ID locally (used in offline fallback too)
  const timestampPart = new Date().toISOString().substring(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  const ticketId = `BUG-${timestampPart}-${rand}`;

  const payload = {
    id: ticketId,
    timestamp: metadata.timestamp,
    user_input: {
      category,
      title,
      steps_to_reproduce: steps,
      priority
    },
    system_metadata: {
      current_page: metadata.current_page,
      user_agent: metadata.user_agent,
      app_state_snapshot: metadata.app_state_snapshot,
      console_logs: metadata.console_logs
    },
    status: 'open',
    assigned_to: 'google-antigravity'
  };

  try {
    const response = await fetch('/api/report-bug', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      renderSuccess(data.id || ticketId, false);
      showToast("Foutrapport succesvol verzonden!", "success");
    } else {
      const errData = await response.json().catch(() => ({}));
      // Check if it's missing GITHUB_TOKEN
      if (errData.error === 'GITHUB_TOKEN_MISSING' || response.status === 404) {
        // Fallback to local storage (e.g. offline/demo mode or not deployed yet)
        saveBugLocally(payload);
        renderSuccess(ticketId, true);
        showToast("Fout lokaal opgeslagen (API offline)", "info");
      } else {
        throw new Error(errData.message || `Fout bij verzenden: ${response.status}`);
      }
    }
  } catch (error) {
    console.error("Fout bij bug rapportage:", error);
    // If it's a network error (like local testing without dev server), fallback to local storage
    saveBugLocally(payload);
    renderSuccess(ticketId, true);
    showToast("Fout lokaal opgeslagen (Netwerkfout)", "info");
  }
}

function saveBugLocally(payload) {
  try {
    const localBugs = JSON.parse(localStorage.getItem('cyclo_offline_bugs') || '[]');
    localBugs.push(payload);
    localStorage.setItem('cyclo_offline_bugs', JSON.stringify(localBugs));
    console.log("Bug rapport lokaal opgeslagen in localStorage:", payload);
  } catch (e) {
    console.error("Kon bug niet lokaal opslaan:", e);
  }
}

function renderLoading() {
  const bodyContent = document.getElementById('bug-modal-body-content');
  if (!bodyContent) return;

  bodyContent.innerHTML = `
    <div class="bug-status-container">
      <div class="bug-spinner"></div>
      <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Foutrapport verzenden...</h4>
      <p style="font-size: 13px; color: var(--text-muted);">Systeemgegevens en foutlogs worden geaggregeerd.</p>
    </div>
  `;
}

function renderSuccess(ticketId, isLocalFallback) {
  const bodyContent = document.getElementById('bug-modal-body-content');
  if (!bodyContent) return;

  const titleText = isLocalFallback ? "Lokaal Opgeslagen!" : "Verzonden!";
  const subtext = isLocalFallback 
    ? "De serverless API is momenteel offline of GITHUB_TOKEN is niet geconfigureerd. Uw melding is lokaal opgeslagen."
    : "Het ontwikkelingsteam (Google Antigravity) is op de hoogte gebracht en gaat er direct mee aan de slag.";

  bodyContent.innerHTML = `
    <div class="bug-status-container">
      <div class="bug-success-icon">✓</div>
      <h4 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px;">Foutrapport ${titleText}</h4>
      <p style="font-size: 13px; color: var(--text-secondary); max-width: 360px; line-height: 1.5; margin-bottom: 16px;">
        ${subtext}
      </p>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Ticket ID:</div>
      <div class="bug-ticket-id">${ticketId}</div>
      
      <button class="bug-btn-primary" id="btn-bug-success-close" style="margin-top: 20px;">
        Sluiten
      </button>
    </div>
  `;

  document.getElementById('btn-bug-success-close').onclick = closeBugModal;
}

// 4. AUTO-INITIALIZE ON DOM CONTENT LOADED
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectBugReporterUI);
} else {
  injectBugReporterUI();
}

// Re-inject on state shifts or routing if needed, but since it's a floating button
// appended to body, it stays throughout the SPA life cycle.
export { collectSystemMetadata, openBugModal, closeBugModal };
