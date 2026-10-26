# AGENTS.md

Guidance for AI coding assistants working on this repository.

## What this is

`cuaca` is a terminal-first weather service for Indonesia, powered by BMKG
(Badan Meteorologi, Klimatologi, dan Geofisika). It runs on Cloudflare Workers.

- **Live at**: `https://cuaca.wilayah.workers.dev`
- **Production**: `typescript/` — deployed, feature-complete
- **Experimental**: `rust/` — builds, has core features, needs web UI parity
- **Repo**: `github.com/rafiyq/cuaca-worker` (public)

## File map

```
typescript/src/
├── index.ts      route dispatch, scheduled handler (entry point)
├── cache.ts       response cache (memory), resolution cache, serveWeatherView
├── bmkg.ts        BMKG forecast + warnings client, CAP XML parsing
├── wilayah.ts     wilayah service binding, location resolution chain
├── ai.ts          AI report generation (Workers AI)
├── format.ts      custom ?format= templates, helpers
├── openapi.ts     OpenAPI 3.1 spec
├── types.ts       shared API-layer types
└── render.ts      terminal + HTML + prometheus renderers, icons, emoji

rust/src/
├── lib.rs         route dispatch, serve_weather_view
├── cache.rs       per-isolate memory cache
├── bmkg.rs         BMKG client
├── wilayah.rs      wilayah client
├── ai.rs           AI reports (disabled)
└── render.rs       HTML renderer

.github/workflows/
├── typescript.yml  CI: test on push to main + PRs (path: typescript/**)
├── deploy.yml      Deploy: on v* tags (test → wrangler deploy)
└── ci-rust.yml     CI: cargo build on rust/** changes
```

## Critical gotchas (don't break these)

### 1. Same-zone worker fetches bypass the target worker

`cuaca.wilayah.workers.dev` and `api.wilayah.workers.dev` share the same
workers.dev zone. A fetch from one to the other via the public URL **does not
reach the target worker** — it returns 404. All production calls to the wilayah
API go through the `WILAYAH` service binding:

```jsonc
// typescript/wrangler.jsonc
"services": [{ "binding": "WILAYAH", "service": "api" }]
```

In `typescript/src/wilayah.ts`, `wilayahFetch()` tries the service binding first,
falls back to public fetch. The fallback path is used by local dev and CI
(where the binding isn't connected). **Do not remove the service binding or
the fallback.**

### 2. BMKG weather codes are not what you'd expect

The real BMKG codes are: `0, 1, 2, 3, 4, 5, 10, 45, 60, 61, 63, 80, 95, 97`.
**Not** 10–14 (those don't exist). Rain codes are `60, 61` (light), `63, 80`
(heavy), `95, 97` (thunderstorm). If you add icon mappings with the wrong codes,
rain will render as a sunny icon.

Verify against live data: `curl "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001"`

### 3. `strip = true` breaks the Rust build

Do not add `strip = true` to `rust/Cargo.toml` `[profile.release]`. It strips
the `reference-types` section from the wasm binary, which wasm-bindgen 0.2.129
requires for externref catch wrappers. This was the root cause of a multi-day
blocker. `wasm-opt` (run by worker-build) handles size optimization anyway.
See `rust/TOOLCHAIN_ISSUES.md`.

### 4. Cache keys include language

The response cache key is `"{adm4}:{view}"` where view can be `"terminal"`,
`"html"`, `"short"`, or `"terminal:en"` (when `?lang=en`). Without the `:en`
suffix, English responses poison the cache for Indonesian requests. If you add
new language params, extend the cache key accordingly.

### 5. Custom `?format=` templates are never cached

They're per-user templates (unbounded key space). The `serveWeatherView()`
function explicitly excludes the `"custom"` view from both cache layers.

## Deploy pipeline

```
push to main     → CI runs tests (typescript, rust) — NO deploy
push tag v0.x.y  → tests run → `wrangler deploy --tag v0.x.y` → live
PR               → tests run only
```

Never deploy from a PR or a push to main. Only tags.

## Testing

```bash
cd typescript
npm test
```

- `src/render.test.ts` — **unit tests, no network needed** (fixtures only)
- `src/index.test.ts` — **integration tests, need live APIs** (BMKG + wilayah)

If integration tests fail, check if the upstream APIs are reachable before
debugging code. They go down occasionally.

## Adding a new endpoint

1. Add the route handler in `typescript/src/index.ts`
2. Add the OpenAPI entry in `typescript/src/openapi.ts`
3. Add the endpoint to the 404 handler's `endpoints` array in `index.ts`
4. Add tests in `src/index.test.ts`
5. Update the endpoints table in `typescript/README.md`
6. If it needs the wilayah API, pass `env` through the call chain

## Adding a new weather icon or format

1. Add the icon data in `typescript/src/render.ts` (ASCII art + emoji table)
2. Use the correct BMKG weather code
3. If it's a new `?format=` value, add it to the view determination in
   `typescript/src/cache.ts` (`serveWeatherView`)
4. Add tests in `src/render.test.ts`

## Dependencies

**Zero production dependencies** (devDependencies only). Do not add runtime
dependencies. The Workers bundle is intentionally ~20 KB.

Rust deps are in `rust/Cargo.toml` — the key ones are `worker` (Cloudflare
Workers SDK), `cuaca` (BMKG models + rendering), `js-sys` (for `Date::now()`
in the cache).

## What NOT to do

- Don't add a JavaScript/CSS bundler or CDN links (system font stack only)
- Don't fetch wilayah via the public URL in production (service binding only)
- Don't cache custom `?format=` templates
- Don't add `strip = true` to Rust
- Don't change the default branch from `main`
- Don't deploy without running tests first
- Don't use BMKG weather codes 10–14 for rain (they don't exist in the API)

## Key docs

- `docs/CHANGELOG.md` — release history
- `docs/CONTRIBUTING.md` — for human contributors
- `typescript/PERF.md` — performance plan + verified numbers
- `typescript/LAYOUT.md` — web UI wireframes
- `rust/TOOLCHAIN_ISSUES.md` — the externref blocker + resolution