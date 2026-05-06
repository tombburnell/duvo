# Spec: 1001 — Fetch web content and downloadable documents (agent tool + files API)

## 1. Summary

1. Extend the agent flow so instructions whose **intent is a deliverable document** (for example “latest AI news”) can produce **server-written files** plus a **user-facing message**, not only inline text.
2. The agent runtime exposes a **tool** that writes content to a controlled storage location and records **filenames** (or stable ids resolvable to filenames) for the response payload.
3. The HTTP API returns a structured body **`{ messages: string; files: string[] }`** so the frontend can show the assistant text and offer **download links** that resolve via a **REST endpoint**.

## 2. Goals

1. Users can ask for web-sourced or synthesized **documents** (example: latest AI news summary) and **download** them as files from the same session/UI.
2. The LLM response contract clearly separates **assistant message** (`messages`) from **artifacts** (`files`).
3. File writes and downloads stay **server-side** with explicit validation, naming, and limits; secrets remain server-only (aligned with 1000).
4. Implementation follows thin routes + typed services per `AGENTS.md` and `.ai-assist/code-standards.md`.

## 3. Non-Goals

1. Full web browsing product (authenticated sessions, arbitrary domain allowlists beyond a minimal safety rule, or crawl-scale scraping).
2. Long-term durable document storage, CDN, or user-specific libraries (unless promoted from Open Questions).
3. Guaranteed factual correctness of fetched web content; scope is **mechanical fetch + packaging**, not editorial QA.
4. Multi-tenant RBAC and production hardening beyond basic abuse limits (unless decided in Open Questions).

## 4. User Stories

### UC1 — Request a document and see downloads

1. **Actor:** Internal operator / developer using the lightweight frontend (same persona as 1000).
2. **Preconditions:** Agent API available; tool and download route deployed; any required keys for LLM (and optional fetch dependencies) configured server-side.
3. **Flow**
   1. User submits instructions whose outcome is a **document** (e.g. “Fetch latest AI news and give me a downloadable summary”).
   2. Server runs the agent; the model may call a **write-document** tool one or more times.
   3. Server responds with `{ messages, files }`.
   4. UI renders `messages` and lists files; user downloads via REST (e.g. GET by id or name per Decisions).
4. **Postconditions:** User obtains file(s); response contains no secrets; failed writes or fetch errors surface in `messages` and/or HTTP error semantics per acceptance criteria.

### UC2 — Request with no file artifact

1. **Actor:** Same as UC1.
2. **Preconditions:** Same as UC1.
3. **Flow**
   1. User submits normal instructions that do not require a file.
   2. Agent returns `messages` and `files: []`.
4. **Postconditions:** UI behaves as today for text-only outcomes; no download UI required.

## 5. Acceptance Criteria

| Ref  | Criteria                                                                                                                                           | Priority |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC1  | Successful agent responses use body shape **`{ messages: string; files: string[] }`** (JSON), where `files` lists server-written artifacts for this request. | P0       |
| AC2  | A **tool** (or equivalent server capability) writes document bytes under a **controlled** directory or storage abstraction; routes do not accept arbitrary filesystem paths from the client. | P0       |
| AC3  | **GET** (or documented verb) REST endpoint retrieves a file by a **server-issued** identifier or safe name; path traversal and cross-request access are rejected. | P0       |
| AC4  | When the model does not produce files, **`files` is `[]`** and `messages` still explains the outcome.                                           | P0       |
| AC5  | Errors from fetch, tool IO, or provider are **user-visible** in `messages` and/or HTTP status without leaking stack traces or secrets in production paths. | P1       |
| AC6  | Typecheck/lint for touched packages passes per project norms (TypeScript only for new code).                                                    | P1       |

## 6. Scope

### 6.1 In Scope

1. Agent response contract **`{ messages: string; files: string[] }`** end-to-end (API + frontend consumption).
2. Server-side **write-document** tool wiring (format and storage details subject to Open Questions).
3. **Download** REST API for artifacts produced in the same “session” or request correlation model as decided.
4. Basic **limits** (max file size, max files per request, timeout) documented and enforced.
5. Example flow: “latest AI news” as a **representative** use case in manual smoke / docs, not a hard-coded single-site integration unless decided.

### 6.2 Out of Scope

1. Persistent cross-device history of generated files (unless added later).
2. Virus scanning or DRM for downloads.
3. Replacing the OpenAI SDK as the agent runtime for this ticket.

## 7. Open Questions

1. **Artifact identity in `files`:** Should entries be **opaque ids** (recommended), **filenames only**, or **URLs** to the GET endpoint? (Impacts caching, leakage, and client simplicity.)
2. **File format:** Default **Markdown**, **plain text**, or **HTML**? Allow multiple types per tool call?
3. **Retention:** Ephemeral (TTL minutes/hours) vs until next deploy? Cleanup job vs on-demand delete?
4. **Fetch mechanism:** Simple HTTP GET + readable extraction vs delegated tool/service (and allowed domains).
5. **Auth:** Reuse 1000 “no auth” stance for downloads or require a shared secret / session for GET?
6. **Correlation:** Must downloads be tied to a **request id** so only the originating client can fetch, or is obscurity via random id enough for this phase?

## 8. Decisions

1. **Response shape:** Fixed JSON **`{ messages: string; files: string[] }`** for agent completion payloads exposed to the frontend (see AC1). *Rationale:* Clear separation of narrative vs artifacts; easy to extend later with metadata.
2. **Pattern:** Keep **thin** Next route handlers; implement tool handlers and file IO in dedicated modules/services (see `AGENTS.md`).
3. Pending resolution: items in §7 (record dates when closed in implementation PR).

## 9. Risks & Mitigations

| Risk                         | Impact              | Mitigation                                                                 |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------- |
| SSRF / abusive fetch via agent | Security, abuse     | Allowlist hosts or strip tools from untrusted instructions; timeouts; rate limits. |
| Path traversal or arbitrary read | Critical            | Never accept raw paths from client; store under generated ids; validate reads. |
| Large responses / disk fill  | Availability        | Per-file and per-request caps; TTL cleanup.                               |
| Model invents filenames      | Broken downloads    | Server assigns canonical names; tool returns server ids only.             |

## 10. High-Level Technical Approach

1. Extend the agent orchestration layer so the model can call **`write_document`** (name TBD): inputs include content + desired label/type; output returns **artifact id(s)** appended to `files`.
2. Persist bytes to **scoped storage** (local disk under `tmp/` or dedicated folder in dev; abstract interface for future S3).
3. Change the agent HTTP handler response from plain text to **`{ messages, files }`**, with `messages` assembled from the model’s user-visible summary (final assistant content).
4. Add **`GET /api/.../files/:id`** (exact path follows existing routing conventions) streaming `Content-Disposition: attachment` with appropriate media type.
5. Update the lightweight UI to render `messages` and download links for each `files` entry.

### 10.1 Patterns

1. **Follows existing patterns:** Thin API routes; typed helpers; OpenAI SDK server-side only; env-based config; mirror §10–§15 structure from `docs/plans/1000-lightweight-frontend/spec.md`.
2. **Breaks/changes patterns:** API response shape becomes **structured JSON** instead of a single text field—clients must migrate (acceptable as follow-on to 1000).

## 11. Testing Strategy

| Area            | Test Type        | Coverage                                                   | Priority |
| --------------- | ---------------- | ---------------------------------------------------------- | -------- |
| Response schema | Unit / contract  | Handler returns `{ messages, files }`; empty files OK      | P0       |
| File write tool | Unit             | Rejects oversize content; returns id                       | P1       |
| Download route  | Unit / integration | Unknown id → 404; valid id streams bytes                | P0       |
| E2E             | Manual smoke     | “AI news” style prompt produces ≥0 files and downloads   | P1       |

## 12. Observability

1. Log **request id**, artifact ids created, latency, and failures **without** logging full instruction bodies or file contents at info level in shared environments.

## 13. Security & Permissions

1. No trusted client paths; all artifact access goes through **server-issued** identifiers.
2. Apply **size** and **count** limits per request; optional **host allowlist** for fetch.
3. Align **authentication** posture with §7 Q5; default assumption matches 1000 unless explicitly tightened.

## 14. Dependencies

1. **External:** OpenAI API via official SDK (same as 1000); HTTP fetch capability for web content (platform `fetch` or equivalent).
2. **Internal:** Existing agent route and frontend from 1000; filesystem or storage abstraction for artifacts.

## 15. Pattern alignment checklist

1. **`AGENTS.md`:** Thin routes; services/modules for tool IO and fetch; throw on unexpected failures; log in catch blocks.
2. **`.ai-assist/code-standards.md`:** Strict TypeScript; explicit types for response DTOs; no `any` without justification.
3. **`.ai-assist/agents/code-review.md`:** Review should verify SSRF/path traversal controls, response schema, and absence of secret leakage in logs or responses.
