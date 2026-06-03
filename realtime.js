// Cyclo - Supabase Realtime Sync Module
import { config } from './state.js';

/**
 * Zet realtime subscriptions op voor alle databasetabellen.
 * Zodra er een verandering is, wordt de dashboard data ververst.
 * @param {Function} loadDashboardDataCallback 
 * @returns {RealtimeChannel|null}
 */
export function setupRealtimeSubscriptions(loadDashboardDataCallback) {
  if (config.isDemoMode || !config.supabaseClient) {
    return null;
  }

  try {
    const channel = config.supabaseClient
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availabilities' }, () => {
        loadDashboardDataCallback();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        loadDashboardDataCallback();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_participants' }, () => {
        loadDashboardDataCallback();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadDashboardDataCallback();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        loadDashboardDataCallback();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log("Realtime synchronisatie geactiveerd voor Cyclo tabellen!");
        }
      });
      
    return channel;
  } catch (err) {
    console.error("Fout bij initialiseren realtime database verbinding:", err);
    return null;
  }
}
