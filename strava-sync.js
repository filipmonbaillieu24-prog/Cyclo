// Cyclo - Strava Sync Management Module
import { state, config, showToast, navigateTo } from './state.js';

// Track if the OAuth callback has already been handled to prevent duplicate toasts
let _stravaCallbackHandled = false;
// Track if the click handler is already bound to prevent duplicate handlers
let _stravaListenerBound = false;

export async function initStravaSync() {
  const btn = document.getElementById('btn-connect-strava');
  const lbl = document.getElementById('strava-status-lbl');
  if (!btn || !lbl) return;

  // 1. Check URL parameters for redirection callback success (only handle once)
  if (!_stravaCallbackHandled) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      _stravaCallbackHandled = true;
      showToast("Strava succesvol gekoppeld! Bekijk je profiel.", "success");
      // Clean up URL
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
      // After Strava connect, navigate to profile so user sees connection status
      // Wait for user session to be set before navigating
      setTimeout(() => {
        if (state.user && window._loadProfilePage) {
          window._loadProfilePage();
        }
      }, 1500);
    }
    if (params.get('garmin') === 'connected') {
      _stravaCallbackHandled = true;
      showToast("Garmin Connect succesvol gekoppeld! Bekijk je profiel.", "success");
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
      setTimeout(() => {
        if (state.user && window._loadProfilePage) {
          window._loadProfilePage();
        }
      }, 1500);
    }
  }

  // 2. Initial state sync
  await updateStravaUI();

  // 3. Bind click handler (only once)
  if (!_stravaListenerBound) {
    _stravaListenerBound = true;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!state.user) {
        showToast("Meld u eerst aan om een account te koppelen.", "error");
        return;
      }

      btn.disabled = true;
      const isConnected = btn.textContent === 'Ontkoppelen';

      if (isConnected) {
        // Disconnect Strava
        const success = await disconnectStrava();
        if (success) {
          showToast("Strava ontkoppeld.", "info");
        }
      } else {
        // Connect Strava
        if (config.isDemoMode) {
          // Simulate OAuth redirection and connection
          showToast("Koppelen met Strava (Mock)...", "info");
          btn.textContent = "Koppelen...";
          setTimeout(() => {
            const mockData = getMockIntegrations();
            mockData.strava_connected = true;
            mockData.strava_athlete_id = 'athlete_mock_filip';
            saveMockIntegrations(mockData);
            updateStravaUI();
            showToast("Strava succesvol gekoppeld (Demo)!", "success");
          }, 1200);
        } else {
          // Redirect to Vercel OAuth endpoint
          showToast("Omleiden naar Strava...", "info");
          window.location.href = `/api/auth/strava?userId=${state.user.id}`;
        }
      }
      btn.disabled = false;
    });
  }


async function updateStravaUI() {
  const btn = document.getElementById('btn-connect-strava');
  const lbl = document.getElementById('strava-status-lbl');
  if (!btn || !lbl) return;

  let connected = false;
  let athleteId = '';

  if (config.isDemoMode) {
    const mock = getMockIntegrations();
    connected = !!mock.strava_connected;
    athleteId = mock.strava_athlete_id || '';
  } else if (state.user && config.supabaseClient) {
    try {
      const { data, error } = await config.supabaseClient
        .from('user_integrations')
        .select('strava_connected, strava_athlete_id')
        .eq('user_id', state.user.id)
        .maybeSingle();

      if (data && !error) {
        connected = !!data.strava_connected;
        athleteId = data.strava_athlete_id || '';
      }
    } catch (err) {
      console.warn("Strava status query failed:", err);
    }
  }

  if (connected) {
    lbl.textContent = `Gekoppeld${athleteId ? ' (ID: ' + athleteId + ')' : ''}`;
    lbl.style.color = 'var(--primary)';
    btn.textContent = 'Ontkoppelen';
    btn.className = 'btn btn-secondary btn-sm';
    btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    btn.style.color = '#ef4444';
  } else {
    lbl.textContent = 'Niet gekoppeld';
    lbl.style.color = 'var(--text-muted)';
    btn.textContent = 'Koppelen';
    btn.className = 'btn btn-primary btn-sm';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

async function disconnectStrava() {
  if (config.isDemoMode) {
    const mock = getMockIntegrations();
    mock.strava_connected = false;
    mock.strava_athlete_id = null;
    saveMockIntegrations(mock);
    await updateStravaUI();
    return true;
  }

  if (state.user && config.supabaseClient) {
    try {
      const { error } = await config.supabaseClient
        .from('user_integrations')
        .update({
          strava_connected: false,
          strava_access_token: null,
          strava_refresh_token: null,
          strava_expires_at: null,
          strava_athlete_id: null
        })
        .eq('user_id', state.user.id);

      if (error) throw error;
      await updateStravaUI();
      return true;
    } catch (err) {
      showToast("Fout bij ontkoppelen: " + err.message, "error");
      return false;
    }
  }
  return false;
}

// Mock Helpers for Demo Mode
function getMockIntegrations() {
  try {
    return JSON.parse(localStorage.getItem('cyclo_mock_integrations') || '{}');
  } catch (e) {
    return {};
  }
}

function saveMockIntegrations(data) {
  try {
    localStorage.setItem('cyclo_mock_integrations', JSON.stringify(data));
  } catch (e) {}
}
