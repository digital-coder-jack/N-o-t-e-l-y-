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

Notely's deployed architecture uses two separate Vercel projects:

- **Backend:** FastAPI, deployed from the repository root through `api/index.py`.
- **Frontend:** either the static site under `frontend/` or the Next.js app under `web/`.
- **Persistent database:** Neon PostgreSQL. The backend does not use a local SQLite file for application data.
- **Email verification:** Resend SMTP configuration supplied through backend environment variables.

## 1. Backend Vercel project

1. In Vercel, create/open the backend project connected to this repository.
2. Set the project's **Root Directory** to the repository root (not `frontend/` or `web/`).
3. Confirm `vercel.json` and `api/index.py` are included in the deployment.
4. Open **Settings → Environment Variables** and configure the variables below for both **Production** and **Preview** as appropriate.

### Neon PostgreSQL

The backend runtime uses the first non-empty pooled URL in this order:

1. `NOTELY_DATABASE_URL_POSTGRES_URL`
2. `NOTELY_DATABASE_URL_POSTGRES_PRISMA_URL`
3. `NOTELY_DATABASE_URL_DATABASE_URL`

The schema migration uses a direct/non-pooled URL:

- `NOTELY_DATABASE_URL_POSTGRES_URL_NON_POOLING`, or
- `NOTELY_DATABASE_URL_DATABASE_URL_UNPOOLED`.

These names are supplied by the Vercel Neon integration. Do not paste connection strings into source code, commits, issue comments, or logs.

### Authentication, trial and email

Configure these names in the backend project:

- `JWT_SECRET` — stable random secret for signing account tokens.
- `OTP_SECRET` — separate stable random secret for OTP hashing.
- `TRIAL_HASH_SECRET` — separate stable random secret for trial identity hashing.
- `COOKIE_SECURE=1` — production cookies use HTTPS.
- `APP_BASE_URL` — public frontend URL used to create password-reset links.
- `ALLOWED_ORIGINS` — comma-separated exact frontend origins if direct browser-to-backend requests are used. Preview origins must be explicitly listed.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS`, `SMTP_USE_SSL`.
- `TEMP_EMAIL_DOMAINS` — optional comma-separated additions to the built-in disposable-email blocklist.

Optional features use `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, and their model/tuning variables. Telegram integration uses `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `WEB_APP_URL`, and optionally `TELEGRAM_ADMIN_ID`.

For Resend SMTP, check the host/port/TLS mode in the Resend dashboard, use the correct SMTP credentials, and ensure the sender address/domain is verified. Do not log or commit the SMTP password/API key.

## 2. Frontend Vercel project

The frontend API requests now use a **same-origin proxy** at `/api/*`. This avoids browser CORS and cross-site cookie problems between two different `vercel.app` domains.

1. Open the frontend Vercel project → **Settings → Environment Variables**.
2. Add `NOTELY_BACKEND_URL`.
3. Set it to the backend project's public HTTPS origin only, with no trailing slash or path. Do not include database credentials.
4. Enable it for **Production** and **Preview**.
5. Save and redeploy the frontend.

If both the static `frontend/` project and the Next.js `web/` project are deployed separately, set `NOTELY_BACKEND_URL` in each one. The proxy uses this server-side variable; the browser does not receive the backend host from a `NEXT_PUBLIC_` variable.

The Next.js frontend no longer reads `NEXT_PUBLIC_API_BASE_URL`. Its API calls stay on the frontend origin and are forwarded by `web/app/api/[...path]/route.ts`. The static frontend uses `frontend/api/[...path].js` in the same way.

## 3. Run the Neon schema migration

From the repository root on your PC, link the Vercel CLI to the **backend** project and pull its Production environment into a private local file:

```powershell
vercel link
vercel env pull .env.local --environment production
py -m pip install -r requirements.txt
py -m backend.migrate_neon
```

If the repo is already linked to the backend project, skip `vercel link`. Keep `.env.local` private and ignored by Git. The migration creates the schema; it does not import old SQLite records.

## 4. Verify the deployment

1. Open `https://YOUR-BACKEND-DOMAIN/api/health`. Expect HTTP 200 and `"database_engine": "neon_postgres"` when the connection and expected schema are ready. A safe HTTP 503 indicates the database URL or schema is unavailable.
2. In browser DevTools → **Network**, confirm API calls go to the frontend origin at `/api/...`; they should not call the backend's `vercel.app` hostname directly.
3. Open the backend Vercel project's **Functions / Runtime Logs** for `api/index.py` and `backend.main`. Open the frontend project's deployment/function logs for the `/api/[...path]` proxy.
4. Test trial start/resume/restart-blocking, signup email delivery, OTP verification, signin, signout, and expired-trial behavior.
5. To verify tables, use the Neon Console → correct project/branch/database → SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

The expected application tables are `users`, `email_verifications`, `trial_sessions`, `trial_device_aliases`, `trial_attempts`, `auth_signin_attempts`, `questions`, `chats`, `messages`, `notes`, `quizzes`, `uploads`, `user_settings`, `topics`, `topic_artifacts`, and `tasks`.

- **SQLite** (users, chats, messages, notes, quizzes, uploads) — structure
  **unchanged**. Use `DB_PATH` on a mounted disk for persistence.
- **Analytics** are process-local counters only. They are best-effort,
  privacy-preserving, and reset when the backend process restarts.
- For fully durable, multi-instance SQL on serverless, consider migrating the
  Keep database schema changes in `backend/migrate_neon.py` and run the migration before deployment.
