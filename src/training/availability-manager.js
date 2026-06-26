import { config, state } from '../../state.js';

export const availabilityManager = {
  /**
   * Ophalen van de wekelijkse beschikbaarheidssloten
   * (maandag = 1, zondag = 7)
   */
  async fetchSlots() {
    if (config.isDemoMode) {
      const stored = localStorage.getItem('cyclo_avail_slots');
      return stored ? JSON.parse(stored) : this.getDefaultSlots();
    }

    try {
      const { data, error } = await config.supabaseClient
        .from('user_availability_slots')
        .select('*')
        .eq('user_id', state.user.id);

      if (error) throw error;
      return data && data.length > 0 ? data : this.getDefaultSlots();
    } catch (err) {
      console.warn("Fout bij ophalen slots:", err.message);
      return this.getDefaultSlots();
    }
  },

  /**
   * Opslaan van wekelijks slot
   */
  async saveSlot(dayOfWeek, maxDurationMinutes) {
    if (config.isDemoMode) {
      const slots = await this.fetchSlots();
      const existing = slots.find(s => s.day_of_week === dayOfWeek);
      if (existing) {
        existing.max_duration_minutes = maxDurationMinutes;
      } else {
        slots.push({ day_of_week: dayOfWeek, max_duration_minutes: maxDurationMinutes });
      }
      localStorage.setItem('cyclo_avail_slots', JSON.stringify(slots));
      return slots;
    }

    try {
      const { error } = await config.supabaseClient
        .from('user_availability_slots')
        .upsert({
          user_id: state.user.id,
          day_of_week: dayOfWeek,
          max_duration_minutes: maxDurationMinutes
        }, { onConflict: 'user_id,day_of_week' });

      if (error) throw error;
    } catch (err) {
      console.error("Fout bij opslaan slot:", err.message);
      throw err;
    }
  },

  /**
   * Ophalen van de beschikbaarheidsuitzonderingen
   */
  async fetchExceptions() {
    if (config.isDemoMode) {
      const stored = localStorage.getItem('cyclo_avail_exceptions');
      return stored ? JSON.parse(stored) : [];
    }

    try {
      const { data, error } = await config.supabaseClient
        .from('availability_exceptions')
        .select('*')
        .eq('user_id', state.user.id);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("Fout bij ophalen exceptions:", err.message);
      return [];
    }
  },

  /**
   * Opslaan of aanpassen van een uitzondering
   */
  async saveException(dateStr, isAvailable, notes = '') {
    if (config.isDemoMode) {
      const exceptions = await this.fetchExceptions();
      const idx = exceptions.findIndex(e => e.date === dateStr);
      const payload = { date: dateStr, is_available: isAvailable, notes };
      if (idx !== -1) {
        exceptions[idx] = payload;
      } else {
        exceptions.push(payload);
      }
      localStorage.setItem('cyclo_avail_exceptions', JSON.stringify(exceptions));
      return exceptions;
    }

    try {
      const { error } = await config.supabaseClient
        .from('availability_exceptions')
        .upsert({
          user_id: state.user.id,
          date: dateStr,
          is_available: isAvailable,
          notes: notes
        }, { onConflict: 'user_id,date' });

      if (error) throw error;
    } catch (err) {
      console.error("Fout bij opslaan uitzondering:", err.message);
      throw err;
    }
  },

  /**
   * Standaard slots: doordeweeks 60 minuten, weekend 180 minuten.
   */
  getDefaultSlots() {
    return [
      { day_of_week: 1, max_duration_minutes: 60 },
      { day_of_week: 2, max_duration_minutes: 60 },
      { day_of_week: 3, max_duration_minutes: 90 }, // Woensdagavond rit
      { day_of_week: 4, max_duration_minutes: 60 },
      { day_of_week: 5, max_duration_minutes: 60 },
      { day_of_week: 6, max_duration_minutes: 180 }, // Zaterdag duurrit
      { day_of_week: 7, max_duration_minutes: 180 }  // Zondag duurrit
    ];
  }
};
