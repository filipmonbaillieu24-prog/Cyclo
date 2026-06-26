export const nodeNetworkBias = {
  /**
   * Berekent de bonus voor fietssnelwegen en het knooppuntennetwerk.
   * @param {Object} segmentTags - OSM tags van het wegsegment
   * @returns {number} Bonusvermenigvuldigingsfactor (<1 = gunstiger)
   */
  calculateNetworkBonus(segmentTags) {
    if (!segmentTags) return 1.0;

    let bonus = 1.0;

    const network = segmentTags.network || '';
    const highway = segmentTags.highway || '';
    const cycleway = segmentTags.cycleway || '';

    // 1. Knooppuntennetwerk (Recreational Cycle Network)
    if (network.includes('rcn') || segmentTags.rcn_ref) {
      bonus -= 0.15; // 15% korting op kosten
    }

    // 2. Fietssnelwegen (bijv. F-wegen in Vlaanderen of snelfietspaden)
    if (segmentTags.ref && (segmentTags.ref.startsWith('F') || segmentTags.ref.startsWith('f')) && highway === 'cycleway') {
      bonus -= 0.25; // 25% korting (grote voorkeur voor fietssnelwegen)
    }

    // 3. Standaard vrijliggende fietspaden
    if (highway === 'cycleway' || cycleway === 'track' || segmentTags.bicycle === 'designated') {
      bonus -= 0.10;
    }

    return parseFloat(Math.max(0.6, bonus).toFixed(2));
  }
};
