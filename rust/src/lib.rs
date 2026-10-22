use worker::*;
use serde_json;
use http::StatusCode;

use cuaca::model::{Forecast as CuacaForecast, Location as CuacaLocation, Slot as CuacaSlot, SlotGroup};
use cuaca::terminal::render as render_terminal;
use cuaca::warnings::Warning as CuacaWarning;
use cuaca::Config;

mod bmkg;
mod wilayah;
// mod ai;  // disabled for now

use bmkg::{fetch_forecast, fetch_warnings, BmkgForecast, BmkgWarning};
use wilayah::{search_wilayah, nearest_wilayah, locate_wilayah};

fn header_to_string(headers: &Headers, key: &str) -> String {
    headers.get(key)
        .ok()
        .and_then(|v| v)
        .unwrap_or_else(|| String::new())
}

fn header_to_parsed<T: std::str::FromStr>(headers: &Headers, key: &str) -> Option<T> {
    headers.get(key)
        .ok()
        .and_then(|v| v)
        .and_then(|v| v.parse().ok())
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();
    
    let url = req.url()?;
    let path_str = url.path();
    
    // Handle CORS preflight
    if req.method() == Method::Options {
        return cors_headers(Response::ok("")?);
    }

    // GET /api/forecast?adm4=...
    if path_str == "/api/forecast" {
        let adm4 = url.query_pairs().find(|(k, _)| k == "adm4").map(|(_, v)| v.to_string());
        let adm4 = match adm4 {
            Some(a) => a,
            None => return json_error("adm4 parameter required", StatusCode::BAD_REQUEST),
        };
        
        match fetch_forecast(&adm4).await {
            Ok(data) => return cors_json_response(data),
            Err(e) => return json_error(&format!("Failed to fetch forecast: {}", e), StatusCode::BAD_GATEWAY),
        }
    }

    // GET /api/warnings?adm4=...
    if path_str == "/api/warnings" {
        let adm4 = url.query_pairs().find(|(k, _)| k == "adm4").map(|(_, v)| v.to_string());
        let adm4 = match adm4 {
            Some(a) => a,
            None => return json_error("adm4 parameter required", StatusCode::BAD_REQUEST),
        };
        
        match fetch_warnings(&adm4).await {
            Ok(warnings) => return cors_json_response(serde_json::json!({ "adm4": adm4, "warnings": warnings })),
            Err(e) => return json_error(&format!("Failed to fetch warnings: {}", e), StatusCode::BAD_GATEWAY),
        }
    }

    // GET /api/resolve?q=jakarta&limit=5
    if path_str == "/api/resolve" {
        let q = url.query_pairs().find(|(k, _)| k == "q").map(|(_, v)| v.to_string());
        let q = match q {
            Some(q) => q,
            None => return json_error("q parameter required", StatusCode::BAD_REQUEST),
        };
        let limit = url.query_pairs()
            .find(|(k, _)| k == "limit")
            .and_then(|(_, v)| v.parse().ok())
            .unwrap_or(10);
        
        match search_wilayah(&q, limit).await {
            Ok(results) => return cors_json_response(serde_json::json!({ "query": q, "results": results })),
            Err(e) => return json_error(&format!("Failed to search: {}", e), StatusCode::BAD_GATEWAY),
        }
    }

    // GET /api/nearest?lat=&lon=&limit=1
    if path_str == "/api/nearest" {
        let lat = url.query_pairs().find(|(k, _)| k == "lat").and_then(|(_, v)| v.parse().ok());
        let lon = url.query_pairs().find(|(k, _)| k == "lon").and_then(|(_, v)| v.parse().ok());
        let (lat, lon) = match (lat, lon) {
            (Some(lat), Some(lon)) => (lat, lon),
            _ => return json_error("lat and lon parameters required", StatusCode::BAD_REQUEST),
        };
        let limit = url.query_pairs()
            .find(|(k, _)| k == "limit")
            .and_then(|(_, v)| v.parse().ok())
            .unwrap_or(1);
        
        match nearest_wilayah(lat, lon, limit).await {
            Ok(results) => return cors_json_response(serde_json::json!({ "lat": lat, "lon": lon, "results": results })),
            Err(e) => return json_error(&format!("Failed to reverse geocode: {}", e), StatusCode::BAD_GATEWAY),
        }
    }

    // GET /api/locate?lat=&lon=
    if path_str == "/api/locate" {
        let lat = url.query_pairs().find(|(k, _)| k == "lat").and_then(|(_, v)| v.parse().ok());
        let lon = url.query_pairs().find(|(k, _)| k == "lon").and_then(|(_, v)| v.parse().ok());
        let (lat, lon) = match (lat, lon) {
            (Some(lat), Some(lon)) => (lat, lon),
            _ => return json_error("lat and lon parameters required", StatusCode::BAD_REQUEST),
        };
        
        match locate_wilayah(lat, lon).await {
            Ok(result) => return cors_json_response(result),
            Err(e) => return json_error(&format!("Failed to locate: {}", e), StatusCode::BAD_GATEWAY),
        }
    }

    // GET /api/locations
    if path_str == "/api/locations" {
        let examples = vec![
            serde_json::json!({ "adm4": "31.71.03.1001", "name": "Kemayoran, Jakarta Pusat" }),
            serde_json::json!({ "adm4": "31.71.01.1001", "name": "Gambir, Jakarta Pusat" }),
            serde_json::json!({ "adm4": "32.73.07.1001", "name": "Cibeunying Kaler, Bandung" }),
            serde_json::json!({ "adm4": "33.74.07.1001", "name": "Semarang Tengah, Semarang" }),
            serde_json::json!({ "adm4": "35.78.03.1001", "name": "Tegalsari, Surabaya" }),
        ];
        return cors_json_response(serde_json::json!({ "examples": examples }));
    }

    // GET / - Terminal weather (auto GeoIP)
    if path_str == "/" || path_str == "/weather" {
        let adm4 = resolve_adm4_from_request(&req, &url).await.unwrap_or_else(|| "31.71.03.1001".to_string());
        
        let forecast = match fetch_forecast(&adm4).await {
            Ok(f) => f,
            Err(e) => return cors_text_response(&format!("Error: {}", e), StatusCode::BAD_GATEWAY),
        };
        let warnings = match fetch_warnings(&adm4).await {
            Ok(w) => w,
            Err(e) => return cors_text_response(&format!("Error: {}", e), StatusCode::BAD_GATEWAY),
        };
        
        let format = url.query_pairs().find(|(k, _)| k == "format").map(|(_, v)| v.to_string());
        
        if format.as_deref() == Some("3") || format.as_deref() == Some("short") {
            let cuaca_forecast = convert_forecast(&forecast);
            let current = cuaca_forecast.first_slot();
            let icon = match current {
                Some(s) => cuaca::icons::ascii_icon(s.weather),
                None => cuaca::icons::ascii_icon(0),
            };
            let text = format!("{}: {} {}", get_location_name(&cuaca_forecast), icon[0], format_temp(current.map(|s| s.t).unwrap_or(0)));
            return cors_text_response(&text, StatusCode::OK);
        }
        
        let accept_header = header_to_string(&req.headers(), "Accept");
        let accepts_html = accept_header.contains("text/html");
        
        let cuaca_forecast = convert_forecast(&forecast);
        let cuaca_warnings = convert_warnings(&warnings);
        
        if accepts_html {
            let html = render_html_cuaca(&cuaca_forecast);
            return cors_html_response(html);
        } else {
            let text = render_terminal(&Config::default(), &cuaca_forecast, &cuaca_warnings);
            return cors_text_response(&text, StatusCode::OK);
        }
    }

    // GET /:location
    let url2 = req.url()?;
    let path_str2 = url2.path();
    if path_str2.len() > 1 && !path_str2.starts_with("/api") {
        let location_name = &path_str2[1..];
        let adm4 = resolve_location(location_name).await.unwrap_or_else(|| "31.71.03.1001".to_string());
        
        let forecast = match fetch_forecast(&adm4).await {
            Ok(f) => f,
            Err(e) => return cors_text_response(&format!("Error: {}", e), StatusCode::BAD_GATEWAY),
        };
        let warnings = match fetch_warnings(&adm4).await {
            Ok(w) => w,
            Err(e) => return cors_text_response(&format!("Error: {}", e), StatusCode::BAD_GATEWAY),
        };
        
        let format = url2.query_pairs().find(|(k, _)| k == "format").map(|(_, v)| v.to_string());
        
        if format.as_deref() == Some("3") || format.as_deref() == Some("short") {
            let cuaca_forecast = convert_forecast(&forecast);
            let current = cuaca_forecast.first_slot();
            let icon = match current {
                Some(s) => cuaca::icons::ascii_icon(s.weather),
                None => cuaca::icons::ascii_icon(0),
            };
            let text = format!("{}: {} {}", get_location_name(&cuaca_forecast), icon[0], format_temp(current.map(|s| s.t).unwrap_or(0)));
            return cors_text_response(&text, StatusCode::OK);
        }
        
        let accept_header = header_to_string(&req.headers(), "Accept");
        let accepts_html = accept_header.contains("text/html");
        
        let cuaca_forecast = convert_forecast(&forecast);
        let cuaca_warnings = convert_warnings(&warnings);
        
        if accepts_html {
            let html = render_html_cuaca(&cuaca_forecast);
            return cors_html_response(html);
        } else {
            let text = render_terminal(&Config::default(), &cuaca_forecast, &cuaca_warnings);
            return cors_text_response(&text, StatusCode::OK);
        }
    }

    json_error("Not found", StatusCode::NOT_FOUND)
}

fn cors_headers(mut resp: Response) -> Result<Response> {
    let mut headers = Headers::new();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")?;
    headers.set("Access-Control-Allow-Headers", "Content-Type")?;
    let resp_headers = resp.headers_mut();
    resp_headers.set("Access-Control-Allow-Origin", "*")?;
    resp_headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")?;
    resp_headers.set("Access-Control-Allow-Headers", "Content-Type")?;
    Ok(resp)
}

fn cors_json_response<T: serde::Serialize>(data: T) -> Result<Response> {
    cors_headers(Response::from_json(&data)?)
}

fn cors_text_response(text: &str, status: StatusCode) -> Result<Response> {
    let mut resp = Response::ok(text)?;
    resp = resp.with_status(status.as_u16());
    cors_headers(resp)
}

fn cors_html_response(html: String) -> Result<Response> {
    let mut resp = Response::ok(html)?;
    resp.headers_mut().set("Content-Type", "text/html; charset=utf-8")?;
    cors_headers(resp)
}

fn json_error(msg: &str, status: StatusCode) -> Result<Response> {
    let body = serde_json::to_string(&serde_json::json!({ "error": msg })).unwrap();
    let mut resp = Response::ok(body)?;
    resp = resp.with_status(status.as_u16());
    cors_headers(resp)
}

async fn resolve_adm4_from_request(req: &Request, url: &Url) -> Option<String> {
    if let Some(adm4) = url.query_pairs().find(|(k, _)| k == "adm4").map(|(_, v)| v.to_string()) {
        return Some(adm4);
    }
    if let (Some(lat), Some(lon)) = (
        url.query_pairs().find(|(k, _)| k == "lat").and_then(|(_, v)| v.parse().ok()),
        url.query_pairs().find(|(k, _)| k == "lon").and_then(|(_, v)| v.parse().ok()),
    ) {
        if let Ok(results) = nearest_wilayah(lat, lon, 1).await {
            if let Some(first) = results.first() {
                return Some(first.code.clone());
            }
        }
    }
    let lat = header_to_parsed::<f64>(req.headers(), "CF-IPLatitude");
    let lon = header_to_parsed::<f64>(req.headers(), "CF-IPLongitude");
    if let (Some(lat), Some(lon)) = (lat, lon) {
        if let Ok(results) = nearest_wilayah(lat, lon, 1).await {
            if let Some(first) = results.first() {
                return Some(first.code.clone());
            }
        }
    }
    None
}

async fn resolve_location(name: &str) -> Option<String> {
    if regex::Regex::new(r"^\d{2}(\.\d{2}){3}$").unwrap().is_match(name) {
        return Some(name.to_string());
    }
    if let Ok(results) = search_wilayah(name, 1).await {
        if let Some(first) = results.first() {
            return Some(first.code.clone());
        }
    }
    let known = [
        ("jakarta", "31.71.03.1001"), ("kemayoran", "31.71.03.1001"),
        ("gambir", "31.71.01.1001"), ("bandung", "32.73.07.1001"),
        ("cibeunying", "32.73.07.1001"), ("semarang", "33.74.07.1001"),
        ("surabaya", "35.78.03.1001"), ("yogyakarta", "34.71.07.1001"),
        ("jogja", "34.71.07.1001"), ("medan", "12.71.07.1001"),
        ("makassar", "73.71.07.1001"), ("denpasar", "51.71.07.1001"),
        ("bali", "51.71.07.1001"), ("palembang", "16.71.07.1001"),
        ("batam", "21.71.07.1001"), ("bogor", "32.71.07.1001"),
        ("depok", "32.76.07.1001"), ("tangerang", "36.71.07.1001"),
        ("bekasi", "32.75.07.1001"),
    ];
    known.iter().find(|(k, _)| *k == name.to_lowercase()).map(|(_, v)| v.to_string())
}

fn get_location_name(forecast: &CuacaForecast) -> String {
    let loc = &forecast.location;
    [loc.desa.as_str(), loc.kecamatan.as_str(), loc.kotkab.as_str(), loc.provinsi.as_str()]
        .into_iter()
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn format_temp(temp: i64) -> String {
    format!("{:+}°C", temp)
}

fn convert_forecast(f: &BmkgForecast) -> CuacaForecast {
    let location = CuacaLocation {
        adm1: f.location.adm1.clone(),
        adm2: f.location.adm2.clone(),
        adm3: f.location.adm3.clone(),
        adm4: f.location.adm4.clone(),
        provinsi: f.location.provinsi.clone(),
        kotkab: f.location.kotkab.clone(),
        kecamatan: f.location.kecamatan.clone(),
        desa: f.location.desa.clone(),
        lat: f.location.lat,
        lon: f.location.lon,
        timezone: Some(f.location.timezone.clone()),
    };
    
    let groups: Vec<SlotGroup> = f.forecast.iter().collect::<Vec<_>>().chunks(8).map(|chunk| {
        let slots: Vec<CuacaSlot> = chunk.iter().map(|item| CuacaSlot {
            datetime: Some(item.time.clone()),
            local_datetime: Some(item.time.clone()),
            utc_datetime: None,
            t: item.temp as i64,
            hu: item.humidity as i64,
            tcc: item.cloud_cover as i64,
            tp: item.rain_prob as f64 / 100.0,
            ws: item.wind_speed,
            wd_deg: 0,
            wd: item.wind_dir.clone(),
            wd_to: None,
            vs: None,
            vs_text: None,
            weather: item.weather as i64,
            weather_desc: Some(item.condition.clone()),
            weather_desc_en: Some(item.condition_en.clone()),
            image: None,
            time_index: None,
            analysis_date: Some(f.analysis_date.clone()),
        }).collect();
        SlotGroup { slots }
    }).collect();
    
    CuacaForecast { location, groups }
}

fn convert_warnings(warnings: &[BmkgWarning]) -> Vec<CuacaWarning> {
    warnings.iter().filter_map(|w| {
        let polygons: Vec<Vec<(f64, f64)>> = w.polygon.as_ref().and_then(|p| {
            let parsed = cuaca::warnings::parse_polygon(p);
            if parsed.is_empty() { None } else { Some(vec![parsed]) }
        }).unwrap_or_default();
        
        let effective = w.effective.parse::<chrono::DateTime<chrono::Utc>>().ok();
        let expires = w.expires.parse::<chrono::DateTime<chrono::Utc>>().ok();
        
        Some(CuacaWarning {
            headline: w.event.clone(),
            area_desc: w.area_desc.clone(),
            effective,
            expires,
            polygons,
            web: None,
        })
    }).collect()
}

fn render_html_cuaca(forecast: &CuacaForecast) -> String {
    let first = forecast.first_slot();
    let (temp, condition, humidity, wind_speed, wind_dir, vis_text, tp) = match first {
        Some(s) => (
            s.t,
            s.desc(cuaca::lang::Lang::ID),
            s.hu,
            s.ws,
            s.wd.clone(),
            s.vs_text.clone().unwrap_or_else(|| "?".to_string()),
            s.tp,
        ),
        None => (0, "Unknown", 0, 0.0, "?".to_string(), "?".to_string(), 0.0),
    };
    
    let location_name = get_location_name(forecast);
    let icon = cuaca::icons::ascii_icon(first.map(|s| s.weather).unwrap_or(0));
    
    format!(r#"
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cuaca: {}</title>
    <style>
        body {{ font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; margin: 0; }}
        .container {{ max-width: 600px; margin: 0 auto; }}
        .header {{ color: #00d9ff; font-size: 1.5em; margin-bottom: 10px; }}
        .location {{ color: #aaa; margin-bottom: 20px; }}
        .icon {{ font-size: 3em; line-height: 1.2; white-space: pre; font-family: monospace; }}
        .main-info {{ display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }}
        .info-item {{ background: #16213e; padding: 15px; border-radius: 8px; flex: 1; min-width: 120px; }}
        .info-label {{ color: #888; font-size: 0.85em; text-transform: uppercase; }}
        .info-value {{ font-size: 1.5em; font-weight: bold; color: #fff; }}
        .forecast-table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
        .forecast-table th, .forecast-table td {{ padding: 10px; text-align: left; border-bottom: 1px solid #333; }}
        .forecast-table th {{ color: #00d9ff; font-weight: normal; }}
        .day-header {{ background: #16213e; color: #00d9ff; }}
        .source {{ color: #666; font-size: 0.8em; margin-top: 20px; text-align: center; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">Laporan Cuaca</div>
        <div class="location">{}</div>
        <div class="icon">{}</div>
        <div class="main-info">
            <div class="info-item"><div class="info-label">Suhu</div><div class="info-value">{}°C</div></div>
            <div class="info-item"><div class="info-label">Kondisi</div><div class="info-value">{}</div></div>
            <div class="info-item"><div class="info-label">Kelembaban</div><div class="info-value">{}%</div></div>
            <div class="info-item"><div class="info-label">Angin</div><div class="info-value">{} {} km/jam</div></div>
            <div class="info-item"><div class="info-label">Visibilitas</div><div class="info-value">{}</div></div>
            <div class="info-item"><div class="info-label">Hujan</div><div class="info-value">{} mm</div></div>
        </div>
        <table class="forecast-table">
            <thead>
                <tr><th>Waktu</th><th>Suhu</th><th>Kondisi</th><th>Angin</th><th>Awan</th><th>Hujan</th><th>Vis</th></tr>
            </thead>
            <tbody>
                {}
            </tbody>
        </table>
        <div class="source">Data dari BMKG</div>
    </div>
</body>
</html>
"#,
        location_name,
        location_name,
        icon.join("\n"),
        temp,
        condition,
        humidity,
        wind_dir,
        wind_speed,
        vis_text,
        tp,
        render_forecast_rows(forecast)
    )
}

fn render_forecast_rows(forecast: &CuacaForecast) -> String {
    let mut rows = String::new();
    for (day_idx, group) in forecast.groups.iter().enumerate() {
        if day_idx >= 3 { break; }
        let date_str = group.slots.first()
            .and_then(|s| s.local_dt())
            .map(|dt| dt.date().format("%a %d %b").to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        
        let day_label = match day_idx {
            0 => "Hari Ini",
            1 => "Besok",
            2 => "Lusa",
            _ => "Hari ke-",
        };
        
        rows.push_str(&format!(
            r#"<tr class="day-header"><td colspan="7">{}, {}</td></tr>"#,
            day_label, date_str
        ));
        
        for slot in &group.slots {
            let time_str = slot.local_dt()
                .map(|dt| dt.format("%H:%M").to_string())
                .unwrap_or_else(|| "??:??".to_string());
            
            let temp_c = slot.t;
            let temp_str = format!("{}°C", temp_c);
            let condition = slot.desc(cuaca::lang::Lang::ID);
            let wind_str = format!("{} {:.0} km/jam", slot.wd, slot.ws);
            let cloud_str = format!("{:.0}%", slot.tcc as f64);
            let precip_str = format!("{:.1} mm", slot.tp);
            let vis_str = slot.vs_text.as_deref().unwrap_or("?");
            
            rows.push_str(&format!(
                r#"<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                time_str, temp_str, condition, wind_str, cloud_str, precip_str, vis_str
            ));
        }
    }
    rows
}