export const infrastructureFlowFilter = {
  /**
   * Berekent de straffactor voor infrastructuurobstakels (zoals drempels, paaltjes).
   * @param {Object} segment - OSM element tags
   * @returns {number} Gewichtskosten (>1 = ongunstig)
   */
  calculateObstacleWeight(segment) {
    let weight = 1.0;
    const tags = segment.tags || {};

    // 1. Paaltjes midden op het fietspad
    if (tags.barrier === 'bollard' || tags.barrier === 'cycle_barrier') {
      weight += 0.25; // vertraagt cadans door sturen/remmen
    }

    // 2. Verkeersdrempels
    if (tags.traffic_calming === 'bump' || tags.traffic_calming === 'table' || tags.traffic_calming === 'cushion') {
      weight += 0.15;
    }

    // 3. Spoorwegovergangen (trillingen/gevaar)
    if (tags.railway === 'level_crossing') {
      weight += 0.3;
    }

    return parseFloat(weight.toFixed(2));
  }
};
