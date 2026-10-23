# cuaca (TypeScript)

Production Cloudflare Worker behind [cuaca](https://cuaca.wilayah.workers.dev) —
terminal-first weather for Indonesia, powered by BMKG. Part of the
[cuaca-worker monorepo](../README.md) (this implementation is production; `rust/` is parked).

[![typescript CI](https://github.com/rafiyq/cuaca-worker/actions/workflows/typescript.yml/badge.svg)](https://github.com/rafiyq/cuaca-worker/actions/workflows/typescript.yml)

```
$ curl https://cuaca.wilayah.workers.dev/Jakarta

Weather report: Kemayoran, Kemayoran

    \ . /        Cerah
   - .-. -       +32°C
  ‒ (   ) ‒      ↖ 13.0 km/h
   . `-᾿ .       54% humidity
    / ' \         0% rain

 Wed, Oct 22
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ 13:00        │ 16:00        │ 19:00        │ 22:00        │
│  \ . /  Cerah│  \ . /  Cerah│  \__/  Cerah │    *   Cerah │
...
```

## Endpoints

### Human-facing

| Endpoint | Description |
|----------|-------------|
| `GET /` | Auto-locate via Cloudflare GeoIP → terminal output |
| `GET /:location` | By name (`/Jakarta`), adm4 code (`/31.71.03.1001`), or `?adm4=`, `?lat=&lon=` |
| `GET /:location?format=3` | One-liner: `Kemayoran: ☀️ +32°C` |
| `GET /:location?format={ICON} {t}°C {weather_desc}` | Waybar/custom template |
| `GET /:location?format=prometheus` | Prometheus exposition (current conditions as gauges) |
| Browser (Accept: text/html) | Styled page: colored ASCII art, warnings, responsive 3-day grid |

Browsers get HTML; `curl`/`wget`/`httpie` get ANSI terminal output — same URL.

### JSON API

| Endpoint | Description |
|----------|-------------|
| `GET /api/forecast?adm4=31.71.03.1001` | 3-day forecast, 8 slots/day |
| `GET /api/warnings?adm4=...` | BMKG weather warnings (CAP XML parsed) |
| `GET /api/resolve?q=jakarta&limit=5` | Village search by name |
| `GET /api/nearest?lat=-6.17&lon=106.82&limit=1` | Nearest village to coordinates |
| `GET /api/locate?lat=&lon=` | Full admin hierarchy for coordinates |
| `GET /api/locations` | Example location codes |

### Custom format placeholders

`{ICON}` `{ICON_ASCII}` `{t}` `{temp}` `{hu}` `{tcc}` `{tp}` `{rain}` `{ws}` `{wd}`
`{weather_desc}` `{weather_desc_en}` `{condition}` `{desa}` `{kecamatan}` `{kotkab}` `{provinsi}`

## Response headers (observability)

```
X-Cuaca-Cache: MISS | MEMHIT | EDGEHIT | BYPASS
Server-Timing: upstream;dur=83, render;dur=1, cache;desc=MISS
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600
```

## Architecture

```
request ──▶ resolve location (WILAYAH service binding → api worker)
        │      cached 24h in-isolate (name/geo → adm4)
        ├─▶ cache: memory (5min) ──▶ Cache API per-colo (5min) ──▶ fetch
        │                                                        ├─ BMKG forecast (edge cache 5min)
        │                                                        └─ BMKG warnings (edge cache 15min)
        └─▶ render: ANSI terminal | styled HTML | short | prometheus | custom
```

- **Service binding**: production calls to `api.wilayah.workers.dev` go through
  the `WILAYAH` binding — same-account worker→worker fetches via the public
  URL bypass the target worker (Cloudflare same-zone behavior). Falls back to
  public fetch in local dev/CI where the binding isn't connected.
- **Two-layer response cache** keyed `adm4:view` — `/Jakarta`, `?adm4=` and
  GeoIP hits share artifacts. Custom `?format=` templates are never cached.
- **Weather codes** match real BMKG values: `0,1` sun · `2` partly · `3,4`
  cloud · `5,10,45` fog · `60,61` light rain · `63,80` heavy rain · `95,97` storm.

See [PERF.md](./PERF.md) and [LAYOUT.md](./LAYOUT.md) for details.

## Development

```bash
npm install --legacy-peer-deps
npx wrangler dev --local --port 8787   # no login needed
npm test                               # 12 render tests + 5 integration tests
```

## Deployment

Tag-triggered (`.github/workflows/deploy.yml`): push a `v*` tag → tests run
on the tagged commit → `wrangler deploy --tag <version>` ships it. Pushes to
`main` and PRs run CI only.

```bash
git tag -a v0.2.0 -m "Description" && git push origin v0.2.0
```

Local deploy (requires `wrangler login`): `npx wrangler deploy` from this directory.

## Data sources

- Forecast/warnings: [api.bmkg.go.id](https://api.bmkg.go.id)
- Locations: [wilayah-worker](https://github.com/rafiyq/wilayah-worker) via service binding
- Icons: ported from [cuaca-rs](https://github.com/rafiyq/cuaca-rs)

License: MIT — see [root LICENSE](../LICENSE).