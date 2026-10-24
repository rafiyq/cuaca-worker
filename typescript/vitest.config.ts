import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// The WILAYAH service binding (wrangler.jsonc) points at the deployed
// "api" worker, which doesn't exist in the test sandbox. Define a stub
// worker with that name whose fetch always throws -- src/index.ts
// wilayahFetch() catches and falls back to the public fetch path, which
// is exactly what CI and local dev should exercise.
const STUB_WORKER = `export default {
  fetch() {
    throw new Error("WILAYAH stub: binding unavailable in test sandbox");
  },
};`;

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          workers: [
            {
              name: "api",
              modules: [
                {
                  type: "ESModule",
                  path: "stub-worker.js",
                  contents: STUB_WORKER,
                },
              ],
              compatibilityDate: "2025-10-13",
            },
            {
              name: "ai-stub",
              modules: [
                {
                  type: "ESModule",
                  path: "ai-stub.js",
                  contents: "export default { async fetch() { return new Response('{\"response\": \"stub\"}', { headers: { 'Content-Type': 'application/json' } }); } };",
                },
              ],
              compatibilityDate: "2025-10-13",
            },
          ],
        },
      },
    },
  },
});