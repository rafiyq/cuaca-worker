# Inspiration from rafiyq/cuaca & rafiyq/wilayah-worker

## Key Patterns to Adopt

### 1. Location Resolution via wilayah-worker API
Instead of hardcoded location map, use `https://api.wilayah.workers.dev/`:
- `GET /search?q=jakarta&limit=5` - Search by name
- `GET /nearest?lat=-6.17&lon=106.82&limit=1` - Reverse geocode
- `GET /code?q=31.71.03.1001` - Exact code lookup
- `GET /locate?lat=-6.17&lon=106.82` - Full admin hierarchy

### 2. Cloudflare GeoIP Headers
Auto-detect location from request headers:
- `CF-IPLatitude`, `CF-IPLongitude` - Client coordinates
- `CF-IPCountry`, `CF-IPRegion`, `CF-IPCity` - Admin info
- No client-side GPS needed!

### 3. BMKG Weather Warnings (CAP XML)
Endpoint: `https://api.bmkg.go.id/publik/peringatan-dini-cuaca?adm4=...`
- Parse CAP XML for alert polygons
- Match against user location
- Cache per-alert (15 min default)

### 4. Custom Indicator Format (Waybar-style)
Template: `{ICON} {t}°C` or `{weather_desc} {t}°C`
Placeholders: `t`, `hu`, `tcc`, `tp`, `ws`, `wd_deg`, `wd`, `weather_desc`, `weather_desc_en`, `vs_text`, `ICON`

### 5. Daemon/Caching Pattern
- Cron trigger to pre-fetch popular locations
- KV cache with TTL (10 min forecast, 15 min warnings)
- Reduces BMKG rate limit pressure

### 6. Statistics/Archival
- Store forecast history in R2/D1
- `cuaca stats` equivalent endpoint

---

## Implementation Plan

### Phase 1: Location Resolution
- [ ] Add `/resolve` endpoint using wilayah-worker API
- [ ] Auto-detect via CF-GeoIP headers
- [ ] Fallback to hardcoded map

### Phase 2: Weather Warnings
- [ ] Fetch BMKG peringatan-dini (CAP XML)
- [ ] Parse and filter by location
- [ ] Include in tooltip/terminal output

### Phase 3: Custom Format
- [ ] Add `?format={ICON} {t}°C` parameter
- [ ] Support all placeholders

### Phase 4: Caching & Cron
- [ ] KV binding for forecast cache
- [ ] Cron trigger for popular locations
- [ ] Cache warming

### Phase 5: History & Stats
- [ ] R2/D1 for historical data
- [ ] `/stats` endpoint

---

## API Endpoints to Add

| Endpoint | Description |
|----------|-------------|
| `GET /` | Terminal weather (auto-location via GeoIP) |
| `GET /:location` | Terminal weather by name/code |
| `GET /:location?format=3` | Short format |
| `GET /:location?format={ICON} {t}°C` | Custom format |
| `GET /api/forecast?adm4=...` | JSON forecast |
| `GET /api/warnings?adm4=...` | JSON warnings |
| `GET /api/resolve?q=jakarta` | Location search |
| `GET /api/nearest?lat=&lon=` | Reverse geocode |
| `GET /api/stats?adm4=...` | Historical stats |