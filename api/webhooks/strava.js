// api/webhooks/strava.js
// Vercel Serverless Function to receive Strava Webhook events (handshakes and activity uploads).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://znnuvfhtyfjsxwssdkqc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_V4C4Mu-_M9upY-cbDpYeyg_EuSgqPmq';

// Verification token chosen during subscription setup
const VERIFY_TOKEN = 'cyclo_strava_webhook_token';

module.exports = async (req, res) => {
  // ─── GET: Webhook Subscription Validation Handshake ───
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Strava Webhook] Handshake successful!');
      return res.status(200).json({ 'hub.challenge': challenge });
    }
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Verify token mismatch.' });
  }

  // ─── POST: Incomming Activity Event Notifications ───
  if (req.method === 'POST') {
    try {
      const { aspect_type, object_type, object_id, owner_id } = req.body;
      console.log(`[Strava Webhook] Received event: ${aspect_type} on ${object_type} id=${object_id} for athlete=${owner_id}`);

      // We only care about new activities
      if (aspect_type !== 'create' || object_type !== 'activity') {
        return res.status(200).json({ status: 'ignored' });
      }

      // 1. Locate user profile linked to this Strava Athlete ID
      const queryUrl = `${SUPABASE_URL}/rest/v1/user_integrations?strava_athlete_id=eq.${owner_id}&select=user_id,strava_access_token,strava_refresh_token,strava_expires_at`;
      const userRes = await fetch(queryUrl, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      });

      if (!userRes.ok) {
        console.error('[Strava Webhook] Failed to query user integrations:', await userRes.text());
        return res.status(500).json({ error: 'DB_QUERY_FAILED' });
      }

      const integrations = await userRes.json();
      if (integrations.length === 0) {
        console.warn(`[Strava Webhook] No user found for Strava athlete: ${owner_id}`);
        return res.status(200).json({ status: 'no_user_found' });
      }

      const integration = integrations[0];
      const userId = integration.user_id;

      // 2. Fetch Activity Details (Mock or Real)
      let rawActivity = {};
      const isMockAthlete = String(owner_id).startsWith('athlete_mock_');

      if (isMockAthlete || !process.env.STRAVA_CLIENT_ID) {
        // Generate simulated activity detail data
        console.log(`[Strava Webhook] Mock Ingestion Active. Generating mock activity for user: ${userId}`);
        const rideDate = new Date().toISOString();
        rawActivity = {
          id: object_id || Date.now(),
          name: 'Zondagsritje (Strava)',
          start_date: rideDate,
          distance: 52400, // 52.4 km
          moving_time: 7320, // ~2 hrs
          total_elevation_gain: 410,
          has_heartrate: true,
          average_heartrate: 138,
          device_watts: true,
          average_watts: 195
        };
      } else {
        // Retrieve fresh token (refresh if expired)
        let token = integration.strava_access_token;
        const expiresAt = new Date(integration.strava_expires_at).getTime();
        const isExpired = Date.now() >= expiresAt - 300000; // 5 min buffer

        if (isExpired) {
          console.log('[Strava Webhook] Access token expired, performing refresh...');
          const refreshRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: process.env.STRAVA_CLIENT_ID,
              client_secret: process.env.STRAVA_CLIENT_SECRET,
              refresh_token: integration.strava_refresh_token,
              grant_type: 'refresh_token'
            })
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            token = refreshData.access_token;
            // Update db with new tokens
            await fetch(`${SUPABASE_URL}/rest/v1/user_integrations?user_id=eq.${userId}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                strava_access_token: refreshData.access_token,
                strava_refresh_token: refreshData.refresh_token,
                strava_expires_at: new Date(refreshData.expires_at * 1000).toISOString()
              })
            });
            console.log('[Strava Webhook] Tokens updated successfully.');
          } else {
            console.error('[Strava Webhook] Token refresh failed:', await refreshRes.text());
          }
        }

        // Fetch activity from Strava API
        const actUrl = `https://www.strava.com/api/v3/activities/${object_id}`;
        const actRes = await fetch(actUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!actRes.ok) {
          console.error(`[Strava Webhook] Failed to fetch Strava activity details:`, await actRes.text());
          return res.status(500).json({ error: 'STRAVA_API_FAILED' });
        }

        rawActivity = await actRes.json();
      }

      // 3. Normalize Activity using Activity Pipeline logic (duplicated here for backend isolation)
      const distanceKm = parseFloat((rawActivity.distance / 1000).toFixed(2));
      const durSecs = rawActivity.moving_time || rawActivity.elapsed_time || 1;
      const hours = durSecs / 3600;
      const avgSpeed = parseFloat((distanceKm / hours).toFixed(1)) || 0;
      const avgHr = rawActivity.has_heartrate ? Math.round(rawActivity.average_heartrate) : null;
      const avgPower = rawActivity.device_watts ? Math.round(rawActivity.average_watts) : null;

      // Mock coordinates around Ghent, Belgium for Leaflet route display
      const coordinates = [
        { lat: 51.0504, lng: 3.7378, alt: 8 },
        { lat: 51.0580, lng: 3.7480, alt: 9 },
        { lat: 51.0620, lng: 3.7600, alt: 11 },
        { lat: 51.0650, lng: 3.7450, alt: 10 },
        { lat: 51.0504, lng: 3.7378, alt: 8 }
      ];

      // Calculate Rider Score
      const score = Math.round((distanceKm * 2) + (avgSpeed * 1.5)) + (avgPower ? Math.round(avgPower * 0.5) : 0);

      // Save activity directly to database
      const cleanName = rawActivity.name || 'Strava Ingest';
      const dbPayload = {
        user_id: userId,
        name: cleanName,
        date: rawActivity.start_date || new Date().toISOString(),
        distance_km: distanceKm,
        duration_secs: durSecs,
        ascent_m: Math.round(rawActivity.total_elevation_gain || 0),
        avg_speed_kmh: avgSpeed,
        avg_heart_rate: avgHr,
        avg_power_watts: avgPower,
        rider_score: score,
        coordinates: coordinates
      };

      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/activities`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(dbPayload)
      });

      if (!saveRes.ok) {
        console.error('[Strava Webhook] Failed to save activity to DB:', await saveRes.text());
        return res.status(500).json({ error: 'SAVE_ACTIVITY_FAILED' });
      }

      // Add entry to activity_feed
      const feedPayload = {
        user_id: userId,
        type: 'uploaded_activity',
        payload: {
          name: cleanName,
          distance_km: distanceKm,
          rider_score: score
        }
      };

      await fetch(`${SUPABASE_URL}/rest/v1/activity_feed`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedPayload)
      });

      console.log('[Strava Webhook] Activity successfully processed, persisted, and published to feed!');
      return res.status(201).json({ success: true, activity_id: object_id, user_id: userId });

    } catch (err) {
      console.error('[Strava Webhook] Error processing event:', err);
      return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
};
