// Cyclo — Analytics & Zones Module
// FTP/MaxHR auto-schatting, training zones, CTL/ATL/TSB, PR tracker, heatmap prep
import { state } from './state.js';

// ─── Zone definities ──────────────────────────────────────────────────────────
export const HR_ZONES = [
  { n: 1, name: 'Recovery',   color: '#4ade80', hrPct: [0,    0.60] },
  { n: 2, name: 'Endurance',  color: '#a3e635', hrPct: [0.60, 0.70] },
  { n: 3, name: 'Tempo',      color: '#facc15', hrPct: [0.70, 0.80] },
  { n: 4, name: 'Drempel',    color: '#fb923c', hrPct: [0.80, 0.90] },
  { n: 5, name: 'VO₂Max',     color: '#f87171', hrPct: [0.90, 1.10] },
];

export const PWR_ZONES = [
  { n: 1, name: 'Recovery',   color: '#4ade80', ftpPct: [0,    0.55] },
  { n: 2, name: 'Endurance',  color: '#a3e635', ftpPct: [0.55, 0.75] },
  { n: 3, name: 'Tempo',      color: '#facc15', ftpPct: [0.75, 0.90] },
  { n: 4, name: 'Drempel',    color: '#fb923c', ftpPct: [0.90, 1.05] },
  { n: 5, name: 'VO₂Max',     color: '#f87171', ftpPct: [1.05, 1.20] },
  { n: 6, name: 'Anaeroob',   color: '#c084fc', ftpPct: [1.20, 99]   },
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
 * Formule: 220 - leeftijd, maar als hogere HR gezien is → aanpassen.
 */
export function estimateMaxHR(profile, activities) {
  let maxHR = 190; // fallback zonder geboortedatum

  if (profile && profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const age = new Date().getFullYear() - birth.getFullYear();
    maxHR = 220 - age;
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
    // Elke 10e punt of eerste/laatste
    if (i % Math.max(1, Math.floor(coordinates.length / 100)) === 0 || i === coordinates.length - 1) {
      labels.push(dist.toFixed(1));
      elevs.push(c[2] || 0);
    }
  }
  return { labels, elevs };
}
