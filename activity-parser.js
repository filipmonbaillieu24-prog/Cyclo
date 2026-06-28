/**
 * Cyclo - Activity File Parser (GPX, TCX, FIT, KML) & Metrics Engine
 * 
 * Ondersteunde formaten:
 *   - TCX  (.tcx)  — Garmin Training Center XML
 *   - GPX  (.gpx)  — GPS Exchange Format (Strava, Komoot, ...)
 *   - FIT  (.fit)  — Garmin native binair formaat (via fit-file-parser CDN)
 *   - KML  (.kml)  — Google Earth / Maps export
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
    
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Ongeldig XML-bestand. Kon het bestand niet parseren.");
    }

    const hasGpx = xmlDoc.querySelector("gpx") !== null;
    const hasTcx = xmlDoc.querySelector("TrainingCenterDatabase") !== null;
    const hasKml = xmlDoc.querySelector("kml") !== null;

    if (hasGpx) return this.parseGpx(xmlDoc);
    if (hasTcx) return this.parseTcx(xmlDoc);
    if (hasKml) return this.parseKml(xmlDoc);

    throw new Error("Onbekend bestandsformaat. Upload een .tcx, .gpx, .fit of .kml bestand.");
  }

  /**
   * Parse een FIT-bestand (binair). Vereist de fit-file-parser CDN library.
   * @param {ArrayBuffer} buffer 
   * @returns {Promise<Object>}
   */
  static parseFit(buffer) {
    return new Promise((resolve, reject) => {
      if (typeof FitParser === 'undefined') {
        reject(new Error('FIT parser bibliotheek niet geladen. Controleer je internetverbinding.'));
        return;
      }

      const fitParser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'meters',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list'
      });

      fitParser.parse(buffer, (error, data) => {
        if (error) { reject(new Error('FIT parse fout: ' + error)); return; }
        try {
          resolve(this.parseFitData(data));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  static parseFitData(data) {
    const records = data.records || [];
    if (records.length === 0) throw new Error('Geen data gevonden in FIT bestand.');

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

    let hrSum = 0, hrCount = 0;
    let cadSum = 0, cadCount = 0;
    let powerSum = 0, powerCount = 0;
    let prevAlt = null;
    let firstTime = null, lastTime = null;

    records.forEach(rec => {
      if (rec.position_lat !== undefined && rec.position_long !== undefined) {
        const lat = rec.position_lat;
        const lng = rec.position_long;
        const alt = rec.altitude !== undefined ? rec.altitude : null;
        result.coordinates.push({ lat, lng, alt });

        if (alt !== null) {
          if (prevAlt !== null && alt > prevAlt) {
            result.totalAscentMeters += (alt - prevAlt);
          }
          prevAlt = alt;
        }
      }

      if (rec.timestamp) {
        const t = new Date(rec.timestamp);
        if (!firstTime) { firstTime = t; result.startTime = t; }
        lastTime = t;
      }

      if (rec.heart_rate > 0) { hrSum += rec.heart_rate; hrCount++; if (!result.maxHeartRate || rec.heart_rate > result.maxHeartRate) result.maxHeartRate = rec.heart_rate; }
      if (rec.cadence > 0) { cadSum += rec.cadence; cadCount++; }
      if (rec.power > 0) { powerSum += rec.power; powerCount++; }
      if (rec.speed !== undefined && rec.speed * 3.6 > result.maxSpeedKmh) result.maxSpeedKmh = parseFloat((rec.speed * 3.6).toFixed(1));
      if (rec.distance !== undefined) result.totalDistanceMeters = Math.max(result.totalDistanceMeters, rec.distance);
    });

    // Totale tijd
    if (firstTime && lastTime) {
      result.totalTimeSeconds = (lastTime - firstTime) / 1000;
    }

    // Sessie-data gebruiken als beschikbaar
    const sessions = data.sessions || [];
    if (sessions.length > 0) {
      const s = sessions[0];
      if (s.total_elapsed_time) result.totalTimeSeconds = s.total_elapsed_time;
      if (s.total_distance) result.totalDistanceMeters = s.total_distance;
      if (s.total_calories) result.calories = s.total_calories;
      if (s.avg_heart_rate) { hrSum = s.avg_heart_rate; hrCount = 1; }
      if (s.max_heart_rate) result.maxHeartRate = s.max_heart_rate;
    }

    if (result.totalTimeSeconds > 0 && result.totalDistanceMeters > 0) {
      result.avgSpeedKmh = parseFloat(((result.totalDistanceMeters / 1000) / (result.totalTimeSeconds / 3600)).toFixed(1));
    }

    if (hrCount > 0) result.avgHeartRate = Math.round(hrSum / hrCount);
    if (cadCount > 0) result.avgCadence = Math.round(cadSum / cadCount);
    if (powerCount > 0) result.avgPowerWatts = Math.round(powerSum / powerCount);

    result.totalAscentMeters = Math.round(result.totalAscentMeters);
    result.distanceKm = parseFloat((result.totalDistanceMeters / 1000).toFixed(2));
    result.durationFormatted = this.formatDuration(result.totalTimeSeconds);
    result.riderScore = this.calculateRiderScore(result);
    result.tss = this.calculateTSS(result);

    return result;
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
    result.tss = this.calculateTSS(result);

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
    result.tss = this.calculateTSS(result);

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
    const distKm     = ride.distanceKm         || 0;
    const ascentM    = ride.totalAscentMeters  || 0;
    const durationH  = (ride.totalTimeSeconds  || 0) / 3600;
    const avgSpeed   = ride.avgSpeedKmh        || 0;
    const avgPower   = ride.avgPowerWatts       || 0;
    const avgHr      = ride.avgHeartRate        || 0;

    if (distKm < 0.5 || durationH < 0.05) return 10; // Minimale rit

    // ─── Component 1: Afstand (met afnemend rendement)
    // Korte ritten scoren lineair, lange ritten logaritmisch
    const distScore = distKm <= 50
      ? distKm * 2.8
      : 140 + Math.log(distKm / 50) * 120;

    // ─── Component 2: Hoogtemeters (kliminspanning)
    // VAM-gebaseerd: elke 100m klim = significant meer effort
    const ascentScore = ascentM <= 500
      ? ascentM * 0.55
      : 275 + (ascentM - 500) * 0.38;

    // ─── Component 3: Snelheidsfactor (normalisatie)
    // 27.5 km/u = referentietempo voor een gemiddelde recreatieve fietser
    // Factor loopt van 0.6 (15km/u) tot 1.45 (40+ km/u)
    let speedFactor = 1.0;
    if (avgSpeed >= 10) {
      speedFactor = Math.max(0.6, Math.min(1.45, 0.3 + avgSpeed / 30));
    }

    // ─── Component 4: Duur-bonus (endurance)
    // Ritten langer dan 2u krijgen een progressieve bonustoeslag
    const enduranceBonus = durationH > 2
      ? Math.min(80, (durationH - 2) * 18)
      : 0;

    // ─── Component 5: Intensiteitsbonus (vermogen of hartslag)
    let intensityBonus = 0;
    if (avgPower > 0) {
      // W/kg-achtige bonus: hoog vermogen = hoge inspanning
      // Basis 150W = +20, 250W = +60, 350W = +100 (gecapped)
      intensityBonus = Math.min(120, avgPower * 0.33);
    } else if (avgHr > 0) {
      // Hartslag als fallback: zones 1-5
      // <120 = licht, 120-140 = matig, 140-160 = tempo, 160+ = hard
      if (avgHr > 160)      intensityBonus = 50;
      else if (avgHr > 150) intensityBonus = 35;
      else if (avgHr > 140) intensityBonus = 20;
      else if (avgHr > 130) intensityBonus = 10;
    }

    // ─── Totaalscore
    const raw = (distScore + ascentScore) * speedFactor + enduranceBonus + intensityBonus;

    // Afronden en clamp naar 10–1000
    return Math.max(10, Math.min(1000, Math.round(raw)));
  }

  /**
   * Berekent de TSS (Training Stress Score) op basis van de polymorfe fallback cascade:
   * 1. Vermogen (TSS)
   * 2. Hartslag (hrTSS)
   * 3. Hoogtemeters / GPS-profiel (Estimated Power TSS via physics engine)
   * 4. RPE (Rate of Perceived Exertion) default
   */
  static calculateTSS(ride) {
    const ftp = (window.state && window.state.user && window.state.user.ftp) || 200;
    const lthr = (window.state && window.state.user && window.state.user.lthr) || 160;
    const weight = (window.state && window.state.user && window.state.user.weight) || 88;
    const height = 181; // verankerd voor baseline

    const durationHrs = (ride.totalTimeSeconds || 0) / 3600;

    // 1. IF (avgPowerWatts) -> Bereken TSS
    if (ride.avgPowerWatts && ride.avgPowerWatts > 0) {
      const np = ride.avgPowerWatts * 1.04; // Schatting van NP (Normalized Power)
      const intensityFactor = np / ftp;
      const tss = ((ride.totalTimeSeconds || 0) * np * intensityFactor) / (ftp * 3600) * 100;
      return Math.round(tss);
    }

    // 2. ELSE IF (avgHeartRate) -> Bereken hrTSS
    if (ride.avgHeartRate && ride.avgHeartRate > 0) {
      const intensityFactorHr = ride.avgHeartRate / lthr;
      const hrTSS = durationHrs * Math.pow(intensityFactorHr, 2) * 100;
      return Math.round(hrTSS);
    }

    // 3. ELSE IF (totalAscentMeters) -> Bereken Estimated Power TSS (via physics engine en lichaamslengte)
    if (ride.totalAscentMeters && ride.totalAscentMeters > 0 && ride.distanceKm && ride.distanceKm > 0) {
      const m = weight + 10; // Fietser + fiets (10 kg)
      const g = 9.81;

      // Gemiddelde snelheid in m/s
      const avgSpeedMps = ((ride.distanceKm * 1000) / (ride.totalTimeSeconds || 3600));

      // Aerodynamische weerstand op basis van verankerde lengte (181 cm) en gewicht
      const CdA = 0.32;
      const rho = 1.2; // Luchtdichtheid
      const P_drag = 0.5 * CdA * rho * Math.pow(avgSpeedMps, 3);

      // Rolweerstand (Crr = 0.005)
      const Crr = 0.005;
      const P_rolling = Crr * m * g * avgSpeedMps;

      // Zwaartekracht vermogen voor het stijgen
      const verticalSpeedMps = ride.totalAscentMeters / (ride.totalTimeSeconds || 3600);
      const P_gravity = m * g * verticalSpeedMps;

      const estimatedPower = P_drag + P_rolling + P_gravity;
      const intensityFactorEst = estimatedPower / ftp;
      const tssEst = durationHrs * Math.pow(intensityFactorEst, 2) * 100;
      return Math.round(tssEst);
    }

    // 4. ELSE -> Default handmatige RPE-prompt (RPE 5 = 25 TSS/uur)
    return Math.round(25 * durationHrs);
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
    let coords = coordinates;
    if (typeof coords === 'string') {
      try { coords = JSON.parse(coords); } catch (e) { coords = null; }
    }
    if (!coords || coords.length === 0) return;
    if (typeof L === 'undefined') {
      console.error("Leaflet is niet geladen.");
      return;
    }

    const latLngs = coords.map(c => {
      const lat = c.lat !== undefined ? c.lat : c[0];
      const lng = c.lng !== undefined ? c.lng : c[1];
      return [lat, lng];
    });

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
  /**
   * Parse een KML-bestand (Google Earth / Maps export)
   * @param {Document} xmlDoc
   */
  static parseKml(xmlDoc) {
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

    // KML coördinaten zitten in <coordinates> als "lng,lat,alt" per punt
    const coordNodes = xmlDoc.querySelectorAll('coordinates');
    let prevAlt = null;
    let prevLat = null, prevLng = null;

    coordNodes.forEach(node => {
      const text = node.textContent.trim();
      const points = text.split(/\s+/).filter(p => p.includes(','));
      points.forEach(point => {
        const parts = point.split(',');
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;

          if (!isNaN(lat) && !isNaN(lng)) {
            result.coordinates.push({ lat, lng, alt });

            if (prevLat !== null) {
              result.totalDistanceMeters += this.getHaversineDistance(prevLat, prevLng, lat, lng);
            }
            prevLat = lat; prevLng = lng;

            if (alt !== null && !isNaN(alt)) {
              if (prevAlt !== null && alt > prevAlt) {
                result.totalAscentMeters += (alt - prevAlt);
              }
              prevAlt = alt;
            }
          }
        }
      });
    });

    if (result.coordinates.length === 0) throw new Error('Geen routepunten gevonden in KML bestand.');

    // Tijdstempels uit KML (optioneel)
    const whenNodes = xmlDoc.querySelectorAll('when');
    if (whenNodes.length >= 2) {
      result.startTime = new Date(whenNodes[0].textContent);
      const endTime = new Date(whenNodes[whenNodes.length - 1].textContent);
      result.totalTimeSeconds = (endTime - result.startTime) / 1000;
    }

    if (result.totalTimeSeconds > 0 && result.totalDistanceMeters > 0) {
      result.avgSpeedKmh = parseFloat(((result.totalDistanceMeters / 1000) / (result.totalTimeSeconds / 3600)).toFixed(1));
    }

    result.totalAscentMeters = Math.round(result.totalAscentMeters);
    result.distanceKm = parseFloat((result.totalDistanceMeters / 1000).toFixed(2));
    result.durationFormatted = this.formatDuration(result.totalTimeSeconds);
    result.riderScore = this.calculateRiderScore(result);
    result.tss = this.calculateTSS(result);

    return result;
  }

  /**
   * Bouw een hoogteprofiel op basis van coördinaten.
   * @param {Array} coordinates - [{lat, lng, alt}, ...]
   * @returns {Object} { distances: number[], altitudes: number[], totalAscent, totalDescent, maxAlt, minAlt }
   */
  static buildElevationProfile(coordinates) {
    const distances = [];
    const altitudes = [];
    let cumulativeDist = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    // Filter punten zonder hoogte
    const withAlt = coordinates.filter(c => c.alt !== null && c.alt !== undefined && !isNaN(c.alt));
    if (withAlt.length < 2) return null;

    // Smooth de hoogte licht (3-punt voortschrijdend gemiddelde)
    const smoothed = withAlt.map((c, i) => {
      if (i === 0 || i === withAlt.length - 1) return c.alt;
      return (withAlt[i-1].alt + c.alt + withAlt[i+1].alt) / 3;
    });

    distances.push(0);
    altitudes.push(parseFloat(smoothed[0].toFixed(1)));

    for (let i = 1; i < withAlt.length; i++) {
      const dist = this.getHaversineDistance(
        withAlt[i-1].lat, withAlt[i-1].lng,
        withAlt[i].lat,   withAlt[i].lng
      );
      cumulativeDist += dist;
      const diff = smoothed[i] - smoothed[i - 1];
      if (diff > 0) totalAscent += diff;
      else totalDescent += Math.abs(diff);

      // Sla 1 punt per ~100m op (decimeer voor performance)
      if (i % Math.max(1, Math.floor(withAlt.length / 300)) === 0 || i === withAlt.length - 1) {
        distances.push(parseFloat((cumulativeDist / 1000).toFixed(2)));
        altitudes.push(parseFloat(smoothed[i].toFixed(1)));
      }
    }

    return {
      distances,
      altitudes,
      totalAscent: Math.round(totalAscent),
      totalDescent: Math.round(totalDescent),
      maxAlt: Math.round(Math.max(...altitudes)),
      minAlt: Math.round(Math.min(...altitudes))
    };
  }
}

// Expose naar global scope
window.ActivityParser = ActivityParser;
window.TcxParser = ActivityParser;
