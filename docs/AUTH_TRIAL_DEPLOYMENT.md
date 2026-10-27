# Notely authentication and trial deployment checklist

This repository supports a static frontend under `frontend/` and a Next.js frontend under `web/`, plus a separate FastAPI backend. Both frontend implementations now use a same-origin `/api/*` proxy to avoid browser cross-site cookie restrictions.

## 1. Configure the frontend Vercel project

In the Vercel dashboard:

1. Open the **frontend** project.
2. Go to **Settings → Environment Variables**.
3. Add `NOTELY_BACKEND_URL`.
4. Set its value to the backend FastAPI project's public HTTPS origin only, for example `https://your-backend-project.vercel.app` — no trailing slash, path, username, password, or connection string.
5. Enable it for **Production** and **Preview**.
6. Save, then redeploy the frontend deployment for each environment.

If you deploy both `frontend/` and `web/` as separate frontend projects, configure `NOTELY_BACKEND_URL` in both. It is server-side and must not use the `NEXT_PUBLIC_` prefix.

The Next.js frontend no longer reads `NEXT_PUBLIC_API_BASE_URL`; API calls go to the frontend's own `/api/*` route and the proxy forwards them server-side. The static frontend also uses its same-origin `/api/*` route. This keeps the browser talking only to the frontend origin and lets HttpOnly trial cookies remain first-party.

## 2. Check the backend Vercel project

Open the **backend** project → **Settings → Environment Variables**. For both **Production** and **Preview**, check the variable names below. Do not paste values into source code, GitHub, logs, screenshots, or chat.

Required for Neon runtime:
- `NOTELY_DATABASE_URL_POSTGRES_URL` (pooled runtime URL), or the supported pooled fallback `NOTELY_DATABASE_URL_POSTGRES_PRISMA_URL` / `NOTELY_DATABASE_URL_DATABASE_URL`.

Required to run the schema migration locally:
- `NOTELY_DATABASE_URL_POSTGRES_URL_NON_POOLING`, or `NOTELY_DATABASE_URL_DATABASE_URL_UNPOOLED` (direct/non-pooled URL).

Authentication/trial configuration:
- `JWT_SECRET`: stable, long random secret; keep the same value across Production instances.
- `OTP_SECRET`: separate stable random secret.
- `TRIAL_HASH_SECRET`: separate stable random secret.
- `COOKIE_SECURE=1` for HTTPS production.
- `APP_BASE_URL`: public frontend URL used in password-reset links.
- `ALLOWED_ORIGINS`: exact frontend origins, comma-separated, if any browser calls still go directly to the backend. With the same-origin proxy, normal browser API calls should not need cross-origin CORS.

Email configuration:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS`, and `SMTP_USE_SSL`.
- Verify the sender/domain in Resend. The sender must be permitted by the Resend account; an unverified domain or rejected SMTP credentials will prevent OTP delivery.

Do not copy the actual values into this document.

## 3. Run the schema migration

From the repository root on your own machine, after securely pulling the backend project's Production variables:

```powershell
vercel link
vercel env pull .env.local --environment production
py -m pip install -r requirements.txt
py -m backend.migrate_neon
```

If the repository is already linked to the backend project, `vercel link` can be skipped. Keep `.env.local` private and ignored by Git. The migration creates tables; it does not import old SQLite records.

## 4. Verify the live schema in Neon

In Neon Console → the exact project/branch/database used by the backend → **SQL Editor**, run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

The expected application tables are `users`, `email_verifications`, `trial_sessions`, `trial_device_aliases`, `trial_attempts`, `auth_signin_attempts`, `questions`, `chats`, `messages`, `notes`, `quizzes`, `uploads`, `user_settings`, `topics`, `topic_artifacts`, and `tasks`.

## 5. Smoke-test after deployment

1. Open the backend deployment's `/api/health`; expect HTTP 200 and `database_engine: neon_postgres`. If connection or required schema is unavailable, expect a safe HTTP 503 response.
2. Open browser DevTools → Network. Requests should go to the frontend origin at `/api/...`, not directly to a second `vercel.app` hostname.
3. Start a trial, close/reopen the tab, and confirm it resumes with the same expiry.
4. Attempt a second trial from the same browser/device; it should be blocked/resumed, not create a second trial.
5. Test temporary-email rejection, Gmail dot/plus normalization, real-email signup, OTP verification, signin, signout, and an expired trial.
6. Check backend Vercel Function Logs for `api/index.py` / `backend.main`; check frontend deployment/function logs for the `/api/[...path]` proxy. For delivery failures, inspect the Resend email logs.

The repository tools cannot inspect your private Vercel or Neon dashboard values. Do not mark the live smoke tests passed until you run them against the deployed projects.
