// Route dispatch + scheduled handler
// Business logic lives in ./bmkg, ./wilayah, ./cache, ./ai, ./format, ./openapi

import type { Env, LocationSource } from "./types";
import { SimpleForecast, LocationInfo, Warning, parseLang } from "./render";
import { fetchForecast, fetchWarnings, toLocationInfo } from "./bmkg";
import { searchWilayah, nearestWilayah, locateWilayah, resolveAdm4FromRequest } from "./wilayah";
import { resolveLocationCached } from "./cache";
import { serveWeatherView, cacheKey, setResCache, CACHE_TTL_MS } from "./cache";
import { generateAIReport } from "./ai";
import { formatCustom } from "./format";
import { getOpenApiSpec } from "./openapi";

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /api/forecast
    if (url.pathname === "/api/forecast") {
      const adm4 = url.searchParams.get("adm4");
      if (!adm4) return json({ error: "adm4 parameter required (e.g., 31.71.03.1001)" }, 400, corsHeaders);
      try {
        const data = await fetchForecast(adm4);
        return json(data, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to fetch forecast", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/warnings
    if (url.pathname === "/api/warnings") {
      const adm4 = url.searchParams.get("adm4");
      if (!adm4) return json({ error: "adm4 parameter required" }, 400, corsHeaders);
      try {
        const warnings = await fetchWarnings(adm4);
        return json({ adm4, warnings }, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to fetch warnings", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/resolve
    if (url.pathname === "/api/resolve") {
      const q = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "10");
      if (!q) return json({ error: "q parameter required" }, 400, corsHeaders);
      try {
        const results = await searchWilayah(q, limit, env);
        return json({ query: q, results }, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to search", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/nearest
    if (url.pathname === "/api/nearest") {
      const lat = parseFloat(url.searchParams.get("lat") || "");
      const lon = parseFloat(url.searchParams.get("lon") || "");
      if (isNaN(lat) || isNaN(lon)) return json({ error: "lat and lon parameters required" }, 400, corsHeaders);
      const limit = parseInt(url.searchParams.get("limit") || "1");
      try {
        const results = await nearestWilayah(lat, lon, limit, env);
        return json({ lat, lon, results }, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to reverse geocode", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/locate
    if (url.pathname === "/api/locate") {
      const lat = parseFloat(url.searchParams.get("lat") || "");
      const lon = parseFloat(url.searchParams.get("lon") || "");
      if (isNaN(lat) || isNaN(lon)) return json({ error: "lat and lon parameters required" }, 400, corsHeaders);
      try {
        const result = await locateWilayah(lat, lon, env);
        return json(result, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to locate", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/ai-report
    if (url.pathname === "/api/ai-report") {
      const adm4 = url.searchParams.get("adm4");
      const style = url.searchParams.get("style") || "brief";
      if (!adm4) return json({ error: "adm4 parameter required (e.g., 31.71.03.1001)" }, 400, corsHeaders);
      if (!env.AI) return json({ error: "Workers AI binding not configured" }, 503, corsHeaders);
      try {
        const [data, warnings] = await Promise.all([
          fetchForecast(adm4),
          fetchWarnings(adm4).catch(() => [] as Warning[]),
        ]);
        const report = await generateAIReport(env.AI, data, warnings, style);
        return new Response(report, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Cuaca-Location": `adm4=${adm4}`,
            "X-Cuaca-Source": "param",
            ...corsHeaders,
          },
        });
      } catch (e) {
        return json({ error: "Failed to generate AI report", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/openapi.json
    if (url.pathname === "/api/openapi.json") {
      return json(getOpenApiSpec(), 200, corsHeaders);
    }

    // GET /api/locations
    if (url.pathname === "/api/locations") {
      return json({
        examples: [
          { adm4: "31.71.03.1001", name: "Kemayoran, Jakarta Pusat" },
          { adm4: "31.71.01.1001", name: "Gambir, Jakarta Pusat" },
          { adm4: "32.73.07.1001", name: "Cibeunying Kaler, Bandung" },
          { adm4: "33.74.07.1001", name: "Semarang Tengah, Semarang" },
          { adm4: "35.78.03.1001", name: "Tegalsari, Surabaya" },
        ],
      }, 200, corsHeaders);
    }

    // GET / - auto-location (GeoIP)
    if (url.pathname === "/" || url.pathname === "/weather") {
      try {
        const { adm4, source } = await resolveAdm4FromRequest(request, env, url);
        return await serveWeatherView(request, ctx, adm4, source, url.searchParams.get("format"), corsHeaders, url.searchParams.get("lang"));
      } catch (e) {
        return new Response(`Error: ${e}`, { status: 502, headers: corsHeaders });
      }
    }

    // GET /:location - by name
    if (url.pathname.startsWith("/") && url.pathname.length > 1 && !url.pathname.startsWith("/api")) {
      const locationName = url.pathname.slice(1);
      try {
        const resolved = await resolveLocationCached(locationName, env);
        const adm4 = resolved || "31.71.03.1001";
        const source: LocationSource = resolved ? "name" : "default";
        return await serveWeatherView(request, ctx, adm4, source, url.searchParams.get("format"), corsHeaders, url.searchParams.get("lang"));
      } catch (e) {
        return new Response(`Error: ${e}`, { status: 502, headers: corsHeaders });
      }
    }

    return json({ error: "Not found" }, 404, corsHeaders);
  },

  // Cron pre-warm
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const TOP_CITIES = [
      "31.71.03.1001", "31.71.01.1001", "32.73.07.1001",
      "33.74.07.1001", "35.78.03.1001", "34.71.07.1001",
      "12.71.07.1001", "51.71.07.1001", "73.71.07.1001", "16.71.07.1001",
    ];
    const { renderTerminal, renderHTML } = await import("./render");
    const results = await Promise.allSettled(
      TOP_CITIES.flatMap(adm4 => [terminalView(adm4), htmlView(adm4)])
    );
    const ok = results.filter(r => r.status === "fulfilled").length;
    console.log(`[cron] pre-warmed ${ok}/${results.length} cache entries`);

    async function terminalView(adm4: string): Promise<void> {
      const data = await fetchForecast(adm4);
      const location = toLocationInfo(data);
      const body = renderTerminal(location, data.forecast, []);
      setResCache(cacheKey(adm4, "terminal"), { expires: Date.now() + CACHE_TTL_MS, body, headers: {} });
    }
    async function htmlView(adm4: string): Promise<void> {
      const data = await fetchForecast(adm4);
      const location = toLocationInfo(data);
      const body = renderHTML(location, data.forecast, []);
      setResCache(cacheKey(adm4, "html"), { expires: Date.now() + CACHE_TTL_MS, body, headers: {} });
    }
  },
} satisfies ExportedHandler<Env>;
