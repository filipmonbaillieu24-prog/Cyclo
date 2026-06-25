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
          rainProb: data.clouds ? data.clouds.all : 0,
          condition: data.weather[0]?.main || 'Helder',
          isMock: false
        };
      }
    } catch (e) {
      console.warn('OpenWeatherMap API request mislukt, fallback naar Open-Meteo:', e);
    }
  }
  
  // Gratis Open-Meteo fallback (geen API key vereist, altijd actuele data)
  if (navigator.onLine) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,windspeed_10m,winddirection_10m,precipitation_probability,weathercode&timezone=auto`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const c = json.current;
        const wmoConditions = {
          0: 'Helder', 1: 'Helder', 2: 'Bewolkt', 3: 'Bewolkt',
          45: 'Mist', 48: 'Mist',
          51: 'Drizzle', 53: 'Drizzle', 55: 'Rain',
          61: 'Rain', 63: 'Rain', 65: 'Rain',
          71: 'Snow', 73: 'Snow', 75: 'Snow',
          80: 'Rain', 81: 'Rain', 82: 'Rain',
          95: 'Thunderstorm', 99: 'Thunderstorm'
        };
        return {
          temp: c.temperature_2m,
          windSpeedKmh: c.windspeed_10m,
          windDirection: c.winddirection_10m,
          rainProb: c.precipitation_probability || 0,
          condition: wmoConditions[c.weathercode] || 'Helder',
          isMock: false
        };
      }
    } catch (e) {
      console.warn('Open-Meteo request mislukt, gebruik vaste fallback:', e);
    }
  }
  
  // Laatste noodoplossing: vaste Belgische gemiddelden (offline of beide API's falen)
  return {
    temp: 14,
    windSpeedKmh: 15,
    windDirection: 225,
    rainProb: 30,
    condition: 'Bewolkt',
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
