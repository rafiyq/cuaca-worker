use worker::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct WilayahResult {
    pub code: String,
    pub name: String,
    pub district: String,
    pub city: String,
    pub province: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Deserialize, Serialize)]
struct WilayahSearchResponse {
    results: Vec<WilayahResult>,
}

#[derive(Debug, Deserialize, Serialize)]
struct WilayahNearestResponse {
    results: Vec<WilayahResult>,
}

const WILAYAH_API: &str = "https://api.wilayah.workers.dev";

pub async fn search_wilayah(query: &str, limit: usize) -> Result<Vec<WilayahResult>> {
    let url = format!("{}/search?q={}&limit={}", WILAYAH_API, urlencoding::encode(query), limit);
    
    let req = Request::new_with_init(&url, &RequestInit {
        method: Method::Get,
        headers: {
            let mut h = Headers::new();
            h.set("User-Agent", "cuaca-worker-rs/1.0").unwrap();
            h
        },
        cf: CfProperties {
            cache_ttl: Some(86400),
            cache_everything: Some(true),
            ..Default::default()
        },
        ..Default::default()
    })?;
    
    let mut resp = Fetch::Request(req).send().await?;
    
    if resp.status_code() != 200 {
        return Err(Error::RustError(format!("Wilayah API {}", resp.status_code())));
    }
    
    let data: WilayahSearchResponse = resp.json().await?;
    Ok(data.results)
}

pub async fn nearest_wilayah(lat: f64, lon: f64, limit: usize) -> Result<Vec<WilayahResult>> {
    let url = format!("{}/nearest?lat={}&lon={}&limit={}", WILAYAH_API, lat, lon, limit);
    
    let req = Request::new_with_init(&url, &RequestInit {
        method: Method::Get,
        headers: {
            let mut h = Headers::new();
            h.set("User-Agent", "cuaca-worker-rs/1.0").unwrap();
            h
        },
        cf: CfProperties {
            cache_ttl: Some(86400),
            cache_everything: Some(true),
            ..Default::default()
        },
        ..Default::default()
    })?;
    
    let mut resp = Fetch::Request(req).send().await?;
    
    if resp.status_code() != 200 {
        return Err(Error::RustError(format!("Wilayah API {}", resp.status_code())));
    }
    
    let data: WilayahNearestResponse = resp.json().await?;
    Ok(data.results)
}

pub async fn locate_wilayah(lat: f64, lon: f64) -> Result<serde_json::Value> {
    let url = format!("{}/locate?lat={}&lon={}", WILAYAH_API, lat, lon);
    
    let req = Request::new_with_init(&url, &RequestInit {
        method: Method::Get,
        headers: {
            let mut h = Headers::new();
            h.set("User-Agent", "cuaca-worker-rs/1.0").unwrap();
            h
        },
        cf: CfProperties {
            cache_ttl: Some(86400),
            cache_everything: Some(true),
            ..Default::default()
        },
        ..Default::default()
    })?;
    
    let mut resp = Fetch::Request(req).send().await?;
    
    if resp.status_code() != 200 {
        return Err(Error::RustError(format!("Wilayah API {}", resp.status_code())));
    }
    
    let data: serde_json::Value = resp.json().await?;
    Ok(data)
}
