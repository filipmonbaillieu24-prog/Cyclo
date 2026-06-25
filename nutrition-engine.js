// Cyclo - Nutrition & Hydration Engine
import { state } from './state.js';

export class NutritionEngine {
  constructor() {
    this.lastDrinkTime = Date.now();
    this.lastEatTime = Date.now();
    this.drinkIntervalMs = 20 * 60 * 1000; // Standaard 20m
    this.eatIntervalMs = 45 * 60 * 1000;   // Standaard 45m
    this.isAlertingEnabled = true;

    // Performance tracking voor dynamische aanpassingen (Decoupling)
    this.history = []; // Array van {hr, power, time}
    this.performanceDropDetected = false;
  }

  start(tempC) {
    this.lastDrinkTime = Date.now();
    this.lastEatTime = Date.now();
    this.history = [];
    this.performanceDropDetected = false;

    // Pas drink interval aan op basis van temperatuur (als hitte)
    if (tempC !== null && tempC >= 22) {
      this.drinkIntervalMs = 15 * 60 * 1000; // Sneller drinken
    } else {
      this.drinkIntervalMs = 20 * 60 * 1000;
    }
  }

  update(currentHr, currentPower) {
    if (!this.isAlertingEnabled) return null;

    const now = Date.now();
    
    // 1. Performance monitoring (Decoupling detectie)
    // Als we HR en Power hebben, controleren we of de efficiëntie (Power/HR) daalt
    if (currentHr && currentPower && currentPower > 0) {
      this.history.push({ hr: currentHr, power: currentPower, time: now });
      
      // Bewaar maximaal de laatste 20 minuten aan ruwe data (sample per seconde)
      this.history = this.history.filter(d => now - d.time < 20 * 60 * 1000);

      // Check decoupling als we minstens 10 minuten data hebben
      if (this.history.length > 600) { 
         // Basic decoupling check: EF (Efficiency Factor) = avg Power / avg HR
         // We vergelijken de eerste 10 min met de laatste 10 min uit deze window
         const firstHalf = this.history.slice(0, Math.floor(this.history.length / 2));
         const secondHalf = this.history.slice(Math.floor(this.history.length / 2));
         
         const ef1 = this.calculateEF(firstHalf);
         const ef2 = this.calculateEF(secondHalf);

         if (ef1 > 0 && ef2 > 0) {
           const drop = (ef1 - ef2) / ef1;
           if (drop > 0.08 && !this.performanceDropDetected) { 
             // 8% drop in efficiëntie (HR schiet omhoog voor hetzelfde vermogen, of vermogen daalt bij zelfde HR)
             this.performanceDropDetected = true;
             
             // Verkort de intervallen dynamisch
             this.drinkIntervalMs = Math.max(10 * 60 * 1000, this.drinkIntervalMs - 5 * 60 * 1000);
             this.eatIntervalMs = Math.max(30 * 60 * 1000, this.eatIntervalMs - 15 * 60 * 1000);
             
             return { type: 'alert', message: '⚠️ Prestatiedaling gedetecteerd (Aerobe Ontkoppeling). Voedingsintervallen zijn automatisch versneld!' };
           }
         }
      }
    }

    // 2. Check alerts
    if (now - this.lastDrinkTime > this.drinkIntervalMs) {
      this.lastDrinkTime = now;
      return { type: 'drink', message: '💧 Tijd voor een slok water of sportdrank!' };
    }

    if (now - this.lastEatTime > this.eatIntervalMs) {
      this.lastEatTime = now;
      return { type: 'eat', message: '🍌 Neem koolhydraten in (ca. 20-30g, bv. een gel of bar)!' };
    }

    return null;
  }

  calculateEF(data) {
    if (data.length === 0) return 0;
    const avgPower = data.reduce((s, d) => s + d.power, 0) / data.length;
    const avgHr = data.reduce((s, d) => s + d.hr, 0) / data.length;
    if (avgHr === 0) return 0;
    return avgPower / avgHr;
  }
}

export const nutritionEngine = new NutritionEngine();
