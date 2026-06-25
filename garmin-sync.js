// Cyclo - Garmin Sync Management Module
import { state, config, showToast } from './state.js';

export async function initGarminSync() {
  const btn = document.getElementById('btn-connect-garmin');
  const lbl = document.getElementById('garmin-status-lbl');
  if (!btn || !lbl) return;

  // 1. Check URL parameters for redirection callback success
  const params = new URLSearchParams(window.location.search);
  if (params.get('garmin') === 'connected') {
    showToast("Garmin Connect succesvol gekoppeld!", "success");
    // Clean up URL
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  } else if (params.get('garmin') === 'cancelled') {
    showToast("Koppeling met Garmin Connect geannuleerd.", "info");
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  }

  // 2. Initial state sync
  await updateGarminUI();

  // 3. Bind click handler
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!state.user) {
      showToast("Meld u eerst aan om een account te koppelen.", "error");
      return;
    }

    btn.disabled = true;
    const isConnected = btn.textContent === 'Ontkoppelen';

    if (isConnected) {
      // Disconnect Garmin
      const success = await disconnectGarmin();
      if (success) {
        showToast("Garmin Connect ontkoppeld.", "info");
      }
    } else {
      // Connect Garmin
      if (config.isDemoMode) {
        // Simulate OAuth redirection and connection
        showToast("Koppelen met Garmin Connect (Mock)...", "info");
        btn.textContent = "Koppelen...";
        setTimeout(() => {
          const mockData = getMockIntegrations();
          mockData.garmin_connected = true;
          mockData.garmin_user_id = 'garmin_user_mock_filip';
          saveMockIntegrations(mockData);
          updateGarminUI();
          showToast("Garmin Connect succesvol gekoppeld (Demo)!", "success");
        }, 1200);
      } else {
        // Redirect to Vercel OAuth endpoint
        showToast("Omleiden naar Garmin...", "info");
        window.location.href = `/api/auth/garmin?userId=${state.user.id}`;
      }
    }
    btn.disabled = false;
  });
}

async function updateGarminUI() {
  const btn = document.getElementById('btn-connect-garmin');
  const lbl = document.getElementById('garmin-status-lbl');
  if (!btn || !lbl) return;

  let connected = false;
  let garminUid = '';

  if (config.isDemoMode) {
    const mock = getMockIntegrations();
    connected = !!mock.garmin_connected;
    garminUid = mock.garmin_user_id || '';
  } else if (state.user && config.supabaseClient) {
    try {
      const { data, error } = await config.supabaseClient
        .from('user_integrations')
        .select('garmin_connected, garmin_user_id')
        .eq('user_id', state.user.id)
        .maybeSingle();

      if (data && !error) {
        connected = !!data.garmin_connected;
        garminUid = data.garmin_user_id || '';
      }
    } catch (err) {
      console.warn("Garmin Connect status query failed:", err);
    }
  }

  if (connected) {
    lbl.textContent = `Gekoppeld${garminUid ? ' (ID: ' + garminUid + ')' : ''}`;
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

async function disconnectGarmin() {
  if (config.isDemoMode) {
    const mock = getMockIntegrations();
    mock.garmin_connected = false;
    mock.garmin_user_id = null;
    saveMockIntegrations(mock);
    await updateGarminUI();
    return true;
  }

  if (state.user && config.supabaseClient) {
    try {
      const { error } = await config.supabaseClient
        .from('user_integrations')
        .update({
          garmin_connected: false,
          garmin_access_token: null,
          garmin_refresh_token: null,
          garmin_expires_at: null,
          garmin_user_id: null
        })
        .eq('user_id', state.user.id);

      if (error) throw error;
      await updateGarminUI();
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
