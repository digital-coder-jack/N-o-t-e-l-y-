# Notely deployment guide

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

Do not mark the live smoke tests as passed until they have been run against the deployed projects and the correct Neon database.
