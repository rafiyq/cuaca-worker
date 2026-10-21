// Unit tests for the renderers — pure functions, no network needed
import { describe, it, expect } from "vitest";
import { renderTerminal, renderHTML, SimpleForecast, LocationInfo } from "./render";

const loc: LocationInfo = {
  provinsi: "DKI Jakarta",
  kotkab: "Kota Adm. Jakarta Pusat",
  kecamatan: "Kemayoran",
  desa: "Kemayoran",
  lat: -6.1647,
  lon: 106.8454,
};

// Times picked so day slots are 06:00-17:59, night 18:00-05:59
function slot(time: string, weather: number, condition: string): SimpleForecast {
  return {
    time, temp: 31, condition, conditionEn: "Sunny",
    humidity: 60, windSpeed: 7.2, windDir: "NE",
    cloudCover: 20, rainProb: 10, weather,
  };
}

const sunnyDay   = slot("2026-10-20 13:00:00", 0, "Cerah");
const rainySlot  = slot("2026-10-21 13:00:00", 61, "Hujan Ringan");   // real BMKG rain code
const stormSlot  = slot("2026-10-22 13:00:00", 95, "Hujan Petir");   // real BMKG storm code
const nightClear = slot("2026-10-20 22:00:00", 0, "Cerah");          // night → moon

describe("renderTerminal", () => {
  it("renders the sunny 5-line icon in the header", () => {
    const out = renderTerminal(loc, [sunnyDay]);
    // Sun rays + disc from cuaca-rs ICON_SUNNY
    expect(out).toContain("\\ . /");
    expect(out).toContain("(   )");
    expect(out).toContain("/ ' \\");
    expect(out).toContain("Cerah");
  });

  it("shows the moon for clear night", () => {
    const out = renderTerminal(loc, [nightClear]);
    expect(out).toContain("--.");   // moon .--.
    expect(out).toContain("`--'");
    expect(out).not.toContain("\\ . /"); // no sun rays at night
  });

  it("renders rain code 61 with the rain icon (regression: was sunny fallback)", () => {
    const out = renderTerminal(loc, [rainySlot]);
    expect(out).toContain("(___(__)"); // rain cloud
    expect(out).toContain("ʻ ʻ");        // light rain drops
    expect(out).toContain("Hujan Ringan");
  });

  it("renders thunderstorm code 95 with ⚡", () => {
    const out = renderTerminal(loc, [stormSlot]);
    expect(out).toContain("⚡");
    expect(out).toContain("Hujan Petir");
  });

  it("expands 256-color tokens in icon lines", () => {
    const out = renderTerminal(loc, [sunnyDay]);
    expect(out).toContain("\x1b[38;5;226m"); // yellow sun
  });
});

describe("renderHTML", () => {
  it("renders rain code 61 with colored ASCII art (regression: was sun)", () => {
    const out = renderHTML(loc, [rainySlot]);
    expect(out).toContain("(___(__)");        // rain cloud art
    expect(out).toContain("ac-111");          // light-blue drops
    expect(out).not.toContain("\\ . /");    // no sun rays
    expect(out).toContain("Hujan Ringan");    // condition from API
  });

  it("renders sunny hero art with xterm-226 color", () => {
    const out = renderHTML(loc, [sunnyDay]);
    expect(out).toContain("\\ . /");         // hero sun art
    expect(out).toContain("ac-226");          // yellow
  });

  it("renders thunderstorm 95 with lightning bolt in art", () => {
    const out = renderHTML(loc, [stormSlot]);
    expect(out).toContain("\u26A1");         // ⚡
    expect(out).toContain("ac-33");           // blue rain
    expect(out).toContain("Hujan Petir");
  });

  it("keeps single °C unit in current-temp", () => {
    const out = renderHTML(loc, [sunnyDay]);
    expect(out).toContain('class="temp-unit">°C');
    // temp-value must be the bare number (no °C inside)
    expect(out).toMatch(/class="temp-value[^"]*">\+31</);
  });
});
