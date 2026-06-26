export const surfaceTruthValidator = {
  /**
   * Valideert de werkelijke kwaliteit van het wegdek op basis van historische ritgegevens.
   * @param {string} wayId - Unieke OSM Way ID
   * @param {Array} databaseSpeeds - Historische rijsnelheden (km/u) geregistreerd op deze way
   * @returns {number} Kwaliteitsindex (1.0 = perfect asfalt, >1.0 = gedegradeerd wegdek)
   */
  validateQuality(wayId, databaseSpeeds) {
    if (!databaseSpeeds || databaseSpeeds.length < 3) return 1.0;

    // Bereken gemiddelde snelheid van de rijders op dit segment
    const sum = databaseSpeeds.reduce((a, b) => a + b, 0);
    const avgSpeed = sum / databaseSpeeds.length;

    // Verwachte snelheid op vlak racefietstraject is ~28 km/u
    // Als de werkelijke snelheid structureel onder de 22 km/u zakt, duidt dit op
    // slecht wegdek (bijv. betonplaten met spleten, putten of boomwortels).
    if (avgSpeed < 22) {
      const degradationFactor = 28 / avgSpeed;
      // Maximaal 1.6x vertragingsstraf toewijzen
      return parseFloat(Math.min(1.6, degradationFactor).toFixed(2));
    }

    return 1.0;
  }
};
