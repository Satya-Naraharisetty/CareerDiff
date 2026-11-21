# Environment Configuration Specification — CareerDiff

**Document Version:** 1.1.0  
**Status:** Approved Configuration Standard  

The project enforces a strict **two-file convention** for both backend and frontend:
* **Active Environment File (`.env`)**: Contains the local active keys/secrets (gitignored, never committed).
* **Reference Example File (`.env.example`)**: Contains complete documentation and templates for all keys across local Docker Compose and Cloud Free Tier deployments (committed to git).

---

## 1. Backend Environment (`backend/.env` & `backend/.env.example`)

| Variable Name | Type | Default Local Value | Required in Prod? | Description & Free Tier Notes |
| :--- | :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | `string` | `development` | Yes | `development`, `testing`, or `production`. |
| `LOG_LEVEL` | `string` | `INFO` | No | `DEBUG`, `INFO`, `WARNING`, `ERROR`. |
| `WEB_CONCURRENCY` | `int` | `1` | No | Concurrency workers for Uvicorn (1 worker recommended for 512 MB Render free tier). |
| `DATABASE_URL` | `string` | `postgresql+asyncpg://careerdiff:postgres@localhost:5432/careerdiff_dev` | Yes | PostgreSQL connection string. On Supabase free tier, use the **Transaction Pooler (port 6543)**. |
| `TEST_DATABASE_URL` | `string` | `postgresql+asyncpg://careerdiff:postgres@localhost:5432/careerdiff_test` | No | Test database connection string used by pytest. |
| `REDIS_URL` | `string` | `redis://localhost:6379/0` | Yes | Ephemeral session cache. On Upstash, format: `rediss://default:[TOKEN]@[HOST].upstash.io:6379`. |
| `JWT_SECRET_KEY` | `string` | `insecure_dev_secret_change_in_production_key_32bytes` | Yes | 32+ byte cryptographic random secret for JWT signing. |
| `JWT_ALGORITHM` | `string` | `HS256` | No | Token hashing algorithm. |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | `10080` | No | Access token TTL in minutes (default 7 days). |
| `CORS_ORIGINS` | `string` | `http://localhost:3000,...` | Yes | Comma-separated allowed frontend origins (e.g. `https://your-app.vercel.app,http://localhost:5173`). |
| `S3_ENDPOINT_URL` | `string` | `http://localhost:9000` | No | S3 / MinIO endpoint. For Supabase Storage: `https://[REF].supabase.co/storage/v1/s3`. |
| `S3_BUCKET_NAME` | `string` | `careerdiff-resumes` | Yes | Target storage bucket for resume uploads. |
| `S3_ACCESS_KEY` | `string` | `minioadmin` | Yes | S3 Access Key ID. |
| `S3_SECRET_KEY` | `string` | `minioadmin` | Yes | S3 Secret Access Key. |
| `GEMINI_API_KEY` | `string` | `None` | Yes | Google Gemini API Key for semantic turns and evaluation. |
| `GEMINI_TURN_MODEL` | `string` | `gemini-3.8-flash` | No | High-speed LLM model used for live turn adaptation. |
| `GEMINI_EVAL_MODEL` | `string` | `gemini-4-argon` | No | High-rigor reasoning LLM model used for decoupled rubric evaluation. |
| `GOOGLE_CLIENT_ID` | `string` | `None` | No | Google OAuth 2.0 Web Client ID for authentication. |
| `GOOGLE_CLIENT_SECRET` | `string` | `None` | No | Google OAuth 2.0 Client Secret for authentication token verification. |

---

## 2. Frontend Environment (`frontend/.env` & `frontend/.env.example`)

| Variable Name | Type | Default Local Value | Required in Prod? | Description |
| :--- | :--- | :--- | :--- | :--- |
| `VITE_API_URL` | `string` | *(empty string)* | Yes (in Prod) | Base URL for REST API and WebSocket connection. If left blank locally, Vite dev server proxies `/api` and `/ws` to `http://localhost:8000`. In production (Vercel), set to your Render URL (e.g. `https://careerdiff-backend.onrender.com`). |
| `VITE_GOOGLE_CLIENT_ID` | `string` | *(empty string)* | No | Google OAuth 2.0 Web Client ID (matches `GOOGLE_CLIENT_ID` in backend) for One-Tap and Google Sign-In button. |
