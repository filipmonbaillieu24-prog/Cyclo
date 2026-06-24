// Cyclo - Advanced Activity Data Pipeline

/**
 * Standardizes activity data from different sources (Strava, Garmin, In-App / Local parsers)
 * into the uniform Cyclo format.
 * 
 * @param {Object} params
 * @param {string} params.source - 'Strava' | 'Garmin' | 'In-App'
 * @param {Object} params.rawData - The raw API JSON or file parsed object
 * @param {Object} [params.streams] - Raw streaming data (e.g. time, latlng, altitude, heartrate, watts, cadence)
 * @returns {Object} Normalized activity object
 */
export function normalizeActivity({ source, rawData, streams = {} }) {
  let activity_id = '';
  let start_time = new Date().toISOString();
  let name = 'Activiteit';
  let distance_meters = 0;
  let duration_seconds = 0;
  let total_elevation_gain = 0;
  let avg_hr = null;
  let avg_power = null;

  // Ensure arrays exist for streams
  const normalizedStreams = {
    time: streams.time || [],
    latlng: streams.latlng || [],
    altitude: streams.altitude || [],
    heartrate: streams.heartrate || [],
    watts: streams.watts || [],
    cadence: streams.cadence || []
  };

  if (source === 'Strava') {
    activity_id = String(rawData.id || `strava-${Date.now()}`);
    start_time = rawData.start_date || new Date().toISOString();
    name = rawData.name || 'Strava Rit';
    distance_meters = rawData.distance || 0;
    duration_seconds = rawData.moving_time || rawData.elapsed_time || 0;
    total_elevation_gain = rawData.total_elevation_gain || 0;
    avg_hr = rawData.has_heartrate ? Math.round(rawData.average_heartrate) : null;
    avg_power = rawData.device_watts ? Math.round(rawData.average_watts) : null;
  } else if (source === 'Garmin') {
    activity_id = String(rawData.activityId || rawData.id || `garmin-${Date.now()}`);
    start_time = rawData.startTimeLocal || rawData.startTimeGMT || new Date().toISOString();
    name = rawData.activityName || 'Garmin Rit';
    distance_meters = rawData.distance || 0;
    duration_seconds = rawData.duration || rawData.movingDuration || 0;
    total_elevation_gain = rawData.elevationGain || 0;
    avg_hr = rawData.averageHeartRateInBeatsPerMinute || null;
    avg_power = rawData.averagePowerInWatts || null;
  } else {
    // In-App / GPX / TCX / FIT Parser local files
    activity_id = rawData.activity_id || `inapp-${Date.now()}`;
    start_time = rawData.startTime ? new Date(rawData.startTime).toISOString() : new Date().toISOString();
    name = rawData.name || 'In-App Rit';
    distance_meters = (rawData.distanceKm || 0) * 1000;
    duration_seconds = rawData.totalTimeSeconds || 0;
    total_elevation_gain = rawData.totalAscentMeters || 0;
    avg_hr = rawData.avgHeartRate || null;
    avg_power = rawData.avgPowerWatts || null;
    
    // Ingest streams if available on rawData
    if (rawData.coordinates && rawData.coordinates.length > 0) {
      normalizedStreams.latlng = rawData.coordinates.map(c => [c.lat, c.lng]);
      normalizedStreams.altitude = rawData.coordinates.map(c => c.alt || 0);
    }
  }

  // Derive averages from streams if not explicitly present in rawData summary
  if (!avg_hr && normalizedStreams.heartrate.length > 0) {
    const validHr = normalizedStreams.heartrate.filter(h => h > 0);
    if (validHr.length > 0) {
      avg_hr = Math.round(validHr.reduce((s, x) => s + x, 0) / validHr.length);
    }
  }
  if (!avg_power && normalizedStreams.watts.length > 0) {
    const validWatts = normalizedStreams.watts.filter(w => w >= 0);
    if (validWatts.length > 0) {
      avg_power = Math.round(validWatts.reduce((s, x) => s + x, 0) / validWatts.length);
    }
  }

  return {
    activity_id,
    source,
    name,
    start_time,
    summary: {
      distance_meters,
      duration_seconds,
      total_elevation_gain
    },
    streams: normalizedStreams,
    computed: {
      avg_heart_rate: avg_hr,
      avg_power_watts: avg_power
    }
  };
}

/**
 * Transforms a normalized activity object into the schema format of public.activities.
 * 
 * @param {Object} normalized - Normalized activity from normalizeActivity
 * @param {string} userId - Supabase user UID
 * @returns {Object} Database insertion payload
 */
export function mapToDatabaseSchema(normalized, userId) {
  const distKm = parseFloat((normalized.summary.distance_meters / 1000).toFixed(2));
  const durSecs = normalized.summary.duration_seconds || 1;
  const hours = durSecs / 3600;
  const avgSpeed = parseFloat((distKm / hours).toFixed(1)) || 0;

  // Construct coordinates from streams
  const coordinates = [];
  const { latlng, altitude } = normalized.streams;
  if (latlng && latlng.length > 0) {
    for (let i = 0; i < latlng.length; i++) {
      const coord = latlng[i];
      const lat = Array.isArray(coord) ? coord[0] : (coord.lat || coord.latitude);
      const lng = Array.isArray(coord) ? coord[1] : (coord.lng || coord.longitude);
      const alt = altitude && altitude[i] !== undefined ? altitude[i] : null;
      if (lat !== undefined && lng !== undefined) {
        coordinates.push({ lat, lng, alt });
      }
    }
  }

  // Calculate Rider Score
  let score = 0;
  const metrics = {
    distanceKm: distKm,
    totalTimeSeconds: durSecs,
    totalAscentMeters: Math.round(normalized.summary.total_elevation_gain),
    avgSpeedKmh: avgSpeed,
    avgHeartRate: normalized.computed.avg_heart_rate,
    avgPowerWatts: normalized.computed.avg_power_watts,
    coordinates
  };

  if (typeof window !== 'undefined' && window.ActivityParser && typeof window.ActivityParser.calculateRiderScore === 'function') {
    score = window.ActivityParser.calculateRiderScore(metrics);
  } else {
    // Basic fallback formula for serverless context
    score = Math.round((distKm * 2) + (avgSpeed * 1.5));
    if (metrics.avgPowerWatts) {
      score += Math.round(metrics.avgPowerWatts * 0.5);
    }
  }

  return {
    user_id: userId,
    name: normalized.name,
    date: normalized.start_time,
    distance_km: distKm,
    duration_secs: durSecs,
    ascent_m: Math.round(normalized.summary.total_elevation_gain),
    avg_speed_kmh: avgSpeed,
    avg_heart_rate: normalized.computed.avg_heart_rate,
    avg_power_watts: normalized.computed.avg_power_watts,
    rider_score: score,
    coordinates: coordinates
  };
}
