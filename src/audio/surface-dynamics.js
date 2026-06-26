import { audioController } from './audio-controller.js';

export const surfaceDynamics = {
  lastSurfaceType: 'asphalt',

  reset() {
    this.lastSurfaceType = 'asphalt';
  },

  /**
   * Monitort de transitie van het wegdek en waarschuwt bij ingrijpende overgangen
   * @param {string} currentSurface - Het actuele type wegdek (asphalt, cobblestone, gravel, etc.)
   */
  updateSurface(currentSurface) {
    if (!currentSurface) return;

    const cleanSurface = currentSurface.toLowerCase().trim();
    if (cleanSurface === this.lastSurfaceType) return;

    // Check voor transities
    if (cleanSurface.includes('cobble') || cleanSurface.includes('sett') || cleanSurface.includes('kassei') || cleanSurface.includes('paved_flat')) {
      audioController.speak("Kasseien vooruit. Pas op je bandenspanning.", "critical");
    } else if (cleanSurface.includes('gravel') || cleanSurface.includes('unpaved') || cleanSurface.includes('dirt') || cleanSurface.includes('path')) {
      audioController.speak("Gravel vooruit. Houd controle over je stuur.", "critical");
    } else if (cleanSurface.includes('asphalt') || cleanSurface.includes('concrete') || cleanSurface.includes('paved')) {
      // Alleen melden als we van een slechtere weg komen
      if (this.lastSurfaceType.includes('cobble') || this.lastSurfaceType.includes('sett') || this.lastSurfaceType.includes('kassei') || this.lastSurfaceType.includes('gravel') || this.lastSurfaceType.includes('unpaved')) {
        audioController.speak("Terug op asfalt.", "normal");
      }
    }

    this.lastSurfaceType = cleanSurface;
  }
};
