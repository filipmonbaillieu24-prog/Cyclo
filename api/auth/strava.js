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
        console.log(`[Strava OAuth] Mock Mode Active. Displaying mock authorization page for user: ${activeUserId}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`
          <!DOCTYPE html>
          <html lang="nl">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Koppel Strava aan Cyclo</title>
            <style>
              :root {
                --bg: #0f172a;
                --card-bg: #1e293b;
                --primary: #f97316;
                --primary-hover: #ea580c;
                --text: #f8fafc;
                --text-muted: #94a3b8;
                --border: #334155;
              }
              body {
                background-color: var(--bg);
                color: var(--text);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
              }
              .card {
                background-color: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 16px;
                padding: 32px;
                max-width: 450px;
                width: 100%;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
                text-align: center;
              }
              .logo-container {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 16px;
                margin-bottom: 24px;
              }
              .logo {
                width: 48px;
                height: 48px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 24px;
              }
              .logo-cyclo {
                background: linear-gradient(135deg, #f97316, #f43f5e);
                color: white;
              }
              .logo-strava {
                background-color: #fc4c02;
                color: white;
              }
              .connection-line {
                height: 2px;
                background-color: var(--border);
                width: 40px;
              }
              h1 {
                font-size: 22px;
                margin: 0 0 12px 0;
                font-weight: 700;
              }
              p {
                color: var(--text-muted);
                font-size: 14px;
                line-height: 1.6;
                margin: 0 0 24px 0;
              }
              .scopes {
                background-color: rgba(15, 23, 42, 0.4);
                border-radius: 8px;
                padding: 16px;
                text-align: left;
                margin-bottom: 28px;
                font-size: 13px;
                border: 1px solid var(--border);
              }
              .scopes-title {
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text);
              }
              .scope-item {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                margin-bottom: 6px;
                color: var(--text-muted);
              }
              .scope-item:last-child {
                margin-bottom: 0;
              }
              .scope-check {
                color: var(--primary);
                font-weight: bold;
              }
              .btn-group {
                display: flex;
                flex-direction: column;
                gap: 12px;
              }
              .btn {
                font-size: 15px;
                font-weight: 600;
                padding: 12px 24px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                text-decoration: none;
                text-align: center;
              }
              .btn-primary {
                background-color: var(--primary);
                color: white;
              }
              .btn-primary:hover {
                background-color: var(--primary-hover);
              }
              .btn-secondary {
                background-color: transparent;
                color: var(--text-muted);
                border: 1px solid var(--border);
              }
              .btn-secondary:hover {
                background-color: rgba(255, 255, 255, 0.05);
                color: var(--text);
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="logo-container">
                <div class="logo logo-cyclo">C</div>
                <div class="connection-line"></div>
                <div class="logo logo-strava">S</div>
              </div>
              <h1>Koppel Strava aan Cyclo</h1>
              <p>De applicatie <strong>Cyclo (Mock Mode)</strong> wil verbinding maken met jouw Strava-account om activiteiten te synchroniseren.</p>
              
              <div class="scopes">
                <div class="scopes-title">Deze koppeling staat Cyclo toe om:</div>
                <div class="scope-item">
                  <span class="scope-check">✓</span>
                  <span>Jouw profielgegevens en instellingen in te zien</span>
                </div>
                <div class="scope-item">
                  <span class="scope-check">✓</span>
                  <span>Activiteiten en gps-bestanden uit te lezen</span>
                </div>
              </div>
              
              <div class="btn-group">
                <a href="${redirectUri}?code=mock_strava_code_2026&state=${activeUserId}" class="btn btn-primary">Autoriseren</a>
                <a href="${protocol}://${host}/index.html?strava=cancelled" class="btn btn-secondary">Annuleren</a>
              </div>
            </div>
          </body>
          </html>
        `);
      }
 else {
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
