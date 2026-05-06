# Spec: 1000 — Lightweight automation frontend (agent prompt → response)

## 1. Summary

1. Add a minimal UI plus server integration so operators can submit **one** instruction block to an agentic backend and read the **single** consolidated reply.
2. Integration **must** use the official **OpenAI SDK**; OpenAI credentials and model are provided via `.env`.
3. Scope is intentionally tiny (~10 min implementation slot in a larger block); polish and productization are out of scope unless explicitly expanded later. **Authentication is not required** for this ticket (see §7–§8).

## 2. Goals

1. Prove end-to-end flow: user enters instructions → system returns agent response in the same session.
2. Keep API keys and SDK calls **server-side** (never shipped to the browser).
3. Align with repo conventions in `AGENTS.md` and `code-standards.md` (thin HTTP layer, typed TS, minimal surface area).

### 2.1 Non-functional requirements

1. **TypeScript:** All code added or changed for this feature is TypeScript, compiled under the repo’s strict TS settings (`npm run tsc` / package equivalents).
2. **OpenAI SDK:** Agent calls are implemented only via the **OpenAI SDK** using `OPENAI_API_KEY` and `OPENAI_MODEL`.

## 3. Non-Goals

1. Multi-turn chat history, threads, or persistence.
2. Streaming responses (unless trivial with chosen SDK; not required).
3. RBAC, org isolation, or production hardening beyond basic secret handling.
4. Choosing final product UX, branding, or routing structure beyond “one page + one API”.
5. Authentication, sessions, or RBAC for the lightweight page (internal/dev use only for this spike).

## 4. User Stories

### UC1 — Submit instructions and view reply

1. **Actor:** Internal operator / developer testing the automation platform.
2. **Preconditions:** Valid OpenAI API key and model configured in server environment; dev server running.
3. **Flow**
   1. User opens the lightweight frontend page.
   2. User pastes or types a single block of instructions.
   3. User submits the form.
   4. User sees a loading state, then the agent response (or a clear error message).
4. **Postconditions:** Response text visible on screen; no secrets echoed to the client.

## 5. Acceptance Criteria

| Ref   | Criteria                                                                 | Priority |
| ----- | ------------------------------------------------------------------------ | -------- |
| AC1   | User can submit non-empty instructions and receive a text response.    | P0       |
| AC2   | API key / SDK usage runs only on the server (or trusted automation), not in client bundles. | P0 |
| AC3   | Errors from the provider (network, auth, rate limit) surface as user-visible, non-leaking messages. | P1 |
| AC4   | Typecheck/lint for touched packages passes per project norms.            | P1       |
| AC5   | Implementation uses TypeScript only (no new plain JS for this feature).   | P0       |
| AC6   | Agent invocation goes through the OpenAI SDK (server-side).              | P0       |

## 6. Scope

### 6.1 In Scope

1. One UI surface (e.g. textarea + submit + result panel).
2. One backend endpoint or server action that invokes the **OpenAI SDK** (or thin typed wrapper around it).
3. Configuration via environment variable(s) documented for local dev (no committed secrets).
4. **`docker-compose.local.yml`** for local development with the app process only for this phase; no Postgres/Redis app wiring is needed yet.

### 6.2 Out of Scope

1. Application use of databases, queues, Redis, or workflow orchestration **for this agent call**.
2. Automated E2E against live OpenAI API in CI (manual smoke acceptable for spike).
3. Replacing the OpenAI SDK with another client for this ticket.

## 7. Open Questions

All items below were **resolved** for this ticket; none block implementation.

| Topic | Decision |
| ----- | -------- |
| Local development | Use **`docker-compose.local.yml`** for the Next app service only for now. Do not wire Postgres/Redis into the app for this phase. |
| Auth | **Not required** for this page for this task. |
| Prompt / payload | **User-submitted instructions only** for v1; a separate **system** prompt or preamble may be added later. |

## 8. Decisions

1. **Language:** **TypeScript** for all implementation touching this feature (see §2.1).
2. **Agent runtime:** **OpenAI SDK** only—matches the updated platform direction (see §2.1). *Date: TBD.*
3. **Key handling:** Use server-side env vars `OPENAI_API_KEY` and `OPENAI_MODEL`; load from **`.env`** (gitignored); document in `.env.example` or README only—never client exposure.
4. **Local orchestration:** **`docker-compose.local.yml`** per §7 table and the docker-compose-local skill.
5. **Security posture for this spike:** No app-level authentication; still do not log secrets or leak keys to the client (see §13).
6. **Agent input:** Request body carries **end-user instructions only**; no mandatory system prompt in scope for v1.

## 9. Risks & Mitigations

| Risk                         | Impact              | Mitigation                                      |
| ---------------------------- | ------------------- | ----------------------------------------------- |
| SDK install / runtime mismatch in repo | Wasted spike time | Spike starts with dependency proof in target app; fallback doc row in Decisions if blocked. |
| Accidental key leak via client bundle | Critical security | Code review checks for imports of SDK in client paths; only call from server module. |

## 10. High-Level Technical Approach

1. Add a server route (or equivalent) that accepts a JSON body `{ instructions: string }` (**user payload only** for v1), validates non-empty input, and calls the **OpenAI SDK** with `OPENAI_MODEL` (system layer optional later).
2. Add a minimal client page that POSTs to that route and renders plaintext/markdown-safe response.
3. Document required env vars and local run steps.

### 10.1 Patterns

1. **Follows existing patterns:** Routers/controllers stay thin; delegate to a small service/helper for the SDK call (`AGENTS.md` layer split). TypeScript strictness and formatting per `code-standards.md`.
2. **Breaks/changes patterns:** None expected; if repo has no frontend yet, adding the smallest possible surface is an explicit spike exception until structure is decided.

## 11. Testing Strategy

| Area            | Test Type        | Coverage                                  | Priority |
| --------------- | ---------------- | ----------------------------------------- | -------- |
| Input validation | Unit or handler test | Empty body rejected with 4xx             | P1       |
| Client wiring   | Manual smoke      | Happy path in dev                         | P0       |
| Provider errors | Manual / optional unit | Mapped to safe client message          | P2       |

## 12. Observability

1. Optional: structured log line on server for request id + latency + failure reason (no instruction body if it may contain secrets). No metrics/alerts required for this spike.

## 13. Security & Permissions

1. Treat submitted instructions as sensitive; avoid logging full payload at info level in shared environments.
2. API key only in server environment; rotate via 1Password-supplied process if leaked.
3. **No authentication** for this lightweight page on this ticket; do not rely on obscurity for production—scope remains dev/internal.

## 14. Dependencies

1. **External:** OpenAI API accessed **only** through the official **OpenAI SDK** package pinned in `package.json`.
2. **Internal:** Next.js + Tailwind + shadcn per `approach.md`; local run via **`docker-compose.local.yml`** (docker-compose-local skill).

## 15. Pattern alignment checklist

1. **`AGENTS.md`:** Thin routes, services for orchestration, throw/log errors appropriately, TypeScript discipline.
2. **`code-standards.md`:** Explicit types, no `any` shortcuts without justification, consistent naming.
3. **`agents/code-review.md`:** Review should verify server-only secrets, input validation, and error handling.
