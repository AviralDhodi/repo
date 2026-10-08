import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

const BLUEDART_URL =
  process.env.BLUEDART_TRACKING_URL ||
  "https://apigateway.bluedart.com/in/transportation/tracking/v1";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Render environment variable: ${name}`);
  return value;
}

function safeParse(text, contentType) {
  if ((contentType || "").includes("json")) {
    try { return JSON.parse(text); } catch {}
  }
  return text;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "bluedart-waybill-proxy" });
});

app.get("/whateverrender/:waybill", async (req, res) => {
  const waybill = String(req.params.waybill || "").trim();

  if (!/^\\d{8,11}$/.test(waybill)) {
    return res.status(400).json({
      ok: false,
      error: "Waybill must contain 8-11 digits"
    });
  }

  try {
    const loginId = requiredEnv("BLUEDART_API_ID");
    const licenseKey = requiredEnv("BLUEDART_API_KEY");
    const jwtToken = requiredEnv("BLUEDART_JWT_TOKEN");

    const url = new URL(BLUEDART_URL);
    url.searchParams.set("handler", "tnt");
    url.searchParams.set("action", "custawbquery");
    url.searchParams.set("loginid", loginId);
    url.searchParams.set("awb", "awb");
    url.searchParams.set("numbers", waybill);
    url.searchParams.set("format", process.env.BLUEDART_FORMAT || "xml");
    url.searchParams.set("lickey", licenseKey);
    url.searchParams.set("verno", "1");
    url.searchParams.set("scan", "1");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "JWTToken": jwtToken,
        "Accept": process.env.BLUEDART_FORMAT === "json" ? "application/json" : "application/xml,text/xml,text/plain,*/*"
      },
      signal: AbortSignal.timeout(30000)
    });

    const body = await response.text();
    const contentType = response.headers.get("content-type") || "";

    res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      waybill,
      bluedartStatusCode: response.status,
      data: safeParse(body, contentType)
    });
  } catch (error) {
    console.error("Blue Dart tracking error:", error);
    res.status(502).json({
      ok: false,
      waybill,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Blue Dart proxy listening on port ${PORT}`);
});
