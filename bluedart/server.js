import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;
const SHIP24_URL = process.env.SHIP24_URL || "https://api.ship24.com";
const COURIER_CACHE_TTL = 24 * 60 * 60 * 1000;

let courierCache = { loadedAt: 0, couriers: [] };

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing Render environment variable: " + name);
  return value;
}

function authHeaders() {
  return {
    Authorization: "Bearer " + requiredEnv("SHIP24_API_KEY"),
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

async function ship24(path, options = {}) {
  const response = await fetch(SHIP24_URL + path, Object.assign({}, options, {
    headers: Object.assign(authHeaders(), options.headers || {}),
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.95;
  }
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

// Common informal names/typos can be handled before fuzzy matching.
// Ship24's actual courierCode remains the value sent to Ship24.
const aliases = {
  bluemoron: "bluedart",
  bluedartindia: "bluedart",
  blueex: "bluedart",
  dhlindia: "dhl",
  fedexindia: "fedex",
  upsindia: "ups",
  delhiveryindia: "delhivery"
};

function extractCourierList(data) {
  // Ship24's courier catalogue may be wrapped differently between API versions.
  // Walk the JSON response and select the first array containing courier-like records.
  const queue = [data];
  const seen = new Set();

  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      if (value.some(item =>
        item &&
        typeof item === "object" &&
        (item.courierCode || item.code || item.slug || item.name || item.courierName || item.title)
      )) {
        return value;
      }
      for (const item of value) queue.push(item);
      continue;
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") queue.push(child);
    }
  }

  return [];
}

async function getCouriers() {
  if (courierCache.couriers.length && Date.now() - courierCache.loadedAt < COURIER_CACHE_TTL) {
    return courierCache.couriers;
  }

  const result = await ship24("/couriers", { method: "GET" });
  if (!result.response.ok) {
    throw new Error("Ship24 courier list failed with HTTP " + result.response.status);
  }

  const couriers = extractCourierList(result.data)
    .filter(c => c && !c.isDeprecated && c.is_deprecated !== true && c.is_deprecated !== 1);

  if (!couriers.length) {
    throw new Error("Ship24 returned an empty courier list");
  }

  courierCache = { loadedAt: Date.now(), couriers };
  return couriers;
}

function courierFields(courier) {
  return {
    code: courier?.courierCode || courier?.code || courier?.slug || "",
    name: courier?.name || courier?.courierName || courier?.title || "",
    otherNames: Array.isArray(courier?.otherNames) ? courier.otherNames : []
  };
}

function resolveCourier(input, couriers) {
  const original = String(input || "").trim();
  if (!original) return null;

  const aliased = aliases[normalizeText(original)] || original;
  const target = normalizeText(aliased);

  const scored = couriers.map(courier => {
    const fields = courierFields(courier);
    const values = [fields.code, fields.name, ...fields.otherNames]
      .filter(Boolean)
      .map(normalizeText);

    const score = Math.max(...values.map(value => similarity(target, value)));
    return { courier, score, fields };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;

  // Exact code/name always wins. Otherwise require a reasonably strong fuzzy match.
  if (best.score < 0.60) return null;

  return {
    input: original,
    matchedCode: best.fields.code,
    matchedName: best.fields.name,
    score: Number(best.score.toFixed(3))
  };
}

function validTrackingNumber(value) {
  return /^[A-Za-z0-9._/-]{5,50}$/.test(value);
}

async function createTracker(req, res) {
  const trackingNumber = String(
    req.params.trackingNumber ||
    req.query.trackingid ||
    req.query.trackingId ||
    req.query.trackingNumber ||
    ""
  ).trim();

  const provider = String(
    req.params.provider ||
    req.query.provider ||
    req.query.courier ||
    ""
  ).trim();

  if (!validTrackingNumber(trackingNumber)) {
    return res.status(400).json({
      ok: false,
      error: "trackingid must be 5-50 characters using letters, digits, -, _, / or ."
    });
  }

  try {
    const payload = { trackingNumber };

    if (provider) {
      const couriers = await getCouriers();
      const resolved = resolveCourier(provider, couriers);

      if (!resolved) {
        return res.status(400).json({
          ok: false,
          error: "Could not resolve provider",
          provider,
          hint: "Use a Ship24 courier name/code or omit provider for automatic detection."
        });
      }

      payload.courierCode = [resolved.matchedCode];
    }

    const result = await ship24("/trackers/track", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const { response, data } = result;
    if (!response.ok) return sendResult(res, result);

    const trackerId =
      data?.data?.tracker?.trackerId ||
      data?.tracker?.trackerId ||
      data?.trackerId ||
      null;

    res.json({
      ok: true,
      trackingNumber,
      ...(provider ? { provider, resolvedProvider: payload.courierCode[0] } : {}),
      trackerId,
      data
    });
  } catch (error) {
    console.error("Ship24 create tracker error:", error);
    res.status(502).json({
      ok: false,
      trackingNumber,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "shipment-tracking-proxy" });
});

// Preferred:
// /trackingId/new/90691129233
// /trackingId/new/90691129233?provider=bluedart
app.get("/trackingId/new/:trackingNumber", createTracker);
app.post("/trackingId/new/:trackingNumber", createTracker);
app.get("/trackingId/new", createTracker);
app.post("/trackingId/new", createTracker);

// Also accepts the user's compact form:
// /whateverrender/new/provider=bluemoron&trackingid=1234
// and the conventional query form:
// /whateverrender/new?provider=bluemoron&trackingid=1234
app.get("/whateverrender/new/:providerSpec", (req, res, next) => {
  const raw = String(req.params.providerSpec || "");
  const match = raw.match(/^provider=(.+)$/i);
  if (!match) return next();
  req.query.provider = decodeURIComponent(match[1]);
  return createTracker(req, res);
});

app.get("/whateverrender/new", createTracker);
app.post("/whateverrender/new", createTracker);

// Existing Ship24 tracker.
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

// Backward-compatible generic endpoint: auto-detect provider.
app.get("/whateverrender/:trackingNumber", createTracker);

app.listen(PORT, "0.0.0.0", () => {
  console.log("Shipment tracking proxy listening on port " + PORT);
});
