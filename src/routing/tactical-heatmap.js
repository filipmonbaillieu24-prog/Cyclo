export const tacticalHeatmap = {
  /**
   * Analyseert een gereden activiteit op tactische "pain points" (hartslagpieken, peloton-splitsingen)
   * @param {Object} activity - Rit data met coordinates en sensor arrays
   * @param {number} lthr - Lactate Threshold Heart Rate
   * @returns {Array} Array van gedetecteerde POIs (Hotspots)
   */
  analyzeRideForHotspots(activity, lthr = 160) {
    const coords = activity.coordinates || [];
    if (coords.length < 5) return [];

    const hotspots = [];

    for (let i = 2; i < coords.length - 2; i++) {
      const p = coords[i];
      
      // 1. Cardiac Peak: Hartslag > 93% van LTHR (Zone 5+)
      if (p.hr && p.hr > (lthr * 0.93)) {
        // Voorkom teveel opeenvolgende hotspots; check afstand tot laatste hotspot
        if (!this.hasNearbyHotspot(hotspots, p.lat, p.lng, 150)) {
          hotspots.push({
            lat: p.lat,
            lng: p.lng,
            type: 'cardiac-peak',
            intensity: Math.round((p.hr / lthr) * 100),
            name: 'Fysiologische Limiet (Z5+)',
            description: 'Zone waarin het peloton doorgaans zwaar afziet.'
          });
        }
      }

      // 2. Peloton Split: Grote acceleratie/snelheidstoename bij stijgend percentage
      if (i > 10) {
        const prev = coords[i - 10];
        const elevationDiff = (p.alt || 0) - (prev.alt || 0);
        const timeDiff = 10; // ~10 seconden
        
        // Hellingspercentage schatting
        const dist = this.getDistance(prev.lat, prev.lng, p.lat, p.lng);
        const gradient = dist > 20 ? (elevationDiff / dist) * 100 : 0;

        // Als helling > 6% en snelheid stijgt (demarrage / tempoversnelling)
        if (gradient > 6 && p.speed > prev.speed * 1.15) {
          if (!this.hasNearbyHotspot(hotspots, p.lat, p.lng, 200)) {
            hotspots.push({
              lat: p.lat,
              lng: p.lng,
              type: 'peloton-split',
              intensity: Math.round(gradient),
              name: 'Cruciaal Selectiemoment',
              description: 'Demarrage-zone op een steile klim.'
            });
          }
        }
      }
    }

    return hotspots;
  },

  /**
   * Filtert historische hotspots die langs de huidige route liggen (binnen 100m straal)
   */
  getTacticalPOIsForRoute(routeCoords, historicalHotspots) {
    const activePOIs = [];

    (routeCoords || []).forEach((coord, idx) => {
      // Om performance te sparen, scannen we 1 op de 5 routepunten
      if (idx % 5 !== 0) return;

      (historicalHotspots || []).forEach(hotspot => {
        const dist = this.getDistance(coord.lat, coord.lng, hotspot.lat, hotspot.lng);
        if (dist < 100) { // Binnen 100 meter
          if (!activePOIs.some(p => p.type === hotspot.type && this.getDistance(p.lat, p.lng, hotspot.lat, hotspot.lng) < 150)) {
            activePOIs.push({
              ...hotspot,
              routeIndex: idx, // index op de route voor anticipatie
              distanceToStart: dist
            });
          }
        }
      });
    });

    return activePOIs;
  },

  hasNearbyHotspot(hotspots, lat, lng, minDistanceMeters) {
    return hotspots.some(h => this.getDistance(h.lat, h.lng, lat, lng) < minDistanceMeters);
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
