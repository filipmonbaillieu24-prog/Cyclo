// api/auth/strava.js
// Vercel Serverless Function to handle Strava OAuth2 redirection, code exchange, and token persistence.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://znnuvfhtyfjsxwssdkqc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_V4C4Mu-_M9upY-cbDpYeyg_EuSgqPmq';

module.exports = async (req, res) => {
  const { code, state: userId, userId: directUserId } = req.query;
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const redirectUri = `${protocol}://${host}/api/auth/strava`;

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  const isMockMode = !clientId || !clientSecret || clientId === 'placeholder';

  try {
    // ─── STEP 1: Redirection Trigger from Frontend ───
    if (!code && (userId || directUserId)) {
      const activeUserId = userId || directUserId;
      if (isMockMode) {
        console.log(`[Strava OAuth] Mock Mode Active. Redirecting back to mock exchange for user: ${activeUserId}`);
        return res.redirect(`${redirectUri}?code=mock_strava_code_2026&state=${activeUserId}`);
      } else {
        const authorizeUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=activity:read_all&state=${activeUserId}`;
        return res.redirect(authorizeUrl);
      }
    }

    // ─── STEP 2: Handle OAuth Authorization Code Callback ───
    if (code && userId) {
      let tokenData = {};

      if (isMockMode || code === 'mock_strava_code_2026') {
        // Simulated token details
        tokenData = {
          access_token: 'mock_strava_access_token_xyz',
          refresh_token: 'mock_strava_refresh_token_abc',
          expires_at: Math.floor(Date.now() / 1000) + 21600, // 6 hours
          athlete: { id: 'athlete_mock_filip' }
        };
      } else {
        // Exchange code for real tokens
        const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code'
          })
        });

        if (!tokenResponse.ok) {
          const errText = await tokenResponse.text();
          console.error('[Strava OAuth] Token exchange error:', errText);
          return res.status(500).send(`Token exchange failed: ${errText}`);
        }

        tokenData = await tokenResponse.json();
      }

      // Upsert tokens in Supabase user_integrations table
      const expiresAtDate = new Date(tokenData.expires_at * 1000).toISOString();
      const athleteId = String(tokenData.athlete?.id || '');

      const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_integrations`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_id: userId,
          strava_connected: true,
          strava_access_token: tokenData.access_token,
          strava_refresh_token: tokenData.refresh_token,
          strava_expires_at: expiresAtDate,
          strava_athlete_id: athleteId,
          updated_at: new Date().toISOString()
        })
      });

      if (!dbResponse.ok) {
        const dbErr = await dbResponse.text();
        console.error('[Strava OAuth] Database update failed:', dbErr);
        // Continue even if database RLS fails (user redirect experience is preserved)
      }

      // Redirect user back to the profile settings area
      return res.redirect(`${protocol}://${host}/index.html?strava=connected`);
    }

    // Invalid parameters
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing OAuth parameters (code/state/userId)' });

  } catch (err) {
    console.error('[Strava OAuth] Internal Server Error:', err);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
};
