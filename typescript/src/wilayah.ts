// Wilayah service binding client + location resolution chain

import type { Env, WilayahSearchResult, WilayahNearestResult, WilayahCodeResult, LocationSource } from "./types";
import { nearestAdm4Cached } from "./cache";

const WILAYAH_API = "https://api.wilayah.workers.dev";

// ===== Wilayah Worker Integration =====
// Fetch through the WILAYAH service binding when available (same-account
// worker-to-worker: bypasses same-zone routing, faster, free). Falls
// back to public fetch -- local dev/CI have no live binding for 'api'.
async function wilayahFetch(url: string, cf: Record<string, unknown>, env?: Env): Promise<Response> {
  const headers = { "User-Agent": "cuaca-worker/1.0" };
  if (env?.WILAYAH) {
    try {
      return await env.WILAYAH.fetch(url, { headers });
    } catch {
      // binding unavailable (local dev stub) -> public fetch
    }
  }
  return fetch(url, { headers, cf: cf as RequestInit["cf"] });
}
export async function searchWilayah(query: string, limit: number, env?: Env): Promise<WilayahSearchResult[]> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { cacheTtl: 86400, cacheEverything: true }, // 24h edge cache (public fetch path)
    env
  );
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  const data = (await res.json()) as WilayahNearestResult;
  return data.results || [];
}

export async function nearestWilayah(lat: number, lon: number, limit: number, env?: Env): Promise<WilayahSearchResult[]> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/nearest?lat=${lat}&lon=${lon}&limit=${limit}`,
    { cacheTtl: 86400, cacheEverything: true },
    env
  );
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  const data = (await res.json()) as WilayahNearestResult;
  return data.results || [];
}

export async function locateWilayah(lat: number, lon: number, env?: Env): Promise<any> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/locate?lat=${lat}&lon=${lon}`,
    { cacheTtl: 86400, cacheEverything: true },
    env
  );
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  return res.json();
}

export async function getWilayahByCode(code: string, env?: Env): Promise<WilayahCodeResult | null> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/code?q=${encodeURIComponent(code)}`,
    { cacheTtl: 86400, cacheEverything: true },
    env
  );
  if (!res.ok) return null;
  return res.json();
}

// ===== Location Resolution =====
export async function resolveAdm4FromRequest(request: Request, env: Env, url: URL): Promise<{ adm4: string; source: LocationSource }> {
  // 1. Explicit adm4 in query
  const explicitAdm4 = url.searchParams.get("adm4");
  if (explicitAdm4) return { adm4: explicitAdm4, source: "param" };

  // 2. Explicit lat/lon in query (cached ~1 km, 24 h)
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  if (lat && lon) {
    const adm4 = await nearestAdm4Cached(parseFloat(lat), parseFloat(lon), env);
    if (adm4) return { adm4, source: "query" };
  }

  // 3. Cloudflare GeoIP headers (cached ~1 km, 24 h)
  const cfLat = request.headers.get("CF-IPLatitude");
  const cfLon = request.headers.get("CF-IPLongitude");
  if (cfLat && cfLon) {
    const adm4 = await nearestAdm4Cached(parseFloat(cfLat), parseFloat(cfLon), env);
    if (adm4) return { adm4, source: "geoip" };
  }

  // 4. Default: Kemayoran, Jakarta
  return { adm4: "31.71.03.1001", source: "default" };
}

export async function resolveLocation(name: string, env?: Env): Promise<string | null> {
  // Try exact code first
  if (/^\d{2}(\.\d{2}){3}$/.test(name)) {
    const result = await getWilayahByCode(name, env);
    return result?.code || null;
  }

  // Search by name
  const results = await searchWilayah(name, 1, env);
  if (results.length > 0) return results[0].code;

  // Fallback to hardcoded map
  const known: Record<string, string> = {
    "jakarta": "31.71.03.1001", "kemayoran": "31.71.03.1001",
    "gambir": "31.71.01.1001", "bandung": "32.73.07.1001",
    "cibeunying": "32.73.07.1001", "semarang": "33.74.07.1001",
    "surabaya": "35.78.03.1001", "yogyakarta": "34.71.07.1001",
    "jogja": "34.71.07.1001", "medan": "12.71.07.1001",
    "makassar": "73.71.07.1001", "denpasar": "51.71.07.1001",
    "bali": "51.71.07.1001", "palembang": "16.71.07.1001",
    "batam": "21.71.07.1001", "bogor": "32.71.07.1001",
    "depok": "32.76.07.1001", "tangerang": "36.71.07.1001",
    "bekasi": "32.75.07.1001",
  };
  return known[name.toLowerCase()] || null;
}
