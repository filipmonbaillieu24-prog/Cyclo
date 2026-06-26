import { state } from '../../state.js';

export const recoveryMetrics = {
  baseline: {
    gender: 'male',
    height: 181,
    birthdate: '1995-10-24'
  },

  /**
   * Berekent de leeftijd op basis van de verankerde geboortedatum
   */
  getAge() {
    const birth = new Date(this.baseline.birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  },

  /**
   * Return to Play check:
   * Als er 7 opeenvolgende dagen 0 TSS wordt gemeten,
   * dwingt de module een "Opbouwweek" af (uitsluitend Zone 1 en 2, lager volume).
   */
  shouldEnforceReturnToPlay(activities) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Controleer de afgelopen 7 dagen (vandaag t/m 6 dagen geleden)
    const tssPerDay = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      tssPerDay[dStr] = 0;
    }

    (activities || []).forEach(act => {
      const actDate = new Date(act.date || act.startTime);
      const actDateStr = actDate.toISOString().split('T')[0];
      if (tssPerDay[actDateStr] !== undefined) {
        tssPerDay[actDateStr] += act.tss || 0;
      }
    });

    const hasAnyTss = Object.values(tssPerDay).some(tss => tss > 0);
    return !hasAnyTss; // Indien 0 TSS over alle 7 dagen, dwing opbouwweek af
  },

  /**
   * TSS Plafond:
   * Verhoogt de wekelijkse TSS met maximaal 10-15% ten opzichte van de actuele Chronic Training Load (CTL)
   */
  calculateWeeklyTSSCeiling(ctl) {
    const baseCTL = ctl || 30; // fallback ctl
    // Wekelijkse TSS = CTL * 7
    // Plafond = wekelijkse TSS * 1.15
    return Math.round(baseCTL * 7 * 1.15);
  },

  /**
   * HRV & Readiness aanpassing:
   * Indien de ochtend readiness_score < 50% is, worden Zone 4+ workouts
   * voor die dag onzichtbaar teruggeschroefd naar Zone 1/2.
   */
  adjustWorkoutForHRV(workout, readinessScore) {
    if (!workout) return null;

    const score = readinessScore !== undefined ? readinessScore : (state.user?.readiness_score || 70);

    if (score < 50) {
      const typeLower = (workout.type || '').toLowerCase();
      // Indien workout van hoge intensiteit is (bijv. threshold, vo2max, anaerobe of interval)
      if (typeLower.includes('threshold') || typeLower.includes('vo2') || typeLower.includes('interval') || typeLower.includes('anaerob') || typeLower.includes('tempo')) {
        // Schaal de workout terug naar Zone 1/2 (Recovery of Endurance)
        const adjustedWorkout = {
          ...workout,
          title: `🍀 Herstel: ${workout.title} (Aangepast wegens lage HRV)`,
          type: 'Recovery/Endurance',
          target_tss: Math.round(workout.target_tss * 0.5), // TSS halveren
          planned_duration_minutes: Math.round(workout.planned_duration_minutes * 0.75), // kortere duur
          is_auto_adjusted: true,
          original_workout: {
            title: workout.title,
            type: workout.type,
            target_tss: workout.target_tss,
            planned_duration_minutes: workout.planned_duration_minutes
          }
        };
        return adjustedWorkout;
      }
    }
    return workout;
  }
};
