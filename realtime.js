// Cyclo - Supabase Realtime Sync Module
import { config } from './state.js';

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
