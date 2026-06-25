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
  
  // Verzamel alle ritten van de gebruiker
  const activities = [...(state.activities || [])];
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
  
  let plannedTss = 300;
  let actualTss = 0;
  let adjustmentType = 'on_track';
  let notes = 'Je training ligt perfect op schema! Houd deze CTL vast.';
  let trainingBlocks = [
    { day: 'Dinsdag', type: 'Intervals', target: '2x20m Sweetspot', durationMin: 75, targetPower: '88-93% FTP' },
    { day: 'Donderdag', type: 'Tempo', target: '60m Tempo Ride', durationMin: 60, targetPower: '76-90% FTP' },
    { day: 'Zaterdag', type: 'Duur', target: '3h Endurance Ride', durationMin: 180, targetPower: '56-75% FTP' }
  ];
  
  // Bereken werkelijke TSS van de afgelopen 7 dagen
  const last7Days = metrics.slice(-7);
  actualTss = last7Days.reduce((sum, m) => sum + m.tss, 0);
  
  // Evalueer fitheidsverlies (CTL drop in de afgelopen week)
  const ctl7DaysAgo = metrics.length >= 7 ? metrics[metrics.length - 7].ctl : 0;
  const ctlDrop = ctl7DaysAgo - currentCtl;
  
  // BESLISSINGSMATRIX:
  // Scenario 2: Oververmoeidheid (TSB < -30 EN HRV readiness < 40%)
  if (currentTsb < -30 && todayReadiness < 40) {
    adjustmentType = 'rest_days';
    notes = `⚠️ Critically Overfatigued! TSB is zeer laag (${currentTsb.toFixed(1)}) en je HRV readiness is ${todayReadiness}%. We hebben je komende trainingen omgezet naar rustdagen en lichte herstelritten om overtraining te voorkomen.`;
    trainingBlocks = [
      { day: 'Dinsdag', type: 'Rust', target: 'Volledige rust', durationMin: 0, targetPower: '—' },
      { day: 'Donderdag', type: 'Herstel', target: '30m Actief herstel', durationMin: 30, targetPower: '≤50% FTP' },
      { day: 'Zaterdag', type: 'Herstel', target: '45m Actief herstel', durationMin: 45, targetPower: '≤50% FTP' }
    ];
  }
  // Scenario 1: CTL achterstand (Fitheidsverlies > 5 punten)
  else if (ctlDrop > 5) {
    adjustmentType = 'reduce_intensity';
    notes = `📉 Fitheidsverlies gedetecteerd (CTL is met ${ctlDrop.toFixed(1)} punten gedaald). We hebben de intensiteit van je eerstvolgende intervaltraining met 15% verlaagd om blessures te voorkomen en de opbouw rustiger te maken.`;
    trainingBlocks = [
      { day: 'Dinsdag', type: 'Herstel-Intervals', target: '3x10m Light Tempo', durationMin: 60, targetPower: '70-75% FTP (15% verlaagd)' },
      { day: 'Donderdag', type: 'Tempo', target: '45m Light Tempo Ride', durationMin: 45, targetPower: '75-80% FTP' },
      { day: 'Zaterdag', type: 'Duur', target: '2h Endurance Ride', durationMin: 120, targetPower: '56-75% FTP' }
    ];
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
