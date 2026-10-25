# Cuaca Worker - Framework Research

## Current: Native Cloudflare Workers (TypeScript)
- **Bundle size**: ~0 KB (no deps)
- **Cold start**: ~0ms (V8 isolates)
- **Memory**: Minimal
- **Pros**: Maximum control, smallest, fastest
- **Cons**: Manual routing, no middleware, verbose

---

## Option 1: Hono (Recommended for APIs)
```bash
npm i hono
```
- **Bundle**: ~14 KB minzipped
- **Cold start**: +1-2ms
- **Features**: Router, middleware, validation (Zod), OpenAPI, RPC
- **DX**: Excellent TypeScript, Express-like API
- **Best for**: REST APIs, multiple endpoints, validation needs

```ts
import { Hono } from 'hono'
const app = new Hono()
app.get('/forecast', async (c) => {
  const adm4 = c.req.query('adm4')
  // ...
})
export default app
```

---

## Option 2: itty-router (Tiny Router)
```bash
npm i itty-router
```
- **Bundle**: ~2 KB
- **Cold start**: ~0ms
- **Features**: Route matching, params, middleware
- **Best for**: Simple routing only, no validation/OpenAPI

---

## Option 3: Workers + Scheduled + KV (Current Architecture)
```
Cron Trigger (every 6hr) → Worker → Fetch BMKG → KV (cache) → API serves from KV
```
- **Pros**: Reduces BMKG calls, survives rate limits, fast reads
- **Cons**: Stale data (6hr), KV costs

---

## Option 4: Cloudflare Queues + Workers
```
HTTP /forecast → Queue (batch) → Consumer Worker → BMKG → KV/R2
```
- **Pros**: Batch multiple locations, retry logic, durable
- **Cons**: Overkill for single-location fetch, adds latency

---

## Option 5: Workflows (Beta)
```
Workflow: fetch → transform → store → notify
```
- **Pros**: Multi-step, retries, persistence, sleep/wait
- **Cons**: Beta, overkill for simple fetch

---

## Option 6: Durable Objects
- **Use case**: WebSocket connections, coordination, per-location state
- **Not needed** for simple forecast fetch

---

## Recommendation Matrix

| Need | Best Choice |
|------|-------------|
| Single endpoint, minimal | **Native (current)** |
| Multiple endpoints, validation, OpenAPI | **Hono** |
| Simple routing only | **itty-router** |
| Periodic fetch + cache | **Native + Cron + KV** |
| Batch multiple locations | **Queues** |
| Complex multi-step | **Workflows** |

---

## BMKG-Specific Considerations
1. **Rate limit**: 60 req/min/IP → Need caching or queue
2. **Data updates**: 2x/day (00:00, 12:00 UTC) → Cron at 01:00, 13:00 UTC
3. **Location codes**: 80k+ villages → Need lookup table (KV/R2)
4. **Response size**: ~15 KB per location → Compression helps

---

## Next Steps to Decide
1. **API surface**: Just `/forecast`? Or also `/current`, `/alerts`, `/history`?
2. **Consumers**: Web app? Mobile? Telegram bot? Internal dashboard?
3. **Scale**: 1 location? 100? All 80k villages?
4. **Freshness**: Real-time? 6hr cache OK?
5. **Auth**: Public? API keys? JWT?

---

## Option 7: Rust on Cloudflare Workers (via Workers-rs)

### Workers-rs (Rust → Wasm)
```toml
# Cargo.toml
[package]
name = "cuaca-worker"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
worker = { version = "0.4", features = ["http", "kv", "console_error_panic_hook"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
reqwest = { version = "0.12", features = ["json", "blocking"] }  # Note: limited in Workers
```

```rust
// src/lib.rs
use worker::*;

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let adm4 = req.url()?.query_pairs()
        .find(|(k, _)| k == "adm4")
        .map(|(_, v)| v.to_string())
        .ok_or_else(|| Response::error("adm4 required", 400))?;
    
    let url = format!("https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={}", adm4);
    let mut res = Fetch::Request(Request::new(&url)?).send().await?;
    let text = res.text().await?;
    
    Response::ok(text)
}
```

| Metric | Native TS | Rust (workers-rs) |
|--------|-----------|-------------------|
| Bundle (Wasm) | ~0 KB | **~50-100 KB** |
| Cold start | 0ms | **+1-5ms** (Wasm init) |
| CPU (parsing) | Fast | **Faster** (SIMD, no GC) |
| Memory | V8 heap | **Lower** (linear memory) |
| Dev speed | Fast | Slower (compile) |
| Debugging | Excellent | Harder (Wasm) |
| Ecosystem | Huge npm | Growing crates.io |

### Leptos on Cloudflare Workers?
- **Leptos** = Full-stack Rust WASM framework (like SolidJS but Rust)
- **SSR on Workers**: Possible via `leptos_cf_workers` but **experimental**
- **Client-side WASM**: ~200-500 KB (too heavy for "smallest footprint")
- **Not recommended** for API-only worker

### When Rust Makes Sense on Workers
- CPU-heavy: image processing, crypto, ML inference, parsing huge JSON
- Existing Rust codebase/libraries
- Team knows Rust, not TS
- Need SIMD/threads (Workers supports Wasm threads in beta)

### For Cuaca Worker: **Not Recommended**
- Simple JSON fetch → transform → return
- No CPU-intensive work
- Wasm overhead > benefit
- TypeScript native is faster to dev, smaller, zero cold start

---

## Summary: Rust/Leptos Verdict

| Use Case | Verdict |
|----------|---------|
| API worker (this project) | ❌ Stay TypeScript |
| CPU-intensive (parsing 10MB JSON, crypto) | ✅ Consider Rust |
| Full-stack web app with SSR | ⚠️ Leptos on Workers = experimental |
| Team expertise = Rust | ✅ If you prefer Rust |

**Bottom line**: For "smallest footprint + fastest" weather API → **TypeScript native wins**.
