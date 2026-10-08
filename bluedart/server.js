import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;
const SHIP24_URL = process.env.SHIP24_URL || "https://api.ship24.com";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing Render environment variable: " + name);
  return value;
}

async function ship24(path, options = {}) {
  const apiKey = requiredEnv("SHIP24_API_KEY");
  const headers = Object.assign({
    Authorization: "Bearer " + apiKey,
    "Content-Type": "application/json",
    Accept: "application/json"
  }, options.headers || {});

  const response = await fetch(SHIP24_URL + path, Object.assign({}, options, {
    headers,
    signal: AbortSignal.timeout(90000)
  }));

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = text; }
  return { response, data };
}

function sendResult(res, result) {
  const { response, data } = result;
  res.status(response.ok ? 200 : response.status).json({
    ok: response.ok,
    ship24StatusCode: response.status,
    data
  });
}

function validTrackingNumber(value) {
  return /^[A-Za-z0-9._/-]{5,50}$/.test(value);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ship24-waybill-proxy" });
});

async function createTracker(req, res) {
  const trackingNumber = String(
    req.params.trackingNumber || req.query.trackingNumber || ""
  ).trim();

  if (!validTrackingNumber(trackingNumber)) {
    return res.status(400).json({
      ok: false,
      error: "trackingNumber must be 5-50 characters using letters, digits, -, _, / or ."
    });
  }

  try {
    const result = await ship24("/trackers/track", {
      method: "POST",
      body: JSON.stringify({ trackingNumber })
    });

    const { response, data } = result;
    if (!response.ok) return sendResult(res, result);

    const trackerId =
      data?.data?.tracker?.trackerId ||
      data?.tracker?.trackerId ||
      data?.trackerId ||
      null;

    res.json({ ok: true, trackingNumber, trackerId, data });
  } catch (error) {
    console.error("Ship24 create tracker error:", error);
    res.status(502).json({
      ok: false,
      trackingNumber,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

app.get("/trackingId/new/:trackingNumber", createTracker);
app.post("/trackingId/new/:trackingNumber", createTracker);
app.get("/trackingId/new", createTracker);
app.post("/trackingId/new", createTracker);

app.get("/trackingId/:trackerId", async (req, res) => {
  const trackerId = String(req.params.trackerId || "").trim();

  if (!trackerId || trackerId === "new" || trackerId.length > 200) {
    return res.status(400).json({ ok: false, error: "A valid Ship24 trackerId is required" });
  }

  try {
    const result = await ship24(
      "/trackers/" + encodeURIComponent(trackerId) + "/results",
      { method: "GET" }
    );
    sendResult(res, result);
  } catch (error) {
    console.error("Ship24 existing tracker error:", error);
    res.status(502).json({
      ok: false,
      trackerId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/whateverrender/:trackingNumber", createTracker);

app.listen(PORT, "0.0.0.0", () => {
  console.log("Ship24 proxy listening on port " + PORT);
});
