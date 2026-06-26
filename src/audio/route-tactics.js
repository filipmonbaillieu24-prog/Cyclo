import { audioController } from './audio-controller.js';

export const routeTactics = {
  routeCoords: [],
  lastWarnedIndex: -1,
  lastWarnedBochtIndex: -1,

  setRoute(coords) {
    this.routeCoords = coords || [];
    this.lastWarnedIndex = -1;
    this.lastWarnedBochtIndex = -1;
  },

  /**
   * Projecteert de GPS positie op de route en anticipeert op topografische heuvels of scherpe bochten.
   */
  updatePosition(lat, lng, speedKmh = 25) {
    if (this.routeCoords.length < 5) return;

    // Vind het dichtstbijzijnde punt op de route
    let closestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < this.routeCoords.length; i++) {
      const d = this.getDistance(lat, lng, this.routeCoords[i].lat, this.routeCoords[i].lng);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }

    // We scannen vooruit: ~200 tot 500 meter ahead
    // Bij een gemiddelde routeresolutie van 1 punt per 30m, kijken we 10 tot 15 punten vooruit
    const scanPointsAhead = 12;
    const endIdx = Math.min(this.routeCoords.length - 1, closestIdx + scanPointsAhead);

    if (endIdx <= closestIdx) return;

    // 1. ANTICIPEER OP HEUVELS / KLIMMEN ("Muurtjes")
    const currentPt = this.routeCoords[closestIdx];
    const aheadPt = this.routeCoords[endIdx];

    if (currentPt.alt !== null && aheadPt.alt !== null) {
      const elevationGain = aheadPt.alt - currentPt.alt;
      const distance = this.getDistance(currentPt.lat, currentPt.lng, aheadPt.lat, aheadPt.lng);

      // Als de klim > 12 meter is en de gemiddelde helling > 5%
      const gradient = distance > 20 ? (elevationGain / distance) * 100 : 0;

      if (elevationGain > 12 && gradient > 5) {
        // Zorg dat we niet herhaaldelijk waarschuwen voor dezelfde klim
        if (this.lastWarnedIndex === -1 || closestIdx > this.lastWarnedIndex + 20) {
          this.lastWarnedIndex = closestIdx;
          
          audioController.speak(
            `Klim in aantocht. Over ${Math.round(distance)} meter volgt een klim van ${Math.round(elevationGain)} hoogtemeters met een helling van ${gradient.toFixed(1)} procent. Neem wat voeding en schakel alvast lichter.`,
            'critical'
          );
        }
      }
    }

    // 2. ANTICIPEER OP SCHERPTE VAN BOCHTEN (Blinde bochten)
    // We kijken naar de hoekverandering tussen segmenten 3 tot 6 punten vooruit
    if (closestIdx + 6 < this.routeCoords.length) {
      const pA = this.routeCoords[closestIdx];
      const pB = this.routeCoords[closestIdx + 3];
      const pC = this.routeCoords[closestIdx + 6];

      const bearing1 = this.getBearing(pA.lat, pA.lng, pB.lat, pB.lng);
      const bearing2 = this.getBearing(pB.lat, pB.lng, pC.lat, pC.lng);

      const angleChange = Math.abs(bearing2 - bearing1);
      const normalizedChange = angleChange > 180 ? 360 - angleChange : angleChange;

      // Hoekverandering > 65 graden binnen ~150 meter = scherpe bocht
      if (normalizedChange > 65 && speedKmh > 20) {
        if (this.lastWarnedBochtIndex === -1 || closestIdx > this.lastWarnedBochtIndex + 15) {
          this.lastWarnedBochtIndex = closestIdx;
          audioController.speak(
            `Pas op, scherpe bocht over honderd meter. Matig je snelheid.`,
            'critical'
          );
        }
      }
    }
  },

  getBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const rLat1 = lat1 * Math.PI / 180;
    const rLat2 = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(rLat2);
    const x = Math.cos(rLat1) * Math.sin(rLat2) - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  },

  getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
};
