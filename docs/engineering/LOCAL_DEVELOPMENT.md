# Local Development Guide — IntervueX

**Document Version:** 1.0.0  
**Status:** Approved Setup Runbook  

---

## 1. System Prerequisites

Before starting local development on IntervueX, ensure your workstation has the following installed:
- **Operating System**: macOS, Linux, or Windows (WSL2 or PowerShell).
- **Python**: `3.12` or higher (recommended via `uv` or `pyenv`).
- **Node.js**: `20.x` or higher (recommended via `nvm` or `fnm`).
- **Package Managers**:
  - Python: **`uv`** (`curl -LsSf https://astral.sh/uv/install.sh | sh` or `winget install astral-sh.uv`)
  - Frontend: **`pnpm`** (`npm install -g pnpm`)
- **Containers**: **Docker Desktop** or Docker Engine with Docker Compose v2.

---

## 2. Infrastructure Setup (Docker Compose)

Start the local backing services (PostgreSQL 16, Redis 7, MinIO):

```bash
# Start all backing services in background
docker compose up -d

# Verify container health
docker compose ps
```

### Local Services & Ports:
- **PostgreSQL 16**: `localhost:5432` (User: `intervuex`, DB: `intervuex_dev`, Pass: `postgres`)
- **Redis 7**: `localhost:6379`
- **MinIO S3**: `localhost:9000` (Console: `localhost:9001`, User: `minioadmin`, Pass: `minioadmin`)

---

## 3. Backend Setup (FastAPI & Python)

```bash
# 1. Navigate to backend directory (when implemented)
cd backend

# 2. Copy environment variables
cp .env.example .env

# 3. Create virtual environment and sync dependencies using uv
uv sync

# 4. Apply database migrations
uv run alembic upgrade head

# 5. Seed initial roles and rubrics
uv run python -m app.scripts.seed_roles

# 6. Start FastAPI development server with auto-reload
uv run uvicorn app.main:app --reload --port 8000
```
API Documentation will be available at: `http://localhost:8000/docs`.

---

## 4. Frontend Setup (React & Vite)

```bash
# 1. Navigate to frontend directory (when implemented)
cd frontend

# 2. Copy environment template
cp .env.example .env.local

# 3. Install dependencies
pnpm install

# 4. Start Vite development server with HMR
pnpm dev --port 3000
```
Web App will be available at: `http://localhost:3000`.

---

## 5. Development Verification Loop

After making any changes:
```bash
# Run backend tests
cd backend && uv run pytest

# Run type check & linter
uv run ruff check . && uv run mypy app/

# Run frontend lint & build
cd ../frontend && pnpm typecheck && pnpm lint
```
