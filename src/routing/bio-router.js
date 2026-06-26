export const bioRouter = {
  /**
   * Berekent de zonnestand (azimut en elevatie) op basis van locatie en tijdstip.
   * Benaderingsformule voor prestaties.
   */
  calculateSunPosition(lat, dateObj) {
    const d = dateObj || new Date();
    const hour = d.getHours() + d.getMinutes() / 60;
    
    // Azimut benadering: 6u = 90° (Oost), 12u = 180° (Zuid), 18u = 270° (West)
    const azimuth = ((hour - 6) * 15 + 90) % 360;
    
    // Elevatie benadering (maximaal op het middaguur)
    const declination = 23.45 * Math.sin((2 * Math.PI * (284 + 172)) / 365); // Zomerzonnewende benadering
    const hourAngle = (hour - 12) * 15;
    
    const latRad = (lat * Math.PI) / 180;
    const decRad = (declination * Math.PI) / 180;
    const hrRad = (hourAngle * Math.PI) / 180;
    
    const sinEl = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hrRad);
    const elevation = (Math.asin(sinEl) * 180) / Math.PI;
    
    return { azimuth, elevation: Math.max(0, elevation) };
  },

  /**
   * Berekent of een wegsegment in de slagschaduw ligt van bomen/gebouwen
   */
  calculateSegmentShade(coordA, coordB, sunPos, osmTreesAndBuildings = []) {
    if (sunPos.elevation <= 0) return 1.0; // Nacht/schemering = 100% donker/schaduw

    const segLat = (coordA.lat + coordB.lat) / 2;
    const segLng = (coordA.lng + coordB.lng) / 2;
    
    // Bereken wegrichting (bearing)
    const dLon = (coordB.lng - coordA.lng) * Math.PI / 180;
    const lat1 = coordA.lat * Math.PI / 180;
    const lat2 = coordB.lat * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    let shadowOverlap = 0.1; // basis schaduw (bijv. bermen)

    // Simuleer slagschaduw invloed op basis van nabijgelegen objecten
    (osmTreesAndBuildings || []).forEach(obj => {
      const dist = this.getDistance(segLat, segLng, obj.lat, obj.lng);
      if (dist < 50) { // object ligt dicht bij de weg
        const height = obj.height || (obj.type === 'tree' ? 12 : 8); // default hoogtes
        // Slagschaduw lengte = hoogte / tan(elevatie)
        const shadowLength = height / Math.tan((sunPos.elevation * Math.PI) / 180);
        
        // Hoek van schaduw = (azimut + 180) % 360
        const shadowAngle = (sunPos.azimuth + 180) % 360;
        
        // Als de schaduw lang genoeg is om de weg te bereiken
        if (shadowLength > dist) {
          // Check of de hoek van de schaduw de weg kruist
          const angleDiff = Math.abs(shadowAngle - bearing) % 180;
          if (angleDiff < 30 || angleDiff > 150) {
            shadowOverlap += 0.45; // Hoge schaduwoverlap
          } else {
            shadowOverlap += 0.20; // Gedeeltelijke schaduw
          }
        }
      }
    });

    return Math.min(1.0, shadowOverlap);
  },

  /**
   * Berekent de windbeschutting van een wegsegment
   */
  calculateWindShelter(coordA, coordB, windDirection, windSpeed, isUrbanOrForest = false) {
    if (windSpeed < 20) return 1.0; // Weinig wind = geen beschutting nodig

    // Bereken bearing van het segment
    const dLon = (coordB.lng - coordA.lng) * Math.PI / 180;
    const lat1 = coordA.lat * Math.PI / 180;
    const lat2 = coordB.lat * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    // Verschilhoek tussen windrichting en rijrichting
    const diff = Math.abs(bearing - windDirection) % 180;

    let shelterFactor = 0.2; // Standaard open weg = weinig beschutting (0.2)

    if (isUrbanOrForest) {
      shelterFactor += 0.6; // Gebouwen en bomen bieden veel zijwind beschutting
    }

    // Als de wind recht van voren of van achteren komt (diff < 20 of > 160),
    // is er minder zijdelingse windhinder
    if (diff < 20 || diff > 160) {
      shelterFactor += 0.15;
    }

    return Math.min(1.0, shelterFactor);
  },

  /**
   * Genereert de "Solar Route" door segmenten te analyseren en schaduw/wind scores toe te kennen
   */
  analyzeRouteExposure(coordinates, windDirection, windSpeed, dateObj) {
    const sunPos = this.calculateSunPosition(coordinates[0]?.lat || 51.0, dateObj);
    const analyzedSegments = [];

    // Mock een aantal bomen en gebouwen langs de route voor simulatie
    const mockObstacles = [];
    for (let i = 0; i < coordinates.length; i += 5) {
      if (coordinates[i]) {
        mockObstacles.push({
          lat: coordinates[i].lat + (Math.random() - 0.5) * 0.0003,
          lng: coordinates[i].lng + (Math.random() - 0.5) * 0.0003,
          type: Math.random() > 0.5 ? 'tree' : 'building',
          height: Math.random() > 0.5 ? 15 : 10
        });
      }
    }

    for (let i = 0; i < coordinates.length - 1; i++) {
      const p1 = coordinates[i];
      const p2 = coordinates[i + 1];
      const isUrban = Math.random() > 0.7; // 30% kans op beschut segment (bos/bebouwing)

      const shade = this.calculateSegmentShade(p1, p2, sunPos, mockObstacles);
      const shelter = this.calculateWindShelter(p1, p2, windDirection, windSpeed, isUrban);

      analyzedSegments.push({
        from: p1,
        to: p2,
        shadeScore: shade, // 0.0 = volle zon, 1.0 = diepe schaduw
        shelterScore: shelter, // 0.0 = vol aan de wind blootgesteld, 1.0 = winddicht beschut
        isShaded: shade > 0.5
      });
    }

    return {
      sunAzimuth: sunPos.azimuth,
      sunElevation: sunPos.elevation,
      segments: analyzedSegments
    };
  },

  getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }
};
