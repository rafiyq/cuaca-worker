# Framework Decision: Final Assessment

## Current State: Native TypeScript on Cloudflare Workers
- **Bundle**: ~2 KB (only runtime types, no deps)
- **Cold start**: 0ms (V8 isolates)
- **Files**: `src/index.ts` + `src/render.ts` = ~600 lines
- **Deps**: 0 production dependencies

---

## Comparison Matrix

| Criterion | Native TS (Current) | Hono | itty-router | Rust (workers-rs) |
|-----------|---------------------|------|-------------|-------------------|
| **Bundle size** | ~2 KB | ~14 KB | ~2 KB | ~50-100 KB |
| **Cold start** | 0ms | +1-2ms | 0ms | +1-5ms |
| **Routing** | Manual `if` | Excellent | Good | Manual |
| **Validation** | Manual | Zod built-in | Manual | Manual |
| **OpenAPI** | Manual | Built-in | No | Manual |
| **Middleware** | Manual | Built-in | Basic | Manual |
| **TypeScript DX** | Native | Excellent | Good | Good |
| **Debugging** | Excellent | Excellent | Good | Hard (Wasm) |
| **Learning curve** | None | Low | Low | High |
| **Ecosystem** | Web standards | Hono plugins | Minimal | Crates.io |

---

## When to Switch FROM Native

| Trigger | Recommended |
|---------|-------------|
| >10 endpoints with params | **Hono** |
| Need Zod validation + OpenAPI | **Hono** |
| Need middleware (auth, rate-limit, logger) | **Hono** |
| Team prefers Express-like API | **Hono** |
| Just need routing, no validation | **itty-router** |
| CPU-heavy (parsing 10MB JSON, crypto) | **Rust** |
| Existing Rust codebase | **Rust** |

---

## Our Worker: Why Native Wins

1. **5 endpoints** (`/`, `/:location`, `/api/forecast`, `/api/warnings`, `/api/resolve`, `/api/nearest`, `/api/locate`, `/api/locations`)
2. **Simple routing** - path + query params only
3. **No validation complexity** - query params are simple strings
4. **Zero deps** - smallest possible Worker
5. **wttr.in compatibility** - raw text/HTML responses, not JSON API
6. **CF Workers native** - `cf` cache hints, `Request`/`Response` standards

---

## Migration Path (If Needed Later)

```typescript
// Native → Hono: ~30 min refactor
import { Hono } from 'hono'
const app = new Hono()

app.get('/api/forecast', async (c) => {
  const adm4 = c.req.query('adm4')
  // ... same logic
})

app.get('/:location', async (c) => {
  const locationName = c.req.param('location')
  // ... same logic
})

export default app
```

**No rewrite needed** - just wrap handlers.

---

## Verdict

**Stay Native** for this project because:
- ✅ Smallest footprint (your #1 requirement)
- ✅ Fastest cold start (your #1 requirement)
- ✅ 5 simple endpoints don't need router abstraction
- ✅ wttr.in compatibility needs raw Response control
- ✅ Zero production dependencies = zero supply chain risk

**Add Hono only when**: You hit routing pain, need OpenAPI docs, or add auth/middleware.

---

## What We Gained From Research

| Inspiration | Adopted |
|-------------|---------|
| rafiyq/cuaca | Custom format templates, warnings parsing, daemon concept |
| rafiyq/wilayah-worker | GeoIP auto-detect, village search API, 24h caching |

All implemented in **native TypeScript** - no framework needed.

---

## Rust / Leptos: Final Verdict

| Aspect | Reality for This Project |
|--------|-------------------------|
| **Leptos on Workers** | Experimental SSR via `leptos_cf_workers`; client WASM ~200-500 KB |
| **Rust (workers-rs)** | ~50-100 KB WASM, +1-5ms cold start |
| **Your use case** | Fetch JSON → transform → return text/HTML |

### Why Not Here

1. **No WASM advantage** - Simple JSON transform, no CPU-heavy work (crypto, image proc, ML)
2. **Leptos = wrong tool** - It's a full-stack reactive framework (SolidJS-like), not an API worker
3. **Debugging pain** - Wasm stack traces vs native TypeScript
4. **Compile loop** - `cargo build --target wasm32-unknown-unknown` on every change
5. **Bundle bloat** - 50-100 KB vs 2 KB for zero benefit

### When Rust *Would* Win Here

- Parsing ALL 80k villages' forecasts in one Worker invocation
- Crypto signing (webhook verification, JWT)
- Reusing existing Rust weather libraries
- Team is Rust-first, refuses TypeScript

### Leptos Use Case (Different Project)

```rust
// Leptos shines for: Full-stack web apps with SSR + hydration
// Example: Interactive weather dashboard with:
// - Island hydration (interactive charts)
// - Server-side rendered initial view
// - Client-side reactivity for filters
// - Deployed to Cloudflare Pages + Workers
```

**Not for**: `curl cuaca.workers.dev/Jakarta` → terminal text.

---

## Decision Locked

**Native TypeScript** → Deploy → Done.

If you later build a **web dashboard** (not CLI/API), *then* consider Leptos on Cloudflare Pages.
