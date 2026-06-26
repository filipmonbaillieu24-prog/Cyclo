import { audioController } from './audio-controller.js';

export const trafficOptimizer = {
  lastAlertTime: 0,

  // Mock database met bekende verkeerslichtlocaties (coördinaten en cyclustimers)
  trafficLights: [
    { lat: 51.0534, lng: 3.7302, name: "Kruispunt R4", cycleSeconds: 60, greenDuration: 32, offsetSeconds: 0 },
    { lat: 51.0488, lng: 3.7420, name: "Gent Dampoort", cycleSeconds: 90, greenDuration: 40, offsetSeconds: 15 },
    { lat: 50.8520, lng: 4.3540, name: "Brussel Kruispunt", cycleSeconds: 80, greenDuration: 35, offsetSeconds: 5 }
  ],

  /**
   * Analyseert naderende verkeerslichten en adviseert pacing-snelheden voor een groene golf
   */
  updatePacing(lat, lng, currentSpeedKmh = 25) {
    const now = Date.now();
    // Limiteer waarschuwingen tot één per 45 seconden
    if (now - this.lastAlertTime < 45000) return null;

    // Vind het dichtstbijzijnde verkeerslicht vooruit
    let targetLight = null;
    let minDistance = Infinity;

    this.trafficLights.forEach(light => {
      const d = this.getDistance(lat, lng, light.lat, light.lng);
      if (d < 350) { // Binnen 350 meter
        minDistance = d;
        targetLight = light;
      }
    });

    if (!targetLight) return null;

    // Bereken huidige fase van het verkeerslicht
    const elapsedSecondsTotal = Math.floor(now / 1000) + targetLight.offsetSeconds;
    const currentCycleSecond = elapsedSecondsTotal % targetLight.cycleSeconds;
    const isGreenNow = currentCycleSecond < targetLight.greenDuration;
    const secondsRemainingInPhase = isGreenNow
      ? targetLight.greenDuration - currentCycleSecond
      : targetLight.cycleSeconds - currentCycleSecond;

    // Bereken reistijd bij huidige snelheid (m/s)
    const speedMps = currentSpeedKmh / 3.6;
    if (speedMps <= 1) return null; // Bijna stilstaand

    const timeToArrivalSeconds = minDistance / speedMps;

    // Bepaal de kleur van het licht bij aankomst
    const arrivalCycleSecond = (currentCycleSecond + timeToArrivalSeconds) % targetLight.cycleSeconds;
    const willBeGreen = arrivalCycleSecond < targetLight.greenDuration;

    if (willBeGreen) {
      // De renner haalt het groene licht! Bevestig dit visueel/auditief indien gewenst
      return {
        lightName: targetLight.name,
        distance: Math.round(minDistance),
        pacingSpeedKmh: currentSpeedKmh,
        status: 'green-wave',
        message: 'Op schema voor groen!'
      };
    } else {
      // Rood licht bij aankomst! Bereken de benodigde snelheid om aan te komen exact wanneer het groen wordt
      // We willen aankomen op seconde 0 van de volgende groene fase (of 2 seconden marge)
      const secondsUntilNextGreen = isGreenNow
        ? secondsRemainingInPhase + (targetLight.cycleSeconds - targetLight.greenDuration) // resterend groen + rood fase
        : secondsRemainingInPhase; // resterend rood fase

      const targetTimeToArrival = timeToArrivalSeconds + secondsUntilNextGreen + 2; // voeg 2 seconden marge toe
      const targetSpeedMps = minDistance / targetTimeToArrival;
      const targetSpeedKmh = parseFloat((targetSpeedMps * 3.6).toFixed(1));

      // Adviseer alleen als de doelsnelheid realistisch is (tussen 16 en 36 km/u)
      if (targetSpeedKmh >= 16 && targetSpeedKmh <= 36) {
        this.lastAlertTime = now;
        
        audioController.speak(
          `Groene golf advies. Verkeerslicht vooruit. Houd ${Math.round(targetSpeedKmh)} kilometer per uur aan om zonder te stoppen door het groen te fietsen.`,
          'normal'
        );

        return {
          lightName: targetLight.name,
          distance: Math.round(minDistance),
          pacingSpeedKmh: targetSpeedKmh,
          status: 'adjust-pacing',
          message: `Houd ${targetSpeedKmh} km/u aan`
        };
      }
    }

    return null;
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
