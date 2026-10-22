// Worker entry point for worker-rs
import init, { fetch } from "./cuaca_worker_bg.wasm";

let initialized = false;

export default {
    async fetch(request, env, ctx) {
        if (!initialized) {
            await init();
            initialized = true;
        }
        return fetch(request, env, ctx);
    }
};
