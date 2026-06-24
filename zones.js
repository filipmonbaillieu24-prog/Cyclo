// Cyclo — Analytics & Zones Module
// FTP/MaxHR auto-schatting, training zones, CTL/ATL/TSB, PR tracker, heatmap prep
import { state } from './state.js';

// ─── Zone definities ──────────────────────────────────────────────────────────
export const HR_ZONES = [
  { n: 1, name: 'Recovery',        color: '#4ade80', hrPct: [0,    0.60] },
  { n: 2, name: 'Endurance',       color: '#a3e635', hrPct: [0.60, 0.70] },
  { n: 3, name: 'Tempo',           color: '#facc15', hrPct: [0.70, 0.80] },
  { n: 4, name: 'Drempel',         color: '#fb923c', hrPct: [0.80, 0.90] },
  { n: 5, name: 'VO₂Max',          color: '#f87171', hrPct: [0.90, 1.00] },
  { n: 6, name: 'Anaeroob',        color: '#c084fc', hrPct: [1.00, 1.10] },
  { n: 7, name: 'Neuromusculair',  color: '#ec4899', hrPct: [1.10, 99.0] }
];

export const PWR_ZONES = [
  { n: 1, name: 'Recovery',        color: '#4ade80', ftpPct: [0,    0.55] },
  { n: 2, name: 'Endurance',       color: '#a3e635', ftpPct: [0.55, 0.75] },
  { n: 3, name: 'Tempo',           color: '#facc15', ftpPct: [0.75, 0.90] },
  { n: 4, name: 'Drempel',         color: '#fb923c', ftpPct: [0.90, 1.05] },
  { n: 5, name: 'VO₂Max',          color: '#f87171', ftpPct: [1.05, 1.20] },
  { n: 6, name: 'Anaeroob',        color: '#c084fc', ftpPct: [1.20, 1.50] },
  { n: 7, name: 'Neuromusculair',  color: '#ec4899', ftpPct: [1.50, 99.0] }
];

// ─── FTP & Max HR schatting ───────────────────────────────────────────────────

/**
 * Schat FTP op basis van activiteiten.
 * Methode: beste gemiddeld vermogen van ritten tussen 15-30 min × 0.95
 * Als geen data: beste avg power van alle ritten × 0.85
 * Wordt opgeslagen in state.user.ftp en verbetert bij nieuwe ritten.
 */
export function estimateFTP(activities) {
  const withPower = activities.filter(a => a.avg_power_watts > 0);
  if (withPower.length === 0) return null;

  // Beste uit ritten van 15-30 minuten (dichtst bij een FTP-test)
  const shortRides = withPower.filter(a => {
    const mins = (a.duration_secs || 0) / 60;
    return mins >= 15 && mins <= 35;
  });

  if (shortRides.length > 0) {
    const best = Math.max(...shortRides.map(a => a.avg_power_watts));
    return Math.round(best * 0.95);
  }

  // Fallback: beste gemiddeld vermogen van langere ritten × 0.85
  const best = Math.max(...withPower.map(a => a.avg_power_watts));
  return Math.round(best * 0.85);
}

/**
 * Schat Max HR op basis van leeftijd + gecorrigeerd op basis van observaties.
 * Formule: Gulati formula (206 - 0.88 * age) voor vrouwen, Tanaka formula (208 - 0.7 * age) voor mannen/anderen.
 */
export function estimateMaxHR(profile, activities) {
  let maxHR = 190; // fallback zonder geboortedatum

  if (profile && profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const age = new Date().getFullYear() - birth.getFullYear();
    if (!isNaN(age)) {
      if (profile.gender === 'Female') {
        maxHR = Math.round(206 - 0.88 * age);
      } else {
        maxHR = Math.round(208 - 0.7 * age);
      }
    }
  }

  // Als we hogere HR hebben gezien in activiteiten, pas max aan
  const withHR = activities.filter(a => a.avg_heart_rate > 0);
  if (withHR.length > 0) {
    const highestObserved = Math.max(...withHR.map(a => a.avg_heart_rate));
    // Avg HR kan niet hoger zijn dan max HR — als het dicht bij komt, pas max aan
    if (highestObserved > maxHR * 0.92) {
      maxHR = Math.round(highestObserved / 0.88); // Schat max = observed_avg / 0.88
    }
  }

  return maxHR;
}

/**
 * Update FTP en MaxHR in state.user na elke activiteiten-load.
 * Verbetert automatisch als betere data beschikbaar is.
 */
export function updateFitnessBaseline(activities) {
  if (!state.user) return;
  const ftp    = estimateFTP(activities);
  const maxHR  = estimateMaxHR(state.user, activities);
  state.user.ftp   = ftp;
  state.user.maxHR = maxHR;
}

// ─── Zone lookup ──────────────────────────────────────────────────────────────

export function getActivityZone(activity) {
  const ftp   = state.user?.ftp;
  const maxHR = state.user?.maxHR;

  if (activity.avg_power_watts && ftp) {
    const pct = activity.avg_power_watts / ftp;
    return PWR_ZONES.find(z => pct >= z.ftpPct[0] && pct < z.ftpPct[1]) || PWR_ZONES[4];
  }
  if (activity.avg_heart_rate && maxHR) {
    const pct = activity.avg_heart_rate / maxHR;
    return HR_ZONES.find(z => pct >= z.hrPct[0] && pct < z.hrPct[1]) || HR_ZONES[4];
  }
  return null;
}

// ─── Zone balk renderen ───────────────────────────────────────────────────────

export function renderZoneBar(activity) {
  const zone  = getActivityZone(activity);
  if (!zone) return '';

  const zones  = activity.avg_power_watts ? PWR_ZONES : HR_ZONES;
  const metric = activity.avg_power_watts
    ? `${activity.avg_power_watts}W`
    : `${activity.avg_heart_rate} bpm`;

  const segments = zones.map(z => {
    const active = z.n === zone.n;
    return `<div class="zone-seg${active ? ' active' : ''}" style="background:${z.color}${active ? '' : '33'};" title="Zone ${z.n}: ${z.name}"><span class="zone-seg-label">Z${z.n}</span></div>`;
  }).join('');

  return `
    <div class="zone-bar-wrap">
      <div class="zone-bar">${segments}</div>
      <div class="zone-meta">
        <span style="color:${zone.color};font-weight:700;font-size:11px;">Zone ${zone.n} · ${zone.name}</span>
        <span style="color:var(--text-muted);font-size:11px;"> · ${metric}</span>
      </div>
    </div>`;
}

// ─── TSS berekening ───────────────────────────────────────────────────────────

function calculateTSS(activity) {
  const dur = activity.duration_secs || 0;
  const ftp = state.user?.ftp;

  if (activity.avg_power_watts && ftp) {
    const np  = activity.avg_power_watts;
    const IF  = np / ftp;
    return (dur * np * IF) / (ftp * 3600) * 100;
  }
  // Schatting op basis van afstand + hoogte
  const km  = parseFloat(activity.distance_km  || 0);
  const asc = parseInt(activity.ascent_m || 0);
  return km * 1.0 + asc * 0.05;
}

// ─── CTL / ATL / TSB (90 dagen) ──────────────────────────────────────────────

export function calculateFitnessMetrics(activities) {
  // Bouw TSS-kaart per dag
  const tssMap = {};
  for (const act of activities) {
    const dateStr = (act.date || '').substring(0, 10);
    if (!dateStr) continue;
    tssMap[dateStr] = (tssMap[dateStr] || 0) + calculateTSS(act);
  }

  const today  = new Date();
  const result = [];
  let ctl = 0, atl = 0;

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const tss = tssMap[dateStr] || 0;

    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;

    result.push({
      date: dateStr,
      tss:  Math.round(tss),
      ctl:  Math.round(ctl * 10) / 10,
      atl:  Math.round(atl * 10) / 10,
      tsb:  Math.round((ctl - atl) * 10) / 10,
    });
  }
  return result;
}

// ─── Persoonlijke Records ─────────────────────────────────────────────────────

const PR_BUCKETS = [
  { label: '< 20 km',  min: 0,   max: 20  },
  { label: '20–50 km', min: 20,  max: 50  },
  { label: '50–80 km', min: 50,  max: 80  },
  { label: '80–120 km',min: 80,  max: 120 },
  { label: '120+ km',  min: 120, max: 9999},
];

export function calculatePRs(activities) {
  return PR_BUCKETS.map(bucket => {
    const matches = activities.filter(a => {
      const km = parseFloat(a.distance_km || 0);
      return km >= bucket.min && km < bucket.max;
    });
    if (matches.length === 0) return { bucket: bucket.label, count: 0, best: null };

    const best = {
      distance:  Math.max(...matches.map(a => parseFloat(a.distance_km || 0))),
      speed:     Math.max(...matches.map(a => parseFloat(a.avg_speed_kmh || 0))),
      ascent:    Math.max(...matches.map(a => parseInt(a.ascent_m || 0))),
      power:     Math.max(...matches.map(a => parseInt(a.avg_power_watts || 0))),
      activity:  matches.sort((a, b) => parseFloat(b.distance_km) - parseFloat(a.distance_km))[0],
    };
    return { bucket: bucket.label, count: matches.length, best };
  }).filter(b => b.count > 0);
}

// ─── Heatmap data ─────────────────────────────────────────────────────────────

export function buildHeatmapData(activities) {
  const map = {};
  for (const act of activities) {
    const dateStr = (act.date || '').substring(0, 10);
    if (!dateStr) continue;
    if (!map[dateStr]) map[dateStr] = { km: 0, count: 0, names: [] };
    map[dateStr].km    += parseFloat(act.distance_km || 0);
    map[dateStr].count += 1;
    map[dateStr].names.push(act.name || 'Rit');
  }
  return map;
}

// ─── Vergelijking vorige periode ──────────────────────────────────────────────

export function comparePeriods(activities, days = 30) {
  const now    = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - days);
  const prev   = new Date(cutoff); prev.setDate(prev.getDate() - days);

  const current = activities.filter(a => new Date(a.date) >= cutoff && new Date(a.date) <= now);
  const previous = activities.filter(a => new Date(a.date) >= prev && new Date(a.date) < cutoff);

  const sum = arr => ({
    km:    arr.reduce((s, a) => s + parseFloat(a.distance_km || 0), 0),
    ritten: arr.length,
    asc:   arr.reduce((s, a) => s + parseInt(a.ascent_m || 0), 0),
    uren:  arr.reduce((s, a) => s + parseFloat(a.duration_secs || 0), 0) / 3600,
  });

  const c = sum(current);
  const p = sum(previous);

  const pct = (cur, prv) => {
    if (prv === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prv) / prv) * 100);
  };

  return {
    current: c,
    previous: p,
    diff: {
      km:    pct(c.km,    p.km),
      ritten: pct(c.ritten, p.ritten),
      asc:   pct(c.asc,   p.asc),
      uren:  pct(c.uren,  p.uren),
    }
  };
}

// ─── Hoogteprofiel uit coordinates ───────────────────────────────────────────

export function buildElevationData(coordinates) {
  if (!coordinates || coordinates.length < 2) return null;

  let dist = 0;
  const labels = [];
  const elevs  = [];

  for (let i = 0; i < coordinates.length; i++) {
    const c = coordinates[i];
    if (i > 0) {
      const prev = coordinates[i - 1];
      const dlat = (c[0] - prev[0]) * 111000;
      const dlng = (c[1] - prev[1]) * 111000 * Math.cos(prev[0] * Math.PI / 180);
      dist += Math.sqrt(dlat * dlat + dlng * dlng) / 1000;
    }
    if (i % Math.max(1, Math.floor(coordinates.length / 100)) === 0 || i === coordinates.length - 1) {
      labels.push(dist.toFixed(1));
      elevs.push(c[2] || 0);
    }
  }
  return { labels, elevs };
}

// ─── Mean Maximal Power (MMP) Curve ──────────────────────────────────────────
//
// Zwift levert avg_power_watts per activiteit.
// MMP per tijdsduur wordt geschat via een power-decay model op basis van FTP:
//   P(t) = FTP × (t_FTP/t)^0.07
// Waarbij we voor elk tijdsinterval ook de best gemeten activiteit meenemen.

const MMP_DURATIONS = [5, 10, 30, 60, 300, 600, 1200, 1800, 3600]; // seconden
const MMP_LABELS    = ['5s', '10s', '30s', '1m', '5m', '10m', '20m', '30m', '60m'];

export function calculateMMP(activities) {
  const withPower = activities.filter(a => a.avg_power_watts > 0 && a.duration_secs > 0);
  const ftp = state.user?.ftp;
  if (withPower.length === 0 || !ftp) return null;

  const FTP_DURATION = 3600; // 60 minuten als referentie voor FTP

  // Personaliseer Riegel exponent op basis van biologische eigenschappen
  let exponent = 0.07;
  const profile = state.user;
  if (profile) {
    if (profile.gender === 'Female') {
      exponent -= 0.005;
    }
    if (profile.birthdate) {
      const birth = new Date(profile.birthdate);
      const age = new Date().getFullYear() - birth.getFullYear();
      if (!isNaN(age)) {
        exponent += (age - 30) * 0.0003;
      }
    }
    if (profile.height && !isNaN(profile.height)) {
      exponent += (profile.height - 180) * 0.0001;
    }
  }
  // Clamp exponent
  exponent = Math.max(0.05, Math.min(0.10, exponent));

  return MMP_DURATIONS.map((dur, i) => {
    // Theoretisch model: activiteiten die minstens zo lang duren
    const candidates = withPower.filter(a => a.duration_secs >= dur);

    let bestPower = 0;
    if (candidates.length > 0) {
      // Schaal avg power naar de korter tijdsduur via power-duration model
      bestPower = Math.max(...candidates.map(a => {
        const t  = Math.min(a.duration_secs, dur);
        const scale = Math.pow(FTP_DURATION / t, exponent);
        return Math.round(a.avg_power_watts * scale);
      }));
    } else {
      // Alleen model-curve gebruiken als geen data
      const scale = Math.pow(FTP_DURATION / dur, exponent);
      bestPower = Math.round(ftp * scale);
    }

    return {
      label:    MMP_LABELS[i],
      duration: dur,
      power:    bestPower,
      wkg:      state.user?.weight ? +(bestPower / state.user.weight).toFixed(2) : null,
      isEstimate: candidates.length === 0,
    };
  });
}

// ─── VO₂max Schatting ────────────────────────────────────────────────────────
//
// Methode 1 (beste): Vermogen + gewicht (Zwift / power meter)
//   VO₂max ≈ (P_best_20min × 10.8) / gewicht + 7
// Methode 2: Hartslag (Uth-formule)
//   VO₂max ≈ 15 × (HRmax / HRrust)
// Methode 3 (fallback): Snelheid
//   VO₂max ≈ avgSpeed × 3.5

const VO2_CATEGORIES = [
  { min: 0,  max: 30, label: 'Laag',      color: '#f87171' },
  { min: 30, max: 40, label: 'Matig',     color: '#fb923c' },
  { min: 40, max: 50, label: 'Goed',      color: '#facc15' },
  { min: 50, max: 60, label: 'Excellent', color: '#a3e635' },
  { min: 60, max: 70, label: 'Hoog',      color: '#4ade80' },
  { min: 70, max: 999,label: 'Elite',     color: '#34d399' },
];

export function estimateVO2max(activities, profile) {
  const weight  = (profile?.weight && !isNaN(profile.weight)) ? parseFloat(profile.weight) : 70;
  const height  = (profile?.height && !isNaN(profile.height)) ? parseFloat(profile.height) : 175;
  const ftp     = state.user?.ftp;
  const maxHR   = state.user?.maxHR || 190;
  let performanceVO2 = null;
  let method    = '';

  // Bereken klinische Wasserman baseline
  let age = 30;
  if (profile && profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const parsedAge = new Date().getFullYear() - birth.getFullYear();
    if (!isNaN(parsedAge)) {
      age = parsedAge;
    }
  }
  let clinicalVO2 = 45; // default clinical baseline
  if (profile?.gender === 'Female') {
    clinicalVO2 = (height * (14.81 - 0.11 * age)) / weight;
  } else {
    clinicalVO2 = ((0.79 * height - 60.7) * (50.72 - 0.372 * age)) / weight;
  }

  // Methode 1: Beste 20-min power (FTP ≈ 95% van 20-min power)
  if (ftp && weight) {
    const p20 = ftp / 0.95;
    performanceVO2 = (p20 * 10.8) / weight + 7;
    method = 'Vermogen (Wasserman baseline averaged)';
  }

  // Methode 2: Hartslag (als geen vermogen)
  if (!performanceVO2) {
    const hrRest = activities.length > 0
      ? Math.min(...activities.filter(a => a.avg_heart_rate > 0).map(a => a.avg_heart_rate))
      : 60;
    if (maxHR && hrRest < maxHR) {
      performanceVO2 = 15 * (maxHR / hrRest);
      method = 'Hartslag (Wasserman baseline averaged)';
    }
  }

  // Methode 3: Gemiddelde snelheid (fallback)
  if (!performanceVO2 && activities.length > 0) {
    const speeds = activities.map(a => parseFloat(a.avg_speed_kmh || 0)).filter(s => s > 0);
    if (speeds.length > 0) {
      const bestSpeed = Math.max(...speeds);
      performanceVO2 = bestSpeed * 3.5;
      method = 'Snelheid (Wasserman baseline averaged)';
    }
  }

  let finalVO2 = clinicalVO2;
  if (performanceVO2) {
    finalVO2 = (performanceVO2 + clinicalVO2) / 2;
  } else {
    method = 'Klinisch baseline (Wasserman)';
  }

  finalVO2 = Math.round(finalVO2 * 10) / 10;
  const cat = VO2_CATEGORIES.find(c => finalVO2 >= c.min && finalVO2 < c.max) || VO2_CATEGORIES[0];

  return { vo2max: finalVO2, category: cat.label, color: cat.color, method };
}

// ─── Seizoensvergelijking (week per week) ────────────────────────────────────

export function compareSeasons(activities) {
  const getWeek = (date) => {
    const d = new Date(date);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  };

  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;

  // Cumulatieve km per weeknummer per jaar
  const buckets = { [thisYear]: {}, [lastYear]: {} };

  for (const act of activities) {
    const d    = new Date(act.date);
    const year = d.getFullYear();
    if (year !== thisYear && year !== lastYear) continue;
    const week = getWeek(d);
    buckets[year][week] = (buckets[year][week] || 0) + parseFloat(act.distance_km || 0);
  }

  const weeks = Array.from({ length: 52 }, (_, i) => i + 1);

  // Cumulatief optellen
  const cumulative = (yearData) => {
    let sum = 0;
    return weeks.map(w => {
      sum += yearData[w] || 0;
      return Math.round(sum);
    });
  };

  const currentWeek = getWeek(new Date());

  return {
    labels:       weeks.map(w => `W${w}`),
    currentYear:  thisYear,
    lastYear:     lastYear,
    thisSeason:   cumulative(buckets[thisYear]),
    lastSeason:   cumulative(buckets[lastYear]),
    currentWeek,
  };
}

// ─── Badges & Achievements ────────────────────────────────────────────────────

export const BADGE_DEFINITIONS = [
  {
    key:   'first_ride',
    emoji: '🚀',
    name:  'Eerste Rit',
    desc:  'Je eerste activiteit geüpload!',
    check: (acts) => acts.length >= 1,
  },
  {
    key:   'century',
    emoji: '💯',
    name:  'Eeuweling',
    desc:  'Één rit van 100 km of meer gereden.',
    check: (acts) => acts.some(a => parseFloat(a.distance_km || 0) >= 100),
  },
  {
    key:   'climber',
    emoji: '⛰️',
    name:  'Klimmer',
    desc:  '1000 hoogtemeters in één rit.',
    check: (acts) => acts.some(a => parseInt(a.ascent_m || 0) >= 1000),
  },
  {
    key:   'weekly_warrior',
    emoji: '🔥',
    name:  'Week Warrior',
    desc:  '5 of meer ritten in één kalenderweek.',
    check: (acts) => {
      const weekMap = {};
      acts.forEach(a => {
        const d    = new Date(a.date);
        const key  = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;
        weekMap[key] = (weekMap[key] || 0) + 1;
      });
      return Object.values(weekMap).some(c => c >= 5);
    },
  },
  {
    key:   'monthly_trophy',
    emoji: '📅',
    name:  'Maandtrofee',
    desc:  '10 of meer ritten in één kalendermaand.',
    check: (acts) => {
      const monthMap = {};
      acts.forEach(a => {
        const key = (a.date || '').substring(0, 7);
        monthMap[key] = (monthMap[key] || 0) + 1;
      });
      return Object.values(monthMap).some(c => c >= 10);
    },
  },
  {
    key:   'early_bird',
    emoji: '🌅',
    name:  'Vroege Vogel',
    desc:  'Een rit gestart vóór 7:00 uur.',
    check: (acts) => acts.some(a => {
      const h = new Date(a.date).getHours();
      return h >= 4 && h < 7;
    }),
  },
  {
    key:   'thousand_km',
    emoji: '🌍',
    name:  'Duizendpoot',
    desc:  '1000 km totaal gereden.',
    check: (acts) => acts.reduce((s, a) => s + parseFloat(a.distance_km || 0), 0) >= 1000,
  },
  {
    key:   'ten_thousand_m',
    emoji: '🗻',
    name:  'Alpenklimmer',
    desc:  '10.000 hoogtemeters totaal gereden.',
    check: (acts) => acts.reduce((s, a) => s + parseInt(a.ascent_m || 0), 0) >= 10000,
  },
  {
    key:   'power_rider',
    emoji: '⚡',
    name:  'Power Rider',
    desc:  'Gemiddeld 250W of meer gereden in één rit.',
    check: (acts) => acts.some(a => parseInt(a.avg_power_watts || 0) >= 250),
  },
  {
    key:   'explorer',
    emoji: '🗺️',
    name:  'Ontdekkingsreiziger',
    desc:  '25 verschillende ritten gereden.',
    check: (acts) => acts.length >= 25,
  },
];

/**
 * Berekent welke badges verdiend zijn op basis van activiteiten.
 * Geeft een array terug van { ...badgeDef, earned: boolean }.
 */
export function calculateBadges(activities) {
  return BADGE_DEFINITIONS.map(badge => ({
    ...badge,
    earned: badge.check(activities),
  }));
}

// ─── Trainingsstructuur analyse ──────────────────────────────────────────────
// Schat de trainingsstructuur op basis van beschikbare gemiddelden + zones.
// Zonder per-seconde data: we modelleren een plausibele verdeling.

export function analyzeTrainingStructure(activity) {
  const ftp   = state.user?.ftp  || 200;
  const maxHR = state.user?.maxHR || 190;
  const durMin = (activity.duration_secs || 0) / 60;
  const power  = activity.avg_power_watts || 0;
  const hr     = activity.avg_heart_rate  || 0;

  // Bepaal dominante zone (7-zone model)
  let zone = 2; // Standaard endurance
  if (power && ftp) {
    const pct = power / ftp;
    if (pct < 0.55) zone = 1;
    else if (pct < 0.75) zone = 2;
    else if (pct < 0.90) zone = 3;
    else if (pct < 1.05) zone = 4;
    else if (pct < 1.20) zone = 5;
    else if (pct < 1.50) zone = 6;
    else zone = 7;
  } else if (hr && maxHR) {
    const pct = hr / maxHR;
    if (pct < 0.60) zone = 1;
    else if (pct < 0.70) zone = 2;
    else if (pct < 0.80) zone = 3;
    else if (pct < 0.90) zone = 4;
    else if (pct < 1.00) zone = 5;
    else if (pct < 1.10) zone = 6;
    else zone = 7;
  }

  // Modelleer trainingsstructuur op basis van zone + duur
  // Blokken = hoge-intensiteitsperiodes, warmup/cooldown = Z1-2
  const zoneColors = {
    1: '#4ade80', 2: '#a3e635', 3: '#facc15',
    4: '#fb923c', 5: '#f87171', 6: '#c084fc', 7: '#ec4899'
  };
  const zoneNames = {
    1: 'Recovery', 2: 'Endurance', 3: 'Tempo',
    4: 'Drempel', 5: 'VO₂Max', 6: 'Anaeroob', 7: 'Neuromusculair'
  };

  // Standaard structuur: warmup (10%) + kern + cooldown (8%)
  const warmupPct   = Math.min(0.15, 10 / Math.max(durMin, 20));
  const cooldownPct = Math.min(0.10, 8  / Math.max(durMin, 20));
  const mainPct     = 1 - warmupPct - cooldownPct;

  const segments = [];

  // Warmup
  segments.push({
    label: 'Warming-up',
    pct: warmupPct,
    zone: 1,
    color: zoneColors[1],
    desc: `~${Math.round(durMin * warmupPct)} min`,
  });

  // Hoofdblok(ken)
  if (zone >= 4 && durMin > 30) {
    // Intervallen: afwisseling hoofdzone ↔ herstel
    const blockCount  = zone === 7 ? 8 : zone === 6 ? 6 : zone === 5 ? 4 : 3;
    const blockPct    = mainPct / (blockCount * 2 - 1);
    for (let i = 0; i < blockCount; i++) {
      segments.push({
        label: `Blok ${i + 1}`,
        pct: blockPct,
        zone,
        color: zoneColors[zone],
        desc: `~${Math.round(durMin * blockPct)} min · ${power ? power + 'W' : hr + 'bpm'}`,
      });
      if (i < blockCount - 1) {
        segments.push({
          label: 'Herstel',
          pct: blockPct,
          zone: 1,
          color: zoneColors[1],
          desc: `~${Math.round(durMin * blockPct)} min`,
        });
      }
    }
  } else {
    // Steady-state of duurrit
    segments.push({
      label: zone <= 2 ? 'Duurrit' : zone === 3 ? 'Tempoblok' : 'Drempelblok',
      pct: mainPct,
      zone,
      color: zoneColors[zone],
      desc: `~${Math.round(durMin * mainPct)} min · Zone ${zone} ${zoneNames[zone]}`,
    });
  }

  // Cooldown
  segments.push({
    label: 'Cooldown',
    pct: cooldownPct,
    zone: 1,
    color: zoneColors[1],
    desc: `~${Math.round(durMin * cooldownPct)} min`,
  });

  return {
    segments,
    zone,
    zoneName: zoneNames[zone],
    zoneColor: zoneColors[zone],
    totalMin: Math.round(durMin),
    isEstimate: true, // Altijd schatting zonder second-by-second data
  };
}