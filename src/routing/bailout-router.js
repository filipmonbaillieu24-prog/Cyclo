import { weatherSurfaceSync } from './weather-surface-sync.js';

export const bailoutRouter = {
  /**
   * Genereert een directe, veilige en wind-gunstige escape-route terug naar het startpunt.
   * @param {Object} currentLatLng - Huidige positie {lat, lng}
   * @param {Object} homeLatLng - Start/thuis locatie {lat, lng}
   * @param {Object} weather - Actueel weer ({ windDirection, temp, ... })
   * @returns {Array} Array van waypoints voor de herberekening
   */
  generateBailoutRoute(currentLatLng, homeLatLng, weather) {
    console.log(`[Bail-Out Router] Berekenen van noodroute naar thuislocatie...`);

    const waypoints = [];
    waypoints.push(currentLatLng);

    // Bepaal windrichting om rugwind/beschutting te optimaliseren
    const windDir = weather ? weather.windDirection : 225; // default ZW wind
    const angleRad = (windDir * Math.PI) / 180;

    // We berekenen een rechtstreekse lijn terug.
    // Indien we sterke tegenwind zouden hebben op een rechte lijn, stelt het algoritme
    // een lichte omweg/tussenliggende knikpunt voor dat beschutting zoekt.
    const distToHome = this.getDistance(currentLatLng.lat, currentLatLng.lng, homeLatLng.lat, homeLatLng.lng);

    // Knikpunt toevoegen bij langere afstanden (> 5 km) voor windbeschutting/optimale hoek
    if (distToHome > 5000) {
      const midLat = (currentLatLng.lat + homeLatLng.lat) / 2;
      const midLng = (currentLatLng.lng + homeLatLng.lng) / 2;

      // Verschuif het knikpunt licht met de wind mee om stuwkracht (rugwind) te maximaliseren
      const offsetKm = 0.8; // 800 meter offset
      const offsetLat = (offsetKm * Math.cos(angleRad)) / 111;
      const offsetLng = (offsetKm * Math.sin(angleRad)) / (111 * Math.cos(midLat * Math.PI / 180));

      waypoints.push({
        lat: midLat + offsetLat,
        lng: midLng + offsetLng,
        // Dwing een paved asfalt tag af voor de routing engine
        surface: 'asphalt',
        alt: currentLatLng.alt ? (currentLatLng.alt + (homeLatLng.alt || currentLatLng.alt)) / 2 : null
      });
    }

    waypoints.push(homeLatLng);

    // Geef de waypoints terug voor directe invoer in de Route Builder
    return waypoints;
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
