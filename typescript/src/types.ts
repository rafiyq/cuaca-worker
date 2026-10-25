// API-layer shared types

export interface BmkgResponse {
  lokasi: {
    adm1: string; adm2: string; adm3: string; adm4: string;
    provinsi: string; kotkab: string; kecamatan: string; desa: string;
    lon: number; lat: number; timezone: string;
  };
  data: Array<{
    lokasi: BmkgResponse["lokasi"] & { type: string };
    cuaca: Array<Array<BmkgForecastItem>>;
  }>;
}

export interface BmkgForecastItem {
  datetime: string; t: number; tcc: number; tp: number; weather: number;
  weather_desc: string; weather_desc_en: string; wd_deg: number; wd: string;
  wd_to: string; ws: number; hu: number; vs: number | null; vs_text: string | null;
  time_index: string; analysis_date: string; image: string;
  utc_datetime: string; local_datetime: string;
}

export interface WilayahSearchResult {
  code: string;
  name: string;
  district: string;
  city: string;
  province: string;
  lat: number;
  lon: number;
}

export interface WilayahNearestResult {
  results: WilayahSearchResult[];
}

export interface WilayahCodeResult {
  code: string;
  name: string;
  district: string;
  city: string;
  province: string;
  lat: number;
  lon: number;
}

export interface Env {
  AI?: { run(model: string, input: unknown): Promise<{ response?: string }> };
  ASSETS?: unknown;
  WILAYAH?: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
}

export type LocationSource = "param" | "query" | "geoip" | "name" | "default";