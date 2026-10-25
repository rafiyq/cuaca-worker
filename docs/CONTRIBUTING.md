# Contributing to cuaca-worker

## Development setup

```bash
git clone https://github.com/rafiyq/cuaca-worker
cd cuaca-worker/typescript
npm install --legacy-peer-deps
```

## Local development (no login needed)

```bash
npx wrangler dev --local --port 8787
curl http://localhost:8787/Jakarta
```

The WILAYAH service binding shows as `[not connected]` in local dev —
the code automatically falls back to the public wilayah API.

## Running tests

```bash
npm test
```

- `src/render.test.ts` — unit tests for renderers, icons, prometheus (no network)
- `src/index.test.ts` — integration tests via the Workers runtime (hits live APIs)

## Code structure

```
typescript/src/
├── index.ts      route dispatch + scheduled handler
├── cache.ts      response cache (memory + edge) + resolution cache
├── bmkg.ts       BMKG forecast + warnings client
├── wilayah.ts    wilayah service binding + location resolution chain
├── ai.ts         AI report generation (Workers AI)
├── format.ts     custom format templates (Waybar-style)
├── openapi.ts    OpenAPI 3.1 spec
├── types.ts      shared API-layer types
└── render.ts     renderers: terminal, HTML, prometheus + icons
```

## Making changes

1. Make your changes in `typescript/src/`
2. Run `npm test` — all tests must pass
3. Push to `main` — CI runs tests only (no deploy)

## Releasing

Deploys are triggered by version tags:

```bash
git tag -a v0.x.y -m "Description"
git push origin v0.x.y
```

The deploy pipeline: test → `wrangler deploy --tag v0.x.y` → live.

## Adding an endpoint

1. Add the handler in `src/index.ts` (route dispatch)
2. Add the OpenAPI spec entry in `src/openapi.ts`
3. Add tests in `src/index.test.ts`
4. Update `typescript/README.md` endpoints table

## Style

- TypeScript strict mode (`tsc --noEmit` must pass with zero errors)
- Zero production dependencies (devDependencies only)
- Every response: `X-Cuaca-Location`, `X-Cuaca-Source`, `X-Cuaca-Cache`, `Server-Timing`
- New location resolution paths must set `X-Cuaca-Source` to a meaningful value