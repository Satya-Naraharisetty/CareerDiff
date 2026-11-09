# Environment Configuration Specification — IntervueX

**Document Version:** 1.0.0  
**Status:** Approved Configuration Standard  

---

## 1. Backend Environment Variables (`backend/.env`)

| Variable Name | Type | Default Value | Required in Prod? | Description & Security Notes |
| :--- | :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | `string` | `development` | Yes | `development`, `testing`, or `production`. |
| `LOG_LEVEL` | `string` | `INFO` | No | `DEBUG`, `INFO`, `WARNING`, `ERROR`. |
| `DATABASE_URL` | `string` | `postgresql+asyncpg://intervuex:postgres@localhost:5432/intervuex_dev` | Yes | Async PostgreSQL connection string. |
| `REDIS_URL` | `string` | `redis://localhost:6379/0` | Yes | Redis connection string for session state. |
| `JWT_SECRET_KEY` | `string` | `insecure_dev_secret_change_in_production_key_32bytes` | Yes | 32+ byte cryptographic secret for JWT signing. |
| `JWT_ALGORITHM` | `string` | `HS256` | No | Algorithm for JWT tokens. |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`| `int` | `15` | No | Short access token TTL. |
| `S3_ENDPOINT_URL`| `string` | `http://localhost:9000` | No | S3 / MinIO endpoint URL. |
| `S3_BUCKET_NAME` | `string` | `intervuex-resumes` | Yes | S3 bucket for storing resume files. |
| `S3_ACCESS_KEY` | `string` | `minioadmin` | Yes | S3 access key. |
| `S3_SECRET_KEY` | `string` | `minioadmin` | Yes | S3 secret key. |
| `GEMINI_API_KEY` | `string` | | Yes | API key for Gemini LLM. |
| `DEEPGRAM_API_KEY`| `string`| | Yes | API key for streaming Deepgram STT. |
| `CARTESIA_API_KEY`| `string`| | Yes | API key for streaming Cartesia TTS. |
| `ELEVENLABS_API_KEY`| `string`| | No | Alternative TTS provider API key. |

---

## 2. Frontend Environment Variables (`frontend/.env.local`)

| Variable Name | Type | Default Value | Required in Prod? | Description |
| :--- | :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `string` | `http://localhost:8000/api/v1` | Yes | Base URL for REST API calls. |
| `VITE_WS_BASE_URL` | `string` | `ws://localhost:8000/ws/v1` | Yes | Base URL for WebSocket streams. |
| `VITE_ENABLE_MOCK_AUDIO` | `boolean` | `false` | No | Enables synthetic microphone simulation for testing without physical mic. |
