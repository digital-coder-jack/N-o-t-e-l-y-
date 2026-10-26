# Notely AI provider smoke test

This test creates a uniquely named temporary account (“Notely AI Smoke Test”), exercises the API, and attempts to delete the account in a finally block. It never prints provider keys, bearer tokens, or the temporary password.

## Requirements

- Python 3.10+
- Install the project dependencies from requirements.txt (httpx is included).
- Set valid provider keys in your local shell for tiers you expect to pass.
- Optional: set DIAG_TOKEN locally to run protected live probes.

Provider variable names:
- GEMINI_API_KEY — AI Notebook (Gemini)
- OPENROUTER_API_KEY — AI Notebook Pro (OpenRouter)
- GROQ_API_KEY — AI Notebook Pro Max (Groq)

Optional model overrides: GEMINI_MODEL, OPENROUTER_MODEL, GROQ_MODEL.
CORS origins: ALLOWED_ORIGINS, a comma-separated list.

## Run locally with Uvicorn

From the repository root, start the backend:

    uvicorn backend.main:app --host 127.0.0.1 --port 3000

In a second terminal, run:

    python scripts/ai_smoke_test.py --base-url http://127.0.0.1:3000

If diagnostics are enabled, set DIAG_TOKEN in the second terminal before running the script. It is sent only as the X-Diag-Token request header.

## Run against Vercel

Use a terminal with network access. If DIAG_TOKEN is configured in Vercel, store the same value in your local secret manager or shell and run:

    python scripts/ai_smoke_test.py --base-url https://notely-mwlq.vercel.app

The script reads DIAG_TOKEN from the environment. Never paste it into chat, commit it, or print it. The public health checks deliberately send no cookies or authorization headers; they will detect Vercel Deployment Protection rather than bypass it.

## Coverage

- Public unauthenticated GET requests to /api/health and /api/ai/status.
- Protected API rejection without a bearer token.
- Live per-tier probes when DIAG_TOKEN is supplied.
- Temporary signup/login, chat creation, SSE start/provider/token/done events, and saved assistant reply.
- Overlong input and schema validation errors.
- GET model list, PUT model selection, and a stream using the selected model.
- Notes, summarization, quiz, flashcards, plan, homework, topic generation, topic chat, text upload, and file summarization.
- Explicit stream cancellation.
- Deterministic in-process failover simulation: default tier is forced to time out, then the Pro tier must answer with the correct product label. A separate simulation verifies sanitized provider error events. This monkeypatch exists only inside the smoke-test process; it does not alter real keys or add a public production test switch.
- Attempted deletion of the temporary account.

## Reading results

The table reports PASS/FAIL, latency, and a sanitized error class. The test account is deleted at the end; if deletion fails because another serverless instance cannot find the account, the report says so. It does not print the account password, token, or provider keys.

Common probe errors:
- invalid_key: rotate the corresponding variable in Vercel: GEMINI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY. Never share the value.
- quota_or_rate_limit: check quota, billing, and provider rate limits. Rotating a key may not fix exhausted account quota.
- model_not_found: verify the matching model variable or remove the override to use the repository default.
- timeout/network/provider_5xx: check provider status, outbound connectivity, and execution duration.
- parse_error: inspect provider/model compatibility without logging raw response bodies.

If unauthenticated health endpoints return an HTML login page, redirect, 401, or 403, open the relevant Vercel project, then Settings/Security → Deployment Protection. A protected generated vercel.app URL is not reachable from an Android client without Vercel authentication. Use a public production domain/custom domain or configure the protection scope so the API's production domain is public. Do not embed a protection-bypass secret in the app.

## Known serverless constraints

SQLite at /tmp/ai_notebook.db is ephemeral, and the stream manager, rate limiter, probe cache, and cooldowns are per-instance memory. A passing request sequence proves that the current request path worked; it does not prove durable persistence across a different Vercel instance. This smoke test does not migrate data or modify existing user data.

The repo sets the Python function maxDuration to 300 seconds, matching Vercel's current Hobby maximum with Fluid Compute enabled. Provider streaming timeout is kept below that ceiling. Without Fluid Compute, Hobby duration limits are lower; verify the project’s runtime configuration.

## Database migration recommendation (not performed)

The smallest durable path is managed PostgreSQL (for example Neon or Supabase) behind the existing backend.database data-access functions. First export a SQLite snapshot, create PostgreSQL equivalents for users, chats, messages, notes, quizzes, uploads, user_settings, topics, topic_artifacts, and tasks, migrate and compare row counts, then switch the DB adapter. No database was provisioned and no production records were changed by this work.
