export const smartLoopGenerator = {
  /**
   * Genereert een wind-geoptimaliseerde lus (heen tegenwind, terug rugwind).
   * @param {Object} startLatLng - L.LatLng object (startlocatie)
   * @param {number} durationMinutes - Doeltijd in minuten
   * @param {number} windDirectionDeg - Windrichting in graden (waar de wind vandaan komt, 0 = Noord)
   * @param {number} avgSpeedKmh - Gemiddelde snelheid in km/u
   * @returns {Array} Array van L.LatLng punten die de route vormen
   */
  generateWindOptimizedLoop(startLatLng, durationMinutes, windDirectionDeg, avgSpeedKmh = 28) {
    const startLat = startLatLng.lat;
    const startLng = startLatLng.lng;

    // Bereken doeltraject-afstand
    const distanceKm = avgSpeedKmh * (durationMinutes / 60);

    // Corrigeer de radiusberekening (winding factor correctie van Issue #35)
    // Een correcte winding factor van ~7.2 garandeert dat de uiteindelijke route
    // over de weg de gewenste afstand zeer dicht benadert, in plaats van fors te overschrijden.
    const radiusKm = distanceKm / 7.2;
    const radiusDeg = radiusKm / 111; // 1 graad lat ≈ 111 km

    // Heen tegenwind ➔ rijden in de richting waar de wind VANDAAN komt (windDirectionDeg)
    // Terug rugwind ➔ rijden in de tegenovergestelde richting (windDirectionDeg + 180)
    const baseAngleRad = (windDirectionDeg * Math.PI) / 180;

    const waypoints = [];

    // Startpunt
    waypoints.push(startLatLng);

    // Punt 1 (Tegenwind): Recht in de wind rijden (1/3 van de afstand)
    const lat1 = startLat + radiusDeg * Math.cos(baseAngleRad);
    const lng1 = startLng + (radiusDeg * Math.sin(baseAngleRad)) / Math.cos(startLat * Math.PI / 180);
    waypoints.push({ lat: lat1, lng: lng1 });

    // Punt 2 (Zijwind transitie): Hoek van +90 graden ten opzichte van de windrichting
    const angle2 = baseAngleRad + Math.PI / 2;
    const lat2 = lat1 + radiusDeg * 0.7 * Math.cos(angle2);
    const lng2 = lng1 + (radiusDeg * 0.7 * Math.sin(angle2)) / Math.cos(lat1 * Math.PI / 180);
    waypoints.push({ lat: lat2, lng: lng2 });

    // Punt 3 (Rugwind terugweg): Teruglopen in de windrichting (richting start, maar met offset)
    const angle3 = baseAngleRad + Math.PI; // Tegenovergesteld aan de wind
    const lat3 = lat2 + radiusDeg * 0.9 * Math.cos(angle3);
    const lng3 = lng2 + (radiusDeg * 0.9 * Math.sin(angle3)) / Math.cos(lat2 * Math.PI / 180);
    waypoints.push({ lat: lat3, lng: lng3 });

    // Eindpunt sluit de lus
    waypoints.push(startLatLng);

    return waypoints;
  }
};
