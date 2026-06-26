export const rightTurnBias = {
  /**
   * Berekent de asymmetrische bochtkosten.
   * @param {string} turnDirection - 'left', 'right', of 'straight'
   * @param {Object} streetTags - OSM tags van de straat waar we op rijden
   * @returns {number} Bochtkosten in seconden straftijd
   */
  calculateTurnCost(turnDirection, streetTags) {
    if (!streetTags) return 0;

    const highway = streetTags.highway || '';
    const maxspeed = parseInt(streetTags.maxspeed) || 50;

    // Alleen straftijd toevoegen op drukke/snelle wegen
    const isBusyRoad = maxspeed >= 70 || highway === 'primary' || highway === 'secondary';

    if (isBusyRoad && turnDirection === 'left') {
      // Linksaf slaan op drukke wegen = wachten/oversteken tegen het verkeer in. Dwingt straftijd af.
      return 15; // 15 seconden straftijd
    }

    if (turnDirection === 'right') {
      // Rechtsaf slaan is met de stroom mee en stroomt direct door
      return 1;
    }

    return 0; // Rechtdoor heeft geen extra bochtkosten
  }
};
