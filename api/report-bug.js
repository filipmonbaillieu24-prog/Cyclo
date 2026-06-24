// api/report-bug.js
// Vercel Serverless Function to proxy bug reports to GitHub Issues securely.

module.exports = async (req, res) => {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are allowed.' });
  }

  try {
    const { id, timestamp, user_input, system_metadata, status, assigned_to, image_data, image_filename } = req.body;

    // Validate required fields
    if (!id || !user_input || !system_metadata) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid payload. Missing bug reporting parameters.' });
    }

    // 2. Check for GITHUB_TOKEN in environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn("GITHUB_TOKEN is missing on Vercel environment variables. Falling back to local logging.");
      return res.status(500).json({
        error: 'GITHUB_TOKEN_MISSING',
        message: 'GitHub token is not configured on Vercel project settings.'
      });
    }

    // 2b. If image attachment is present, upload it to GitHub contents first
    let attachmentMarkdown = '';
    if (image_data && image_filename) {
      try {
        const uploadUrl = `https://api.github.com/repos/filipmonbaillieu24-prog/Cyclo/contents/bug-reports/images/${id}_${encodeURIComponent(image_filename)}`;
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Cyclo-Bug-Reporter-Vercel-Proxy'
          },
          body: JSON.stringify({
            message: `Upload bug screenshot for ticket ${id}`,
            content: image_data,
            branch: 'main'
          })
        });

        if (uploadResponse.ok) {
          const rawUrl = `https://raw.githubusercontent.com/filipmonbaillieu24-prog/Cyclo/main/bug-reports/images/${id}_${encodeURIComponent(image_filename)}`;
          attachmentMarkdown = `\n\n## Attachment\n![Screenshot](${rawUrl})`;
        } else {
          const errText = await uploadResponse.text();
          console.warn("GitHub content upload failed:", errText);
        }
      } catch (uploadErr) {
        console.warn("Error during screenshot upload:", uploadErr.message);
      }
    }

    // 3. Format GitHub Issue body in Markdown
    const markdownBody = `
# [BUG] ${user_input.title}

- **Ticket ID:** \`${id}\`
- **Timestamp:** \`${timestamp}\`
- **Category:** \`${user_input.category}\`
- **Priority:** \`${user_input.priority}\`
- **Status:** \`${status}\`
- **Assigned to:** \`${assigned_to}\`

## Steps to Reproduce
${user_input.steps_to_reproduce.split('\n').map(line => `> ${line}`).join('\n')}

## System Metadata
- **Current Page:** \`${system_metadata.current_page}\`
- **OS:** \`${system_metadata.os || 'Unknown'}\`
- **Screen Resolution:** \`${system_metadata.screen_resolution || 'Unknown'}\`
- **User Agent:** \`${system_metadata.user_agent}\`

## App State Snapshot
\`\`\`json
${JSON.stringify(system_metadata.app_state_snapshot, null, 2)}
\`\`\`

## Console Logs (Last 15 lines)
\`\`\`text
${system_metadata.console_logs && system_metadata.console_logs.length > 0 
  ? system_metadata.console_logs.join('\n') 
  : 'Geen console logs geregistreerd.'}
\`\`\`${attachmentMarkdown}
    `.trim();

    // 4. Send request to GitHub API
    // Owner: filipmonbaillieu24-prog
    // Repo: Cyclo
    const githubUrl = 'https://api.github.com/repos/filipmonbaillieu24-prog/Cyclo/issues';
    
    const githubResponse = await fetch(githubUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Cyclo-Bug-Reporter-Vercel-Proxy'
      },
      body: JSON.stringify({
        title: `[${id}] ${user_input.category}: ${user_input.title}`,
        body: markdownBody,
        labels: ['bug', 'google-antigravity']
      })
    });

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error(`GitHub API returned error status ${githubResponse.status}:`, errorText);
      return res.status(githubResponse.status).json({
        error: 'GITHUB_API_ERROR',
        message: `Fout bij koppelen met GitHub: ${githubResponse.statusText}`,
        details: errorText
      });
    }

    const issueData = await githubResponse.json();

    // 5. Return success response
    return res.status(201).json({
      success: true,
      id: id,
      issue_number: issueData.number,
      issue_url: issueData.html_url
    });

  } catch (error) {
    console.error("Internal Server Error in report-bug serverless function:", error);
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Er is een interne serverfout opgetreden bij het verwerken van het bugrapport.',
      details: error.message
    });
  }
};
