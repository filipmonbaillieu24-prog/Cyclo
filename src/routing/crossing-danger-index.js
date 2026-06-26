export const crossingDangerIndex = {
  /**
   * Analyseert of een oversteekplek op een drukke autoweg gevaarlijk is.
   * @param {Object} wayTags - Tags van de weg die gekruist wordt
   * @returns {boolean} True als de kruising onveilig is (geen lichten, maxspeed >= 70)
   */
  isDangerousCrossing(wayTags) {
    if (!wayTags) return false;

    const maxspeed = parseInt(wayTags.maxspeed) || 50;
    const highway = wayTags.highway || '';

    // Drukke banen (trunk, primary, secondary) met maxspeed >= 70 km/u
    const isBusyRoad = maxspeed >= 70 || highway === 'trunk' || highway === 'primary';

    // Check of er beveiliging is (verkeerslichten, fietstunnel, fietsbrug)
    const hasProtection = wayTags.crossing === 'traffic_signals' ||
                          wayTags.railway === 'level_crossing' ||
                          wayTags.tunnel === 'yes' ||
                          wayTags.bridge === 'yes';

    return isBusyRoad && !hasProtection;
  }
};
