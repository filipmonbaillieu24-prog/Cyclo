export const flowWeightAlgorithm = {
  /**
   * Berekent de gewichtsfactor voor traject-flow optimalisatie.
   * @param {Object} segment - OSM wegsegment met tags en geometrie
   * @returns {number} Vermenigvuldigingsfactor voor kosten (>1 = ongunstig)
   */
  calculateWeight(segment) {
    let weight = 1.0;

    const tags = segment.tags || {};
    
    // 1. Straf verkeerslichten af
    if (tags.highway === 'traffic_signals' || tags.crossing === 'traffic_signals') {
      weight += 0.4;
    }

    // 2. Drukke dorpskernen / woonwijken vermijden ten gunste van open wegen
    if (tags.highway === 'residential' || tags.living_street === 'yes') {
      weight += 0.2;
    }

    // 3. Cadans-onderbrekende oversteekplaatsen straffen
    if (tags.railway === 'level_crossing') {
      weight += 0.5;
    }

    // 4. Cadans-ondersteunende asfaltstroken buiten de bebouwde kom bevoordelen
    if (tags.highway === 'primary' || tags.highway === 'secondary' || tags.highway === 'tertiary') {
      if (tags.maxspeed && parseInt(tags.maxspeed) >= 70) {
        // Alleen bonus als er een fietspad bij ligt
        if (tags.cycleway || tags.bicycle === 'designated' || tags.highway === 'cycleway') {
          weight -= 0.15;
        }
      }
    }

    return parseFloat(weight.toFixed(2));
  }
};
