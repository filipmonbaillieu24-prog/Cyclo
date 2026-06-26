import { audioController } from './audio-controller.js';

export const thermalHydration = {
  sweatLossDebtMl: 0,
  lastUpdateTime: null,

  reset() {
    this.sweatLossDebtMl = 0;
    this.lastUpdateTime = null;
  },

  /**
   * Berekent cumulatief zweetverlies en triggert een audio prompt bij 400ml vochtschuld
   * @param {number} powerWatts - Actueel of gemiddeld vermogen
   * @param {number} tempC - Omgevingstemperatuur
   * @param {boolean} isSunny - Zonnig weer indicator
   */
  update(powerWatts, tempC = 20, isSunny = false) {
    const now = Date.now();
    if (!this.lastUpdateTime) {
      this.lastUpdateTime = now;
      return;
    }

    const elapsedSeconds = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // 1. Basis zweetverlies: ~400 ml/uur in rust/lichte inspanning bij 20°C
    let sweatRateMlPerHour = 400;

    // 2. Vermogenseffect (inspanning): elke Watt boven 100W verhoogt zweetverlies met 1.5 ml/uur
    if (powerWatts > 100) {
      sweatRateMlPerHour += (powerWatts - 100) * 1.5;
    }

    // 3. Temperatuurseffect: stijging boven 20°C verhoogt zweetverlies progressief
    if (tempC > 20) {
      sweatRateMlPerHour += (tempC - 20) * 35;
    }
    if (tempC > 30) {
      sweatRateMlPerHour += (tempC - 30) * 50; // extra warmte-impact
    }

    // 4. Zonnestralingseffect: directe zon voegt ~100 ml/uur toe
    if (isSunny) {
      sweatRateMlPerHour += 120;
    }

    // Bereken verlies in dit specifieke tijdsinterval
    const intervalLossMl = sweatRateMlPerHour * (elapsedSeconds / 3600);
    this.sweatLossDebtMl += intervalLossMl;

    // Trigger spraakbericht bij overschrijden van de 400ml vochtschuld
    if (this.sweatLossDebtMl >= 400) {
      const debtClamped = Math.round(this.sweatLossDebtMl);
      audioController.speak(
        `Hydratatie advies. Je hebt een vochttekort van ${debtClamped} milliliter opgebouwd. Drink nu een flinke slok water of sportdrank.`,
        'normal'
      );
      
      // Verminder de schuld met 300ml (er van uitgaande dat de renner drinkt)
      this.sweatLossDebtMl = Math.max(0, this.sweatLossDebtMl - 300);
    }
  }
};
