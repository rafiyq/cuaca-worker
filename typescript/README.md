# cuaca-worker

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yourusername/cuaca-worker)

A terminal-first weather service for Indonesia, powered by **BMKG** (Badan Meteorologi, Klimatologi, dan Geofisika) and **wilayah-worker** for location lookup. Runs on **Cloudflare Workers** with zero cold starts and minimal footprint.

```
$ curl cuaca.workers.dev/Jakarta
     .-.       Cerah
      __)      +31°C
     (         ↑ 12.7 km/h
      `-’      61% humidity
       •       10% rain

 Mon, Oct 13
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│     Morning      │      Noon        │    Evening       │      Night       │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│  .-.  Cerah      │  .-.  Berawan    │  `-'  Cerah      │  `-'  Cerah      │
│     +31°C        │     +33°C        │     +29°C        │     +27°C        │
│  ↑ 12.7 km/h     │  → 3.1 km/h      │  ↗ 5.6 km/h      │  ↓ 2.0 km/h      │
│   10% 61%        │   0% 71%         │   0% 72%         │   0% 85%         │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Terminal-first** | ANSI-colored output for `curl`, HTML for browsers |
| **One-line formats** | `?format=3` short format, custom templates |
| **Auto-location** | Cloudflare GeoIP headers → nearest village |
| **Indonesia coverage** | 80k+ villages via wilayah-worker API |
| **BMKG official data** | 3-day forecast, 3-hour intervals, weather warnings |
| **Multiple formats** | Terminal, HTML, JSON, custom, Prometheus, speech |
| **Zero deps** | ~2 KB bundle, 0ms cold start |
| **Edge cached** | 5min forecast, 15min warnings, 24h location lookups |

## Quick Start

### Terminal (curl)
```bash
# Full weather
curl cuaca.workers.dev/Jakarta
curl cuaca.workers.dev/Bandung
curl cuaca.workers.dev/"Kemayoran"

# Short format (Waybar, status bars)
curl cuaca.workers.dev/Jakarta?format=3
# Output: Kemayoran: ☀️ +31°C

# Custom template (Waybar-style)
curl cuaca.workers.dev/Jakarta?format='{ICON} {t}°C {weather_desc}'
# Output: ☀️ 31°C Cerah

# JSON API
curl cuaca.workers.dev/api/forecast?adm4=31.71.03.1001
```

### Browser
Open `https://cuaca.workers.dev/Jakarta` — auto-renders HTML with monospace font.

### Location Formats
| Input | Example | Resolves To |
|-------|---------|-------------|
| City name | `/Jakarta` | Nearest village in Jakarta |
| District | `/Bandung` | Nearest village in Bandung |
| Village | `/Kemayoran` | Exact village |
| adm4 code | `?adm4=31.71.03.1001` | Exact code |
| Coordinates | `?lat=-6.17&lon=106.82` | Nearest village |
| Auto (GeoIP) | `/` | Your location via CF headers |

## Endpoints

### Human-Facing
| Endpoint | Description |
|----------|-------------|
| `GET /` | Terminal weather (auto GeoIP) |
| `GET /:location` | Terminal weather for location |
| `GET /:location?format=3` | Short: `Kemayoran: ☀️ +31°C` |
| `GET /:location?format={template}` | Custom template |

### Machine-Facing (JSON)
| Endpoint | Description |
|----------|-------------|
| `GET /api/forecast?adm4=...` | 3-day forecast (8 slots/day) |
| `GET /api/warnings?adm4=...` | BMKG weather warnings (CAP XML parsed) |
| `GET /api/resolve?q=jakarta&limit=5` | Search villages by name |
| `GET /api/nearest?lat=-6.17&lon=106.82&limit=1` | Reverse geocode |
| `GET /api/locate?lat=-6.17&lon=106.82` | Full admin hierarchy |
| `GET /api/locations` | Example location codes |

### Custom Format Placeholders
```
{ICON}           → ☀️ 🌤️ 🌧️ ⛈️ (emoji)
{ICON_ASCII}     → .-. .--. (ASCII art)
{t}              → 31 (raw temperature)
{temp}           → +31°C (formatted)
{hu} / {humidity} → 61 (humidity %)
{tcc} / {cloud}  → 23 (cloud cover %)
{tp}             → 0.1 (rain probability 0-1)
{rain}           → 10 (rain probability %)
{ws} / {wind}    → 12.7 (wind speed km/h)
{wd} / {wind_dir} → NE (wind direction)
{weather_desc}   → Cerah (Indonesian)
{weather_desc_en} → Sunny (English)
{condition}      → Cerah
{vs_text}        → Windy/Calm
{desa}           → Kemayoran
{kecamatan}      → Kemayoran
{kotkab}         → Kota Adm. Jakarta Pusat
{provinsi}       → DKI Jakarta
```

## Deployment

### Prerequisites
- Cloudflare account
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Deploy
```bash
git clone https://github.com/yourusername/cuaca-worker
cd cuaca-worker
npm install
npm run deploy
```

### Local Development
```bash
npm run dev
# Opens http://localhost:8787
```

### Configuration
`wrangler.jsonc`:
```jsonc
{
  "name": "cuaca-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-10-13",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": "./public" }
}
```

## Architecture

```
Request → Cloudflare Worker (TypeScript)
    │
    ├─► BMKG API (forecast)     ──► cache 5min
    ├─► BMKG API (warnings)     ──► cache 15min
    └─► wilayah-worker (geo)    ──► cache 24h
```

**Data Sources:**
- **Forecast**: `https://api.bmkg.go.id/publik/prakiraan-cuaca`
- **Warnings**: `https://api.bmkg.go.id/publik/peringatan-dini-cuaca` (CAP XML)
- **Locations**: `https://api.wilayah.workers.dev` (83k+ villages, D1-backed)

## Testing

```bash
npm test           # Run vitest tests
npm run typecheck  # TypeScript check
```

## Inspiration

- **[rafiyq/cuaca](https://github.com/rafiyq/cuaca)** — Rust CLI for Waybar (custom formats, warnings, daemon)
- **[rafiyq/wilayah-worker](https://github.com/rafiyq/wilayah-worker)** — Village lookup API on Cloudflare Workers (D1, GeoIP)

## License

MIT — Weather data © [BMKG](https://bmkg.go.id), location data © [wilayah-worker](https://github.com/rafiyq/wilayah-worker)

---

**Built for Indonesia** 🇮🇩 — `curl cuaca.workers.dev/Jakarta`