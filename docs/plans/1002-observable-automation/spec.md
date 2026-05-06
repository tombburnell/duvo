# Spec: 1002 — Observable automation (SSE trace + dedicated panel)

## 1. Summary

1. Add a **live activity stream** so operators can watch an automation **step by step** while it runs: **tool use**, **reasoning** (when the model and API expose it), and **lifecycle** milestones—each as a **short, human-readable message**.
2. Deliver those events to the browser via **Server-Sent Events (SSE)** on a **dedicated UI panel** separate from the main assistant message / download area (builds on 1000/1001).
3. Enable **reasoning output** in the OpenAI **Responses** path when the configured **model and API** support it; when unsupported or disabled, the stream omits reasoning events without failing the run.
4. **Trace vs answer are separate channels:** SSE carries **observability events only**. The **`{ messages, files }`** outcome stays **`POST /api/agent`-style synchronous JSON** unchanged from today—no merging of final payload into SSE and no persistence of the trace for now.

## 2. Goals

1. From the UI, an operator can **derive key state** of a run (what phase it is in, which tools ran, and—if available—what reasoning the API surfaced) **as it happens**, not only after completion.
2. Event payloads are **small and scannable** (short message per event plus minimal structured fields for correlation).
3. **SSE** is only the **trace** transport. The final **JSON** body **`{ messages, files }`** is returned by the **same synchronous agent POST** flow as today; the browser may open the SSE subscription **in parallel** (same run id or equivalent) without embedding the answer in SSE.
4. Implementation stays **server-side OpenAI SDK**; thin routes and typed helpers per root `AGENTS.md` / `.ai-assist/code-standards.md`.

## 3. Non-Goals

1. Full **chat history**, **persisted** traces/runs, **durability**, or replay from storage—SSE is ephemeral and best-effort (refresh drops history).
2. **WebSocket** transport (SSE only for this ticket).
3. Showing **full** raw tool JSON, file contents, or long model dumps in the panel—only **short messages** plus optional collapsed/raw detail later.
4. Guaranteeing **chain-of-thought** visibility for every model; only what the **Responses API** returns (including optional reasoning streams) is in scope.
5. Multi-tenant auth, rate limiting productization, or production-grade log pipelines beyond basic needs.

## 4. User Stories

### UC1 — Watch a run unfold in a side panel

1. **Actor:** Internal operator using the lightweight frontend (same persona as 1000/1001).
2. **Preconditions:** Agent available; SSE endpoint reachable; model configured; reasoning enabled only when supported.
3. **Flow**
   1. User submits instructions.
   2. Client starts **two concurrent mechanisms**: (a) **`EventSource`** (or equivalent) to an **SSE** URL for this run’s trace; (b) **existing `POST`** to run the agent and receive **`{ messages, files }`** when complete.
   3. UI opens or focuses an **Activity** (or **Run trace**) **panel** fed only by SSE.
   4. As the server processes the run, the panel appends **short lines** for **lifecycle** events (e.g. run started, model round started, model round completed).
   5. When the model emits **reasoning** (if enabled and supported), the panel shows **short reasoning messages** (or summaries—see Open Questions) as they stream.
   6. When a **tool** is invoked (hosted or custom, e.g. `web_search_preview`, `write_document`), the panel shows a **short tool-use message** (tool name + phase: requested / completed, and safe metadata such as filename when already public to the user).
   7. When the **`POST`** returns, the main area shows **`messages` and `files`** per 1001; SSE may emit a terminal **lifecycle** event (optional) **without** carrying those fields.
4. **Postconditions:** User can read the trace **in order**; no secrets or full instruction bodies appear in SSE by default.

### UC2 — Model without reasoning

1. **Actor:** Same as UC1.
2. **Preconditions:** Model or account does not emit reasoning items.
3. **Flow**
   1. User submits instructions.
   2. Panel receives lifecycle and tool events only; no reasoning lines.
4. **Postconditions:** Run completes successfully; final payload unchanged from 1001 expectations.

## 5. Acceptance Criteria

| Ref  | Criteria                                                                                                                                 | Priority |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC1  | Browser receives a **single SSE stream** per run (or per request id) whose events are typed to at least **`lifecycle`**, **`tool`**, and **`reasoning`** (reasoning only when emitted by the API). | P0       |
| AC2  | Every SSE event includes a **short human-readable `message`** (and stable **`type`** + **`event_id` or ordering** so the UI can sort deterministically). | P0       |
| AC3  | UI shows a **dedicated panel** for the trace fed by **SSE only** (not merged into the main bubble). Final **`messages`** and **`files`** come **only** from the **synchronous POST** response when it completes—not from SSE. | P0       |
| AC4  | **Lifecycle** covers run start/end and **meaningful milestones** consistent with implementation (e.g. response created/completed per model round; tool batch start/end)—document the exact set in implementation notes. | P0       |
| AC5  | **Tool** events fire for each tool invocation the orchestration observes (minimum: custom functions like `write_document`; hosted tools when the API surfaces them as observable steps). | P0       |
| AC6  | **Reasoning:** Server requests reasoning per OpenAI **Responses** capability for **`OPENAI_MODEL`**; streamed reasoning deltas are folded into **`reasoning` SSE events** with short messages (truncation policy in Decisions/Open Questions). | P1       |
| AC7  | Errors (provider, timeout, validation) emit a **`lifecycle`** (or typed **`error`**) SSE event with a safe message **and** the main flow still reflects failure appropriately. | P1       |
| AC8  | Typecheck/lint for touched packages passes per project norms.                                                                           | P1       |

## 6. Scope

### 6.1 In Scope

1. Dedicated **SSE** route (recommended) keyed by **run id** emitting the trace contract **only**; keep **`POST /api/agent`** for the substantive run + JSON body (see §8.4).
2. **Orchestration** uses **streaming** internally where needed to capture **lifecycle**, **function_call** boundaries, and **`reasoning_text` deltas**; **`output_text`** feeds the same final **`messages`** string returned on the POST—**not** duplicated on SSE unless an explicit follow-up asks for it.
3. **Frontend:** `EventSource` (or fetch-stream reader) consuming SSE and rendering the **panel** with append-only chronological lines.
4. **Reasoning toggle** via env or request flag (exact choice in §7) aligned with SDK parameters for the Responses API.

### 6.2 Out of Scope

1. **Persistence** of traces (DB, disk, export), cross-reload durability, or JSON download of a full trace archive.
2. Replacing SSE with WebSockets.
3. Admin dashboards, metrics backends, or Datadog wiring (beyond §12 basics).

## 7. Open Questions

1. **SSE route shape:** **`GET …/api/.../trace?runId=`** (EventSource-friendly) vs POST+stream reader—pick what fits Next.js/App Router and run-id handoff cleanly.
2. **Run id:** Client generates uuid vs server returns id from a tiny “start run” call—must be consistent so **POST** execution and **SSE** subscribe to the **same** in-memory (or scoped) run.
3. **Reasoning content:** Emit **truncated excerpts** only vs **summaries** (if summarization adds another model call—likely out of scope—stick to truncation at N chars with ellipsis).
4. **Hosted tool visibility:** If `web_search_preview` does not expose granular events, is **“web search invoked / completed”** inferred from output items acceptable as the **tool** short message?

## 8. Decisions

1. **Event taxonomy:** Every SSE envelope includes at minimum: **`type`** ∈ `lifecycle \| tool \| reasoning` (extend with **`error`** if needed); **`seq`** monotonic integer; **`message`** short string; optional **`payload`** object for stable metadata (`tool_name`, `call_id`, `phase`, `filename` when safe, `response_id` fragment, etc.).
2. **Reasoning:** Turn on **Responses API reasoning parameters** compatible with **`OPENAI_MODEL`**; document the exact SDK fields in implementation (fallback: no reasoning events).
3. **UI:** Dedicated **panel** (e.g. right column or collapsible sidebar) labeled clearly; ** monospace optional**—default to readable body text.
4. **Dual channel (decided):** **SSE = trace only.** **POST agent = full run + synchronous `{ messages, files }`.** No combining payloads; no requirement that the terminal SSE event contain the answer. **No trace persistence** in this ticket—ephemeral in-memory (or process-scoped) fan-out to subscribers is enough.

## 9. Risks & Mitigations

| Risk                                          | Impact        | Mitigation                                                                 |
| --------------------------------------------- | ------------- | -------------------------------------------------------------------------- |
| Next.js buffering breaks SSE                   | Broken UX      | Use recommended streaming patterns (`runtime`, `ReadableStream`, no middleware buffering); manual smoke early. |
| Leaking secrets or PII in tool/reasoning text | Compliance     | Redact payloads in **`message`**; truncate; never stream env or raw API keys. |
| Reasoning verbosity overwhelms UI              | Noise          | Hard cap chars per reasoning event client-side + server truncation policy. |
| Model without reasoning / API drift            | Confusion      | Graceful omission; document in UX copy “Reasoning depends on model.”      |
| POST finishes before/after SSE terminal      | Confusing UX   | UI treats **POST** as source of truth for success/failure; panel may still show a late “closed” lifecycle line. |

## 10. High-Level Technical Approach

1. Refactor **`runInstructions`** (or successor module) into an **async generator** / callback-based runner that emits **canonical internal events** (`lifecycle`, `tool`, `reasoning`) as the OpenAI stream and local tool executor progress.
2. Call **`openai.responses.create`** with **`stream: true`** (and reasoning options when supported) for each model round; map SDK stream events to internal events:
   1. **Lifecycle:** `response.created`, `response.completed`, `response.output_item.added` (summarized), errors, local “executing tools” before/after `handleFunctionCall`.
   2. **Tool:** On complete `function_call` output items and on local execution start/end with **short messages** (e.g. `write_document: writing news.md`).
   3. **Reasoning:** Map `response.reasoning_text.delta` (and related) into incremental **`reasoning`** events with batched or throttled short messages to avoid flooding.
3. Expose **SSE** from a **Route Handler** using a **`ReadableStream`** encoding `data: …\n\n` lines; each line is a JSON object matching §8.1. **Do not** attach `{ messages, files }` to SSE.
4. Frontend: on submit, obtain a **run id**, open **`EventSource`** (or equivalent) for the trace, and **in parallel** **`await`** the existing agent **POST**; bind **`messages` / `files`** from the POST body when it resolves. Close the SSE stream when the server ends the run or on error.
5. **Server:** The runner that fulfills the POST must **publish** trace events to subscribers for that **run id** while still returning the same structured result from the POST handler—implementation detail for **approach.md** (e.g. AsyncQueue / per-run broadcaster).
6. **OpenAI-facing** defaults to **streaming** so trace events can be produced while the POST remains **synchronously awaited** by the HTTP client once the promise resolves with `{ messages, files }`.

### 10.1 Patterns

1. **Follows existing patterns:** Thin `route.ts` handlers; agent logic in `src/lib/agent/*`; TypeScript DTOs for SSE payloads; env-based model config.
2. **Breaks/changes patterns:** 1000 spec listed **non-goal** streaming for the main reply; 1002 **adds SSE** for the **trace** and internal **streaming** toward OpenAI for observability, while keeping the **completion response** synchronous JSON on **`POST`** (unchanged contract from 1001).

## 11. Testing Strategy

| Area              | Test Type        | Coverage                                                   | Priority |
| ----------------- | ---------------- | ---------------------------------------------------------- | -------- |
| Event mapping     | Unit             | Mock stream events → canonical `lifecycle` / `tool` / `reasoning` | P0       |
| SSE format        | Unit / integration | Chunks are valid SSE; JSON parses; `seq` ordering        | P0       |
| Tool runner hooks | Unit             | Local tool start/end emits **tool** events with safe text   | P1       |
| UI panel          | Manual smoke     | Submit prompt → **SSE** fills panel in order; **POST** returns **messages** + files when done | P0       |

## 12. Observability

1. Server logs: **run id**, **response ids** per round, error classes, **duration**—avoid logging full instructions, reasoning bodies, or tool arguments at default log level.

## 13. Security & Permissions

1. Same posture as 1000/1001: **no auth** unless separately decided; do not expose **OPENAI_API_KEY** or raw provider errors to the client.
2. **Sanitize** all SSE `message` and `payload` fields for paths, URLs, and user content; align with download route safety from 1001.

## 14. Dependencies

1. **OpenAI SDK** (existing): Responses API **streaming** and optional **reasoning** parameters for the chosen model.
2. **Frontend:** Native **`EventSource`** toward a **GET** SSE URL (recommended) keyed by **run id**, **in parallel** with **`fetch`** to the synchronous agent **POST**.

## 15. Pattern alignment checklist

1. **`AGENTS.md`:** Keep routes thin; put streaming orchestration in `lib/agent`.
2. **`.ai-assist/code-standards.md`:** Strict TypeScript types for SSE event schema; explicit error handling.
3. **`.ai-assist/agents/code-review.md`:** Review should verify **no secret leakage** on SSE and **SSE reliability** under Next runtime.
