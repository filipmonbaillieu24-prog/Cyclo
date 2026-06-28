// Cyclo - Slimme Adaptieve Trainingsengine
// Pure data-processor module voor NP, TSS en CTL/ATL/TSB trends

import { state, config } from './state.js';
import { calculateReadinessScore } from './zones.js';

// ─── 1. METRIEKEN BEREKENEN ────────────────────────

// Normalized Power (NP) - 30-seconden rolling average 4e machts gemiddelde
export function calculateNP(powerStream) {
  if (!powerStream || powerStream.length === 0) return 0;
  if (powerStream.length < 30) {
    const sum = powerStream.reduce((a, b) => a + b, 0);
    return Math.round(sum / powerStream.length);
  }
  
  const rollingAverages = [];
  let windowSum = 0;
  
  // Initial 30s window
  for (let i = 0; i < 30; i++) {
    windowSum += powerStream[i] || 0;
  }
  rollingAverages.push(windowSum / 30);
  
  // Slide window
  for (let i = 30; i < powerStream.length; i++) {
    windowSum = windowSum - (powerStream[i - 30] || 0) + (powerStream[i] || 0);
    rollingAverages.push(windowSum / 30);
  }
  
  // Raise to 4th power, average, 4th root
  const fourthPowers = rollingAverages.map(val => Math.pow(val, 4));
  const avgFourthPower = fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;
  const np = Math.pow(avgFourthPower, 0.25);
  
  return Math.round(np);
}

// Training Stress Score (TSS) gebaseerd op vermogen
export function calculateTSS(durationSec, np, ftp) {
  if (!ftp || ftp <= 0) ftp = 200; // default FTP fallback
  const intensityFactor = np / ftp;
  const tss = (durationSec * np * intensityFactor) / (ftp * 3600) * 100;
  return parseFloat(tss.toFixed(1));
}

// Hartslag-gebaseerde TSS schatting (hrTSS) als fallback
export function calculateHrTSS(durationMin, avgHr, maxHr) {
  if (!maxHr || maxHr <= 0) maxHr = 190; // default max HR fallback
  const hrRatio = avgHr / maxHr;
  const hrTSS = (durationMin * hrRatio * 100) / 60;
  return parseFloat(hrTSS.toFixed(1));
}


// ─── 2. HISTORISCHE AGGREGATOR (CTL, ATL, TSB) ─────

export async function recalculateTrainingMetrics(userId) {
  if (!userId) return [];
  
  // Verzamel alle ritten van de gebruiker die een geldige datum hebben
  const activities = (state.activities || []).filter(act => act.date && !isNaN(new Date(act.date).getTime()));
  if (activities.length === 0) {
    state.trainingMetrics = [];
    return [];
  }
  
  // Sorteer op datum ascending (oudste eerst)
  activities.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Gropeer TSS per dag (sommeer bij meerdere ritten op dezelfde dag)
  const dailyTss = new Map();
  const ftp = state.user?.ftp || 200;
  const maxHr = state.user?.max_hr || 190;
  
  activities.forEach(act => {
    const d = new Date(act.date);
    const dateStr = d.toISOString().split('T')[0];
    
    let tss = act.tss;
    if (tss === undefined || tss === null || isNaN(tss)) {
      if (act.avg_power_watts && act.avg_power_watts > 0) {
        tss = calculateTSS(act.duration_secs, act.avg_power_watts, ftp);
      } else if (act.avg_heart_rate && act.avg_heart_rate > 0) {
        tss = calculateHrTSS(act.duration_secs / 60, act.avg_heart_rate, maxHr);
      } else {
        // Geschat o.b.v. score/duur
        tss = (act.duration_secs / 3600) * 45; // ~45 TSS per uur gemiddeld
      }
      act.tss = parseFloat(tss.toFixed(1));
    }
    
    dailyTss.set(dateStr, (dailyTss.get(dateStr) || 0) + tss);
  });
  
  // Bepaal de tijdsspanne: van oudste rit tot vandaag
  const oldestDate = new Date(activities[0].date);
  oldestDate.setHours(0,0,0,0);
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const metrics = [];
  let runningCtl = 0;
  let runningAtl = 0;
  
  // EMA constanten:
  // CTL (42 dagen) -> decay = 2 / 43
  // ATL (7 dagen)  -> decay = 2 / 8 = 0.25
  const ctlDecay = 2 / 43;
  const atlDecay = 2 / 8;
  
  let currentDate = new Date(oldestDate);
  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const tss = dailyTss.get(dateStr) || 0;
    
    runningCtl = runningCtl + ctlDecay * (tss - runningCtl);
    runningAtl = runningAtl + atlDecay * (tss - runningAtl);
    const tsb = runningCtl - runningAtl;
    
    metrics.push({
      user_id: userId,
      date: dateStr,
      tss: parseFloat(tss.toFixed(1)),
      ctl: parseFloat(runningCtl.toFixed(1)),
      atl: parseFloat(runningAtl.toFixed(1)),
      tsb: parseFloat(tsb.toFixed(1))
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  state.trainingMetrics = metrics;
  
  // Database of LocalStorage opslag
  if (config.supabaseClient && !config.isDemoMode) {
    try {
      await config.supabaseClient
        .from('training_metrics')
        .upsert(metrics, { onConflict: 'user_id,date' });
    } catch (e) {
      console.warn('Supabase training_metrics write error:', e);
    }
  } else {
    localStorage.setItem(`cyclo_metrics_${userId}`, JSON.stringify(metrics));
  }
  
  return metrics;
}


// ─── 3. ADAPTIEVE BESLISSINGSLOGICA ────────────────

export async function evaluateAndAdaptPlan(userId) {
  if (!userId) return null;
  
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Bereken metrics opnieuw
  const metrics = await recalculateTrainingMetrics(userId);
  if (metrics.length === 0) return null;
  
  const todayMetric = metrics[metrics.length - 1];
  const currentCtl = todayMetric.ctl;
  const currentTsb = todayMetric.tsb;
  
  // Bepaal HRV readiness
  let todayReadiness = 80; // default gezond
  if (config.supabaseClient && !config.isDemoMode) {
    try {
      const { data, error } = await config.supabaseClient
        .from('daily_biometrics')
        .select('readiness_score')
        .eq('user_id', userId)
        .eq('date', todayStr)
        .maybeSingle();
      if (data && !error) {
        todayReadiness = data.readiness_score;
      }
    } catch(e) {
      console.warn('Supabase daily_biometrics query error:', e);
    }
  } else {
    try {
      const localBiometrics = JSON.parse(localStorage.getItem('cyclo_daily_biometrics') || '[]');
      const todayRecord = localBiometrics.find(b => b.date === todayStr);
      if (todayRecord) {
        todayReadiness = todayRecord.readiness_score;
      }
    } catch (e) {
      console.warn('Gevoeligheid lezer kon HRV niet laden:', e);
    }
  }
  
  // Wekelijkse cyclus start (maandag)
  const monday = new Date();
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  monday.setHours(0,0,0,0);
  const weekStartStr = monday.toISOString().split('T')[0];
  const weekEndStr = new Date(monday.getTime() + 6 * 86400000).toISOString().split('T')[0];
  
  // 1. Haal de echte geplande trainingen op voor deze week
  let currentWorkouts = [];
  if (config.supabaseClient && !config.isDemoMode) {
    try {
      const { data } = await config.supabaseClient
        .from('planned_workouts')
        .select('*')
        .eq('user_id', userId)
        .gte('date', weekStartStr)
        .lte('date', weekEndStr);
      if (data) currentWorkouts = data;
    } catch(e) {
      console.warn('Fout bij ophalen planned workouts in engine:', e);
    }
  } else {
    try {
      const allPlanned = JSON.parse(localStorage.getItem('cyclo_planned_workouts') || '[]');
      currentWorkouts = allPlanned.filter(w => w.date >= weekStartStr && w.date <= weekEndStr);
    } catch(e) {}
  }
  
  let plannedTss = currentWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);
  if (plannedTss === 0) plannedTss = 150; // fallback doel
  
  // Bereken werkelijke TSS van de ritten in DEZE actuele week
  let actualTss = 0;
  const thisWeekActivities = (state.activities || []).filter(act => {
    const actDate = new Date(act.date || act.startTime).toISOString().split('T')[0];
    return actDate >= weekStartStr && actDate <= weekEndStr;
  });
  actualTss = thisWeekActivities.reduce((sum, act) => sum + (act.tss || 0), 0);
  
  // Map de echte trainingen naar blocks voor de widget op de planner-pagina
  const days = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  let trainingBlocks = currentWorkouts.map(w => {
    const dayName = days[new Date(w.date).getDay()];
    
    let targetPower = '—';
    if (w.type === 'Recovery') targetPower = '≤55% FTP';
    else if (w.type === 'Endurance') targetPower = '56-75% FTP';
    else if (w.type === 'Tempo') targetPower = '76-90% FTP';
    else if (w.type === 'Threshold') targetPower = '91-105% FTP';
    else if (w.type === 'VO2 Max' || w.type === 'Interval') targetPower = '106-120% FTP';
    else if (w.type === 'Anaerobic') targetPower = '>120% FTP';
    
    return {
      day: dayName,
      type: w.type,
      target: w.title,
      durationMin: w.planned_duration_minutes,
      targetPower: `${targetPower} (${w.target_tss} TSS)`
    };
  });
  
  // Sorteer de blocks chronologisch (Maandag t/m Zondag)
  const dayOrder = { 'Maandag': 1, 'Dinsdag': 2, 'Woensdag': 3, 'Donderdag': 4, 'Vrijdag': 5, 'Zaterdag': 6, 'Zondag': 7 };
  trainingBlocks.sort((a, b) => (dayOrder[a.day] || 9) - (dayOrder[b.day] || 9));
  
  let adjustmentType = 'on_track';
  let notes = 'Je training ligt perfect op schema! Houd deze CTL vast.';
  
  // Evalueer fitheidsverlies (CTL drop in de afgelopen week)
  const ctl7DaysAgo = metrics.length >= 7 ? metrics[metrics.length - 7].ctl : 0;
  const ctlDrop = ctl7DaysAgo - currentCtl;
  
  // BESLISSINGSMATRIX:
  // Scenario 2: Oververmoeidheid (TSB < -30 EN HRV readiness < 40%)
  if (currentTsb < -30 && todayReadiness < 40) {
    adjustmentType = 'rest_days';
    notes = `⚠️ Critically Overfatigued! TSB is zeer laag (${currentTsb.toFixed(1)}) en je HRV readiness is ${todayReadiness}%. Overweeg extra rustdagen of herstelritten te nemen om overtraining te voorkomen.`;
  }
  // Scenario 1: CTL achterstand (Fitheidsverlies > 5 punten)
  else if (ctlDrop > 5) {
    adjustmentType = 'reduce_intensity';
    notes = `📉 Fitheidsverlies gedetecteerd (CTL is met ${ctlDrop.toFixed(1)} punten gedaald). Bouw de trainingen deze week rustig op om blessures te voorkomen.`;
  }
  
  const planRecord = {
    user_id: userId,
    week_start: weekStartStr,
    planned_tss: plannedTss,
    actual_tss: parseFloat(actualTss.toFixed(1)),
    adjustment_type: adjustmentType,
    training_blocks: trainingBlocks,
    notes,
    created_at: new Date().toISOString()
  };
  
  state.activeTrainingPlan = planRecord;
  
  if (config.supabaseClient && !config.isDemoMode) {
    try {
      await config.supabaseClient
        .from('adaptive_plans')
        .upsert(planRecord, { onConflict: 'user_id,week_start' });
    } catch(e) {
      console.warn('Supabase adaptive_plans write error:', e);
    }
  } else {
    localStorage.setItem(`cyclo_plan_${userId}`, JSON.stringify(planRecord));
  }
  
  return planRecord;
}

// ─── 4. DAILY WORKOUT SUGGESTION ───────────────────

export function getSuggestedWorkoutForToday() {
  if (!state.user) return null;

  // Determine current day of week in Dutch
  const days = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  const todayName = days[new Date().getDay()];

  let workout = null;

  // Find workout in active plan
  if (state.activeTrainingPlan && state.activeTrainingPlan.training_blocks) {
    workout = state.activeTrainingPlan.training_blocks.find(b => b.day === todayName);
  }

  // Fallback if no specific workout today
  if (!workout) {
    // If it's a weekend, suggest endurance
    if (todayName === 'Zaterdag' || todayName === 'Zondag') {
      workout = { type: 'Duur', target: 'Endurance Ride', durationMin: 120, targetPower: '60-70% FTP' };
    } else {
      return null; // Rest day
    }
  }

  // If user has no power meter (no FTP), convert power targets to HR/RPE
  let intensityTarget = workout.targetPower;
  if (!state.user.ftp) {
    if (intensityTarget.includes('50%')) intensityTarget = 'Zone 1 HR (RPE 2-3)';
    else if (intensityTarget.includes('75%')) intensityTarget = 'Zone 2 HR (RPE 4-5)';
    else if (intensityTarget.includes('90%')) intensityTarget = 'Zone 3 HR (RPE 6-7)';
    else if (intensityTarget.includes('105%')) intensityTarget = 'Zone 4 HR (RPE 8)';
    else intensityTarget = 'Zone 2 HR (RPE 4-5)';
  }

  // Periodization string
  let periodization = 'Base';
  if (state.user.target_event_date) {
    const eventDate = new Date(state.user.target_event_date);
    const weeksToEvent = Math.floor((eventDate - new Date()) / (7 * 24 * 60 * 60 * 1000));
    
    if (weeksToEvent < 0) periodization = 'Post-Event Herstel';
    else if (weeksToEvent <= 2) periodization = 'Taper';
    else if (weeksToEvent <= 6) periodization = 'Peak';
    else if (weeksToEvent <= 12) periodization = 'Build';
    else periodization = 'Base';
  }

  return `[${periodization}] ${workout.durationMin}m ${workout.type} · Doel: ${intensityTarget}`;
}
