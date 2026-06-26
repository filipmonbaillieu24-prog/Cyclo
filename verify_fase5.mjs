import fs from 'fs';
import assert from 'assert';

(async () => {
  console.log("=== START VERIFICATIE FASE 5 ===");

  // 1. Mock global environment
  globalThis.document = {
    getElementById: (id) => ({
      addEventListener: () => {},
      setAttribute: () => {},
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      value: '',
      appendChild: () => {},
      innerHTML: '',
      cloneNode: () => ({ setAttribute: () => {} })
    })
  };
  globalThis.window = {
    scrollTo: () => {},
    AudioContext: class {
      createDynamicsCompressor() {
        return {
          threshold: { setValueAtTime: () => {} },
          knee: { setValueAtTime: () => {} },
          ratio: { setValueAtTime: () => {} },
          attack: { setValueAtTime: () => {} },
          release: { setValueAtTime: () => {} },
          connect: () => {}
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: () => {}, setTargetAtTime: () => {} },
          connect: () => {}
        };
      }
      destination = {};
      currentTime = 0;
    },
    speechSynthesis: {
      speak: () => {},
      cancel: () => {}
    }
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'node',
      onLine: true
    },
    writable: true,
    configurable: true
  });

  // 2. Testen audio-controller.js
  console.log("\n[1] Testen audio-controller.js triage en Web Audio API...");
  const { audioController } = await import('./src/audio/audio-controller.js');

  // Reset state
  audioController.queue = [];
  audioController.suppressedQueue = [];
  audioController.isRedZone = false;
  audioController.isSpeaking = true;
  
  // Test critical (Priority 1)
  audioController.speak("Kritiek gevaar!", "critical");
  console.log(`- Critical queue length: ${audioController.queue.length} (Verwacht: 1)`);
  assert.strictEqual(audioController.queue.length, 1);

  // Test coaching in Red Zone (Priority 2)
  audioController.isRedZone = true;
  audioController.speak("Schakel een tandje lichter", "coaching");
  console.log(`- Suppressed coaching queue length in Z4/Z5: ${audioController.suppressedQueue.length} (Verwacht: 1)`);
  assert.strictEqual(audioController.suppressedQueue.length, 1);

  // 3. Testen van de 12 routing middlewares
  console.log("\n[2] Testen routing middlewares...");

  // A. flow-weight-algorithm.js
  const { flowWeightAlgorithm } = await import('./src/routing/flow-weight-algorithm.js');
  const wResidential = flowWeightAlgorithm.calculateWeight({ tags: { highway: 'residential' } });
  console.log(`- Flow residential weight: ${wResidential} (Verwacht: 1.2)`);
  assert.strictEqual(wResidential, 1.2);

  // B. elevation-smoothing.js
  const { elevationSmoothing } = await import('./src/routing/elevation-smoothing.js');
  const smoothed = elevationSmoothing.smooth([10, 12, 50, 14, 16]); // 50 is a spike
  console.log(`- Elevation smoothing output: ${smoothed.join(', ')} (Verwacht smoothed midden-waarde)`);
  assert(smoothed[2] < 50);

  // C. gradient-spike-analyzer.js
  const { gradientSpikeAnalyzer } = await import('./src/routing/gradient-spike-analyzer.js');
  const spikes = gradientSpikeAnalyzer.analyzeGradients([
    { lat: 51.0, lng: 3.7, alt: 10 },
    { lat: 51.0002, lng: 3.7, alt: 25 } // steile helling
  ]);
  console.log(`- Aantal gradient spikes: ${spikes.length} (Verwacht: 1)`);
  assert.strictEqual(spikes.length, 1);

  // D. dynamic-closure-api.js
  const { dynamicClosureApi } = await import('./src/routing/dynamic-closure-api.js');
  const closure = dynamicClosureApi.checkClosure(51.0560, 3.7310);
  console.log(`- Wegenwerken gedetecteerd: ${closure ? closure.description : 'geen'} (Verwacht: R4)`);
  assert(closure.description.includes('R4'));

  // E. crossing-danger-index.js
  const { crossingDangerIndex } = await import('./src/routing/crossing-danger-index.js');
  const isDanger = crossingDangerIndex.isDangerousCrossing({ maxspeed: '70', highway: 'primary' });
  console.log(`- Onbeveiligde oversteek 70km/u weg gevaarlijk: ${isDanger} (Verwacht: true)`);
  assert.strictEqual(isDanger, true);

  // F. infrastructure-flow-filter.js
  const { infrastructureFlowFilter } = await import('./src/routing/infrastructure-flow-filter.js');
  const wObstacle = infrastructureFlowFilter.calculateObstacleWeight({ tags: { barrier: 'bollard' } });
  console.log(`- Obstakel bollard weight: ${wObstacle} (Verwacht: 1.25)`);
  assert.strictEqual(wObstacle, 1.25);

  // G. right-turn-bias.js
  const { rightTurnBias } = await import('./src/routing/right-turn-bias.js');
  const costLeft = rightTurnBias.calculateTurnCost('left', { maxspeed: '70', highway: 'primary' });
  console.log(`- Linksaf turn cost op 70km/u weg: ${costLeft}s (Verwacht: 15s)`);
  assert.strictEqual(costLeft, 15);

  // H. surface-truth-validator.js
  const { surfaceTruthValidator } = await import('./src/routing/surface-truth-validator.js');
  const quality = surfaceTruthValidator.validateQuality('way-123', [18, 19, 17]); // trage snelheden
  console.log(`- Wegkwaliteit degradatie factor: ${quality} (Verwacht: >1.0)`);
  assert(quality > 1.0);

  // I. weather-surface-sync.js
  const { weatherSurfaceSync } = await import('./src/routing/weather-surface-sync.js');
  const wWetGravel = weatherSurfaceSync.getSurfaceWeight('gravel', 8.0); // 8mm regen
  console.log(`- Nat gravel gewicht: ${wWetGravel} (Verwacht: 2)`);
  assert.strictEqual(wWetGravel, 2.0);

  // J. node-network-bias.js
  const { nodeNetworkBias } = await import('./src/routing/node-network-bias.js');
  const bonusRCN = nodeNetworkBias.calculateNetworkBonus({ network: 'rcn' });
  console.log(`- Knooppunten netwerk bonus: ${bonusRCN} (Verwacht: 0.85)`);
  assert.strictEqual(bonusRCN, 0.85);

  // K. temporal-traffic-router.js
  const { temporalTrafficRouter } = await import('./src/routing/temporal-traffic-router.js');
  const isRestricted = temporalTrafficRouter.isTemporarilyRestricted(51.0850, 3.7580, "17:15"); // avondspits Gent-Zeehaven
  console.log(`- Zeehaven avondspits 17:15 beperkt: ${isRestricted} (Verwacht: true)`);
  assert.strictEqual(isRestricted, true);

  // L. bailout-router.js
  const { bailoutRouter } = await import('./src/routing/bailout-router.js');
  const bailout = bailoutRouter.generateBailoutRoute(
    { lat: 51.0600, lng: 3.7300 },
    { lat: 51.0100, lng: 3.7000 },
    { windDirection: 225 }
  );
  console.log(`- Bailout route waypoint count: ${bailout.length} (Verwacht: 3)`);
  assert.strictEqual(bailout.length, 3);

  console.log("\n=== FASE 5 VERIFICATIE SUCCESVOL AFGEROND! ===");
})();
