use worker::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use serde_json::json;
use js_sys::Reflect;

// Custom AI binding wrapper
#[derive(Clone)]
pub struct AiBinding(pub JsValue);

impl EnvBinding for AiBinding {
    const TYPE_NAME: &'static str = "Ai";
}

impl JsCast for AiBinding {
    fn instanceof(val: &JsValue) -> bool {
        Reflect::has(val, &JsValue::from_str("run")).unwrap_or(false)
    }

    fn unchecked_from_js(val: JsValue) -> Self {
        AiBinding(val)
    }

    fn unchecked_from_js_ref(val: &JsValue) -> &Self {
        unsafe { &*(val as *const JsValue as *const Self) }
    }
}

impl From<JsValue> for AiBinding {
    fn from(val: JsValue) -> Self {
        AiBinding(val)
    }
}

impl From<AiBinding> for JsValue {
    fn from(binding: AiBinding) -> Self {
        binding.0
    }
}

impl AsRef<JsValue> for AiBinding {
    fn as_ref(&self) -> &JsValue {
        &self.0
    }
}

pub async fn generate_report(
    ai: AiBinding,
    forecast: &crate::bmkg::BmkgForecast,
    warnings: &[crate::bmkg::BmkgWarning],
    style: &str,
) -> Result<String> {
    let current = &forecast.forecast[0];
    let location_name = format!("{}, {}, {}", forecast.location.desa, forecast.location.kecamatan, forecast.location.kotkab);
    
    let next24h: String = forecast.forecast.iter().take(8).map(|f| {
        let hour = f.time.split(' ').nth(1).unwrap_or("").split(':').next().unwrap_or("");
        format!("{}:00 {} {}°C (rain {}%, wind {:.1}km/h {})", hour, f.condition, f.temp, f.rain_prob, f.wind_speed, f.wind_dir)
    }).collect::<Vec<_>>().join("; ");
    
    let warning_text = if warnings.is_empty() {
        "Tidak ada peringatan cuaca.".to_string()
    } else {
        warnings.iter().map(|w| format!("{} ({})", w.event, w.severity)).collect::<Vec<_>>().join("; ")
    };
    
    let prompt = match style {
        "detailed" => format!(
            "Tulis laporan cuaca detail untuk {} dalam Bahasa Indonesia. Sertakan kondisi saat ini, prakiraan 24 jam, dan peringatan jika ada. Gunakan bahasa natural dan informatif.\n\nSaat ini: {} {}°C, kelembaban {}%, angin {:.1}km/h {}\n24 jam: {}\nPeringatan: {}",
            location_name, current.condition, current.temp, current.humidity, current.wind_speed, current.wind_dir, next24h, warning_text
        ),
        "conversational" => format!(
            "Tulis update cuaca santai seperti teman ngobrol untuk warga {}. Sebutkan kondisi sekarang, apa yang diharapkan hari ini, dan saran praktis (misal bawa payung). Tone ramah dan natural.\n\nSekarang: {} {}°C\n24 jam: {}\nPeringatan: {}",
            location_name, current.condition, current.temp, next24h, warning_text
        ),
        _ => format!(
            "Tulis ringkasan cuaca 2 kalimat untuk {} dalam Bahasa Indonesia. Saat ini {} {}°C. {}.",
            location_name, current.condition, current.temp,
            if warnings.is_empty() { "Tidak ada peringatan".to_string() } else { format!("Ada peringatan: {}", warning_text) }
        ),
    };
    
    let model = JsValue::from_str("@cf/meta/llama-3.1-8b-instruct");
    let input_val = serde_wasm_bindgen::to_value(&json!({
        "messages": [
            { "role": "system", "content": "Kamu asisten cuaca Indonesia yang membantu. Tulis dalam Bahasa Indonesia yang natural dan membantu." },
            { "role": "user", "content": prompt }
        ],
        "max_tokens": if style == "detailed" { 300 } else { 150 },
        "temperature": 0.7,
    })).map_err(|e| Error::RustError(e.to_string()))?;
    
    let ai_obj: &JsValue = ai.0.as_ref();
    let run_fn = Reflect::get(ai_obj, &JsValue::from_str("run"))
        .map_err(|_| Error::RustError("AI binding has no run method".to_string()))?;
    
    let run_fn: js_sys::Function = run_fn.dyn_into().map_err(|_| Error::RustError("run is not a function".to_string()))?;
    
    let promise = run_fn.call2(ai.0.as_ref(), &model, &input_val)
        .map_err(|e| Error::RustError(format!("AI call failed: {:?}", e)))?;
    
    let promise: js_sys::Promise = promise.dyn_into().map_err(|_| Error::RustError("AI did not return a Promise".to_string()))?;
    
    let result = JsFuture::from(promise).await
        .map_err(|e| Error::RustError(format!("AI promise failed: {:?}", e)))?;
    
    let result: serde_json::Value = serde_wasm_bindgen::from_value(result).map_err(|e| Error::RustError(e.to_string()))?;
    Ok(result["response"].as_str().unwrap_or("Gagal membuat laporan.").to_string())
}