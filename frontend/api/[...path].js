/*
 * Same-origin API proxy for the separate static frontend Vercel project.
 * Configure NOTELY_BACKEND_URL in that project's environment variables.
 * No connection strings or request bodies are logged.
 */
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
  "content-length", "accept-encoding", "content-encoding"
]);

module.exports = async function handler(req, res) {
  const configured = String(process.env.NOTELY_BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!configured) {
    return res.status(503).json({ detail: "backend_url_not_configured" });
  }

  let backend;
  try {
    backend = new URL(configured);
    if (!["https:", "http:"].includes(backend.protocol) || backend.username || backend.password) {
      return res.status(503).json({ detail: "backend_url_invalid" });
    }
  } catch (_) {
    return res.status(503).json({ detail: "backend_url_invalid" });
  }

  try {
    const incoming = String(req.url || "/");
    const path = incoming.startsWith("/api/") || incoming === "/api"
      ? incoming
      : "/api" + (incoming.startsWith("/") ? incoming : "/" + incoming);
    const target = new URL(path, backend.origin);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers || {})) {
      if (value == null || HOP_BY_HOP.has(name.toLowerCase())) continue;
      if (Array.isArray(value)) headers.set(name, value.join(", "));
      else headers.set(name, String(value));
    }

    let body;
    if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }

    const upstream = await fetch(target, {
      method: req.method || "GET",
      headers,
      body,
      redirect: "manual",
      cache: "no-store"
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, name) => {
      const key = name.toLowerCase();
      if (HOP_BY_HOP.has(key) || key === "set-cookie") return;
      res.setHeader(name, value);
    });
    const cookies = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")] : []);
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (_) {
    return res.status(502).json({ detail: "backend_unavailable" });
  }
};

module.exports.config = { api: { bodyParser: false } };
