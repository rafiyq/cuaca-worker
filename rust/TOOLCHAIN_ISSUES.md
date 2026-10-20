# Toolchain Issues Tracker

## Status: 🔴 BLOCKED

Both build approaches fail to produce working Workers.

---

## Approach 1: wasm-pack + worker@0.4

### Build
```bash
cargo build --target wasm32-unknown-unknown --release
wasm-pack build --target web --out-dir dist/wasm --no-opt
```

### Error
```
TypeError: Cannot read properties of undefined (reading 'method')
    at __wbg_method_... (worker.js:1312:34)
    at wasm://wasm/...:wasm-function[243]:0x703ee
```

### Root Cause
wasm-bindgen generated glue code calls `.method` on undefined. The generated `fetch` function expects `Request` object with `.method` property, but Cloudflare Workers' `Request` implementation differs from web standard.

### Worker Crate Version
- `worker = "0.4"` with `features = ["http"]`
- Uses `#[event(fetch)]` macro
- Exports `fetch(req, env, ctx)` function

### wasm-bindgen Output
Generates `fetch(req, env, ctx)` that calls `wasm.fetch(addHeapObject(req), ...)`

### Hypothesis
The `worker` crate's `Request` type doesn't match what wasm-bindgen expects when targeting `web`. The wasm-bindgen `web` target assumes browser `Request` interface.

---

## Approach 2: worker-build + worker@0.8.7

### Build
```bash
worker-build --release
```

### Error
```
error: failed to generate catch wrappers
Caused by: externref table required for catch wrappers
```

### Root Cause
wasm-bindgen 0.2.129 with `--force-enable-abort-handler` requires `externref` table for catch unwinding. The wasm32-unknown-unknown target doesn't enable this by default.

### Worker Crate Version
- `worker = "0.8.7"` with `features = ["http"]`
- Uses `#[worker::send]` attribute (newer API)
- worker-build uses wasm-bindgen with `--target module`

### Attempted Fixes
- `RUSTFLAGS='-C target-feature=+externref'` → ignored by wasm32 target
- `--no-typescript` flag doesn't affect this

### Hypothesis
Need to either:
1. Use older wasm-bindgen (0.2.99) without abort handler
2. Patch worker-build to remove `--force-enable-abort-handler`
3. Enable `externref` in wasm target (requires nightly + `-Z wasm-externref`)

---

## Investigation Plan

### Phase 1: Understand wasm-bindgen expectations
- [ ] Check what `worker` crate exports for `Request` type
- [ ] Compare with browser `Request` interface
- [ ] Test wasm-bindgen `web` vs `module` target differences

### Phase 2: Try alternative build configurations
- [ ] wasm-pack with `--target bundler` instead of `--target web`
- [ ] wasm-pack with `--target no-modules`
- [ ] Manual wasm-bindgen invocation with custom flags

### Phase 3: Try worker crate upgrade path
- [ ] worker@0.10+ with wrangler 3.80+ native support
- [ ] Use wrangler's built-in Rust compilation (`wrangler deploy` auto-detects Cargo.toml)

### Phase 4: Workarounds
- [ ] Fork worker-build to remove problematic flags
- [ ] Use wasm-bindgen 0.2.99
- [ ] Write minimal JavaScript glue manually

---

## Resources

- [worker-build issues](https://github.com/cloudflare/worker-build/issues)
- [wasm-bindgen catch wrappers](https://github.com/rustwasm/wasm-bindgen/issues/3258)
- [Cloudflare Workers Rust examples](https://github.com/cloudflare/workers-rs/tree/main/examples)
- [wrangler Rust support](https://developers.cloudflare.com/workers/languages/rust/)

---

## Next Steps

1. **Immediate**: Try `wasm-pack build --target bundler` to see if module format works better
2. **Short-term**: Test worker@0.10 with wrangler native build
3. **Medium-term**: File issues upstream if bugs confirmed
4. **Fallback**: Manual JS glue if toolchain doesn't mature