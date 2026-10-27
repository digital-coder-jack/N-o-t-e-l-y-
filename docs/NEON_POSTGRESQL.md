# Neon PostgreSQL migration and verification

Notely's persistent application data uses Neon PostgreSQL. Requests use the pooled URL; schema migrations use a direct/non-pooled URL. Connection strings and secrets must stay in Vercel environment variables or an ignored local environment file.

## 1. Confirm the Vercel variables

In Vercel, open the Notely project → **Settings → Environment Variables**. Confirm the Neon integration has provided these names for the environment you intend to deploy:

- `NOTELY_DATABASE_URL_POSTGRES_URL` or `NOTELY_DATABASE_URL_POSTGRES_PRISMA_URL` — pooled runtime URL.
- `NOTELY_DATABASE_URL_POSTGRES_URL_NON_POOLING` or `NOTELY_DATABASE_URL_DATABASE_URL_UNPOOLED` — direct URL for migrations.

Do not copy their values into source control, logs, screenshots, or chat. Make sure the values are enabled for the relevant Production/Preview environment.

## 2. Run the schema migration from Windows

From the repository root, link the Vercel project if it is not linked already:

```powershell
vercel link
vercel env pull .env.local --environment production
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m backend.migrate_neon
```

If PowerShell blocks activation, run the pip/python commands using `.venv\Scripts\python.exe` directly. The migration uses the non-pooled URL and fails safely if one is missing. Do not print or paste `.env.local`; it must remain ignored by Git.

Expected success message begins with:

```
Neon schema migration completed:
```

This creates tables and indexes. It does **not** copy records from an older SQLite database.

## 3. Verify tables in Neon

1. Open the Neon Console and select the same project, branch, and database used by the Vercel environment.
2. Open **SQL Editor**.
3. Run this query to list all tables in the active schema:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

The migration should include these application tables:

`users`, `email_verifications`, `trial_sessions`, `trial_device_aliases`, `trial_attempts`, `auth_signin_attempts`, `questions`, `chats`, `messages`, `notes`, `quizzes`, `uploads`, `user_settings`, `topics`, `topic_artifacts`, and `tasks`.

To check the expected set directly, run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'email_verifications', 'trial_sessions',
    'trial_device_aliases', 'trial_attempts', 'auth_signin_attempts',
    'questions', 'chats', 'messages', 'notes', 'quizzes', 'uploads',
    'user_settings', 'topics', 'topic_artifacts', 'tasks'
  )
ORDER BY table_name;
```

This query should return 16 rows. If it returns fewer, check that you selected the correct Neon branch/database and rerun the migration.

## 4. Verify the deployed API

After the schema migration has succeeded and the new backend deployment is ready, open:

`https://YOUR-DEPLOYED-API-HOST/api/health`

A successful response is HTTP 200 and includes `"status": "ok"`, `"database": "ok"`, and `"database_engine": "neon_postgres"`. The endpoint runs `SELECT 1`; it does not reveal connection details.

If the response is HTTP 503, check the Vercel environment variables and deployment logs for the safe error identifier. Do not log the full connection string.

## Notes

- Schema creation is a separate migration step; application startup checks that key tables already exist and does not create tables through the pooled request connection.
- Existing SQLite records are not imported by this schema migration. Plan and verify a separate one-time data copy if existing accounts or workspace content must be retained.
