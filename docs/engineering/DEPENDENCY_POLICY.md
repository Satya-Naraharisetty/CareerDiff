# Dependency Management Policy — CareerDiff

**Document Version:** 1.0.0  
**Status:** Approved Engineering Constitution  

---

## 1. Principles for Introducing Dependencies

Every external dependency introduced into CareerDiff is a liability: it increases build times, expands attack surface, introduces transitive bloat, and creates maintenance overhead.

### The 5-Point Vetting Checklist
Before adding **any** new library (`uv add <pkg>` or `pnpm add <pkg>`), the engineer must verify:
1. **Necessity**: Can this be implemented cleanly in $\le 100$ lines of standard library code? If yes, write the code instead of importing a library.
2. **Maintenance & Activity**: Has the repository had a release within the last 6 months? Does it have active maintainers and responsive issue resolution?
3. **Transitive Footprint**: How many secondary dependencies does it drag into the project? (Reject packages that pull in dozens of unvetted sub-dependencies).
4. **License Compatibility**: Is the license permissive (MIT, Apache 2.0, BSD)? Copyleft licenses (GPL, AGPL) are strictly forbidden in client and library code.
5. **No Heavyweight AI Frameworks**: Packages such as `langchain`, `langgraph`, `crewai`, or `autogen` are strictly prohibited. Use native SDKs and Pydantic v2.

---

## 2. Approved Core Dependencies

### Backend Approved Stack
- `fastapi`, `uvicorn[standard]`: ASGI web framework and high-performance server.
- `pydantic` (v2): Data validation, settings management, and JSON schema enforcement.
- `sqlalchemy` (v2), `asyncpg`: Async relational ORM and binary PostgreSQL driver.
- `alembic`: Database schema migrations.
- `redis`: Async Redis client.
- `taskiq`, `taskiq-redis`, `taskiq-fastapi`: Distributed async task queue (supersedes ARQ per ADR-004).
- `pymupdf`: High-performance PDF text and layout extraction for resume intelligence.
- `google-genai`: Official Gemini API SDK.
- `httpx`: Asynchronous HTTP client for external service integration.

### Backend Development Tooling (via `uv add --dev`)
- `pytest`, `pytest-asyncio`, `pytest-cov`: Test runner, async test support, and coverage reporting.
- `ruff`: Fast Python linter and formatter.
- `mypy`: Strict static type checker.

---

## 3. Virtual Environment & Dependency Installation Protocol

1. **Virtualenv Creation**:
   - The virtual environment is created at `.venv/` at the repository root via `uv venv .venv --python 3.13`.
2. **Adding Dependencies**:
   - Runtime dependencies: `uv add <package>` (modifies `pyproject.toml` and installs into `.venv`).
   - Development dependencies: `uv add --dev <package>` (populates `[dependency-groups].dev`).
   - **Never** install packages into the global machine environment.
3. **Execution Context**:
   - Always invoke tools via `uv run <command>` (e.g. `uv run pytest`, `uv run ruff check .`) to execute inside `.venv`.
4. **Lockfile Enforcement**:
   - Always commit `uv.lock` and `pnpm-lock.yaml`. CI builds use frozen lockfiles (`uv sync --frozen`).

### Frontend Approved Stack
- `react`, `react-dom`: UI rendering engine.
- `typescript`: Compile-time type safety.
- `vite`: Build tool and dev server.
- `tailwindcss`: Utility-first CSS framework.
- `@tanstack/react-query`: Server state synchronization and caching.
- `zustand`: Lightweight UI state management.
- `lucide-react`: Lightweight, tree-shakeable icons.

---

## 3. Dependency Vulnerability Auditing
- **Automated Scanning**: GitHub Actions runs `uv pip audit` and `pnpm audit` on every pull request.
- **Lockfile Enforcement**: All CI builds use frozen lockfiles (`uv.lock` and `pnpm-lock.yaml`).
