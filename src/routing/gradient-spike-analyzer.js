export const gradientSpikeAnalyzer = {
  /**
   * Analyseert steilheden per wegsegment en voegt waarschuwings-POIs toe.
   * @param {Array} coords - Routecoördinaten [{lat, lng, alt}, ...]
   * @returns {Array} Lijst van gedetecteerde steile POIs
   */
  analyzeGradients(coords) {
    const warnings = [];
    if (!coords || coords.length < 2) return warnings;

    for (let i = 1; i < coords.length; i++) {
      const p1 = coords[i - 1];
      const p2 = coords[i];

      if (p1.alt !== null && p2.alt !== null) {
        const heightDiff = p2.alt - p1.alt;
        const distMeters = this.getDistance(p1.lat, p1.lng, p2.lat, p2.lng);

        if (distMeters > 15) {
          const gradient = (heightDiff / distMeters) * 100;

          // Steilheid > 12% is een micro-gradient spike voor racefietsen
          if (gradient > 12.0) {
            warnings.push({
              lat: p2.lat,
              lng: p2.lng,
              gradient: parseFloat(gradient.toFixed(1)),
              message: `⚠️ Extreme stijging van ${gradient.toFixed(1)}% gedetecteerd!`,
              type: 'steep-gradient'
            });
          }
        }
      }
    }

    return warnings;
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
