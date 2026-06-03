/**
 * Cyclo - TCX File Parser & Metrics Engine
 * 
 * Deze module parseert TCX (XML) bestanden van Garmin/Wahoo/etc. op de client-side
 * en berekent statistieken, routecoördinaten en de "Rider Score".
 */

class TcxParser {
  /**
   * Parseert een TCX XML-string en geeft een gestructureerd ritobject terug.
   * @param {string} xmlText 
   * @returns {Object} Gegevens van de rit
   */
  static parse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    
    // Check op parser fouten
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Ongeldig TCX-bestand. Kon XML niet parseren.");
    }

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
      coordinates: [], // [{lat, lng, alt}] voor kaarttekening
      riderScore: 0
    };

    // 1. Starttijd en activiteit type
    const activityNode = xmlDoc.querySelector("Activity");
    if (activityNode) {
      const idNode = activityNode.querySelector("Id");
      if (idNode) result.startTime = new Date(idNode.textContent);
    }

    // 2. Loop door de Laps voor algemene totalen
    const laps = xmlDoc.querySelectorAll("Lap");
    let heartRateSum = 0;
    let heartRateCount = 0;
    let cadenceSum = 0;
    let cadenceCount = 0;
    let powerSum = 0;
    let powerCount = 0;

    laps.forEach(lap => {
      const timeNode = lap.querySelector("TotalTimeSeconds");
      const distNode = lap.querySelector("DistanceMeters");
      const calNode = lap.querySelector("Calories");
      const maxSpeedNode = lap.querySelector("MaximumSpeed");

      if (timeNode) result.totalTimeSeconds += parseFloat(timeNode.textContent);
      if (distNode) result.totalDistanceMeters += parseFloat(distNode.textContent);
      if (calNode) result.calories += parseInt(calNode.textContent, 10);
      
      if (maxSpeedNode) {
        // MaximumSpeed in TCX is m/s. Omrekenen naar km/h: m/s * 3.6
        const speedKmh = parseFloat(maxSpeedNode.textContent) * 3.6;
        if (speedKmh > result.maxSpeedKmh) {
          result.maxSpeedKmh = parseFloat(speedKmh.toFixed(1));
        }
      }
    });

    // 3. Loop door de Trackpoints voor gedetailleerde sensordata en hoogteprofielen
    const trackpoints = xmlDoc.querySelectorAll("Trackpoint");
    let prevAltitude = null;

    trackpoints.forEach(tp => {
      // Coördinaten
      const latNode = tp.querySelector("LatitudeDegrees");
      const lngNode = tp.querySelector("LongitudeDegrees");
      const altNode = tp.querySelector("AltitudeMeters");
      const hrNode = tp.querySelector("HeartRateBpm Value");
      const cadNode = tp.querySelector("Cadence");
      const wattNode = tp.querySelector("Watts"); // Garmin Power Extension

      const lat = latNode ? parseFloat(latNode.textContent) : null;
      const lng = lngNode ? parseFloat(lngNode.textContent) : null;
      const alt = altNode ? parseFloat(altNode.textContent) : null;

      if (lat !== null && lng !== null) {
        result.coordinates.push({ lat, lng, alt });
      }

      // Hoogte (stijgingsmeters berekenen)
      if (alt !== null) {
        if (prevAltitude !== null && alt > prevAltitude) {
          result.totalAscentMeters += (alt - prevAltitude);
        }
        prevAltitude = alt;
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
        if (cad > 0) { // Enkel trappende cadans meetellen
          cadenceSum += cad;
          cadenceCount++;
        }
      }

      // Vermogen (Power in Watts)
      if (wattNode) {
        const watt = parseInt(wattNode.textContent, 10);
        powerSum += watt;
        powerCount++;
      } else {
        // Soms zit power in een Extension tag
        const extWatts = tp.querySelector("Extensions Watts");
        if (extWatts) {
          const watt = parseInt(extWatts.textContent, 10);
          powerSum += watt;
          powerCount++;
        }
      }
    });

    // Bereken gemiddeldes
    if (result.totalTimeSeconds > 0) {
      // Afstand in km / tijd in uren
      const hours = result.totalTimeSeconds / 3600;
      const distanceKm = result.totalDistanceMeters / 1000;
      result.avgSpeedKmh = parseFloat((distanceKm / hours).toFixed(1));
    }

    if (heartRateCount > 0) {
      result.avgHeartRate = Math.round(heartRateSum / heartRateCount);
    }
    if (cadenceCount > 0) {
      result.avgCadence = Math.round(cadenceSum / cadenceCount);
    }
    if (powerCount > 0) {
      result.avgPowerWatts = Math.round(powerSum / powerCount);
    }

    // Afronden stijgingsmeters
    result.totalAscentMeters = Math.round(result.totalAscentMeters);

    // Berekende velden
    result.distanceKm = parseFloat((result.totalDistanceMeters / 1000).toFixed(2));
    result.durationFormatted = this.formatDuration(result.totalTimeSeconds);

    // 4. Rider Score berekenen
    result.riderScore = this.calculateRiderScore(result);

    return result;
  }

  /**
   * Berekent een Rider Score op basis van afstand, stijgingsmeters, gemiddelde snelheid en vermogen.
   * @param {Object} ride 
   * @returns {number} Score van 1 tot 1000
   */
  static calculateRiderScore(ride) {
    const distanceKm = ride.distanceKm || 0;
    const ascentMeters = ride.totalAscentMeters || 0;
    const avgSpeed = ride.avgSpeedKmh || 0;
    const avgPower = ride.avgPowerWatts || 0;
    const avgHr = ride.avgHeartRate || 140;

    // Basis scoreformule:
    // - Afstand geeft 3 punten per km
    // - Hoogtemeters geven 0.5 punten per meter (klimmen is zwaar!)
    // - Snelheid geeft een vermenigvuldiger: (gemiddelde snelheid / 25 km/h) * 100
    // - Vermogen (indien aanwezig) geeft extra bonuspunten
    let score = (distanceKm * 3.5) + (ascentMeters * 0.6);
    
    // Snelheidsfactor (wielrenners rijden gemiddeld tussen de 22 en 35 km/u)
    let speedFactor = 1.0;
    if (avgSpeed > 0) {
      speedFactor = Math.max(0.5, Math.min(2.0, avgSpeed / 27.5));
    }
    score = score * speedFactor;

    // Vermogensbonus (bijv. 200W geeft 50 extra punten)
    if (avgPower > 0) {
      score += (avgPower * 0.25);
    } else {
      // Schatting op basis van gewicht en snelheid als er geen wattagemeter is
      // Maar we kunnen ook gewoon hartslag gebruiken
      if (avgHr > 150) {
        score += 20; // Extra bonus voor intensieve inspanning
      }
    }

    // Afronden en binnen de range [10, 1000] houden
    return Math.max(10, Math.min(1000, Math.round(score)));
  }

  /**
   * Formatteert seconden naar UU:MM:SS
   * @param {number} totalSeconds 
   * @returns {string}
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
   * Tekent een minimalistische 2D-route op een HTML5 Canvas op basis van coördinaten.
   * @param {HTMLCanvasElement} canvas 
   * @param {Array} coordinates [{lat, lng}]
   * @param {string} strokeColor Kleur van de lijn
   */
  static drawRouteOnCanvas(canvas, coordinates, strokeColor = "#39ff14") {
    if (!canvas || !coordinates || coordinates.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Zoek uiterste coördinaten
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    coordinates.forEach(c => {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lng < minLng) minLng = c.lng;
      if (c.lng > maxLng) maxLng = c.lng;
    });

    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;

    // Voorkom delen door nul
    if (latRange === 0 || lngRange === 0) return;

    // Bepaal padding (10% aan elke kant)
    const padding = 20;
    const w = canvas.width - (padding * 2);
    const h = canvas.height - (padding * 2);

    // Om de verhoudingen correct te houden (aspect ratio)
    // breedtegraad (lat) en lengtegraad (lng) schalen
    const scale = Math.min(w / lngRange, h / latRange);
    const offsetX = padding + (w - (lngRange * scale)) / 2;
    const offsetY = padding + (h - (latRange * scale)) / 2;

    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Glow effect (premium styling)
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 8;

    coordinates.forEach((c, idx) => {
      // In cartesiaanse coördinaten is Y naar beneden, lat (breedtegraad) is naar boven.
      // Dus Y = canvas.height - y
      const x = offsetX + (c.lng - minLng) * scale;
      const y = canvas.height - (offsetY + (c.lat - minLat) * scale);

      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Teken start- en eindpunten
    ctx.shadowBlur = 0; // stop shadow voor de stippen
    
    // Start (Groen/Blauw stip)
    const startX = offsetX + (coordinates[0].lng - minLng) * scale;
    const startY = canvas.height - (offsetY + (coordinates[0].lat - minLat) * scale);
    ctx.beginPath();
    ctx.arc(startX, startY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "#00F0FF";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eind (Rood stip)
    const endIdx = coordinates.length - 1;
    const endX = offsetX + (coordinates[endIdx].lng - minLng) * scale;
    const endY = canvas.height - (offsetY + (coordinates[endIdx].lat - minLat) * scale);
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "#FF007F";
    ctx.fill();
    ctx.stroke();
  }

  static activeMap = null;

  /**
   * Tekent een route op een interactieve Leaflet kaart.
   * @param {string} mapDivId 
   * @param {Array} coordinates [{lat, lng}]
   * @param {string} strokeColor 
   */
  static drawRouteOnLeaflet(mapDivId, coordinates, strokeColor = "#d4ff00") {
    if (!coordinates || coordinates.length === 0) return;
    if (typeof L === 'undefined') {
      console.error("Leaflet is niet geladen.");
      return;
    }

    const latLngs = coordinates.map(c => [c.lat, c.lng]);

    try {
      // 1. Initialiseer kaart als dat nog niet is gebeurd
      if (!this.activeMap) {
        this.activeMap = L.map(mapDivId, {
          zoomControl: true,
          attributionControl: false
        });

        // Voeg een donkere kaartstijl toe (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(this.activeMap);
      } else {
        // Als de kaart al bestaat, wis alle bestaande polyline en marker lagen
        this.activeMap.eachLayer(layer => {
          if (layer instanceof L.Polyline || layer instanceof L.Marker) {
            this.activeMap.removeLayer(layer);
          }
        });
      }

      // 2. Teken de route polyline
      const polyline = L.polyline(latLngs, {
        color: strokeColor,
        weight: 4,
        opacity: 0.95
      }).addTo(this.activeMap);

      // 3. Zoom de kaart automatisch naar de route grenzen
      this.activeMap.fitBounds(polyline.getBounds(), { padding: [20, 20] });

      // 4. Voeg start- en eindmarkers toe
      const startPoint = latLngs[0];
      const endPoint = latLngs[latLngs.length - 1];

      // Custom markers met CSS styling
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

      // Zorg dat Leaflet de layout ververst (voorkomt grijze vlakken als de map in een verborgen element zat)
      setTimeout(() => {
        if (this.activeMap) this.activeMap.invalidateSize();
      }, 200);

    } catch (e) {
      console.error("Fout bij tekenen Leaflet routekaart:", e);
    }
  }

  /**
   * Genereert een mock TCX-bestand voor testdoeleinden.
   * @returns {string} XML string van een mock rit
   */
  static generateMockTcx() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-06-03T09:00:00Z</Id>
      <Lap StartTime="2026-06-03T09:00:00Z">
        <TotalTimeSeconds>7200.0</TotalTimeSeconds>
        <DistanceMeters>60000.0</DistanceMeters>
        <MaximumSpeed>13.8</MaximumSpeed>
        <Calories>1450</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          <Trackpoint>
            <Time>2026-06-03T09:00:00Z</Time>
            <Position>
              <LatitudeDegrees>51.0504</LatitudeDegrees>
              <LongitudeDegrees>3.7228</LongitudeDegrees>
            </Position>
            <AltitudeMeters>8.0</AltitudeMeters>
            <DistanceMeters>0.0</DistanceMeters>
            <HeartRateBpm><Value>110</Value></HeartRateBpm>
            <Cadence>80</Cadence>
            <Extensions>
              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                <Watts>160</Watts>
              </TPX>
            </Extensions>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-06-03T09:30:00Z</Time>
            <Position>
              <LatitudeDegrees>51.1200</LatitudeDegrees>
              <LongitudeDegrees>3.8500</LongitudeDegrees>
            </Position>
            <AltitudeMeters>45.0</AltitudeMeters>
            <DistanceMeters>15000.0</DistanceMeters>
            <HeartRateBpm><Value>145</Value></HeartRateBpm>
            <Cadence>92</Cadence>
            <Extensions>
              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                <Watts>210</Watts>
              </TPX>
            </Extensions>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-06-03T10:00:00Z</Time>
            <Position>
              <LatitudeDegrees>51.0800</LatitudeDegrees>
              <LongitudeDegrees>3.9800</LongitudeDegrees>
            </Position>
            <AltitudeMeters>120.0</AltitudeMeters>
            <DistanceMeters>35000.0</DistanceMeters>
            <HeartRateBpm><Value>160</Value></HeartRateBpm>
            <Cadence>95</Cadence>
            <Extensions>
              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                <Watts>245</Watts>
              </TPX>
            </Extensions>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-06-03T10:30:00Z</Time>
            <Position>
              <LatitudeDegrees>50.9900</LatitudeDegrees>
              <LongitudeDegrees>3.8200</LongitudeDegrees>
            </Position>
            <AltitudeMeters>35.0</AltitudeMeters>
            <DistanceMeters>50000.0</DistanceMeters>
            <HeartRateBpm><Value>138</Value></HeartRateBpm>
            <Cadence>88</Cadence>
            <Extensions>
              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                <Watts>185</Watts>
              </TPX>
            </Extensions>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-06-03T11:00:00Z</Time>
            <Position>
              <LatitudeDegrees>51.0504</LatitudeDegrees>
              <LongitudeDegrees>3.7228</LongitudeDegrees>
            </Position>
            <AltitudeMeters>8.0</AltitudeMeters>
            <DistanceMeters>60000.0</DistanceMeters>
            <HeartRateBpm><Value>125</Value></HeartRateBpm>
            <Cadence>85</Cadence>
            <Extensions>
              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                <Watts>150</Watts>
              </TPX>
            </Extensions>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
  }
}
// Exporten naar global scope zodat index.html/app.js erbij kunnen
window.TcxParser = TcxParser;
