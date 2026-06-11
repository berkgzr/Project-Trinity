/**
 * detector.js
 * Core detection engine — launches a headless browser, crawls the target URL,
 * and runs 5 detection methods against each fingerprint in the database.
 */

const { chromium } = require('playwright');
const fingerprints = require('../config/fingerprints.json');

const CRAWL_TIMEOUT = parseInt(process.env.CRAWL_TIMEOUT_MS || '30000', 10);
const HEADLESS = process.env.HEADLESS !== 'false';

/**
 * Main entry point.
 * @param {string} url - The target URL to analyze.
 * @returns {Promise<{ detections: Detection[], meta: Meta }>}
 */
async function detect(url) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // ── Collect intercepted network hostnames ──────────────────────────────────
  const networkHosts = new Set();
  const networkRequests = []; // { url, timestamp }
  page.on('request', (req) => {
    try {
      const host = new URL(req.url()).hostname;
      networkHosts.add(host);
      networkRequests.push({ url: req.url(), timestamp: Date.now() });
    } catch (_) {}
  });

  // ── Collect response cookies (Set-Cookie headers) ─────────────────────────
  const responseCookieNames = new Set();
  page.on('response', (res) => {
    const setCookie = res.headers()['set-cookie'];
    if (setCookie) {
      setCookie.split('\n').forEach((line) => {
        const name = line.split('=')[0].trim();
        if (name) responseCookieNames.add(name);
      });
    }
  });

  const startTime = Date.now();
  let htmlContent = '';

  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: CRAWL_TIMEOUT,
    });
  } catch (err) {
    // If networkidle times out, we still have whatever loaded — continue.
    if (!err.message.includes('Timeout')) throw err;
  }

  htmlContent = await page.content();

  // ── Collect browser cookies ────────────────────────────────────────────────
  const browserCookies = await context.cookies();
  const browserCookieNames = new Set(browserCookies.map((c) => c.name));

  // ── Collect all script src values from DOM ────────────────────────────────
  const scriptSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((s, i) => ({
      src: s.src,
      order: i,
    }))
  );

  // ── Run detection across all fingerprints ─────────────────────────────────
  const detections = [];

  for (const fp of fingerprints) {
    const matches = [];

    // 1. Script src pattern matching
    for (const pattern of fp.detectionRules.scriptPatterns) {
      const regex = new RegExp(pattern, 'i');
      for (const { src, order } of scriptSrcs) {
        if (regex.test(src)) {
          matches.push({
            method: 'Script URL',
            evidence: src,
            scriptOrder: order,
          });
          break; // one match per pattern is enough
        }
      }
      // Also check raw HTML (catches inline workers, dynamic imports, etc.)
      if (!matches.some((m) => m.method === 'Script URL')) {
        if (regex.test(htmlContent)) {
          matches.push({ method: 'HTML Pattern', evidence: pattern });
        }
      }
    }

    // 2. Global JS variable detection
    const jsVarResults = await page.evaluate((vars) => {
      return vars
        .filter((v) => {
          try {
            // Support dot notation: e.g. "adobe.target"
            const parts = v.replace('window.', '').split('.');
            let obj = window;
            for (const p of parts) {
              if (obj == null || !(p in obj)) return false;
              obj = obj[p];
            }
            return true;
          } catch (_) {
            return false;
          }
        })
        .map((v) => v);
    }, fp.detectionRules.jsVariables);

    for (const varName of jsVarResults) {
      matches.push({ method: 'JS Variable', evidence: `window.${varName.replace('window.', '')}` });
    }

    // 3. Cookie name matching (browser cookies + Set-Cookie headers)
    const allCookieNames = new Set([...browserCookieNames, ...responseCookieNames]);
    for (const cookieName of fp.detectionRules.cookieNames) {
      // Prefix matching (e.g. "AMCV_" matches "AMCV_abc123") is only safe for
      // sufficiently specific rules. Very short rules (e.g. "s") would otherwise
      // match unrelated cookies like "sync_cookie_csrf" and produce false
      // positives, so we require an exact match for them unless the rule clearly
      // ends in a separator that signals an intended prefix (e.g. "mp_").
      const allowPrefix =
        cookieName.length >= 4 || /[_\-.:]$/.test(cookieName);
      for (const actualName of allCookieNames) {
        const isMatch = allowPrefix
          ? actualName.startsWith(cookieName)
          : actualName === cookieName;
        if (isMatch) {
          matches.push({ method: 'Cookie', evidence: actualName });
          break;
        }
      }
    }

    // 4. DOM element / attribute scanning
    const domResults = await page.evaluate((selectors) => {
      return selectors.filter((sel) => {
        try {
          return document.querySelector(sel) !== null;
        } catch (_) {
          return false;
        }
      });
    }, fp.detectionRules.domSelectors);

    for (const sel of domResults) {
      matches.push({ method: 'DOM Element', evidence: sel });
    }

    // 5. Network request hostname matching
    for (const host of fp.detectionRules.networkHosts) {
      if (networkHosts.has(host)) {
        // Find the first matching request URL for display
        const req = networkRequests.find((r) => {
          try {
            return new URL(r.url).hostname === host;
          } catch (_) {
            return false;
          }
        });
        matches.push({
          method: 'Network Request',
          evidence: req ? req.url : host,
        });
        break;
      }
    }

    if (matches.length > 0) {
      // Deduplicate matches by method+evidence
      const seen = new Set();
      const uniqueMatches = matches.filter((m) => {
        const key = `${m.method}::${m.evidence}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Primary evidence: prefer Script URL or Network Request (most descriptive)
      const primary =
        uniqueMatches.find((m) => m.method === 'Script URL') ||
        uniqueMatches.find((m) => m.method === 'Network Request') ||
        uniqueMatches[0];

      detections.push({
        id: fp.id,
        name: fp.name,
        category: fp.category,
        icon: fp.icon,
        color: fp.color,
        detectedBy: primary.method,
        scriptUrl: primary.evidence,
        scriptOrder: primary.scriptOrder ?? null,
        allMatches: uniqueMatches,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  await browser.close();

  return {
    detections,
    meta: {
      url,
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalScripts: scriptSrcs.length,
      totalRequests: networkRequests.length,
    },
  };
}

module.exports = { detect };
