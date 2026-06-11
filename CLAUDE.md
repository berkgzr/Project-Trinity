# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spy AI — a self-hosted website technology detector (like BuiltWith/Wappalyzer) focused on marketing & analytics platforms. Plain Node.js (CommonJS), no build step, no test suite, no linter.

## Commands

```bash
npm install              # install dependencies
npm run install-browser  # one-time: install Playwright Chromium
npm start                # run server at http://localhost:3000
npm run dev              # run with auto-reload (node --watch)
```

Configuration via `.env` (copy from `.env.example`): `PORT`, `HEADLESS`, `CRAWL_TIMEOUT_MS`.

There are no tests or lint scripts. Verify changes by running the server and POSTing to `/analyze` (e.g. `curl -X POST localhost:3000/analyze -H 'Content-Type: application/json' -d '{"url":"example.com"}'`).

## Architecture

Three pieces, intentionally decoupled:

- **`backend/server.js`** — Express server. Exposes `POST /analyze` (validates/normalizes the URL, calls `detect()`, classifies Playwright errors into user-friendly messages) and `GET /health`. Also serves `frontend/` statically with a catch-all to `index.html`.
- **`backend/detector.js`** — the detection engine. Launches headless Chromium via Playwright, navigates to the target URL (`networkidle`, tolerates timeout and continues with whatever loaded), then runs **5 detection methods** per fingerprint: script `src` regex (falls back to raw-HTML match), global JS variables (dot notation supported), cookie names (browser cookies + intercepted `Set-Cookie` headers; prefix matching only for names ≥4 chars or ending in a separator, to avoid false positives), DOM selectors, and intercepted network-request hostnames. Returns deduplicated matches with a primary evidence pick (Script URL > Network Request > first match).
- **`config/fingerprints.json`** — the platform database. **Adding/changing platform detection requires editing only this file — no code changes.** Each entry has `id`, `name`, `category`, `icon`, `color`, and `detectionRules` with the five rule arrays (`scriptPatterns`, `jsVariables`, `cookieNames`, `domSelectors`, `networkHosts`). Note `scriptPatterns` are regex strings (escape dots), while `networkHosts` are exact hostnames. An optional top-level `features` map (feature name → CSS selectors) enables feature-level detection: which product of a detected platform is active (e.g. Segmentify Search vs. Showcase). Not-detected features are reported explicitly (`detected: false`), and selectors only see the page-load DOM — interaction-mounted widgets can be missed.
- **`frontend/index.html`** — single-file UI with inline JS/CSS; calls `/analyze`.

## Conventions

- CommonJS (`require`/`module.exports`) throughout — do not introduce ESM.
- When adding a detection method in `detector.js`, also document it in the README's Detection Rules Reference table.
- Detection rules should err toward specificity: overly broad patterns (short cookie names, generic regexes) cause false positives across unrelated sites.
