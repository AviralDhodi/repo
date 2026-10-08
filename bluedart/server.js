import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;
const SHIP24_URL = process.env.SHIP24_URL || "https://api.ship24.com/public/v1";
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


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wantsHtml(req) {
  return String(req.path || "").startsWith("/whateverrender");
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata"
  });
}

function renderTrackingHtml(payload) {
  const trackingNumber = payload.trackingNumber || payload.data?.data?.trackings?.[0]?.tracker?.trackingNumber || "";
  const tracking = payload.data?.data?.trackings?.[0] || payload.data?.trackings?.[0] || null;
  const shipment = tracking?.shipment || {};
  const tracker = tracking?.tracker || {};
  const events = Array.isArray(tracking?.events) ? [...tracking.events] : [];
  events.sort((a, b) => new Date(b.datetime || b.occurrenceDatetime || 0) - new Date(a.datetime || a.occurrenceDatetime || 0));
  const status = shipment.statusMilestone || shipment.statusCategory || (events[0]?.status || "Tracking created");
  const statusLabel = String(status).replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
  const courier = payload.resolvedProvider || tracker.courierCode?.[0] || payload.provider || "Auto-detected";
  const delivery = shipment.delivery || {};
  const error = payload.error || payload.data?.errors?.map?.(e => e.message || e.code).filter(Boolean).join("; ") || payload.data?.message || "";
  const eventRows = events.length ? events.map(event => `
    <li class="event">
      <span class="dot"></span>
      <div><div class="event-title">${escapeHtml(event.status || event.statusMilestone || "Shipment update")}</div>
      <div class="event-meta">${escapeHtml(event.location || "Location unavailable")} · ${escapeHtml(formatDate(event.datetime || event.occurrenceDatetime))}</div></div>
    </li>`).join("") : '<li class="empty">No tracking events are available yet. Check again shortly.</li>';
  const isError = payload.ok === false || !!error;
  const title = isError ? "Tracking request failed" : "Shipment tracking";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(trackingNumber)}</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a2e;--muted:#96a4bd;--text:#f4f7ff;--line:#26334d;--accent:#8bb4ff;--good:#5ee0b5;--bad:#ff9b9b}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#182746 0,#0b1020 55%);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--text);min-height:100vh;padding:32px 16px}
main{max-width:760px;margin:0 auto}.brand{color:var(--accent);font-weight:750;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
h1{font-size:clamp(26px,5vw,38px);line-height:1.15;margin:10px 0 8px}.sub{color:var(--muted);margin:0 0 24px}
.card{background:rgba(18,26,46,.94);border:1px solid var(--line);border-radius:20px;padding:24px;margin:16px 0;box-shadow:0 18px 60px #0002}
.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.09em}.number{font-size:clamp(20px,4vw,28px);font-weight:750;overflow-wrap:anywhere;margin:4px 0 18px}
.pill{display:inline-block;background:#203858;color:#c8ddff;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:650}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.value{font-weight:650;margin-top:4px;overflow-wrap:anywhere}
h2{font-size:19px;margin:0 0 20px}.timeline{list-style:none;padding:0;margin:0}.event{display:flex;gap:14px;padding:0 0 23px;position:relative}.event:not(:last-child):before{content:"";position:absolute;left:5px;top:14px;bottom:0;width:1px;background:var(--line)}.dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;background:var(--accent);margin-top:5px;z-index:1;box-shadow:0 0 0 4px #203858}.event-title{font-weight:700}.event-meta{font-size:13px;color:var(--muted);margin-top:3px}.empty{color:var(--muted);list-style:none}.error{border-color:#6c343e;color:var(--bad)}.footer{text-align:center;color:var(--muted);font-size:12px;padding:16px}
@media(max-width:520px){body{padding:22px 12px}.card{padding:18px;border-radius:16px}.grid{grid-template-columns:1fr;gap:14px}}
</style></head><body><main>
<div class="brand">Shipment tracker</div><h1>${escapeHtml(title)}</h1><p class="sub">${isError ? "We couldn't retrieve tracking details for this shipment." : "Latest shipment status and carrier scan history."}</p>
${isError ? `<section class="card error"><h2>Unable to track shipment</h2><p>${escapeHtml(error || payload.error || "The tracking provider returned an error.")}</p>${payload.provider ? `<p>Provider: ${escapeHtml(payload.provider)}</p>` : ""}<p class="event-meta">HTTP status: ${escapeHtml(payload.ship24StatusCode || "proxy error")}</p></section>` : `
<section class="card"><div class="label">Tracking number</div><div class="number">${escapeHtml(trackingNumber || "Unknown")}</div>
<span class="pill">${escapeHtml(statusLabel)}</span>
<div class="grid" style="margin-top:22px">
<div><div class="label">Courier</div><div class="value">${escapeHtml(courier)}</div></div>
<div><div class="label">Estimated delivery</div><div class="value">${escapeHtml(formatDate(delivery.estimatedDeliveryDate || delivery.courierEstimatedDeliveryDate))}</div></div>
<div><div class="label">Origin</div><div class="value">${escapeHtml(shipment.originCountryCode || "Not provided")}</div></div>
<div><div class="label">Destination</div><div class="value">${escapeHtml(shipment.destinationCountryCode || "Not provided")}</div></div>
</div></section>
<section class="card"><h2>Tracking history <span style="color:var(--muted);font-size:13px;font-weight:500">· ${events.length} updates</span></h2><ul class="timeline">${eventRows}</ul></section>
`}
<div class="footer">Tracking data provided by Ship24 · Times shown in India Standard Time</div>
</main></body></html>`;
}

function sendCreateResponse(req, res, status, payload) {
  if (wantsHtml(req)) {
    return res.status(status).type("html").send(renderTrackingHtml(payload));
  }
  return res.status(status).json(payload);
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
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
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
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

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
  if (Array.isArray(data?.couriers)) return data.couriers;
  if (Array.isArray(data?.data?.couriers)) return data.data.couriers;

  const queue = [data];
  const seen = new Set();

  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      if (value.some(item => item && typeof item === "object" && (item.courierCode || item.code || item.slug))) {
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
    const detail = result.data?.errors?.map?.(e => e.message || e.code).filter(Boolean).join("; ") || "";
    throw new Error("Ship24 courier list failed with HTTP " + result.response.status + (detail ? ": " + detail : ""));
  }

  const couriers = extractCourierList(result.data).filter(c =>
    c &&
    c.is_deprecated !== true &&
    c.is_deprecated !== 1 &&
    c.isDeprecated !== true &&
    c.isDeprecated !== 1
  );

  if (!couriers.length) throw new Error("Ship24 returned an empty courier list");

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
    const values = [fields.code, fields.name, ...fields.otherNames].filter(Boolean).map(normalizeText);
    const score = values.length ? Math.max(...values.map(value => similarity(target, value))) : 0;
    return { courier, score, fields };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || !best.fields.code || best.score < 0.60) return null;

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
    return sendCreateResponse(req, res, 400, {
      ok: false,
      trackingNumber,
      error: "trackingid must be 5-50 characters using letters, digits, -, _, / or ."
    });
  }

  try {
    const payload = { trackingNumber };

    if (provider) {
      const couriers = await getCouriers();
      const resolved = resolveCourier(provider, couriers);

      if (!resolved) {
        return sendCreateResponse(req, res, 400, {
          ok: false,
          trackingNumber,
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
    if (!response.ok) {
      return sendCreateResponse(req, res, response.status, {
        ok: false, trackingNumber, provider, ship24StatusCode: response.status, data
      });
    }

    const trackerId =
      data?.data?.tracker?.trackerId ||
      data?.tracker?.trackerId ||
      data?.trackerId ||
      null;

    return sendCreateResponse(req, res, 200, {
      ok: true,
      trackingNumber,
      ...(provider ? { provider, resolvedProvider: payload.courierCode[0] } : {}),
      trackerId,
      data
    });
  } catch (error) {
    console.error("Ship24 create tracker error:", error);
    sendCreateResponse(req, res, 502, {
      ok: false,
      trackingNumber,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "shipment-tracking-proxy" });
});

app.get("/trackingId/new/:trackingNumber", createTracker);
app.post("/trackingId/new/:trackingNumber", createTracker);
app.get("/trackingId/new", createTracker);
app.post("/trackingId/new", createTracker);

app.get("/whateverrender/new/:providerSpec", (req, res, next) => {
  const raw = String(req.params.providerSpec || "");
  const match = raw.match(/^provider=(.+)$/i);
  if (!match) return next();
  req.query.provider = decodeURIComponent(match[1]);
  return createTracker(req, res);
});

app.get("/whateverrender/new", createTracker);
app.post("/whateverrender/new", createTracker);

app.get("/trackingId/:trackerId", async (req, res) => {
  const trackerId = String(req.params.trackerId || "").trim();

  if (!trackerId || trackerId === "new" || trackerId.length > 200) {
    return res.status(400).json({ ok: false, error: "A valid Ship24 trackerId is required" });
  }

  try {
    const result = await ship24("/trackers/" + encodeURIComponent(trackerId) + "/results", { method: "GET" });
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
  console.log("Shipment tracking proxy listening on port " + PORT);
});

// Ship24 API base path fixed for /public/v1 endpoints.
