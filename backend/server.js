/**
 * server.js
 * Express backend — exposes POST /analyze and GET /health endpoints.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { detect } = require('./detector');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the frontend from /frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate and normalize a URL string.
 * Adds https:// if no protocol is present.
 * @param {string} raw
 * @returns {{ valid: boolean, url?: string, error?: string }}
 */
function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'URL is required.' };
  }

  let urlStr = raw.trim();

  // Add protocol if missing
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    // Must have a valid hostname (at least one dot or localhost)
    if (!parsed.hostname || parsed.hostname === 'localhost') {
      return { valid: true, url: urlStr }; // allow localhost for testing
    }
    if (!parsed.hostname.includes('.')) {
      return { valid: false, error: 'Invalid URL: hostname must contain a dot.' };
    }
    return { valid: true, url: urlStr };
  } catch (_) {
    return { valid: false, error: 'Invalid URL format.' };
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /analyze
 * Body: { url: string }
 * Returns: { success: true, detections: [], meta: {} }
 *       or { success: false, error: string }
 */
app.post('/analyze', async (req, res) => {
  const { url: rawUrl } = req.body;

  // Validate URL
  const { valid, url, error: urlError } = normalizeUrl(rawUrl);
  if (!valid) {
    return res.status(400).json({ success: false, error: urlError });
  }

  console.log(`[analyze] Starting scan for: ${url}`);

  try {
    const result = await detect(url);

    console.log(
      `[analyze] Done — ${result.detections.length} platform(s) detected in ${result.meta.durationMs}ms`
    );

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[analyze] Error:`, err.message);

    // Classify common errors into user-friendly messages
    let message = 'An unexpected error occurred while analyzing the site.';

    if (err.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      message = 'Could not reach the site. Please check the URL and try again.';
    } else if (err.message.includes('net::ERR_CONNECTION_REFUSED')) {
      message = 'Connection refused. The site may be down.';
    } else if (err.message.includes('Timeout') || err.message.includes('timeout')) {
      message = 'The site took too long to respond. Try again or use a different URL.';
    } else if (err.message.includes('net::ERR_SSL')) {
      message = 'SSL/HTTPS error. The site may have a certificate issue.';
    }

    return res.status(500).json({ success: false, error: message });
  }
});

// Catch-all: serve the frontend for any other GET
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🕵️  Spy AI running at http://localhost:${PORT}\n`);
});
