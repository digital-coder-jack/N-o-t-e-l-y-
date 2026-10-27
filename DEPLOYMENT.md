# 🚀 AI Notebook — Backend Deployment & Recovery Guide

This guide fixes the **`404 Not Found /api/...`** errors that appeared after the
Railway backend was deleted, and brings the backend back online as a
production-ready, standalone API.

---

## 0. What was wrong (root cause)

- **Framework:** FastAPI (ASGI). **Entry point:** `backend/main.py` → `app`.
- The frontend (on Vercel) calls the API with **relative URLs** (`/api/...`).
  Relative URLs resolve against the page's own host. While the backend served
  the frontend (same origin), this worked. After the **Railway backend was
  deleted**, the frontend on Vercel sent `/api/...` to **Vercel itself**, which
  has no backend → **404 Not Found**, including `/api/chats/.../stream`.

**The fix = two halves:**
1. Redeploy the FastAPI backend as a standalone API (Render or Railway).
2. Point the Vercel frontend at the new backend URL (one line in
   `frontend/js/config.js`) and allow that origin via CORS.

The backend data-access layer uses Neon PostgreSQL. Run the Neon schema migration before the backend starts; SQLite/DB_PATH is not used.

---

## 1. Required environment variables

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `GEMINI_API_KEY` | **Yes for AI Notebook** | Server-side Gemini key for the default tier. |
| `OPENROUTER_API_KEY` | Optional | Server-side OpenRouter key for AI Notebook Pro. |
| `GROQ_API_KEY` | Optional | Server-side Groq key for AI Notebook Pro Max. |
| `GEMINI_MODEL` | Optional | Default `gemini-3.8-flash`. |
| `OPENROUTER_MODEL` | Optional | Default `openrouter/free`; OpenRouter controls the free catalog. |
| `GROQ_MODEL` | Optional | Defaults to `openai/gpt-oss-20b`, the current Groq shared-inference model for AI Notebook Pro Max. |
| `ALLOWED_ORIGINS` | **Yes (prod)** | Comma-separated frontend origins allowed by CORS, e.g. `https://your-app.vercel.app`. `*.vercel.app` preview URLs and `localhost` are always allowed automatically. |
| `JWT_SECRET` | **Strongly recommended** | Stable secret for signing login tokens. Without it, logins break across restarts/instances. (Render `render.yaml` auto-generates one.) |
| `NOTELY_DATABASE_URL_POSTGRES_URL` | **Required for runtime** | Pooled Neon PostgreSQL URL supplied by the Vercel Neon integration. Keep it server-side only. |\n| `NOTELY_DATABASE_URL_POSTGRES_URL_NON_POOLING` | **Required for schema migration** | Direct/non-pooled Neon URL supplied by the integration. Used only by `python -m backend.migrate_neon`. |
| `JWT_TTL_SECONDS` | Optional | Token lifetime (default `604800` = 7 days). |
| `TELEGRAM_BOT_TOKEN` | Optional | Enables the Telegram bot. |
| `WEBHOOK_SECRET` | Optional | Verifies Telegram webhook calls. |
| `TELEGRAM_ADMIN_ID` | Optional | User id allowed to read `/api/analytics/dashboard-stats`. |
| `WEB_CONCURRENCY` | Optional | Gunicorn worker count (default 2). |
| `FAIL_FAST` | Optional | Set `1` to abort startup if required vars are missing. |

> On boot, the backend logs an **environment check** table so you can see at a
> glance which vars are set/missing (visible in Render/Railway logs).

---

## 2. Build & start commands

- **Build command:**
  ```
  pip install -r requirements.txt
  ```
- **Start command (production):**
  ```
  gunicorn backend.main:app -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:$PORT --timeout 120
  ```
- **Health check path:** `/api/health`
- **Local dev (alternative):**
  ```
  uvicorn backend.main:app --reload --port 8000
  ```

---

## 3. Deploy the backend on **Render** (Neon PostgreSQL)

### Option A — Blueprint (uses `render.yaml`, zero clicks)
1. Push this repo to GitHub.
2. Render → **New + → Blueprint** → select the repo → **Apply**.
3. Render reads `render.yaml`: it creates the web service, a 1 GB disk mounted
   at `/data`, sets `DB_PATH=/data/ai_notebook.db`, and auto-generates `JWT_SECRET`.
4. In the dashboard, fill the secret vars marked *sync:false*:
   `TELEGRAM_BOT_TOKEN`, etc.

### Option B — Manual web service
1. Render → **New + → Web Service** → connect repo.
2. **Runtime:** Python 3. **Build:** `pip install -r requirements.txt`.
3. **Start:** the gunicorn command above.
4. **Health check path:** `/api/health`.
5. Add a **Disk** (Settings → Disks): mount path `/data`, size 1 GB, then set
   `DB_PATH=/data/ai_notebook.db`.
6. Add the environment variables from section 1.

> **Free plan note:** Render's free tier has **no persistent disk**, so omit the
> disk and leave `DB_PATH` unset (SQLite will live in ephemeral storage and reset
> on redeploy). Use a paid plan or migrate to a hosted DB for durable data.

Your backend URL will look like `https://ai-notebook.onrender.com`.

---

## 4. Deploy the backend on **Railway**

1. Railway → **New Project → Deploy from GitHub repo**.
2. Railway detects `railway.json` + `nixpacks.toml`:
   - Build: Nixpacks installs `requirements.txt`.
   - Start: the gunicorn command above.
   - Health check: `/api/health`.
3. **Variables** tab → add the env vars from section 1
   (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `ALLOWED_ORIGINS`, `JWT_SECRET`, …).
4. For persistent data: add a **Volume**, mount it at `/data`, and set
   `DB_PATH=/data/ai_notebook.db`.
5. Railway sets `$PORT` automatically; the start command already uses it.

Your backend URL will look like
`https://ai-notebook-production.up.railway.app`.

---

## 5. Point the Vercel frontend at the backend (API URL configuration)

Edit **one file** — `frontend/js/config.js`:

```js
window.SS_API_BASE = "https://ai-notebook.onrender.com"; // NO trailing slash
```

Commit & redeploy the frontend on Vercel. That's it — every API call
(including the SSE chat stream and analytics) is now prefixed with this URL.

**Alternatives (no file edit needed):**
- Add `<meta name="api-base" content="https://your-backend-url">` to the pages, or
- Append `?api_base=https://your-backend-url` to a URL while testing.

Then set CORS on the backend:
```
ALLOWED_ORIGINS=https://your-app.vercel.app
```
(Multiple allowed: comma-separate them. Vercel preview URLs work automatically.)

---

## 6. Verify

```bash
# 1. Backend health
curl https://YOUR-BACKEND-URL/api/health
# -> {"status":"ok", "ai_configured":true, "cors_allowed_origins":[...], ...}

# 2. Auth
curl -X POST https://YOUR-BACKEND-URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"t@e.com","password":"secret123"}'

# 3. From the browser: open your Vercel site, sign up/log in, open AI Chat,
#    send a message — tokens should stream in. Check DevTools → Network:
#    requests should now go to YOUR-BACKEND-URL/api/... and return 200.
```

If chat streams, auth works, and the dashboard loads stats → recovery complete.

---

## 7. Telegram bot (optional, unchanged)

After deploy, register the webhook once:
```
https://YOUR-BACKEND-URL/api/set-webhook
```
Requires `TELEGRAM_BOT_TOKEN` (and optionally `WEBHOOK_SECRET`) to be set.

---

## 8. Notes on the database

- **SQLite** (users, chats, messages, notes, quizzes, uploads) — structure
  **unchanged**. Use `DB_PATH` on a mounted disk for persistence.
- **Analytics** are process-local counters only. They are best-effort,
  privacy-preserving, and reset when the backend process restarts.
- For fully durable, multi-instance SQL on serverless, consider migrating the
  Keep database schema changes in `backend/migrate_neon.py` and run the migration before deployment.
