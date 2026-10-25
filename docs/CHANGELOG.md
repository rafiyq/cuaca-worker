# CHANGELOG

All notable changes to cuaca-worker. Tags trigger production deploys.

## v0.6.0 — AI reports + OpenAPI + English (2026-10-24)

- **`/api/ai-report`**: LLM weather summaries via Workers AI
  (brief/detailed/conversational styles, Indonesian language)
- **`/api/openapi.json`**: OpenAPI 3.1 spec for all endpoints
- **`?lang=en`**: English weather descriptions in terminal output
  (uses BMKG's `weather_desc_en` field)
- Cache key fix: `lang` appended to cache key so English and
  Indonesian responses cache independently

## v0.5.0 — Cron pre-warm (2026-10-24)

- Pre-warms 10 major Indonesian cities every 5 minutes
- Keeps BMKG upstream edge-cache warm (~32ms vs ~600ms cold fetch)
- Cron handler stores rendered terminal + HTML in isolate memory

## v0.4.0 — Search + PWA (2026-10-23)

- Location search in web UI: debounced autocomplete via
  `/api/resolve`, keyboard navigation (arrows + enter), themed dropdown
- PWA manifest: standalone display, "Add to home screen" on mobile

## v0.3.0 — Location detection (2026-10-23)

- `X-Cuaca-Location` + `X-Cuaca-Source` headers on every response
  (param/query/geoip/name/default)
- Terminal fallback note when default location is served
- Browser geolocation button in web UI (GPS/WiFi accuracy)
- "Last known location" hint from localStorage

## v0.2.0 — Prometheus + docs (2026-10-23)

- `?format=prometheus`: current conditions as labeled gauges
- README rewrite with real URLs, architecture docs, CI badges
- Custom `?format=` templates and `?format=3` verified live

## v0.1.3 — Rename (2026-10-23)

- Worker renamed from `cuaca-worker` to `cuaca`
- New URL: `cuaca.wilayah.workers.dev`

## v0.1.2 — Service binding + fixes (2026-10-22)

- WILAYAH service binding for same-account worker calls
  (same-zone fetches bypass the target worker)
- Location resolution moved inside try/catch (no more 1101 errors)
- Response caching: two-layer (memory + edge), keyed by adm4:view
- `X-Cuaca-Cache` + `Server-Timing` observability headers
- Skip warnings fetch for short/custom formats
- System monospace font stack (no Google Fonts request)

## v0.1.0 — First production deploy (2026-10-22)

- Terminal weather output (ANSI for curl, HTML for browser)
- ASCII weather icons (ported from cuaca-rs, correct BMKG codes)
- BMKG forecast + warnings (CAP XML parsing)
- Location resolution: explicit adm4 → lat/lon → GeoIP → name → default
- JSON API endpoints (forecast, warnings, resolve, nearest, locate)
- Custom format templates (Waybar-style placeholders)
- Tag-triggered CI/CD pipeline (test → deploy on v* tags)
- Monorepo: typescript/ (production) + rust/ (experimental)