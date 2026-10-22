use serde::{Deserialize, Serialize};
use crate::bmkg::{SimpleForecast, BmkgWarning};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenderData {
    pub desa: String,
    pub kecamatan: String,
    pub kotkab: String,
    pub provinsi: String,
    pub lat: f64,
    pub lon: f64,
    pub adm4: String,
}

impl RenderData {
    pub fn from_forecast(forecast: &crate::bmkg::BmkgForecast) -> Self {
        Self {
            desa: forecast.location.desa.clone(),
            kecamatan: forecast.location.kecamatan.clone(),
            kotkab: forecast.location.kotkab.clone(),
            provinsi: forecast.location.provinsi.clone(),
            lat: forecast.location.lat,
            lon: forecast.location.lon,
            adm4: forecast.location.adm4.clone(),
        }
    }
}

const ASCII_ICONS: &[(&[i32], [&str; 3])] = &[
    (&[0], ["     .--.     ", "    /    \\    ", "   '      '   "]),
    (&[1], ["     .--.     ", "   .'  '.    ", "  '      '   "]),
    (&[2,3,4], ["    .--.      ", "   /    \\     ", "  '      '   "]),
    (&[5], ["   _ - _ - _  ", "  _ - _ - _  ", "   _ - _ - _  "]),
    (&[10,11], ["     .--.     ", "  .'    '.    ", " '  |  | '  "]),
    (&[12], ["     .--.     ", "  .'    '.    ", " '  || || '  "]),
    (&[13,14], ["     .--.     ", "  .' /\\ '.    ", " '  /  \\ '  "]),
];

fn get_ascii_icon(code: i32, hour: u32) -> [&'static str; 3] {
    let is_day = hour >= 6 && hour < 18;
    for (codes, icon) in ASCII_ICONS {
        if codes.contains(&code) {
            if is_day || code != 0 {
                return *icon;
            }
        }
    }
    if code == 0 && !is_day { return ["     `--'     ", "    \\    /    ", "   '      '   "]; }
    if code == 1 && !is_day { return ["     `--'     ", "   .'  '.    ", "  '      '   "]; }
    ASCII_ICONS[0].1
}

fn get_icon_label(code: i32) -> &'static str {
    match code {
        0 => "Cerah",
        1 => "Cerah Berawan",
        2 | 3 | 4 => "Berawan",
        5 => "Kabut",
        10 => "Hujan Ringan",
        11 => "Hujan",
        12 => "Hujan Lebat",
        13 | 14 => "Hujan Petir",
        _ => "Cerah",
    }
}

fn format_temp(temp: i32) -> String {
    format!("{:+}°C", temp)
}

fn format_wind(speed: f64, dir: &str) -> String {
    let arrow = match dir {
        "N" | "NNE" => "↑", "NE" => "↗", "ENE" | "E" | "ESE" => "→",
        "SE" => "↘", "SSE" | "S" | "SSW" => "↓", "SW" => "↙",
        "WSW" | "W" | "WNW" => "←", "NW" => "↖", "NNW" => "↑",
        _ => "↗",
    };
    format!("{} {:.1} km/h", arrow, speed)
}

fn ansi_temp(temp: i32) -> String {
    let colored = if temp >= 35 { format!("\x1b[38;5;196m{}\x1b[0m", format_temp(temp)) }
    else if temp >= 30 { format!("\x1b[38;5;202m{}\x1b[0m", format_temp(temp)) }
    else if temp >= 25 { format!("\x1b[38;5;226m{}\x1b[0m", format_temp(temp)) }
    else if temp >= 20 { format!("\x1b[38;5;118m{}\x1b[0m", format_temp(temp)) }
    else { format!("\x1b[38;5;51m{}\x1b[0m", format_temp(temp)) };
    colored
}

fn pad_cell(content: &str, width: usize) -> String {
    let visual_width = content.chars().count();
    if visual_width >= width {
        content.chars().take(width).collect()
    } else {
        format!("{}{}", content, " ".repeat(width - visual_width))
    }
}

pub fn render_terminal(location: &RenderData, forecast: &[SimpleForecast], warnings: &[crate::bmkg::BmkgWarning]) -> String {
    let mut lines = vec![];
    
    lines.push(format!("\x1b[1mWeather report: {}, {}\x1b[0m", location.desa, location.kecamatan));
    lines.push("".to_string());
    
    let current = &forecast[0];
    let hour = current.time.split(' ').nth(1).and_then(|t| t.split(':').next()).and_then(|h| h.parse().ok()).unwrap_or(12);
    let icon = get_ascii_icon(current.weather, hour);
    
    lines.push(format!("     {}       {}", icon[0], current.condition));
    lines.push(format!("      __)      {}", ansi_temp(current.temp)));
    lines.push(format!("     (         {}", format_wind(current.wind_speed, &current.wind_dir)));
    lines.push(format!("      `-’      {}% humidity", current.humidity));
    lines.push(format!("       •       {}% rain", current.rain_prob));
    lines.push("".to_string());
    
    if !warnings.is_empty() {
        lines.push("\x1b[41m\x1b[97m ⚠ WEATHER WARNINGS \x1b[0m".to_string());
        for w in warnings.iter().take(3) {
            lines.push(format!("  {} ({})", w.event, w.severity));
            lines.push(format!("  {} → {}", w.effective, w.expires));
            if !w.description.is_empty() {
                lines.push(format!("  {}", w.description.chars().take(80).collect::<String>()));
            }
        }
        lines.push("".to_string());
    }
    
    let mut days: std::collections::HashMap<String, Vec<&SimpleForecast>> = std::collections::HashMap::new();
    for f in forecast {
        let date = f.time.split(' ').next().unwrap_or("").to_string();
        days.entry(date).or_default().push(f);
    }
    
    let mut sorted_dates: Vec<_> = days.keys().cloned().collect();
    sorted_dates.sort();
    
    for (day_idx, date) in sorted_dates.iter().enumerate() {
        if day_idx >= 3 { break; }
        
        let day_name = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map(|d| d.format("%a, %d %b").to_string())
            .unwrap_or_else(|_| date.clone());
        
        lines.push(format!("\x1b[44m\x1b[97m {} \x1b[0m", day_name));
        
        let mut slots = days[date].iter().cloned().collect::<Vec<_>>();
        slots.sort_by_key(|f| f.time.clone());
        let slots = slots.into_iter().take(8).collect::<Vec<_>>();
        
        let cell_w = 28;
        let n = slots.len();
        
        let mut top = "┌".to_string();
        for i in 0..n {
            top += &"─".repeat(cell_w);
            top += if i == n - 1 { "┐" } else { "┬" };
        }
        lines.push(top);
        
        let mut header = "│".to_string();
        for s in &slots {
            let h = s.time.split(' ').nth(1).unwrap_or("").split(':').next().unwrap_or("");
            header += &pad_cell(&format!(" {}:00 ", h), cell_w);
            header += "│";
        }
        lines.push(header);
        
        let mut sep = "├".to_string();
        for i in 0..n {
            sep += &"─".repeat(cell_w);
            sep += if i == n - 1 { "┤" } else { "┼" };
        }
        lines.push(sep);
        
        let mut icon_row0 = "│".to_string();
        let mut icon_row1 = "│".to_string();
        let mut icon_row2 = "│".to_string();
        let mut temp_row = "│".to_string();
        let mut wind_row = "│".to_string();
        let mut cloud_row = "│".to_string();
        let mut rain_row = "│".to_string();
        
        for s in &slots {
            let h = s.time.split(' ').nth(1).and_then(|t| t.split(':').next()).and_then(|h| h.parse().ok()).unwrap_or(12);
            let icon = get_ascii_icon(s.weather, h);
            let label = get_icon_label(s.weather);
            
            icon_row0 += &pad_cell(&format!(" {} {} ", icon[0], label), cell_w);
            icon_row0 += "│";
            icon_row1 += &pad_cell(&format!(" {} ", icon[1]), cell_w);
            icon_row1 += "│";
            icon_row2 += &pad_cell(&format!(" {} {} ", icon[2], format_temp(s.temp)), cell_w);
            icon_row2 += "│";
            temp_row += &pad_cell(&format!(" {} ", format_wind(s.wind_speed, &s.wind_dir)), cell_w);
            temp_row += "│";
            cloud_row += &pad_cell(&format!(" {}% cloud ", s.cloud_cover), cell_w);
            cloud_row += "│";
            rain_row += &pad_cell(&format!(" R{}% H{}% ", s.rain_prob, s.humidity), cell_w);
            rain_row += "│";
        }
        
        lines.push(icon_row0);
        lines.push(icon_row1);
        lines.push(icon_row2);
        lines.push(temp_row);
        lines.push(cloud_row);
        lines.push(rain_row);
        
        let mut bot = "└".to_string();
        for i in 0..n {
            bot += &"─".repeat(cell_w);
            bot += if i == n - 1 { "┘" } else { "┴" };
        }
        lines.push(bot);
        lines.push("".to_string());
    }
    
    lines.push(format!("Location: {}, {}, {}, {} [{},{}]", 
        location.desa, location.kecamatan, location.kotkab, location.provinsi, location.lat, location.lon));
    lines.push("".to_string());
    lines.push("\x1b[2mData: BMKG | Location: wilayah.workers.dev\x1b[0m".to_string());
    
    lines.join("\n")
}

pub fn render_html(location: &RenderData, forecast: &[SimpleForecast], warnings: &[crate::bmkg::BmkgWarning]) -> String {
    let terminal = render_terminal(location, forecast, warnings);
    let html = terminal
        .replace('&', "&")
        .replace('<', "<")
        .replace('>', ">")
        .replace("\x1b[1m", "<strong>")
        .replace("\x1b[2m", "<span style='opacity:0.6'>")
        .replace("\x1b[38;5;196m", "<span style='color:#ff0000'>")
        .replace("\x1b[38;5;202m", "<span style='color:#ff5f00'>")
        .replace("\x1b[38;5;226m", "<span style='color:#ffff00'>")
        .replace("\x1b[38;5;118m", "<span style='color:#87ff00'>")
        .replace("\x1b[38;5;51m", "<span style='color:#00ffff'>")
        .replace("\x1b[44m\x1b[97m", "<span style='background:#0000af;color:#fff'>")
        .replace("\x1b[44m", "<span style='background:#0000af'>")
        .replace("\x1b[41m", "<span style='background:#ff0000;color:#fff'>")
        .replace("\x1b[43m", "<span style='background:#ffff00;color:#000'>")
        .replace("\x1b[0m", "</span>")
        .replace('\n', "<br>");
    
    format!(r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>cuaca - {desa}</title>
<style>
body {{ font-family: 'JetBrains Mono', monospace; background: #1a1b26; color: #c0caf5; padding: 20px; line-height: 1.6; font-size: 14px; }}
pre {{ white-space: pre-wrap; }}
a {{ color: #7aa2f7; }}
.hint {{ color: #565f89; font-size: 12px; margin-top: 20px; }}
</style>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
</head><body><pre>{html}</pre>
<div class="hint">Try: <code>curl {desa}</code> | Data: <a href="https://bmkg.go.id">BMKG</a> | Geo: <a href="https://api.wilayah.workers.dev">wilayah.workers.dev</a></div>
</body></html>"#, desa = location.desa, html = html)
}
