export const audioController = {
  queue: [],
  suppressedQueue: [],
  isRedZone: false,
  isSpeaking: false,
  muted: false,

  // Web Audio API nodes
  audioCtx: null,
  duckNode: null,
  compressorNode: null,

  // Pre-cached audio mappings
  pregeneratedPrompts: {
    "linksaf": "assets/audio/linksaf.wav",
    "rechtsaf": "assets/audio/rechtsaf.wav",
    "kasseien vooruit. pas op je bandenspanning.": "assets/audio/kasseien.wav",
    "pas op, scherpe bocht over honderd meter. matig je snelheid.": "assets/audio/bocht.wav"
  },

  /**
   * Initialiseert de Web Audio API Graph voor Ducking & Normalisatie
   */
  initAudio() {
    if (this.audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = new AudioContext();

      // DynamicsCompressorNode: normaliseert pieken/windruis
      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-24, this.audioCtx.currentTime);
      this.compressorNode.knee.setValueAtTime(30, this.audioCtx.currentTime);
      this.compressorNode.ratio.setValueAtTime(12, this.audioCtx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, this.audioCtx.currentTime);

      // GainNode: gebruikt voor smart audio ducking van muziek/omgevingsgeluid
      this.duckNode = this.audioCtx.createGain();
      this.duckNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

      // Routeer audio graph: Source ➔ DuckNode ➔ Compressor ➔ Output
      this.duckNode.connect(this.compressorNode);
      this.compressorNode.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn("Kon Web Audio API niet initialiseren:", e);
    }
  },

  /**
   * Dempt externe audiobronnen (muziek) met 70% wanneer de DS spreekt
   */
  duckBackground(ducked) {
    this.initAudio();
    if (!this.duckNode || !this.audioCtx) return;
    const targetGain = ducked ? 0.3 : 1.0;
    this.duckNode.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.15);
  },

  /**
   * Spreekt een instructie uit via Web Audio / Web Speech API
   * @param {string} text - De uit te spreken tekst
   * @param {string} priority - 'critical', 'coaching', of 'data'
   */
  speak(text, priority = 'normal') {
    if (this.muted) return;

    const textLower = text.toLowerCase().trim();

    // 1. Triage prioritering
    if (priority === 'critical') {
      // Veiligheid/Gevaar: Altijd direct afspelen, overschrijft lopende audio
      this.queue.unshift({ text, priority });
      this.processQueue();
      return;
    }

    if (priority === 'coaching' && this.isRedZone) {
      // Tactiek: Onderdrukken in rode zone (Z4/Z5)
      console.log(`[Audio DS - Suppressed Coaching (Red Zone)] ${text}`);
      this.suppressedQueue.push({ text, priority });
      return;
    }

    if (priority === 'data' || priority === 'normal') {
      // Data/Voeding: Alleen uitspreken in rustige secties
      const inQuietSection = !this.isRedZone; 
      if (!inQuietSection) {
        console.log(`[Audio DS - Suppressed Data (Not in quiet section)] ${text}`);
        this.suppressedQueue.push({ text, priority });
        return;
      }
    }

    this.queue.push({ text, priority });
    this.processQueue();
  },

  /**
   * Update de hartslag om te bepalen of we ons in de "Red Zone" bevinden
   */
  updateHeartRate(hr, lthr = 160) {
    const redZoneLimit = lthr * 0.94;
    const wasRedZone = this.isRedZone;
    this.isRedZone = hr >= redZoneLimit;

    if (!this.isRedZone && wasRedZone) {
      console.log(`[Audio DS] Rijder herstelt. Spreek onderdrukte meldingen uit...`);
      this.flushSuppressed();
    }
  },

  processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;

    const item = this.queue.shift();
    this.isSpeaking = true;

    // Check pre-cached audiobestanden
    const cacheUrl = this.pregeneratedPrompts[item.text.toLowerCase().trim()];
    if (cacheUrl && navigator.onLine) {
      this.playPrecached(cacheUrl, () => {
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 500);
      });
      return;
    }

    // Fallback: Web Speech API
    this.duckBackground(true);

    if ('speechSynthesis' in window) {
      if (item.priority === 'critical') {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = 'nl-NL';
      
      // Pas intonatie aan op basis van prioriteit
      if (item.priority === 'critical') {
        utterance.rate = 1.15; // Sneller tempo bij gevaar
        utterance.pitch = 1.1;  // Iets hogere toonhoogte
      } else {
        utterance.rate = 0.95;  // Rustige spraak
        utterance.pitch = 0.95; // Empathischere lagere stem
      }

      utterance.onend = () => {
        this.duckBackground(false);
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 500);
      };

      utterance.onerror = (e) => {
        console.warn("Spraaksynthese fout:", e);
        this.duckBackground(false);
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 500);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      console.log(`[Audio Fallback] ${item.text}`);
      this.duckBackground(false);
      this.isSpeaking = false;
    }
  },

  playPrecached(url, callback) {
    this.initAudio();
    if (!this.audioCtx) {
      const audio = new Audio(url);
      audio.onended = callback;
      audio.play().catch(() => callback());
      return;
    }

    this.duckBackground(true);
    fetch(url)
      .then(res => res.arrayBuffer())
      .then(buffer => this.audioCtx.decodeAudioData(buffer))
      .then(audioBuffer => {
        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.duckNode);
        source.onended = () => {
          this.duckBackground(false);
          callback();
        };
        source.start(0);
      })
      .catch((e) => {
        console.warn("Fout bij afspelen precache, fallback naar spraak:", e);
        this.duckBackground(false);
        callback();
      });
  },

  flushSuppressed() {
    while (this.suppressedQueue.length > 0) {
      const item = this.suppressedQueue.shift();
      this.speak(item.text, item.priority);
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
