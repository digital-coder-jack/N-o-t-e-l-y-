/* =====================================================================
   Notely  -  config.js   (MUST load before app.js & trackers)
   ---------------------------------------------------------------------
   This is the SINGLE place to point the frontend at your backend API.

   The frontend and FastAPI backend are separate Vercel projects. The frontend
   project proxies /api/* to NOTELY_BACKEND_URL, so browser calls stay same-origin.

   HOW TO SET IT
   -------------
   After you deploy the backend you will get a public URL, e.g.
       https://ai-notebook.onrender.com
       https://ai-notebook-production.up.railway.app

   Put that URL below (NO trailing slash). That's the only change needed.

   Leave it as '' (empty) ONLY if the frontend and backend are served from
   the same origin (single-host deploy) — then same-origin requests are used.
   ===================================================================== */

/* Keep this empty: /api/* is proxied by the frontend Vercel project using
   the server-side NOTELY_BACKEND_URL environment variable. This also lets
   HttpOnly trial cookies stay first-party in the browser. */
window.SS_API_BASE = "";

/* Optional: allow overriding via a <meta name="api-base"> tag or a
   ?api_base=... query string during testing, without editing this file. */
(function () {
  try {
    var qs = new URLSearchParams(window.location.search).get("api_base");
    if (qs) {
      window.SS_API_BASE = qs.replace(/\/+$/, "");
      return;
    }
    var meta = document.querySelector('meta[name="api-base"]');
    if (meta && meta.content) {
      window.SS_API_BASE = meta.content.replace(/\/+$/, "");
    }
    if (window.SS_API_BASE) {
      window.SS_API_BASE = String(window.SS_API_BASE).replace(/\/+$/, "");
    }
    // Guard against any stale placeholder value.
    if (window.SS_API_BASE === "https://REPLACE-WITH-YOUR-BACKEND-URL") {
      window.SS_API_BASE = "";
    }
  } catch (e) {
    window.SS_API_BASE = window.SS_API_BASE || "";
  }
})();
