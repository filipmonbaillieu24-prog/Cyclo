import { config, state } from '../../state.js';
import { recoveryMetrics } from './recovery-metrics.js';

export const adaptiveScheduler = {
  /**
   * Evalueert het verplaatsen van een workout naar een andere datum.
   * Levert de gewijzigde lijst van geplande workouts terug.
   */
  evaluateMove(workouts, workoutId, newDateStr, slots, exceptions) {
    const newDate = new Date(newDateStr);
    const dayOfWeek = newDate.getDay() === 0 ? 7 : newDate.getDay(); // 1 = ma, 7 = zo

    // Zoek het slot voor deze dag
    const slot = (slots || []).find(s => s.day_of_week === dayOfWeek);
    const maxDur = slot ? slot.max_duration_minutes : 90;

    // Check voor uitzonderingen
    const exception = (exceptions || []).find(e => e.date === newDateStr);
    const isExceptionUnavail = exception ? !exception.is_available : false;

    const updatedWorkouts = [...workouts];
    const workoutIdx = updatedWorkouts.findIndex(w => w.id === workoutId);
    if (workoutIdx === -1) return updatedWorkouts;

    const workout = { ...updatedWorkouts[workoutIdx] };
    workout.date = newDateStr;

    // Check of er overbelasting optreedt
    const isOverloaded = isExceptionUnavail || (workout.planned_duration_minutes > maxDur);
    workout.is_overloaded = isOverloaded;

    updatedWorkouts[workoutIdx] = workout;

    // Als de dag overbelast is, schalen we toekomstige trainingen in DEZELFDE week stilletjes terug
    if (isOverloaded) {
      const weekRange = this.getWeekRange(newDateStr);
      updatedWorkouts.forEach((w, idx) => {
        if (w.id !== workout.id && w.date >= newDateStr && w.date <= weekRange.end) {
          // Maak toekomstige trainingen stilletjes 20% lichter
          updatedWorkouts[idx] = {
            ...w,
            target_tss: Math.round(w.target_tss * 0.8),
            planned_duration_minutes: Math.round(w.planned_duration_minutes * 0.85),
            is_auto_adjusted: true
          };
        }
      });
    }

    return updatedWorkouts;
  },

  /**
   * Trekt de TSS-load van een ongeplande rit af van toekomstige trainingen in die week
   */
  budgetUnplannedRide(workouts, rideTSS, dateStr) {
    const weekRange = this.getWeekRange(dateStr);
    const updated = [...workouts];

    // Vind toekomstige geplande workouts in deze week
    const futureWorkouts = updated.filter(w => w.date > dateStr && w.date <= weekRange.end && w.status === 'planned');
    if (futureWorkouts.length === 0) return updated;

    // Verdeel de load over de toekomstige ritten
    const tssDeductionPerWorkout = Math.round(rideTSS / futureWorkouts.length);

    updated.forEach((w, idx) => {
      if (w.date > dateStr && w.date <= weekRange.end && w.status === 'planned') {
        const newTSS = Math.max(15, w.target_tss - tssDeductionPerWorkout);
        updated[idx] = {
          ...w,
          target_tss: newTSS,
          planned_duration_minutes: Math.max(20, Math.round(w.planned_duration_minutes * (newTSS / w.target_tss))),
          is_auto_adjusted: true
        };
      }
    });

    return updated;
  },

  /**
   * Matchmaker: Koppelt inkomende activiteiten aan een geplande training
   */
  matchActivityToWorkout(activity, workouts) {
    const actDateStr = new Date(activity.date || activity.startTime).toISOString().split('T')[0];
    const updated = [...workouts];

    // Zoek naar een geplande training op dezelfde dag
    const idx = updated.findIndex(w => w.date === actDateStr && w.status === 'planned');
    if (idx !== -1) {
      updated[idx] = {
        ...updated[idx],
        status: 'completed',
        associated_activity_id: activity.id
      };
    }
    return updated;
  },

  /**
   * Berekent Fitness (CTL), Vermoeidheid (ATL) en Vorm (TSB) retroactief dag-voor-dag
   */
  recalculatePMC(activities, daysToCalculate = 90) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pmcData = [];
    let currentCTL = 0;
    let currentATL = 0;

    // Start 120 dagen geleden om CTL op te bouwen (warm-up fase voor accuraatheid)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (daysToCalculate + 30));

    // Groepeer TSS per dag
    const tssMap = {};
    (activities || []).forEach(act => {
      const dStr = new Date(act.date || act.startTime).toISOString().split('T')[0];
      tssMap[dStr] = (tssMap[dStr] || 0) + (act.tss || 0);
    });

    const lambdaCTL = 1 - Math.exp(-1 / 42); // 42 dagen constante
    const lambdaATL = 1 - Math.exp(-1 / 7);  // 7 dagen constante

    const loopDate = new Date(startDate);
    while (loopDate <= today) {
      const dStr = loopDate.toISOString().split('T')[0];
      const dailyTSS = tssMap[dStr] || 0;

      currentCTL = currentCTL + (dailyTSS - currentCTL) * lambdaCTL;
      currentATL = currentATL + (dailyTSS - currentATL) * lambdaATL;
      const tsb = currentCTL - currentATL;

      // Sla alleen de gevraagde periode op in de output
      const daysDiff = (today - loopDate) / (1000 * 3600 * 24);
      if (daysDiff <= daysToCalculate) {
        pmcData.push({
          date: dStr,
          ctl: parseFloat(currentCTL.toFixed(1)),
          atl: parseFloat(currentATL.toFixed(1)),
          tsb: parseFloat(tsb.toFixed(1)),
          tss: dailyTSS
        });
      }

      loopDate.setDate(loopDate.getDate() + 1);
    }

    return pmcData;
  },

  getWeekRange(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Maandag
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // Zondag

    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    };
  },

  /**
   * Genereert een adaptief trainingsschema voor een week op basis van CTL
   */
  generateWeeklyPlan(ctl, slots, exceptions, weekStartDate) {
    const monday = new Date(weekStartDate);
    const getD = (offset) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      return d.toISOString().split('T')[0];
    };

    // Bepaal week TSS doel op basis van CTL
    const baseCTL = ctl || 20;
    // Progressief overload doel: CTL * 7 * 1.15
    let weeklyTargetTSS = Math.round(baseCTL * 7 * 1.15);
    weeklyTargetTSS = Math.max(120, Math.min(650, weeklyTargetTSS));

    // Slots mapping per dag (1-7)
    const slotMap = {};
    for (let i = 1; i <= 7; i++) {
      const s = (slots || []).find(x => x.day_of_week === i);
      slotMap[i] = s ? s.max_duration_minutes : (i >= 6 ? 180 : 60);
    }

    // Exceptions mapping
    const excMap = {};
    (exceptions || []).forEach(e => {
      excMap[e.date] = e.is_available;
    });

    const workouts = [];
    let allocatedTSS = 0;

    // We willen maximaal 2 intensieve sessies per week om overtraining te voorkomen
    let intensitySessionsScheduled = 0;

    // Loop over de 7 dagen van de week (0 = Maandag, 6 = Zondag)
    for (let i = 0; i < 7; i++) {
      const dateStr = getD(i);
      const isAvailable = excMap[dateStr] !== undefined ? excMap[dateStr] : true;
      const maxDur = slotMap[i + 1] || 0;

      // Rustdag als niet beschikbaar of max duration <= 0
      if (!isAvailable || maxDur <= 0) {
        continue;
      }

      // Bepaal workout type en intensiteit op basis van dag en resterend TSS budget
      let type = 'Endurance';
      let title = 'Z2 Duurtraining';
      let duration = Math.min(maxDur, i >= 5 ? 120 : 60);
      let tss = Math.round(duration * 0.6); // default endurance TSS

      if (i === 0) {
        // Maandag: Actief herstel of rustdag
        type = 'Recovery';
        title = 'Z1 Actief Herstel';
        duration = Math.min(maxDur, 40);
        tss = 20;
      } else if (i === 1 && intensitySessionsScheduled < 2 && maxDur >= 60) {
        // Dinsdag: VO2 Max of Threshold
        type = 'Interval';
        title = 'Z5 VO2 Max Intervallen';
        duration = Math.min(maxDur, 75);
        tss = 80;
        intensitySessionsScheduled++;
      } else if (i === 3 && intensitySessionsScheduled < 2 && maxDur >= 60) {
        // Donderdag: Sweet Spot
        type = 'Threshold';
        title = 'Z4 Sweet Spot Threshold';
        duration = Math.min(maxDur, 90);
        tss = 90;
        intensitySessionsScheduled++;
      } else if (i === 5 || i === 6) {
        // Weekend: Lange duurtraining
        type = 'Endurance';
        title = 'Z2 Aerobe Duurtraining';
        duration = Math.min(maxDur, 180);
        // Geef een groter deel van de resterende TSS aan de duurtraining
        tss = Math.min(200, Math.round(duration * 0.65));
      } else {
        // Andere dagen: Rustige duurtraining of recovery
        if (maxDur < 60) {
          type = 'Recovery';
          title = 'Z1 Actief Herstel';
          duration = maxDur;
          tss = Math.round(duration * 0.4);
        } else {
          type = 'Endurance';
          title = 'Z2 Aerobe Basistraining';
          duration = Math.min(maxDur, 60);
          tss = 40;
        }
      }

      workouts.push({
        id: `w-auto-${Date.now()}-${i}-${Math.floor(Math.random() * 100)}`,
        date: dateStr,
        title,
        type,
        planned_duration_minutes: duration,
        target_tss: tss,
        status: 'planned',
        is_auto_adjusted: true
      });

      allocatedTSS += tss;
    }

    // Pas de TSS en duur proportioneel aan om dicht bij het wekelijkse target te komen (indien nodig)
    if (allocatedTSS > 0 && Math.abs(allocatedTSS - weeklyTargetTSS) > 30) {
      const ratio = weeklyTargetTSS / allocatedTSS;
      workouts.forEach(w => {
        if (w.type !== 'Recovery') {
          const oldTss = w.target_tss;
          w.target_tss = Math.max(25, Math.round(w.target_tss * ratio));
          w.planned_duration_minutes = Math.max(30, Math.round(w.planned_duration_minutes * (w.target_tss / oldTss)));
          // Zorg dat het binnen de max duration slot past
          const dayNum = new Date(w.date).getDay();
          const dayIdx = dayNum === 0 ? 7 : dayNum;
          const maxD = slotMap[dayIdx];
          if (w.planned_duration_minutes > maxD) {
            w.planned_duration_minutes = maxD;
            w.target_tss = Math.round(maxD * (w.target_tss / w.planned_duration_minutes));
          }
        }
      });
    }

    return workouts;
  }
};
