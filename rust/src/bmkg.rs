use worker::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct BmkgResponse {
    pub lokasi: BmkgLocation,
    pub data: Vec<BmkgData>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BmkgLocation {
    pub adm1: String,
    pub adm2: String,
    pub adm3: String,
    pub adm4: String,
    pub provinsi: String,
    pub kotkab: String,
    pub kecamatan: String,
    pub desa: String,
    pub lon: f64,
    pub lat: f64,
    pub timezone: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BmkgData {
    pub lokasi: BmkgLocation,
    pub cuaca: Vec<Vec<BmkgForecastItem>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BmkgForecastItem {
    pub datetime: String,
    pub t: i32,
    pub tcc: i32,
    pub tp: f64,
    pub weather: i32,
    pub weather_desc: String,
    pub weather_desc_en: String,
    pub wd_deg: i32,
    pub wd: String,
    pub wd_to: String,
    pub ws: f64,
    pub hu: i32,
    pub vs: Option<f64>,
    pub vs_text: Option<String>,
    pub time_index: String,
    pub analysis_date: String,
    pub image: String,
    pub utc_datetime: String,
    pub local_datetime: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BmkgForecast {
    pub location: BmkgLocation,
    pub forecast: Vec<SimpleForecast>,
    pub analysis_date: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SimpleForecast {
    pub time: String,
    pub temp: i32,
    pub condition: String,
    pub condition_en: String,
    pub humidity: i32,
    pub wind_speed: f64,
    pub wind_dir: String,
    pub cloud_cover: i32,
    pub rain_prob: i32,
    pub weather: i32,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BmkgWarning {
    pub id: String,
    pub event: String,
    pub severity: String,
    pub urgency: String,
    pub certainty: String,
    pub effective: String,
    pub expires: String,
    pub description: String,
    pub instruction: String,
    pub area_desc: String,
    pub polygon: Option<String>,
    pub geocode: std::collections::HashMap<String, String>,
}

pub async fn fetch_forecast(adm4: &str) -> Result<BmkgForecast> {
    let url = format!("https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={}", adm4);
    
    let req = Request::new_with_init(&url, &RequestInit {
        method: Method::Get,
        headers: {
            let mut h = Headers::new();
            h.set("User-Agent", "cuaca-worker-rs/1.0").unwrap();
            h
        },
        cf: CfProperties {
            cache_ttl: Some(300),
            cache_everything: Some(true),
            ..Default::default()
        },
        ..Default::default()
    })?;
    
    let mut resp = Fetch::Request(req).send().await?;
    
    if resp.status_code() != 200 {
        let text = resp.text().await?;
        return Err(Error::RustError(format!("BMKG {}: {}", resp.status_code(), text)));
    }
    
    let data: BmkgResponse = resp.json().await?;
    
    let analysis_date = data.data.first()
        .and_then(|d| d.cuaca.first())
        .and_then(|c| c.first())
        .map(|i| i.analysis_date.clone())
        .unwrap_or_default();
    
    let all_slots: Vec<BmkgForecastItem> = data.data.into_iter()
        .flat_map(|day| day.cuaca.into_iter().flatten())
        .collect();
    
    let forecast: Vec<SimpleForecast> = all_slots.into_iter().map(|item| SimpleForecast {
        time: item.local_datetime,
        temp: item.t,
        condition: item.weather_desc,
        condition_en: item.weather_desc_en,
        humidity: item.hu,
        wind_speed: item.ws,
        wind_dir: item.wd,
        cloud_cover: item.tcc,
        rain_prob: (item.tp * 100.0).round() as i32,
        weather: item.weather,
    }).collect();
    
    Ok(BmkgForecast {
        location: data.lokasi,
        forecast,
        analysis_date,
    })
}

pub async fn fetch_warnings(adm4: &str) -> Result<Vec<BmkgWarning>> {
    let url = format!("https://api.bmkg.go.id/publik/peringatan-dini-cuaca?adm4={}", adm4);
    
    let req = Request::new_with_init(&url, &RequestInit {
        method: Method::Get,
        headers: {
            let mut h = Headers::new();
            h.set("User-Agent", "cuaca-worker-rs/1.0").unwrap();
            h
        },
        cf: CfProperties {
            cache_ttl: Some(900),
            cache_everything: Some(true),
            ..Default::default()
        },
        ..Default::default()
    })?;
    
    let mut resp = Fetch::Request(req).send().await?;
    
    if resp.status_code() != 200 {
        return Ok(vec![]);
    }
    
    let xml = resp.text().await?;
    Ok(parse_cap_warnings(&xml))
}

fn parse_cap_warnings(xml: &str) -> Vec<BmkgWarning> {
    let mut warnings = vec![];
    
    let alert_regex = regex::Regex::new(r"(?s)<alert>(.*?)</alert>").unwrap();
    let tag_regex = regex::Regex::new(r"<(\w+)>(.*?)</\1>").unwrap();
    let info_regex = regex::Regex::new(r"(?s)<info>(.*?)</info>").unwrap();
    let area_regex = regex::Regex::new(r"(?s)<area>(.*?)</area>").unwrap();
    let geocode_regex = regex::Regex::new(r"<geocode><valueName>(.*?)</valueName><value>(.*?)</value></geocode>").unwrap();
    
    for alert_match in alert_regex.captures_iter(xml) {
        let alert_xml = &alert_match[1];
        
        let get_tag = |_tag: &str| -> String {
            tag_regex.captures(alert_xml)
                .and_then(|c| c.get(2))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default()
        };
        
        for info_match in info_regex.captures_iter(xml) {
            let info_xml = &info_match[1];
            
            for area_match in area_regex.captures_iter(info_xml) {
                let area_xml = &area_match[1];
                
                let area_desc = tag_regex.captures(area_xml)
                    .and_then(|c| c.get(2))
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default();
                
                let polygon = tag_regex.captures(area_xml)
                    .and_then(|c| c.get(2))
                    .map(|m| m.as_str().trim().to_string());
                
                let mut geocode = std::collections::HashMap::new();
                for cap in geocode_regex.captures_iter(area_xml) {
                    geocode.insert(cap[1].to_string(), cap[2].to_string());
                }
                
                warnings.push(BmkgWarning {
                    id: "".to_string(),
                    event: get_tag("event"),
                    severity: get_tag("severity"),
                    urgency: get_tag("urgency"),
                    certainty: get_tag("certainty"),
                    effective: get_tag("effective"),
                    expires: get_tag("expires"),
                    description: get_tag("description"),
                    instruction: get_tag("instruction"),
                    area_desc,
                    polygon,
                    geocode,
                });
            }
        }
    }
    
    warnings
}