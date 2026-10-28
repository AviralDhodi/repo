import { timingSafeEqual } from "node:crypto";

const OWNERS = new Set(["aviral", "ananya"]);
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "heart-wallpapers";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const NOTIFICATIONS = {
  wake: "WallpaperWake",
  baseReady: "WallpaperBaseReady",
  wallpaperReady: "WallpaperUpdateReady"
};

function opposite(owner) {
  return owner === "aviral" ? "ananya" : "aviral";
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function authToken(req) {
  const header = String(req.headers.authorization || "");
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, "").trim();
  return String(req.headers["x-wallpaper-token"] || "");
}

function requireWallpaperAuth(req, res, next) {
  const expected = process.env.WALLPAPER_API_TOKEN;
  if (!expected) return res.status(503).json({ ok: false, error: "Wallpaper API is not configured on Render" });
  if (!safeEqual(authToken(req), expected)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

function requireAdminAuth(req, res, next) {
  const expected = process.env.WALLPAPER_ADMIN_TOKEN;
  const supplied = String(req.headers["x-admin-token"] || "");
  if (!expected) return res.status(503).json({ ok: false, error: "Credential setter is not configured on Render" });
  if (!safeEqual(supplied, expected)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

function supabaseConfig() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Render.");
  return { base: base.replace(/\/+$/, ""), key };
}

async function supabaseRequest(path, options = {}) {
  const config = supabaseConfig();
  const response = await fetch(config.base + path, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: "Bearer " + config.key,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : (data?.message || data?.error || data?.hint || JSON.stringify(data));
    const error = new Error("Supabase request failed (" + response.status + "): " + String(detail).slice(0, 400));
    error.status = response.status;
    throw error;
  }
  return data;
}

function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

async function selectRows(table, filters, select = "*", limit = 10) {
  const query = queryString({ ...filters, select, limit });
  return await supabaseRequest("/rest/v1/" + table + "?" + query);
}

async function insertRow(table, body, options = {}) {
  const query = options.onConflict ? "?on_conflict=" + encodeURIComponent(options.onConflict) : "";
  return await supabaseRequest("/rest/v1/" + table + query, {
    method: "POST",
    headers: { Prefer: options.merge ? "resolution=merge-duplicates,return=representation" : "return=representation" },
    body: JSON.stringify(body)
  });
}

async function patchRows(table, filters, body) {
  const query = queryString(filters);
  return await supabaseRequest("/rest/v1/" + table + "?" + query, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
}

function encodedObjectPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function uploadObject(path, bytes, contentType) {
  const config = supabaseConfig();
  const url = config.base + "/storage/v1/object/" + encodeURIComponent(BUCKET) + "/" + encodedObjectPath(path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: "Bearer " + config.key,
      "Content-Type": contentType,
      "x-upsert": "true"
    },
    body: bytes,
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("Storage upload failed (" + response.status + "): " + text.slice(0, 300));
  }
}

async function downloadObject(path) {
  const config = supabaseConfig();
  const url = config.base + "/storage/v1/object/" + encodeURIComponent(BUCKET) + "/" + encodedObjectPath(path);
  const response = await fetch(url, {
    headers: { apikey: config.key, Authorization: "Bearer " + config.key },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("Storage download failed (" + response.status + "): " + text.slice(0, 300));
  }
  return Buffer.from(await response.arrayBuffer());
}

async function deleteObject(path) {
  if (!path) return;
  const config = supabaseConfig();
  const response = await fetch(config.base + "/storage/v1/object/" + encodeURIComponent(BUCKET), {
    method: "DELETE",
    headers: {
      apikey: config.key,
      Authorization: "Bearer " + config.key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: [path] }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const text = await response.text();
    console.warn("Storage cleanup failed (" + response.status + "): " + text.slice(0, 200));
  }
}

function parseImage(body) {
  let value = body?.imageBase64 || body?.image_base64 || body?.base64 || body?.image;
  let contentType = String(body?.contentType || body?.content_type || body?.mimeType || "image/jpeg").toLowerCase();
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error("Body must include imageBase64 and optionally contentType");
    error.status = 400;
    throw error;
  }
  const dataUrl = value.match(/^data:([^;,]+);base64,(.*)$/s);
  if (dataUrl) {
    contentType = dataUrl[1].toLowerCase();
    value = dataUrl[2];
  }
  const extensions = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp"
  };
  if (!extensions[contentType]) {
    const error = new Error("Unsupported image type. Use JPEG, PNG, HEIC, HEIF or WebP.");
    error.status = 415;
    throw error;
  }
  const normalized = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    const error = new Error("imageBase64 is not valid Base64");
    error.status = 400;
    throw error;
  }
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length) {
    const error = new Error("Image is empty");
    error.status = 400;
    throw error;
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    const error = new Error("Image exceeds the 25 MiB limit");
    error.status = 413;
    throw error;
  }
  return { bytes, contentType, extension: extensions[contentType] };
}

async function getPushcutCredentials(owner) {
  const rows = await selectRows("pushcut_credentials", { owner: "eq." + owner }, "owner,api_key,secret", 1);
  return rows?.[0] || null;
}

async function triggerPushcut(owner, notificationName) {
  const credentials = await getPushcutCredentials(owner);
  if (!credentials?.secret) {
    const error = new Error("Pushcut credentials are not configured for " + owner);
    error.status = 409;
    throw error;
  }
  const url = "https://api.pushcut.io/" + encodeURIComponent(credentials.secret) + "/notifications/" + encodeURIComponent(notificationName);
  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error("Pushcut notification failed (" + response.status + "): " + text.slice(0, 200));
    error.status = 502;
    throw error;
  }
  return true;
}

function ownerFromRequest(req) {
  const owner = String(req.params.owner || req.body?.owner || req.query.owner || "").toLowerCase();
  return OWNERS.has(owner) ? owner : null;
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    console.error("Wallpaper API error:", error.message);
    const status = Number.isInteger(error.status) ? error.status : (String(error.message).includes("not configured") ? 503 : 500);
    res.status(status).json({ ok: false, error: error.message || "Internal server error" });
  });
}

function imageResponse(res, bytes, contentType, filename, requestId) {
  res.set("Content-Type", contentType || "application/octet-stream");
  res.set("Content-Disposition", 'attachment; filename="' + filename.replace(/[^A-Za-z0-9._-]/g, "_") + '"');
  res.set("Cache-Control", "no-store");
  if (requestId) res.set("X-Wallpaper-Request-Id", requestId);
  return res.status(200).send(bytes);
}

export function registerWallpaperRoutes(app, express) {
  app.use(express.json({ limit: "36mb" }));

  const auth = [requireWallpaperAuth];
  const adminAuth = [requireAdminAuth];

  const setApiKey = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const apiKey = String(req.body?.apiKey || req.body?.api_key || req.body?.pushcutApiKey || "").trim();
    const secret = String(req.body?.secret || req.body?.pushcutSecret || "").trim();
    if (!apiKey || !secret) return res.status(400).json({ ok: false, error: "Body must contain apiKey and secret" });
    if (apiKey.length > 500 || secret.length > 500) return res.status(400).json({ ok: false, error: "Credential value is too long" });
    await insertRow("pushcut_credentials", { owner, api_key: apiKey, secret, updated_at: new Date().toISOString() }, { onConflict: "owner", merge: true });
    return res.json({ ok: true, owner, configured: true });
  });

  app.post("/:owner/set-api-key", ...adminAuth, setApiKey);

  const wake = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Provide owner as aviral or ananya" });
    const editor = opposite(owner);
    const credentials = await getPushcutCredentials(owner);
    if (!credentials?.secret) return res.status(409).json({ ok: false, error: "Pushcut credentials are not configured for " + owner + "; call /" + owner + "/set-api-key first" });

    const now = new Date().toISOString();
    await patchRows("wallpaper_requests", {
      status: "in.(waiting_for_base,ready_for_edit,waiting_for_upload)",
      expires_at: "lte." + now
    }, { status: "expired", updated_at: now });

    const active = await selectRows("wallpaper_requests", {
      owner: "eq." + owner,
      status: "in.(waiting_for_base,ready_for_edit,waiting_for_upload)",
      expires_at: "gt." + now
    }, "request_id,status,expires_at", 1);
    if (active?.length) return res.status(409).json({ ok: false, error: "An edit is already in progress for " + owner, requestId: active[0].request_id });

    const created = await insertRow("wallpaper_requests", {
      owner, editor, status: "waiting_for_base", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    const request = created?.[0];
    if (!request?.request_id) throw new Error("Could not create wallpaper request");

    try {
      await triggerPushcut(owner, NOTIFICATIONS.wake);
    } catch (error) {
      await patchRows("wallpaper_requests", { request_id: "eq." + request.request_id }, { status: "failed", updated_at: new Date().toISOString() });
      throw error;
    }
    return res.status(202).json({ ok: true, requestId: request.request_id, owner, editor, status: "waiting_for_base" });
  });

  app.get("/wake", ...auth, wake);
  app.post("/wake", ...auth, wake);
  app.get("/:owner/wake", ...auth, wake);
  app.post("/:owner/wake", ...auth, wake);

  const requestWallpaper = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const now = new Date().toISOString();
    const suppliedId = String(req.body?.requestId || req.body?.request_id || "").trim();
    const filters = {
      owner: "eq." + owner,
      status: "eq.waiting_for_base",
      expires_at: "gt." + now,
      ...(suppliedId ? { request_id: "eq." + suppliedId } : {})
    };
    const requests = await selectRows("wallpaper_requests", filters, "request_id,owner,editor,status", 1);
    const request = requests?.[0];
    if (!request) return res.status(404).json({ ok: false, error: "No pending wallpaper request for " + owner });
    const image = parseImage(req.body);
    const path = owner + "/requests/" + request.request_id + "/base." + image.extension;
    await uploadObject(path, image.bytes, image.contentType);
    await patchRows("wallpaper_requests", { request_id: "eq." + request.request_id, status: "eq.waiting_for_base" }, {
      base_object_path: path,
      status: "ready_for_edit",
      updated_at: new Date().toISOString()
    });

    let notificationSent = false;
    let notificationWarning;
    try {
      await triggerPushcut(request.editor, NOTIFICATIONS.baseReady);
      notificationSent = true;
    } catch (error) {
      notificationWarning = error.message;
    }
    return res.json({ ok: true, requestId: request.request_id, owner, editor: request.editor, status: "ready_for_edit", notificationSent, ...(notificationWarning ? { notificationWarning } : {}) });
  });

  app.post("/:owner/request-wallpaper", ...auth, requestWallpaper);

  const pendingRequest = asyncRoute(async (req, res) => {
    const editor = ownerFromRequest(req);
    if (!editor) return res.status(400).json({ ok: false, error: "Editor must be aviral or ananya" });
    const now = new Date().toISOString();
    const rows = await selectRows("wallpaper_requests", {
      editor: "eq." + editor,
      status: "in.(ready_for_edit,waiting_for_upload)",
      expires_at: "gt." + now
    }, "request_id,owner,editor,status,created_at,expires_at,base_object_path", 1);
    if (!rows?.length) return res.status(404).json({ ok: false, error: "No wallpaper is ready for this editor" });
    const request = rows[0];
    return res.json({
      ok: true,
      requestId: request.request_id,
      owner: request.owner,
      editor: request.editor,
      status: request.status,
      filename: "heart-wallpaper-" + request.request_id + "." + String(request.base_object_path || "base.jpg").split(".").pop(),
      downloadPath: "/" + request.owner + "/get-wallpaper?requestId=" + encodeURIComponent(request.request_id)
    });
  });

  app.get("/:owner/pending-request", ...auth, pendingRequest);

  const getWallpaper = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const requestId = String(req.query.requestId || req.query.request_id || "").trim();
    let path;
    let contentType = "image/jpeg";
    let filename = owner + "-current-wallpaper.jpg";

    if (requestId) {
      const rows = await selectRows("wallpaper_requests", { request_id: "eq." + requestId, owner: "eq." + owner }, "request_id,editor,status,base_object_path,expires_at", 1);
      const request = rows?.[0];
      if (!request || !request.base_object_path || !["ready_for_edit", "waiting_for_upload"].includes(request.status)) {
        return res.status(404).json({ ok: false, error: "Base wallpaper not found for that request" });
      }
      if (new Date(request.expires_at).getTime() < Date.now()) return res.status(410).json({ ok: false, error: "Wallpaper request expired" });
      path = request.base_object_path;
      filename = "heart-wallpaper-" + request.request_id + "." + path.split(".").pop();
      if (request.status === "ready_for_edit") {
        await patchRows("wallpaper_requests", { request_id: "eq." + requestId, status: "eq.ready_for_edit" }, { status: "waiting_for_upload", updated_at: new Date().toISOString() });
      }
    } else {
      const profiles = await selectRows("wallpaper_profiles", { owner: "eq." + owner }, "owner,current_object_path,original_object_path", 1);
      path = profiles?.[0]?.current_object_path;
      if (!path) return res.status(404).json({ ok: false, error: "No current wallpaper registered for " + owner + "; set the original wallpaper first" });
      filename = owner + "-current-wallpaper." + path.split(".").pop();
    }

    const bytes = await downloadObject(path);
    const ext = path.split(".").pop().toLowerCase();
    const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp" };
    contentType = types[ext] || contentType;
    return imageResponse(res, bytes, contentType, filename, requestId);
  });

  app.get("/:owner/get-wallpaper", ...auth, getWallpaper);

  const setWallpaper = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const requestId = String(req.body?.requestId || req.body?.request_id || "").trim();
    if (!requestId) return res.status(400).json({ ok: false, error: "requestId is required" });
    const requests = await selectRows("wallpaper_requests", {
      request_id: "eq." + requestId,
      owner: "eq." + owner,
      editor: "eq." + opposite(owner),
      status: "in.(ready_for_edit,waiting_for_upload)",
      expires_at: "gt." + new Date().toISOString()
    }, "request_id,owner,editor,status,edited_object_path,base_object_path", 1);
    const request = requests?.[0];
    if (!request) return res.status(409).json({ ok: false, error: "Request is missing, expired, already completed, or belongs to another editor" });

    const image = parseImage(req.body);
    const editedPath = owner + "/requests/" + requestId + "/edited." + image.extension;
    const currentPath = owner + "/current-wallpaper-" + requestId + "." + image.extension;
    await uploadObject(editedPath, image.bytes, image.contentType);
    const profiles = await selectRows("wallpaper_profiles", { owner: "eq." + owner }, "owner,current_object_path,original_object_path,version", 1);
    const profile = profiles?.[0];
    if (!profile) throw new Error("Wallpaper profile missing for " + owner);
    await uploadObject(currentPath, image.bytes, image.contentType);
    await patchRows("wallpaper_profiles", { owner: "eq." + owner }, {
      current_object_path: currentPath,
      version: Number(profile.version || 0) + 1,
      updated_at: new Date().toISOString()
    });
    await patchRows("wallpaper_requests", { request_id: "eq." + requestId }, {
      edited_object_path: null,
      base_object_path: null,
      status: "completed",
      updated_at: new Date().toISOString()
    });

    if (profile.current_object_path && profile.current_object_path !== profile.original_object_path && profile.current_object_path !== currentPath) {
      await deleteObject(profile.current_object_path);
    }
    await deleteObject(request.base_object_path);
    await deleteObject(editedPath);

    let notificationSent = false;
    let notificationWarning;
    try {
      await triggerPushcut(owner, NOTIFICATIONS.wallpaperReady);
      notificationSent = true;
    } catch (error) {
      notificationWarning = error.message;
    }
    return res.json({ ok: true, owner, editor: request.editor, requestId, version: Number(profile.version || 0) + 1, status: "completed", notificationSent, ...(notificationWarning ? { notificationWarning } : {}) });
  });

  app.post("/:owner/set-wallpaper", ...auth, setWallpaper);

  const setOriginal = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const image = parseImage(req.body);
    const path = owner + "/original." + image.extension;
    const profiles = await selectRows("wallpaper_profiles", { owner: "eq." + owner }, "owner,current_object_path,original_object_path,version", 1);
    const profile = profiles?.[0];
    if (!profile) throw new Error("Wallpaper profile missing for " + owner);
    const now = new Date().toISOString();
    await patchRows("wallpaper_requests", { owner: "eq." + owner, status: "in.(waiting_for_base,ready_for_edit,waiting_for_upload)" }, { status: "expired", updated_at: now });
    await uploadObject(path, image.bytes, image.contentType);
    await patchRows("wallpaper_profiles", { owner: "eq." + owner }, {
      original_object_path: path,
      current_object_path: path,
      version: Number(profile.version || 0) + 1,
      updated_at: new Date().toISOString()
    });
    if (profile.original_object_path && profile.original_object_path !== path) await deleteObject(profile.original_object_path);
    if (profile.current_object_path && profile.current_object_path !== profile.original_object_path && profile.current_object_path !== path) await deleteObject(profile.current_object_path);
    return res.json({ ok: true, owner, originalRegistered: true, version: Number(profile.version || 0) + 1 });
  });

  app.post("/:owner/set-original", ...auth, setOriginal);

  const clearWallpaper = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const profiles = await selectRows("wallpaper_profiles", { owner: "eq." + owner }, "owner,original_object_path,current_object_path,version", 1);
    const profile = profiles?.[0];
    if (!profile?.original_object_path) return res.status(409).json({ ok: false, error: "Original wallpaper has not been registered for " + owner });
    const version = Number(profile.version || 0) + 1;
    const now = new Date().toISOString();
    await patchRows("wallpaper_requests", { owner: "eq." + owner, status: "in.(waiting_for_base,ready_for_edit,waiting_for_upload)" }, { status: "expired", updated_at: now });
    await patchRows("wallpaper_profiles", { owner: "eq." + owner }, {
      current_object_path: profile.original_object_path,
      version,
      updated_at: now
    });
    if (profile.current_object_path && profile.current_object_path !== profile.original_object_path) await deleteObject(profile.current_object_path);
    return res.json({ ok: true, owner, restored: true, version, downloadPath: "/" + owner + "/get-wallpaper" });
  });

  app.post("/:owner/clear", ...auth, clearWallpaper);

  const status = asyncRoute(async (req, res) => {
    const owner = ownerFromRequest(req);
    if (!owner) return res.status(400).json({ ok: false, error: "Owner must be aviral or ananya" });
    const profiles = await selectRows("wallpaper_profiles", { owner: "eq." + owner }, "owner,original_object_path,current_object_path,version,updated_at", 1);
    const credentials = await getPushcutCredentials(owner);
    const profile = profiles?.[0];
    return res.json({
      ok: true, owner, originalRegistered: Boolean(profile?.original_object_path),
      currentRegistered: Boolean(profile?.current_object_path), version: Number(profile?.version || 0),
      pushcutConfigured: Boolean(credentials?.secret && credentials?.api_key), updatedAt: profile?.updated_at || null
    });
  });
  app.get("/:owner/status", ...auth, status);
}
