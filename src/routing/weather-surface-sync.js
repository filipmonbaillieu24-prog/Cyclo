export const weatherSurfaceSync = {
  /**
   * Berekent het seizoensgebonden/weersafhankelijke gewicht voor wegdeksoorten.
   * @param {string} surface - OSM surface type
   * @param {number} rainLast48HoursMm - Hoeveelheid neerslag in de afgelopen 48 uur
   * @returns {number} Weerstandsgewicht factor (>1 = zwaarder)
   */
  getSurfaceWeight(surface, rainLast48HoursMm = 0) {
    if (!surface) return 1.0;

    const surfLower = surface.toLowerCase().trim();
    const isUnpaved = surfLower.includes('dirt') ||
                      surfLower.includes('mud') ||
                      surfLower.includes('unpaved') ||
                      surfLower.includes('ground') ||
                      surfLower.includes('track');

    // Bij aanzienlijke regenval (bijv. > 5mm in afgelopen 48u)
    // verhogen we de weerstandswaarde van modderige/onverharde paden extreem
    // om de fietser en zijn materiaal te beschermen (asfalt-prioriteit).
    if (rainLast48HoursMm > 5.0) {
      if (isUnpaved) {
        return 4.0; // 4x hogere kosten (weert de route hier volledig weg)
      }
      if (surfLower.includes('gravel')) {
        return 2.0; // Gravel wordt ook zwaarder/glibberiger
      }
      if (surfLower.includes('cobble') || surfLower.includes('kassei')) {
        return 2.5; // Kasseien worden gevaarlijk glad bij regen
      }
    }

    // Droog weer: standaard onverharde factor
    if (isUnpaved) return 1.5;
    if (surfLower.includes('gravel')) return 1.2;

    return 1.0;
  }
};
