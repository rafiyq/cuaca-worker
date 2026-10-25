// Response cache (memory + edge) and resolution cache
// See PERF.md for design details

import type { Env, LocationSource } from "./types";
import { renderTerminal, renderHTML, renderPrometheus, wantsHTML, parseLang, weatherEmoji, SimpleForecast, LocationInfo, Warning } from "./render";
import { formatTemp } from "./format";
import { resolveLocation, nearestWilayah } from "./wilayah";
import { fetchForecast, fetchWarnings, toLocationInfo } from "./bmkg";
import { formatCustom } from "./format";

// ===== Rendered-response cache (see PERF.md) =====
// Layer 1: per-isolate memory cache (fastest; isolate reuse makes this very effective)
// Layer 2: Cache API (per-colo edge cache, shared across isolates)
// TTL = 5 min, matching forecast freshness. Keyed by resolved adm4 + view so
// /Jakarta, /?adm4=... and GeoIP hits share one artifact.

export const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL_S = 300;
const RES_CACHE_MAX = 500;

interface CachedResponse {
  expires: number;
  body: string;
  headers: Record<string, string>; // serialized response headers
}
const resCache = new Map<string, CachedResponse>();

// name/geo -> adm4 resolution cache (24h, matching wilayah upstream cache)
const RESOLVE_TTL_MS = 24 * 60 * 60 * 1000;
const resolveCache = new Map<string, { expires: number; adm4: string }>();

export function cacheKey(adm4: string, view: string): string {
  return `${adm4}:${view}`;
}

export function setResCache(key: string, entry: CachedResponse): void {
  if (resCache.size >= RES_CACHE_MAX) {
    // simple FIFO eviction: Map preserves insertion order
    resCache.delete(resCache.keys().next().value as string);
  }
  resCache.set(key, entry);
}

export function responseHeaders(h: Record<string, string>, cacheStatus: string, timing: string): Headers {
  const headers = new Headers(h);
  headers.set("X-Cuaca-Cache", cacheStatus);
  headers.set("Server-Timing", timing);
  return headers;
}

// Build the final response: location headers + optional fallback note
export function finalizeResponse(
  body: string,
  headers: Record<string, string>,
  cacheStatus: string,
  timing: string,
  adm4: string,
  source: LocationSource,
  view: string
): Response {
  const h = responseHeaders(headers, cacheStatus, timing);
  h.set("X-Cuaca-Location", `adm4=${adm4}`);
  h.set("X-Cuaca-Source", source);
  let finalBody = body;
  if (source === "default" && view === "terminal") {
    finalBody = "\x1b[2mNote: default location (Kemayoran) \u2014 pass ?adm4= or ?lat=&lon= for yours\x1b[0m\n\n" + body;
  }
  return new Response(finalBody, { headers: h });
}

// Serve one of the weather views with caching (used by / and /:location)
export async function serveWeatherView(
  request: Request,
  ctx: ExecutionContext | undefined,
  adm4: string,
  source: LocationSource,
  format: string | null,
  corsHeaders: Record<string, string>,
  langStr: string | null = null
): Promise<Response> {
  const lang = parseLang(langStr);
  // Determine view; only full views need warnings (short/custom skip the fetch)
  const view =
    format === "3" || format === "short" ? "short"
    : format === "prometheus" ? "prometheus"
    : format ? "custom"
    : wantsHTML(request) ? "html"
    : "terminal";

  const baseHeaders: Record<string, string> = {
    "Content-Type":
      view === "html" ? "text/html; charset=utf-8"
      : view === "prometheus" ? "text/plain; version=0.0.4; charset=utf-8"
      : "text/plain; charset=utf-8",
    ...corsHeaders,
  };

  // Custom formats are per-user templates: never cached
  if (view === "custom") {
    const t0 = Date.now();
    const data = await fetchForecast(adm4);
    const location = toLocationInfo(data);
    const body = formatCustom(format as string, data.forecast[0], location);
    return finalizeResponse(body, baseHeaders, "BYPASS", `upstream;dur=${Date.now() - t0}, cache;desc=BYPASS`, adm4, source, view);
  }

  const viewKey = lang === "en" ? `${view}:en` : view;
  const key = cacheKey(adm4, viewKey);

  // 1) Memory cache
  const memHit = resCache.get(key);
  if (memHit && memHit.expires > Date.now()) {
    return finalizeResponse(memHit.body, memHit.headers, "MEMHIT", `cache;desc=MEM`, adm4, source, view);
  }

  // 2) Cache API (per-colo edge cache)
  const cache = caches.default;
  const cacheUrl = new Request(`https://cuaca.internal/cache/v1/${encodeURIComponent(adm4)}/${viewKey}`);
  const edgeHit: Response | undefined = await cache.match(cacheUrl);
  if (edgeHit) {
    const body = await edgeHit.text();
    const headers: Record<string, string> = {};
    edgeHit.headers.forEach((v, k) => { headers[k] = v; });
    // promote to memory for next time
    setResCache(key, { expires: Date.now() + CACHE_TTL_MS, body, headers });
    return finalizeResponse(body, headers, "EDGEHIT", `cache;desc=EDGE`, adm4, source, view);
  }

  // 3) MISS: fetch + render
  const tUp = Date.now();
  const needsWarnings = view === "terminal" || view === "html";
  const [data, warnings] = await Promise.all([
    fetchForecast(adm4),
    needsWarnings ? fetchWarnings(adm4).catch(() => [] as Warning[]) : Promise.resolve([] as Warning[]),
  ]);
  const upstreamMs = Date.now() - tUp;

  const tRender = Date.now();
  const location = toLocationInfo(data);
  let body: string;
  if (view === "short") {
    const current = data.forecast[0];
    const icon = weatherEmoji(current.weather, new Date(current.time).getHours());
    body = `${location.desa}: ${icon} ${formatTemp(current.temp)}`;
  } else if (view === "prometheus") {
    body = renderPrometheus(location, data.forecast);
  } else if (view === "html") {
    body = renderHTML(location, data.forecast, warnings);
  } else {
    body = renderTerminal(location, data.forecast, warnings, lang);
  }
  const renderMs = Date.now() - tRender;

  const headers: Record<string, string> = {
    ...baseHeaders,
    "Cache-Control": `public, max-age=60, s-maxage=${CACHE_TTL_S}, stale-while-revalidate=600`,
  };

  // populate memory + edge caches (edge write is async, never blocks the response)
  setResCache(key, { expires: Date.now() + CACHE_TTL_MS, body, headers });
  ctx?.waitUntil?.(cache.put(cacheUrl, new Response(body, { headers })));

  return finalizeResponse(body, headers, "MISS", `upstream;dur=${upstreamMs}, render;dur=${renderMs}, cache;desc=MISS`, adm4, source, view);
}

// ===== Location resolution caches =====
export async function resolveLocationCached(name: string, env?: Env): Promise<string | null> {
  const key = `name:${name.toLowerCase()}`;
  const hit = resolveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.adm4;
  const adm4 = await resolveLocation(name, env);
  if (adm4) resolveCache.set(key, { expires: Date.now() + RESOLVE_TTL_MS, adm4 });
  return adm4;
}

export async function nearestAdm4Cached(lat: number, lon: number, env?: Env): Promise<string | undefined> {
  // round to ~1 km: GeoIP coords jitter between requests but resolve nearby
  const key = `geo:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = resolveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.adm4;
  const nearest = await nearestWilayah(lat, lon, 1, env);
  if (nearest.length > 0) {
    const adm4 = nearest[0].code;
    resolveCache.set(key, { expires: Date.now() + RESOLVE_TTL_MS, adm4 });
    return adm4;
  }
  return undefined;
}

// ===== BMKG Forecast =====
