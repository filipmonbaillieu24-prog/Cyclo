// Cyclo - Meteorologische Route Optimalisatie en Weerservice
// Bevat API-calls, windhoek vectorberekeningen en kledingadvies logica

// ─── 1. WEERSGEGEVENS OPHALEN ─────────────────────

export async function fetchWeatherData(lat, lng) {
  // Gebruik de global window API key indien ingesteld, of fallback
  const apiKey = window.CYCLO_OPENWEATHER_API_KEY || '';
  
  if (apiKey && navigator.onLine) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
      );
      if (response.ok) {
        const data = await response.json();
        return {
          temp: data.main.temp,
          windSpeedKmh: data.wind.speed * 3.6, // m/s naar km/h
          windDirection: data.wind.deg,
          rainProb: data.clouds ? data.clouds.all : 0, // schatting op basis van bewolking
          condition: data.weather[0]?.main || 'Helder',
          isMock: false
        };
      }
    } catch (e) {
      console.warn('OpenWeatherMap API request mislukt, fallback naar simulator:', e);
    }
  }
  
  // Realistische mock weather fallback op basis van coördinaten (deterministisch maar natuurlijk)
  const seed = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  const rand = seed - Math.floor(seed);
  
  const temp = Math.round(13 + rand * 13); // 13°C tot 26°C
  const windSpeedKmh = Math.round(4 + rand * 26); // 4 tot 30 km/h
  const windDirection = Math.round(rand * 360); // 0 tot 360 graden
  const rainProb = Math.round(rand * 70); // 0 tot 70% neerslag
  
  let condition = 'Helder';
  if (rainProb > 45) condition = 'Regenachtig';
  else if (rainProb > 20) condition = 'Bewolkt';
  
  return {
    temp,
    windSpeedKmh,
    windDirection,
    rainProb,
    condition,
    isMock: true
  };
}


// ─── 2. GEVOELSTEMPERATUUR & KLEDINGMATRIX ─────────

export function calculateWindChill(temp, windKmh) {
  // Gevoelstemperatuur (wind chill) formule van JAG/TI is alleen geldig voor T <= 10°C en V >= 4.8 km/h.
  if (temp > 10 || windKmh < 4.8) {
    // Voor warmere omstandigheden koelt wind nog steeds iets af
    return Math.round(temp - (windKmh * 0.05));
  }
  const v = Math.pow(windKmh, 0.16);
  const chill = 13.12 + 0.6215 * temp - 11.37 * v + 0.3965 * temp * v;
  return Math.round(chill);
}

export function generateClothingAdvice(temp, windKmh, rainProbability) {
  const tFeel = calculateWindChill(temp, windKmh);
  
  if (tFeel > 20 && rainProbability < 30) {
    return {
      icon: '☀️',
      advice: 'Korte broek, kort shirt',
      items: ['Korte fietsbroek', 'Kort wielrenshirt', 'Zonnebril'],
      feelTemp: tFeel
    };
  } else if (tFeel >= 15 && rainProbability < 40) {
    return {
      icon: '🌤️',
      advice: 'Kort shirt + armstukken of licht windvest',
      items: ['Kort shirt', 'Afneembare armstukken', 'Licht windvest'],
      feelTemp: tFeel
    };
  } else if (tFeel >= 10 && rainProbability < 50) {
    return {
      icon: '⛅',
      advice: 'Lange fietstrui, windvest, kniestukken',
      items: ['Lang wielrenshirt', 'Windvest', 'Kniestukken', 'Lichte handschoenen'],
      feelTemp: tFeel
    };
  } else {
    return {
      icon: '🌧️',
      advice: 'Winteruitrusting / Waterdicht warm jack vereist',
      items: ['Thermoshirt', 'Waterafstotend winterjack', 'Lange winterbroek', 'Overschoenen', 'Winterhandschoenen'],
      feelTemp: tFeel
    };
  }
}


// ─── 3. VECTORRICHTING & WINDHOEK BEREKENING ───────

// Berekent de bearing (richting in graden) van segment (lat1, lon1) naar (lat2, lon2)
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return bearing;
}

// Berekent de relatieve windhoek ten opzichte van segment bearing en windrichting
// 0° = perfecte rugwind, 90° = zijwind, 180° = recht tegenwind
export function relativeWindAngle(segmentBearing, windDirection) {
  return Math.abs(((segmentBearing - windDirection + 180 + 360) % 360) - 180);
}

// Classificeert de windhoek
export function getWindClass(relAngle) {
  if (relAngle < 45) return 'tailwind';    // Rugwind
  if (relAngle > 135) return 'headwind';   // Tegenwind
  return 'crosswind';                      // Zijwind
}
