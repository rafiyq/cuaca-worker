# Performance & Efficiency Plan

Current profile (from `src/index.ts`):
- Upstream calls: wilayah (24h edge cache) + BMKG forecast (5 min) + BMKG warnings (15 min)
- **Rendered output is never cached** — every request re-runs 2–3 subrequests (each a
  round trip to CF edge cache even when warm) + full re-render
- No `Cache-Control` on responses, no `ctx.waitUntil`, no cache-status observability

## Request profile today

| Path | Cold (upstream miss) | Warm (upstream cached) | Notes |
|------|---------------------|----------------------|-------|
| `/Jakarta` terminal | ~300–1000 ms | ~30–80 ms | wilayah + forecast + warnings + render |
| `/Jakarta?format=3` | ~300–1000 ms | ~30–80 ms | **fetches warnings it never renders** |
| Browser HTML | same | same | + external Google Fonts fetch |

## Wins, ranked

| # | Change | Effect | Effort |
|---|--------|--------|--------|
| 1 | **Skip warnings fetch for `format=3`/custom formats** | Halves subrequests for Waybar/status-bar users (the heaviest pollers) | trivial |
| 2 | **Cache API on rendered responses** (key: `adm4 + view`, TTL 5 min) | Warm hits: 0 upstream, 0 render → **TTFB ~5–15 ms** | small |
| 3 | **In-isolate memory cache** (`Map` + TTL) | Hot path ~1–3 ms, free, survives isolate reuse | small |
| 4 | **`Cache-Control` + `X-Cuaca-Cache: HIT/MISS`** | Browser + edge reuse; observability | trivial |
| 5 | **`Server-Timing` header** (upstream_ms, render_ms, cache) | Measure 1–4 for real | trivial |
| 6 | **Drop/subset Google Fonts** | Faster first paint, no external request | small |
| 7 | **Cron pre-warm top cities** (every 5 min) | Popular locations always warm everywhere | medium |
| 8 | **KV global rendered cache** | Cross-colo warm, but adds ~10 ms on hit — only if traffic is high & spread | medium |

## Design notes

- **Cache key**: canonicalize to resolved `adm4` so `/Jakarta`, `/?adm4=31.71.03.1001`
  and GeoIP hits share one cached artifact. View: `terminal` | `html` | `short`.
  Custom `?format=` templates → skip caching (unbounded key space).
- **TTL = 5 min** (matches forecast freshness). Add `stale-while-revalidate` to hide
  upstream latency at expiry.
- **Memory cache** is best-effort (isolate lifetime unknown); correctness comes from
  the same 5-min TTL, so it can never serve data older than the Cache API would.
- **Warnings split**: only fetch for full terminal/HTML views. `format=3`/custom
  need `forecast[0]` only.
- Need `ctx: ExecutionContext` param for `ctx.waitUntil(cache.put(...))`.
- Tests: Cache API works under vitest-pool-workers/miniflare; keep a bypass
  (`?nocache=1`) for deterministic tests if needed.

## Expected result after 1–4

| Path | Warm | Improvement |
|------|------|-------------|
| terminal/HTML | ~5–15 ms | ~5–10× |
| `format=3` | ~5–20 ms (no warnings call) | ~5× + half the upstream load |

## Not worth doing now

- Minifying the inline HTML (small, gzip handles it)
- Streaming responses (bodies are ≤ ~20 KB)
- Bundle size (already 0-dep, ~2 KB)