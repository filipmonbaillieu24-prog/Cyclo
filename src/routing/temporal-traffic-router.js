export const temporalTrafficRouter = {
  // Mock schoolzones en industrieterreinen met spitsuren
  restrictions: [
    {
      name: "Schoolzone Gent-Centrum",
      lat: 51.0510,
      lng: 3.7250,
      radiusMeters: 200,
      restrictedHours: [
        { start: "08:15", end: "08:45" },
        { start: "15:30", end: "16:00" } // woensdag middag weglaten voor eenvoud
      ],
      type: "school"
    },
    {
      name: "Industrieterrein Gent-Zeehaven",
      lat: 51.0850,
      lng: 3.7580,
      radiusMeters: 600,
      restrictedHours: [
        { start: "07:30", end: "09:00" },
        { start: "16:30", end: "18:00" } // avondspits
      ],
      type: "industrial"
    }
  ],

  /**
   * Controleert of het segment een tijdelijk te vermijden zone doorkruist op het doeltijdstip.
   * @param {number} lat - Breedtegraad van segment
   * @param {number} lng - Lengtegraad van segment
   * @param {string} timeStr - Tijdstip van de rit (bijv. "17:15")
   * @returns {boolean} True als de zone vermeden moet worden op dit tijdstip
   */
  isTemporarilyRestricted(lat, lng, timeStr) {
    if (!timeStr) return false;

    // Converteer doeltijd naar minuten sinds middernacht
    const [tHour, tMin] = timeStr.split(':').map(Number);
    const targetMinutes = tHour * 60 + tMin;

    for (const res of this.restrictions) {
      const dist = this.getDistance(lat, lng, res.lat, res.lng);
      if (dist <= res.radiusMeters) {
        // Controleer of de doeltijd binnen een restrictie-interval valt
        for (const interval of res.restrictedHours) {
          const [sH, sM] = interval.start.split(':').map(Number);
          const [eH, eM] = interval.end.split(':').map(Number);
          const startMinutes = sH * 60 + sM;
          const endMinutes = eH * 60 + eM;

          if (targetMinutes >= startMinutes && targetMinutes <= endMinutes) {
            console.log(`[Temporal Traffic Router] Doorkruising van restrictiezone ${res.name} vermeden op tijdstip ${timeStr}.`);
            return true;
          }
        }
      }
    }

    return false;
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
