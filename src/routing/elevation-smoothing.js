export const elevationSmoothing = {
  /**
   * Past een smoothing filter toe op de hoogtedata om spikes en fouten weg te poetsen.
   * @param {Array<number>} elevationProfile - Lijst van hoogtemeters per punt
   * @returns {Array<number>} Het gesmoothte hoogteprofiel
   */
  smooth(elevationProfile) {
    if (!elevationProfile || elevationProfile.length < 5) return elevationProfile || [];

    // Savitzky-Golay-achtige 5-punts moving average met gewichten [1, 2, 3, 2, 1]
    const smoothed = [];
    const n = elevationProfile.length;

    for (let i = 0; i < n; i++) {
      if (i < 2 || i > n - 3) {
        // Behoud randen ongewijzigd
        smoothed.push(elevationProfile[i]);
      } else {
        const p1 = elevationProfile[i - 2];
        const p2 = elevationProfile[i - 1];
        const p3 = elevationProfile[i];
        const p4 = elevationProfile[i + 1];
        const p5 = elevationProfile[i + 2];
        
        const sum = (1 * p1) + (2 * p2) + (3 * p3) + (2 * p4) + (1 * p5);
        const avg = sum / 9;
        smoothed.push(parseFloat(avg.toFixed(1)));
      }
    }

    return smoothed;
  }
};
