/**
 * Cyclo - Activity File Parser (GPX & TCX) & Metrics Engine
 * 
 * Deze module parseert TCX en GPX XML-bestanden van Garmin/Wahoo/Strava op de client-side
 * en berekent statistieken, routecoördinaten en de "Rider Score".
 */

class ActivityParser {
  /**
   * Parseert een GPX of TCX XML-string en geeft een gestructureerd ritobject terug.
   * @param {string} xmlText 
   * @returns {Object} Gegevens van de rit
   */
  static parse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    
    // Check op parser fouten
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Ongeldig XML-bestand. Kon het bestand niet parseren.");
    }

    // Identificeer het bestandstype
    const hasGpx = xmlDoc.querySelector("gpx") !== null;
    const hasTcx = xmlDoc.querySelector("TrainingCenterDatabase") !== null;

    if (hasGpx) {
      return this.parseGpx(xmlDoc);
    } else if (hasTcx) {
      return this.parseTcx(xmlDoc);
    } else {
      throw new Error("Onbekend bestandsformaat. Upload a.b.e. een geldig .tcx of .gpx bestand.");
    }
  }

  /**
   * Parseert een TCX-document
   * @param {Document} xmlDoc 
   */
  static parseTcx(xmlDoc) {
    const result = {
      startTime: null,
      totalTimeSeconds: 0,
      totalDistanceMeters: 0,
      calories: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      avgHeartRate: null,
      maxHeartRate: null,
      avgCadence: null,
      totalAscentMeters: 0,
      avgPowerWatts: null,
      coordinates: [],
      riderScore: 0
    };

    // Starttijd
    const activityNode = xmlDoc.querySelector("Activity");
    if (activityNode) {
      const idNode = activityNode.querySelector("Id");
      if (idNode) result.startTime = new Date(idNode.textContent);
    }

    // Lap totalen
    const laps = xmlDoc.querySelectorAll("Lap");
    laps.forEach(lap => {
      const timeNode = lap.querySelector("TotalTimeSeconds");
      const distNode = lap.querySelector("DistanceMeters");
      const calNode = lap.querySelector("Calories");
      const maxSpeedNode = lap.querySelector("MaximumSpeed");

      if (timeNode) result.totalTimeSeconds += parseFloat(timeNode.textContent);
      if (distNode) result.totalDistanceMeters += parseFloat(distNode.textContent);
      if (calNode) result.calories += parseInt(calNode.textContent, 10);
      
      if (maxSpeedNode) {
        const speedKmh = parseFloat(maxSpeedNode.textContent) * 3.6;
        if (speedKmh > result.maxSpeedKmh) {
          result.maxSpeedKmh = parseFloat(speedKmh.toFixed(1));
        }
      }
    });

    // Trackpoints
    const trackpoints = xmlDoc.querySelectorAll("Trackpoint");
    let prevAltitude = null;
    let heartRateSum = 0, heartRateCount = 0;
    let cadenceSum = 0, cadenceCount = 0;
    let powerSum = 0, powerCount = 0;

    trackpoints.forEach(tp => {
      const latNode = tp.querySelector("LatitudeDegrees");
      const lngNode = tp.querySelector("LongitudeDegrees");
      const altNode = tp.querySelector("AltitudeMeters");
      const hrNode = tp.querySelector("HeartRateBpm Value");
      const cadNode = tp.querySelector("Cadence");
      const wattNode = tp.querySelector("Watts") || tp.querySelector("Extensions Watts") || tp.querySelector("TPX Watts");

      const lat = latNode ? parseFloat(latNode.textContent) : null;
      const lng = lngNode ? parseFloat(lngNode.textContent) : null;
      const alt = altNode ? parseFloat(altNode.textContent) : null;

      if (lat !== null && lng !== null) {
        result.coordinates.push({ lat, lng, alt });
      }

      if (alt !== null) {
        if (prevAltitude !== null && alt > prevAltitude) {
          result.totalAscentMeters += (alt - prevAltitude);
        }
        prevAltitude = alt;
      }

      if (hrNode) {
        const hr = parseInt(hrNode.textContent, 10);
        heartRateSum += hr;
        heartRateCount++;
        if (!result.maxHeartRate || hr > result.maxHeartRate) {
          result.maxHeartRate = hr;
        }
      }

      if (cadNode) {
        const cad = parseInt(cadNode.textContent, 10);
        if (cad > 0) {
          cadenceSum += cad;
          cadenceCount++;
        }
      }

      if (wattNode) {
        const watt = parseInt(wattNode.textContent, 10);
        powerSum += watt;
        powerCount++;
      }
    });

    if (result.totalTimeSeconds > 0) {
      const hours = result.totalTimeSeconds / 3600;
      const distanceKm = result.totalDistanceMeters / 1000;
      result.avgSpeedKmh = parseFloat((distanceKm / hours).toFixed(1));
    }

    if (heartRateCount > 0) result.avgHeartRate = Math.round(heartRateSum / heartRateCount);
    if (cadenceCount > 0) result.avgCadence = Math.round(cadenceSum / cadenceCount);
    if (powerCount > 0) result.avgPowerWatts = Math.round(powerSum / powerCount);

    result.totalAscentMeters = Math.round(result.totalAscentMeters);
    result.distanceKm = parseFloat((result.totalDistanceMeters / 1000).toFixed(2));
    result.durationFormatted = this.formatDuration(result.totalTimeSeconds);
    result.riderScore = this.calculateRiderScore(result);

    return result;
  }

  /**
   * Parseert een GPX-document
   * @param {Document} xmlDoc 
   */
  static parseGpx(xmlDoc) {
    const result = {
      startTime: null,
      totalTimeSeconds: 0,
      totalDistanceMeters: 0,
      calories: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      avgHeartRate: null,
      maxHeartRate: null,
      avgCadence: null,
      totalAscentMeters: 0,
      avgPowerWatts: null,
      coordinates: [],
      riderScore: 0
    };

    // Metadata starttijd
    const metaTime = xmlDoc.querySelector("metadata time");
    if (metaTime) {
      result.startTime = new Date(metaTime.textContent);
    }

    const trkpts = xmlDoc.querySelectorAll("trkpt");
    if (trkpts.length === 0) {
      throw new Error("Geen routepunten gevonden in dit GPX bestand.");
    }

    if (!result.startTime && trkpts[0]) {
      const firstTime = trkpts[0].querySelector("time");
      if (firstTime) result.startTime = new Date(firstTime.textContent);
    }

    let prevLat = null, prevLng = null, prevAlt = null, prevTime = null;
    let heartRateSum = 0, heartRateCount = 0;
    let cadenceSum = 0, cadenceCount = 0;
    let powerSum = 0, powerCount = 0;

    trkpts.forEach((tp, idx) => {
      const lat = parseFloat(tp.getAttribute("lat"));
      const lng = parseFloat(tp.getAttribute("lon"));
      
      const altNode = tp.querySelector("ele");
      const timeNode = tp.querySelector("time");
      
      // Zoek naar hr, cad en power in extensies
      const hrNode = tp.querySelector("hr") || tp.getElementsByTagName("gpxtpx:hr")[0] || tp.getElementsByTagName("hr")[0];
      const cadNode = tp.querySelector("cad") || tp.getElementsByTagName("gpxtpx:cad")[0] || tp.getElementsByTagName("cad")[0];
      const powerNode = tp.querySelector("power") || tp.getElementsByTagName("power")[0];

      const alt = altNode ? parseFloat(altNode.textContent) : null;
      const time = timeNode ? new Date(timeNode.textContent) : null;

      if (!isNaN(lat) && !isNaN(lng)) {
        result.coordinates.push({ lat, lng, alt });

        // Afstand berekenen via Haversine
        if (prevLat !== null && prevLng !== null) {
          const dist = this.getHaversineDistance(prevLat, prevLng, lat, lng);
          result.totalDistanceMeters += dist;
        }
        prevLat = lat;
        prevLng = lng;
      }

      // Klimmeters berekenen
      if (alt !== null) {
        if (prevAlt !== null && alt > prevAlt) {
          result.totalAscentMeters += (alt - prevAlt);
        }
        prevAlt = alt;
      }

      // Hartslag
      if (hrNode) {
        const hr = parseInt(hrNode.textContent, 10);
        heartRateSum += hr;
        heartRateCount++;
        if (!result.maxHeartRate || hr > result.maxHeartRate) {
          result.maxHeartRate = hr;
        }
      }

      // Cadans
      if (cadNode) {
        const cad = parseInt(cadNode.textContent, 10);
        if (cad > 0) {
          cadenceSum += cad;
          cadenceCount++;
        }
      }

      // Vermogen
      if (powerNode) {
        const watt = parseInt(powerNode.textContent, 10);
        powerSum += watt;
        powerCount++;
      }

      // Tijd berekenen
      if (idx === 0) {
        prevTime = time;
      } else if (idx === trkpts.length - 1 && time && prevTime) {
        result.totalTimeSeconds = (time - prevTime) / 1000;
      }
    });

    // Indien geen tijdverschil berekend kon worden via begin/eind, bereken op basis van alle geldige tijdstappen
    if (result.totalTimeSeconds === 0 && trkpts.length > 1) {
      const first = trkpts[0].querySelector("time");
      const last = trkpts[trkpts.length - 1].querySelector("time");
      if (first && last) {
        result.totalTimeSeconds = (new Date(last.textContent) - new Date(first.textContent)) / 1000;
      }
    }

    if (result.totalTimeSeconds > 0) {
      const hours = result.totalTimeSeconds / 3600;
      const distanceKm = result.totalDistanceMeters / 1000;
      result.avgSpeedKmh = parseFloat((distanceKm / hours).toFixed(1));
    }

    if (heartRateCount > 0) result.avgHeartRate = Math.round(heartRateSum / heartRateCount);
    if (cadenceCount > 0) result.avgCadence = Math.round(cadenceSum / cadenceCount);
    if (powerCount > 0) result.avgPowerWatts = Math.round(powerSum / powerCount);

    result.totalAscentMeters = Math.round(result.totalAscentMeters);
    result.distanceKm = parseFloat((result.totalDistanceMeters / 1000).toFixed(2));
    result.durationFormatted = this.formatDuration(result.totalTimeSeconds);
    result.riderScore = this.calculateRiderScore(result);

    return result;
  }

  /**
   * Bereken de afstand tussen twee GPS-punten in meters met de Haversine formule.
   */
  static getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Aardstraal in meters
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

  /**
   * Berekent een Rider Score op basis van afstand, stijgingsmeters, gemiddelde snelheid en vermogen.
   * @param {Object} ride 
   * @returns {number} Score van 10 tot 1000
   */
  static calculateRiderScore(ride) {
    const distanceKm = ride.distanceKm || 0;
    const ascentMeters = ride.totalAscentMeters || 0;
    const avgSpeed = ride.avgSpeedKmh || 0;
    const avgPower = ride.avgPowerWatts || 0;
    const avgHr = ride.avgHeartRate || 140;

    let score = (distanceKm * 3.5) + (ascentMeters * 0.6);
    
    let speedFactor = 1.0;
    if (avgSpeed > 0) {
      speedFactor = Math.max(0.5, Math.min(2.0, avgSpeed / 27.5));
    }
    score = score * speedFactor;

    if (avgPower > 0) {
      score += (avgPower * 0.25);
    } else if (avgHr > 150) {
      score += 20; // Extra bonus voor zware inspanning
    }

    return Math.max(10, Math.min(1000, Math.round(score)));
  }

  /**
   * Formatteert seconden naar UU:MM:SS of MM:SS
   */
  static formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    const hDisplay = hours > 0 ? `${hours}:` : '';
    const mDisplay = minutes < 10 && hours > 0 ? `0${minutes}:` : `${minutes}:`;
    const sDisplay = seconds < 10 ? `0${seconds}` : `${seconds}`;
    
    return `${hDisplay}${mDisplay}${sDisplay}`;
  }

  /**
   * Tekent een route op een interactieve Leaflet kaart.
   */
  static activeMap = null;

  static drawRouteOnLeaflet(mapDivId, coordinates, strokeColor = "#d4ff00") {
    if (!coordinates || coordinates.length === 0) return;
    if (typeof L === 'undefined') {
      console.error("Leaflet is niet geladen.");
      return;
    }

    const latLngs = coordinates.map(c => [c.lat, c.lng]);

    try {
      if (!this.activeMap) {
        this.activeMap = L.map(mapDivId, {
          zoomControl: true,
          attributionControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(this.activeMap);
      } else {
        this.activeMap.eachLayer(layer => {
          if (layer instanceof L.Polyline || layer instanceof L.Marker) {
            this.activeMap.removeLayer(layer);
          }
        });
      }

      const polyline = L.polyline(latLngs, {
        color: strokeColor,
        weight: 4,
        opacity: 0.95
      }).addTo(this.activeMap);

      this.activeMap.fitBounds(polyline.getBounds(), { padding: [20, 20] });

      const startPoint = latLngs[0];
      const endPoint = latLngs[latLngs.length - 1];

      const startIcon = L.divIcon({
        className: 'custom-map-marker-start',
        html: '<div style="background-color:#00F0FF; width:12px; height:12px; border-radius:50%; border:2px solid #fff; box-shadow: 0 0 10px #00F0FF;"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const endIcon = L.divIcon({
        className: 'custom-map-marker-end',
        html: '<div style="background-color:#FF007F; width:12px; height:12px; border-radius:50%; border:2px solid #fff; box-shadow: 0 0 10px #FF007F;"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      L.marker(startPoint, { icon: startIcon }).addTo(this.activeMap);
      L.marker(endPoint, { icon: endIcon }).addTo(this.activeMap);

      setTimeout(() => {
        if (this.activeMap) this.activeMap.invalidateSize();
      }, 200);

    } catch (e) {
      console.error("Fout bij tekenen Leaflet routekaart:", e);
    }
  }
}

// Expose naar global scope voor backward compatibility
window.ActivityParser = ActivityParser;
window.TcxParser = ActivityParser;
