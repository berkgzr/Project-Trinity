# 🕵️ Spy AI — Technology Detector

Detect which marketing & analytics platforms are running on any website. Similar to BuiltWith or Wappalyzer, but self-hosted and fully extensible.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install the headless browser (one-time)
npm run install-browser

# 3. Start the server
npm start
```

Then open **http://localhost:3000** in your browser.

---

## Detected Platforms

| Platform | Category |
|---|---|
| Insider | Marketing Automation & Personalization |
| Segmentify | Personalization & Recommendation |
| Salesforce Marketing Cloud | Marketing Automation |
| Braze | Customer Engagement |
| Klaviyo | Email & SMS Marketing |
| Emarsys | Marketing Automation |
| Adobe Experience Cloud | Marketing & Analytics Suite |
| MoEngage | Customer Engagement |
| CleverTap | Customer Engagement |
| Bloomreach | Personalization & Commerce |
| Mixpanel | Product Analytics |
| Amplitude | Product Analytics |
| Segment | Customer Data Platform |
| HubSpot | CRM & Marketing |
| Intercom | Customer Messaging |

---

## Adding a New Platform

Edit **`config/fingerprints.json`** and add a new entry. No code changes needed.

```json
{
  "id": "my_platform",
  "name": "My Platform",
  "category": "Analytics",
  "icon": "https://myplatform.com/favicon.ico",
  "color": "#FF5733",
  "detectionRules": {
    "scriptPatterns": ["myplatform\\.com", "mp-sdk\\.js"],
    "jsVariables":    ["MyPlatform", "window._mp"],
    "cookieNames":    ["mp_session", "mp_user"],
    "domSelectors":   ["[id*='myplatform']", "[data-mp]"],
    "networkHosts":   ["myplatform.com", "cdn.myplatform.com"]
  }
}
```

### Detection Rules Reference

| Field | What it matches |
|---|---|
| `scriptPatterns` | Regex patterns matched against `<script src>` attributes and raw HTML |
| `jsVariables` | Global JS variables checked in `window` (dot notation supported) |
| `cookieNames` | Cookie names (prefix matching supported, e.g. `AMCV_` matches `AMCV_abc123`) |
| `domSelectors` | CSS selectors checked with `document.querySelector` |
| `networkHosts` | Hostnames intercepted from all network requests |

---

## Environment Variables

Copy `.env.example` to `.env` to customize:

```
PORT=3000
HEADLESS=true
CRAWL_TIMEOUT_MS=30000
```

---

## Project Structure

```
spy-ai/
├── backend/
│   ├── server.js      # Express server & /analyze endpoint
│   └── detector.js    # Headless browser detection engine
├── config/
│   └── fingerprints.json  # Platform detection rules (the only file you need to edit)
├── frontend/
│   └── index.html     # Single-file UI
└── package.json
```
