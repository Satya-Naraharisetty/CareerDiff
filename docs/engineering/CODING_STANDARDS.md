# Coding Standards & Engineering Guidelines — CareerDiff

**Document Version:** 1.0.0  
**Status:** Approved Engineering Constitution  

---

## 1. Python & FastAPI Backend Standards

### 1.1 Tooling & Linters
- **Python Version**: Python 3.12+
- **Linter & Formatter**: **Ruff** (configured for PEP 8, flake8 rules, import sorting). Line length: **100 characters**.
- **Type Checking**: **Mypy** in strict mode (`--strict`). Every function signature must have explicit parameter types and return type annotations.
- **Package Manager & Isolation**: **`uv`** for deterministic dependency management. All dependencies are added via `uv add` / `uv add --dev` directly into the project's local `.venv/`. Never install packages globally.

### 1.2 Architecture & Layering Rules
1. **Clean Separation of Concerns**:
   - `app/api/`: FastAPI routers and HTTP/WebSocket serialization only. Zero business logic.
   - `app/services/`: Pure business logic and orchestration. No direct FastAPI dependencies (`Request`, `Response`).
   - `app/repositories/`: Database queries and data access via async SQLAlchemy sessions.
   - `app/models/`: SQLAlchemy ORM database models.
   - `app/schemas/`: Pydantic v2 validation and transfer models.
2. **Explicit Dependency Injection**:
   - Database sessions and services must be passed explicitly via FastAPI `Depends()`:
     ```python
     @router.get("/interviews/{interview_id}", response_model=InterviewRead)
     async def get_interview(
         interview_id: uuid.UUID,
         service: InterviewService = Depends(get_interview_service),
         current_user: User = Depends(get_current_user),
     ) -> InterviewRead:
         return await service.get_interview_by_id(interview_id, current_user.id)
     ```
3. **No Catch-All Exceptions**:
   - Never write `except Exception: pass`. Catch specific domain exceptions (`InterviewStateError`, `ProviderTimeoutError`) and log with structured contextual attributes.

---

## 2. TypeScript & React Frontend Standards

### 2.1 Tooling & Rules
- **TypeScript**: Strict mode enabled (`"strict": true`, `"noImplicitAny": true`).
- **No `any` Policy**: The `any` type is strictly forbidden. Use `unknown` with type guards or proper generic typing.
- **Package Manager**: **`pnpm`** with locked lockfiles.

### 2.2 Component & Hook Patterns
1. **Functional Components with Typed Props**:
   ```typescript
   interface TurnTranscriptProps {
     readonly turnIndex: number;
     readonly speaker: 'CANDIDATE' | 'INTERVIEWER';
     readonly text: string;
     readonly audioDurationMs?: number;
     readonly onPlayAudio?: (turnIndex: number) => void;
   }

   export const TurnTranscript: React.FC<TurnTranscriptProps> = ({
     turnIndex,
     speaker,
     text,
     audioDurationMs,
     onPlayAudio,
   }) => {
     // Component implementation
   };
   ```
2. **Custom Hooks for API & State**:
   - Keep components declarative. Extract TanStack Query queries and mutations into dedicated hooks (e.g. `useInterviewSession(id)`, `useResumeUpload()`).
3. **Tailwind Class Order**:
   - Layout / positioning (`flex`, `grid`, `absolute`) $\rightarrow$ Box model (`p-4`, `m-2`, `w-full`) $\rightarrow$ Typography (`text-sm`, `font-semibold`) $\rightarrow$ Visuals (`bg-slate-900`, `rounded-lg`, `border`).
