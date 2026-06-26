import { config, state, showToast } from '../../state.js';

export const zoneCalculator = {
  /**
   * Berekent de vermogenszones (Coggan 7 zones) op basis van FTP
   */
  getPowerZones(ftp) {
    const f = ftp || 200; // fallback
    return {
      z1: { label: 'Actief Herstel', min: 0, max: Math.round(f * 0.55) },
      z2: { label: 'Duurtraining', min: Math.round(f * 0.55) + 1, max: Math.round(f * 0.75) },
      z3: { label: 'Tempo', min: Math.round(f * 0.75) + 1, max: Math.round(f * 0.90) },
      z4: { label: 'Drempel (FTP)', min: Math.round(f * 0.90) + 1, max: Math.round(f * 1.05) },
      z5: { label: 'VO2 Max', min: Math.round(f * 1.05) + 1, max: Math.round(f * 1.20) },
      z6: { label: 'Anaerobe Capaciteit', min: Math.round(f * 1.20) + 1, max: Math.round(f * 1.50) },
      z7: { label: 'Neuromusculair', min: Math.round(f * 1.50) + 1, max: 9999 }
    };
  },

  /**
   * Berekent de hartslagzones (Friel 5 zones) op basis van LTHR (Lactate Threshold Heart Rate)
   */
  getHeartRateZones(lthr) {
    const l = lthr || 160; // fallback
    return {
      z1: { label: 'Herstel', min: 0, max: Math.round(l * 0.81) },
      z2: { label: 'Aerobe Drempel', min: Math.round(l * 0.81) + 1, max: Math.round(l * 0.89) },
      z3: { label: 'Tempo', min: Math.round(l * 0.89) + 1, max: Math.round(l * 0.93) },
      z4: { label: 'Sub-Drempel', min: Math.round(l * 0.93) + 1, max: Math.round(l * 0.99) },
      z5: { label: 'Super-Drempel / Anaeroob', min: Math.round(l * 0.99) + 1, max: 220 }
    };
  },

  /**
   * MMP-detectie: Berekent de Power Duration Curve (MMP) over de afgelopen 30 tot 90 dagen
   */
  calculateMMPCurve(activities, days = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const filtered = (activities || []).filter(a => {
      const aDate = new Date(a.date || a.startTime);
      return aDate >= cutoffDate && a.coordinates && a.coordinates.length > 0;
    });

    const mmp = { '5s': 0, '1m': 0, '5m': 0, '20m': 0 };

    filtered.forEach(act => {
      // Zoek naar raw power values of schat ze
      const powerPoints = act.rawPower || (act.coordinates || []).map(c => c.power).filter(p => p !== undefined && p !== null);
      if (powerPoints.length === 0 && act.avgPowerWatts) {
        // Fallback: vul een platte array met de gemiddelde waarde
        const simulatedPoints = Array(act.totalTimeSeconds || 3600).fill(act.avgPowerWatts);
        this.findMaxAverages(simulatedPoints, mmp);
      } else if (powerPoints.length > 0) {
        this.findMaxAverages(powerPoints, mmp);
      }
    });

    return mmp;
  },

  findMaxAverages(powerPoints, mmpObj) {
    const durations = { '5s': 5, '1m': 60, '5m': 300, '20m': 1200 };
    for (const [label, secs] of Object.entries(durations)) {
      if (powerPoints.length >= secs) {
        let currentSum = 0;
        for (let i = 0; i < secs; i++) currentSum += powerPoints[i];
        let maxSum = currentSum;

        for (let i = secs; i < powerPoints.length; i++) {
          currentSum = currentSum - powerPoints[i - secs] + powerPoints[i];
          if (currentSum > maxSum) maxSum = currentSum;
        }
        const avg = Math.round(maxSum / secs);
        if (avg > mmpObj[label]) mmpObj[label] = avg;
      }
    }
  },

  /**
   * FTP & LTHR stilletjes updaten bij een 20-minuten NP/HR prestatie > 105% van de huidige FTP/LTHR.
   */
  async updateFTPIfNeeded(avgPower20min, avgHR20min) {
    if (!state.user) return;

    let updated = false;
    const currentFTP = state.user.ftp || 200;
    const currentLTHR = state.user.lthr || 160;

    // 20 min power van >105% FTP betekent: 0.95 * 20min power > FTP
    // Hier controleren we direct of de 20-minuten prestatie groter is dan 105% van de huidige FTP
    if (avgPower20min && avgPower20min > (currentFTP * 1.05)) {
      const estimatedNewFTP = Math.round(avgPower20min * 0.95);
      if (estimatedNewFTP > currentFTP) {
        state.user.ftp = estimatedNewFTP;
        updated = true;
        showToast(`⚡ Nieuwe FTP gedetecteerd: ${estimatedNewFTP} Watt!`, "success");
      }
    }

    if (avgHR20min && avgHR20min > (currentLTHR * 1.05)) {
      state.user.lthr = Math.round(avgHR20min);
      updated = true;
      showToast(`❤️ Nieuwe drempelhartslag (LTHR) gedetecteerd: ${state.user.lthr} bpm!`, "success");
    }

    if (updated) {
      if (config.isDemoMode) {
        let mockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
        const idx = mockProfiles.findIndex(p => p.id === state.user.id);
        if (idx !== -1) {
          mockProfiles[idx].ftp = state.user.ftp;
          mockProfiles[idx].lthr = state.user.lthr;
          localStorage.setItem('cyclo_mock_profiles', JSON.stringify(mockProfiles));
        }
      } else {
        try {
          await config.supabaseClient
            .from('profiles')
            .update({ ftp: state.user.ftp, lthr: state.user.lthr })
            .eq('id', state.user.id);
        } catch (err) {
          console.warn("Fout bij opslaan nieuwe FTP/LTHR:", err.message);
        }
      }
    }
  }
};
