// Cyclo - Supabase Realtime Sync & WebSocket Telemetry Module
import { state, config } from './state.js';

/**
 * Zet realtime subscriptions op voor alle databasetabellen.
 * Zodra er een verandering is, wordt de dashboard data ververst.
 * 
 * ride_participants wijzigingen worden NIET doorgegeven aan loadDashboardData
 * omdat de optimistische UI-update in rides.js dit al correct afhandelt.
 * Een volledige herlaad zou de optimistische state overschrijven.
 */
export function setupRealtimeSubscriptions(loadDashboardDataCallback) {
  if (config.isDemoMode || !config.supabaseClient) {
    return null;
  }

  // Debounce: voorkom storm van herlaad-calls bij meerdere snelle DB-wijzigingen
  let debounceTimer = null;
  const debouncedReload = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadDashboardDataCallback();
    }, 800); // Wacht 800ms na laatste event
  };

  try {
    const channel = config.supabaseClient
      .channel('schema-db-changes')

      .on('postgres_changes', { event: '*', schema: 'public', table: 'availabilities' }, () => {
        debouncedReload();
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        debouncedReload();
      })

      // ride_participants: GEEN volledige herlaad — de toggle in rides.js
      // doet een gerichte herlaad van die ene rit na de DB-call.
      // Een volledige reload hier zou de optimistische state overschrijven.
      // .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_participants' }, () => {
      //   debouncedReload();
      // })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        debouncedReload();
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        debouncedReload();
      })

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Synchronisatie geactiveerd.');
        }
      });

    return channel;
  } catch (err) {
    console.error('[Realtime] Fout bij initialiseren:', err);
    return null;
  }
}

// ─── Live Telemetry WebSocket Engine (Socket.io) ──────────────────────────

let socket = null;
let simInterval = null;
let lastUserTelemetry = null;
let simTime = 0;

// IndexedDB Database config for Offline Telemetry Buffering
const DB_NAME = 'cyclo-offline-telemetry';
const DB_VERSION = 1;
const STORE_NAME = 'telemetry-buffer';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function bufferTelemetryPoint(point) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({
      ...point,
      timestamp: Date.now()
    });
    console.log('[Offline Buffer] Datapunt lokaal opgeslagen in IndexedDB:', point);
  } catch (err) {
    console.error('[Offline Buffer] Fout bij opslaan in buffer:', err);
  }
}

async function syncBufferedTelemetry() {
  if (navigator.onLine === false) return;
  
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const points = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (!points || points.length === 0) return;
    
    console.log(`[Offline Buffer] ${points.length} gebufferde datapunten gevonden. Synchroniseren met server...`);
    
    // In production mode, we emit a batch payload through the websocket connection
    if (socket && socket.connected) {
      socket.emit('telemetry-send-batch', points);
      console.log(`[Offline Buffer] Batch verzonden naar WebSocket server`);
    } else {
      // In demo mode or simulation, we just simulate successful sync after a short delay
      console.log(`[Offline Buffer] Mock sync: ${points.length} datapunten succesvol overgedragen.`);
    }
    
    // Clear IndexedDB store
    const clearTx = db.transaction(STORE_NAME, 'readwrite');
    const clearStore = clearTx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const clearRequest = clearStore.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });
    console.log('[Offline Buffer] Lokale buffer succesvol gewist.');
  } catch (err) {
    console.error('[Offline Buffer] Fout bij bulk sync:', err);
  }
}

// Bind connection change event listeners
window.addEventListener('online', () => {
  console.log('[Telemetry] Internetverbinding hersteld. Batch-sync starten...');
  syncBufferedTelemetry();
});

window.addEventListener('offline', () => {
  console.log('[Telemetry] Internetverbinding verbroken. Telemetrie wordt lokaal gebufferd.');
});

export function initTelemetry(rideId, userId, onIncomingTelemetry) {
  disconnectTelemetry();
  
  console.log(`[Telemetry] Initializing telemetry room: ride_${rideId} for user: ${userId}`);
  
  const serverUrl = config.telemetryServerUrl || 'https://cyclo-websocket.onrender.com';
  
  if (typeof io !== 'undefined' && !config.isDemoMode) {
    try {
      socket = io(serverUrl, {
        autoConnect: true,
        reconnection: true,
        transports: ['websocket']
      });
      
      socket.on('connect', () => {
        console.log('[Telemetry] Connected to WebSocket server');
        socket.emit('join-ride', { ride_id: rideId, user_id: userId });
      });
      
      socket.on('telemetry-receive', (data) => {
        if (data && data.user_id !== userId) {
          onIncomingTelemetry(data);
        }
      });
      
      socket.on('connect_error', (err) => {
        console.warn('[Telemetry] Connection error, using simulation fallback:', err.message);
        startTelemetrySimulation(rideId, userId, onIncomingTelemetry);
      });
    } catch (e) {
      console.warn('[Telemetry] Failed to initialize Socket.io client:', e);
      startTelemetrySimulation(rideId, userId, onIncomingTelemetry);
    }
  } else {
    console.log('[Telemetry] Demo mode or Socket.io not loaded. Starting simulator.');
    startTelemetrySimulation(rideId, userId, onIncomingTelemetry);
  }
}

export function sendTelemetry(payload) {
  // If we are currently offline, buffer the telemetry point
  if (navigator.onLine === false) {
    bufferTelemetryPoint(payload);
    return;
  }

  if (socket && socket.connected) {
    socket.emit('telemetry-send', payload);
  }
  // Store user's position for simulator companions
  lastUserTelemetry = payload;

  // Proactively check and sync any buffered telemetry
  syncBufferedTelemetry();
}

export function disconnectTelemetry() {
  if (socket) {
    try {
      socket.disconnect();
    } catch(e) {}
    socket = null;
  }
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  lastUserTelemetry = null;
  simTime = 0;
  console.log('[Telemetry] Telemetry session disconnected.');
}

function startTelemetrySimulation(rideId, userId, onIncomingTelemetry) {
  if (simInterval) clearInterval(simInterval);
  
  // Find other active profiles in database to act as companions
  let companions = (state.profiles || [])
    .filter(p => p.id !== userId)
    .slice(0, 3);
    
  if (companions.length === 0) {
    // Fallback companions
    companions = [
      { id: 'mock-companion-1', full_name: 'Ruben Wieler', avatar_url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ruben', username: 'rubenw' },
      { id: 'mock-companion-2', full_name: 'Sven Stoemper', avatar_url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=sven', username: 'sven_s' },
      { id: 'mock-companion-3', full_name: 'Sarah Grimpeur', avatar_url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=sarah', username: 'sarah_g' }
    ];
  }
  
  console.log(`[Telemetry Sim] Companion riders started:`, companions.map(c => c.full_name));
  
  simTime = 0;
  simInterval = setInterval(() => {
    simTime++;
    if (!lastUserTelemetry) return; // Wait until current user sends GPS position
    
    companions.forEach((comp, index) => {
      let latOffset = 0;
      let lngOffset = 0;
      
      if (index === 0) {
        // Rides slightly ahead and to the right
        latOffset = 0.00015 + 0.00004 * Math.sin(simTime / 8);
        lngOffset = 0.00010 + 0.00004 * Math.cos(simTime / 8);
      } else if (index === 1) {
        // Rides slightly behind
        latOffset = -0.00018 + 0.00003 * Math.cos(simTime / 10);
        lngOffset = -0.00012 + 0.00003 * Math.sin(simTime / 10);
      } else {
        // Rides right next to user
        latOffset = 0.00003 * Math.sin(simTime / 6);
        lngOffset = -0.00014 + 0.00004 * Math.cos(simTime / 6);
      }
      
      const speed = Math.max(10, Math.min(50, lastUserTelemetry.speed + (Math.sin(simTime + index) * 2.5)));
      const hr = Math.max(100, Math.min(190, (lastUserTelemetry.hr || 140) + Math.floor(Math.sin(simTime/5 + index) * 6)));
      const watts = Math.max(50, Math.min(500, (lastUserTelemetry.watts || 200) + Math.floor(Math.cos(simTime/4 + index) * 30)));
      
      onIncomingTelemetry({
        ride_id: rideId,
        user_id: comp.id,
        username: comp.username || comp.full_name.split(' ')[0].toLowerCase(),
        full_name: comp.full_name,
        avatar_url: comp.avatar_url,
        lat: lastUserTelemetry.lat + latOffset,
        lng: lastUserTelemetry.lng + lngOffset,
        speed: parseFloat(speed.toFixed(1)),
        hr: Math.round(hr),
        watts: Math.round(watts)
      });
    });
  }, 1000);
}
