export const audioController = {
  queue: [],
  suppressedQueue: [],
  isRedZone: false,
  isSpeaking: false,
  muted: false,

  /**
   * Spreekt een instructie uit via Web Speech API
   * @param {string} text - De uit te spreken tekst
   * @param {string} priority - 'critical' (navigatie/gevaar) of 'normal' (voeding/tactiek)
   */
  speak(text, priority = 'normal') {
    if (this.muted) return;

    if (priority !== 'critical' && this.isRedZone) {
      console.log(`[Audio DS - Suppressed (Red Zone)] ${text}`);
      this.suppressedQueue.push(text);
      return;
    }

    this.queue.push({ text, priority });
    this.processQueue();
  },

  /**
   * Update de hartslag om te bepalen of we ons in de "Red Zone" (Z4/Z5) bevinden
   */
  updateHeartRate(hr, lthr = 160) {
    // Red Zone = Hartslag boven Zone 4 drempel (94% van LTHR)
    const redZoneLimit = lthr * 0.94;
    const wasRedZone = this.isRedZone;
    this.isRedZone = hr >= redZoneLimit;

    if (this.isRedZone) {
      if (!wasRedZone) {
        console.log(`[Audio DS] Rider entered Red Zone (${hr} bpm). Non-critical audio suppressed.`);
      }
    } else {
      if (wasRedZone) {
        console.log(`[Audio DS] Rider left Red Zone. Recovering... speaking suppressed alerts.`);
        // Flush de onderdrukte meldingen zodra de hartslag zakt
        this.flushSuppressed();
      }
    }
  },

  processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;

    const item = this.queue.shift();
    this.isSpeaking = true;

    // Browser Web Speech Synthesis
    if ('speechSynthesis' in window) {
      // Annuleer lopende spraak niet bij normale meldingen, tenzij critical
      if (item.priority === 'critical') {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = 'nl-NL'; // Nederlands gesproken stem
      utterance.rate = 1.0;     // Normaal tempo

      utterance.onend = () => {
        this.isSpeaking = false;
        // Ga naar de volgende in de wachtrij
        setTimeout(() => this.processQueue(), 500);
      };

      utterance.onerror = (e) => {
        console.warn("Spraaksynthese fout:", e);
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 500);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      console.log(`[Audio Text Fallback] ${item.text}`);
      this.isSpeaking = false;
    }
  },

  flushSuppressed() {
    while (this.suppressedQueue.length > 0) {
      const text = this.suppressedQueue.shift();
      this.speak(text, 'normal');
    }
  },

  mute() {
    this.muted = true;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  },

  unmute() {
    this.muted = false;
  }
};
