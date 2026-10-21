import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("cuaca-worker", () => {
  it("returns 400 without adm4", async () => {
    const req = new Request("http://localhost/api/forecast");
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error).toContain("adm4");
  });

  it("returns 404 for unknown API path", async () => {
    const req = new Request("http://localhost/api/unknown", {
      headers: { "Accept": "application/json" }
    });
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(404);
  });

  it("lists example locations via API", async () => {
    const req = new Request("http://localhost/api/locations", {
      headers: { "Accept": "application/json" }
    });
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.examples).toBeInstanceOf(Array);
    expect(json.examples.length).toBeGreaterThan(0);
  });

  it("returns terminal weather for root", async () => {
    const req = new Request("http://localhost/", {
      headers: { "User-Agent": "curl/7.68.0" }
    });
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Weather report:");
  });

  it("returns short format for /Jakarta?format=3", async () => {
    const req = new Request("http://localhost/Jakarta?format=3", {
      headers: { "User-Agent": "curl/7.68.0" }
    });
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Now resolves via wilayah-worker API (returns Pulau Panggang for Jakarta search)
    expect(text).toMatch(/Pulau Panggang: .* [+-]\d+°C/);
  });
});