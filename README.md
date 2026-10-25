# cuaca-worker

[![typescript CI](https://github.com/rafiyq/cuaca-worker/actions/workflows/typescript.yml/badge.svg)](https://github.com/rafiyq/cuaca-worker/actions/workflows/typescript.yml)
[![rust CI](https://github.com/rafiyq/cuaca-worker/actions/workflows/ci-rust.yml/badge.svg)](https://github.com/rafiyq/cuaca-worker/actions/workflows/ci-rust.yml)

Terminal-first weather service for Indonesia, powered by **BMKG**
(Badan Meteorologi, Klimatologi, dan Geofisika) and **wilayah-worker**
for location lookup. Runs on **Cloudflare Workers** — zero cold starts,
zero dependencies, edge-cached.

```
$ curl https://cuaca.wilayah.workers.dev/Jakarta

Weather report: Kemayoran, Kemayoran

    {226}    \ . /        Cerah
    {226}   - .-. -       +32°C
    {226}  ‒ (   ) ‒      ↖ 13.0 km/h
    {226}   . `-᾿ .       54% humidity
    {226}    / ' \         0% rain

...
```

## Status

| Implementation | Path | Status |
|----------------|------|--------|
| **TypeScript** | [`typescript/`](./typescript) | ✅ **Production** — deploy with `wrangler deploy` |
| **Rust** | [`rust/`](./rust) | 🧪 Experimental — compiles, parked on a [wasm-bindgen toolchain issue](./rust/TOOLCHAIN_ISSUES.md) |

Both share the same product spec: BMKG codes, ASCII icons, endpoints,
caching semantics. The TypeScript version is the reference implementation.

## Structure

```
typescript/              # production Cloudflare Worker
├── src/
│   ├── index.ts         # route dispatch + scheduled handler
│   ├── cache.ts         # response cache (memory + edge)
│   ├── bmkg.ts          # BMKG forecast + warnings client
│   ├── wilayah.ts       # wilayah service binding + location resolution
│   ├── ai.ts            # AI report generation
│   ├── format.ts        # custom format templates
│   ├── openapi.ts       # OpenAPI 3.1 spec
│   ├── types.ts         # shared types
│   └── render.ts        # terminal + HTML + prometheus renderers
├── wrangler.jsonc
├── PERF.md              # performance plan & status
└── LAYOUT.md            # web UI wireframes
rust/                    # experimental workers-rs port (parked)
docs/
├── CHANGELOG.md          # release history
├── CONTRIBUTING.md       # dev setup, testing, releasing
└── history/              # archived design docs
```

## Quick start

```bash
# Terminal (curl)
curl https://cuaca.wilayah.workers.dev/                     # auto-locate via GeoIP
curl https://cuaca.wilayah.workers.dev/Jakarta              # by name
curl https://cuaca.wilayah.workers.dev/Jakarta?format=3     # one-liner
curl 'https://cuaca.wilayah.workers.dev/Jakarta?format={ICON} {t}°C {weather_desc}'   # Waybar
curl https://cuaca.wilayah.workers.dev/Jakarta?format=prometheus      # Prometheus metrics

# Browser — styled page with colored ASCII art, warnings, 3-day forecast

# JSON API
curl https://cuaca.wilayah.workers.dev/api/forecast?adm4=31.71.03.1001
curl https://cuaca.wilayah.workers.dev/api/resolve?q=jakarta&limit=5
```

Every response carries `X-Cuaca-Cache` (`MISS`/`MEMHIT`/`EDGEHIT`/`BYPASS`)
and `Server-Timing` — you can watch the cache layers work.

## Development

```bash
cd typescript
npm install
npx wrangler dev --local --port 8787   # no login needed
npm test                                # 15 tests
```

See [`typescript/README.md`](./typescript/README.md) for the full API,
format placeholders, and deployment guide.

## Data sources

- **Forecast**: [api.bmkg.go.id](https://api.bmkg.go.id) — official BMKG
- **Locations**: [wilayah-worker](https://github.com/rafiyq/wilayah-worker) — 83k+ Indonesian villages
- **Icons**: ported from [cuaca-rs](https://github.com/rafiyq/cuaca-rs)

## License

MIT — see [LICENSE](./LICENSE). Weather data © BMKG; location data © wilayah-worker.
