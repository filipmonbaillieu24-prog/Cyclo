export const dynamicClosureApi = {
  // Mock database met actieve wegafsluitingen/wegenwerken (Gent Dampoort regio, Kruispunt R4)
  activeClosures: [
    { lat: 51.0560, lng: 3.7310, radiusMeters: 100, description: "Wegenwerken R4 - Volledig afgesloten" },
    { lat: 51.0495, lng: 3.7430, radiusMeters: 80, description: "Gent Dampoort Ring - Afsluiting wegens spoorwegwerken" }
  ],

  /**
   * Controleert of een routepunt zich binnen een actieve wegafsluiting bevindt.
   * @param {number} lat - Breedtegraad
   * @param {number} lng - Lengtegraad
   * @returns {Object|null} De wegafsluiting indien match, anders null
   */
  checkClosure(lat, lng) {
    for (const closure of this.activeClosures) {
      const dist = this.getDistance(lat, lng, closure.lat, closure.lng);
      if (dist <= closure.radiusMeters) {
        return closure;
      }
    }
    return null;
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
