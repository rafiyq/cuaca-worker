# Toolchain Issues Tracker

## Status: ✅ UNBLOCKED (2026-10-25)

The externref build blocker was resolved by removing `strip = true` from
`[profile.release]` in Cargo.toml.

---

## Resolution

**Root cause:** `strip = true` removes the `reference-types` custom section
from the compiled wasm binary. wasm-bindgen 0.2.129 requires that section to
generate externref catch wrappers. Without it:

```
error: failed to generate catch wrappers
Caused by: externref table required for catch wrappers
```

**Fix:** remove `strip = true` from `[profile.release]` in Cargo.toml.

**Upstream issues:**
- [workers-rs#1014](https://github.com/cloudflare/workers-rs/issues/1014) —
  "Can no longer compile with `strip = true`" (open, 2026-06-16)
- [workers-rs#1015](https://github.com/cloudflare/workers-rs/pull/1015) —
  proposed fix: re-add the target feature section (closed without merge)
- Upstream fix pending: [wasm-bindgen#5205](https://github.com/rustwasm/wasm-bindgen/pull/5205)
- Cloudflare docs still recommend `strip = true` for size — which now breaks builds

**Workaround:** `wasm-opt` (run by worker-build) handles size optimization
after wasm-bindgen, so `strip = true` is unnecessary anyway.

---

## Build (works now)

```bash
cd rust
worker-build --release          # compiles + wasm-bindgen + esbuild → build/index.js
npx wrangler dev --local --port 8787
```

## Output

- `build/index.js` — 23KB esbuild bundle
- `build/index_bg.wasm` — 1.7MB raw (~600KB gzipped estimate)

## Verified endpoints (2026-10-25)

| Endpoint | Status |
|----------|--------|
| `GET /` (terminal) | ✅ full ASCII weather report with cuaca-rs 6-panel charts |
| `GET /:location` | ✅ by name (searches wilayah) |
| `GET /:location?format=3` | ✅ short format |
| `GET /api/forecast?adm4=...` | ✅ JSON |
| `GET /api/warnings?adm4=...` | ✅ JSON (CAP XML parsed) |
| `GET /` with browser Accept | ✅ HTML page |
| `GET /api/resolve?q=...` | ✅ JSON search |
| `GET /api/nearest?lat=&lon=` | ✅ JSON reverse geocode |
| `GET /api/locate?lat=&lon=` | ✅ JSON admin hierarchy |

## Architecture notes

The Rust version compiles the entire [cuaca-rs](https://github.com/rafiyq/cuaca-rs)
library into the wasm binary — models, 6-panel chart rendering, 5-line ASCII
icons, warning matching. This gives it richer terminal output than the TS
version (bar charts per time slot vs a plain table), at the cost of a
significantly larger binary.

## Historical approaches (all superseded)

### Approach 1: wasm-pack + worker@0.4
Failed: wasm-bindgen `web` target generates browser-compatible glue code
that doesn't match Cloudflare Workers' Request/Response types.

### Approach 2: worker-build + worker@0.8.7 (before the strip fix)
Failed: `externref table required for catch wrappers` — caused by
`strip = true` removing the `reference-types` section.