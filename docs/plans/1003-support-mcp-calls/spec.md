# Spec: 1003 — Support MCP calls (DeepWiki remote MCP demo)

## 1. Summary

1. Add an opt-in UI control so users can allow the agent to use a public remote MCP server during a run.
2. When enabled, the server adds the DeepWiki remote MCP tool (`https://mcp.deepwiki.com/mcp`) to the OpenAI Responses request with no per-call approval for this demo.
3. MCP tool activity appears in the existing Activity panel alongside lifecycle, web search, reasoning, and local tool events.

## 2. Goals

1. Users can keep DeepWiki MCP access enabled by default from the instruction composer.
2. Users can uncheck the control to exclude the MCP server from the request entirely.
3. Web search remains always enabled regardless of MCP checkbox state.
4. MCP calls are visible in the activity log with short started / completed / failed messages.
5. Implementation stays aligned with thin route handlers, typed request validation, and agent logic in `src/lib/agent/*` per `AGENTS.md` and `.ai-assist/code-standards.md`.

## 3. Non-Goals

1. Hosting our own MCP server.
2. Adding arXiv-specific MCP behavior in this demo.
3. Persisting MCP settings across reloads.
4. Adding per-call approval UI.
5. Supporting authenticated or user-provided MCP servers.
6. Replacing existing `web_search_preview` or `write_document` tools.

## 4. User Stories

### UC1 — Submit instructions with MCP enabled

1. **Actor:** Internal operator using the lightweight frontend.
2. **Preconditions:** `OPENAI_API_KEY` and `OPENAI_MODEL` are configured; DeepWiki remote MCP endpoint is reachable; checkbox is checked.
3. **Flow**
   1. User enters instructions.
   2. User leaves the DeepWiki MCP checkbox checked.
   3. Frontend posts instructions, run id, and `enableDeepWikiMcp: true` to `POST /api/agent`.
   4. Server validates the boolean flag and includes DeepWiki MCP in the OpenAI Responses tool list.
   5. If the model calls a DeepWiki MCP tool, the Activity panel shows MCP started and completed / failed messages.
   6. Main response still resolves from the synchronous POST body as `{ messages, files }`.
4. **Postconditions:** User receives the agent response and can see any observed MCP calls in the Activity panel.

### UC2 — Submit instructions with MCP disabled

1. **Actor:** Same as UC1.
2. **Preconditions:** Checkbox is visible and unchecked before submit.
3. **Flow**
   1. User enters instructions.
   2. User unchecks the DeepWiki MCP checkbox.
   3. Frontend posts `enableDeepWikiMcp: false`.
   4. Server excludes DeepWiki MCP from the OpenAI Responses tool list.
   5. Web search and `write_document` remain available.
4. **Postconditions:** The model cannot call DeepWiki MCP for that run.

### UC3 — MCP call fails

1. **Actor:** Same as UC1.
2. **Preconditions:** DeepWiki MCP is enabled; remote server, network, or provider call may fail.
3. **Flow**
   1. Model attempts to use a DeepWiki MCP tool.
   2. OpenAI response output includes an MCP call item with failed status or error.
   3. Server publishes a safe Activity event indicating failure.
   4. Agent run returns or fails according to existing Responses API behavior.
4. **Postconditions:** Failure is visible without exposing raw tool arguments or sensitive server details.

## 5. Acceptance Criteria

| Ref | Criteria | Priority |
| --- | --- | --- |
| AC1 | Instruction composer includes a checkbox under the textarea labeled for allowing the DeepWiki public MCP server. | P0 |
| AC2 | Checkbox defaults to checked for each page load and is disabled while a request is submitting. | P0 |
| AC3 | Frontend sends `enableDeepWikiMcp` in the agent POST body. | P0 |
| AC4 | API route accepts only a boolean `enableDeepWikiMcp` when present and rejects invalid request shapes through existing validation. | P0 |
| AC5 | When `enableDeepWikiMcp` is `true`, the agent tool list includes `{ type: "mcp", server_label: "deepwiki", server_url: "https://mcp.deepwiki.com/mcp", require_approval: "never" }`. | P0 |
| AC6 | When `enableDeepWikiMcp` is `false` or omitted, the DeepWiki MCP tool is excluded. | P0 |
| AC7 | `web_search_preview` remains available for every run regardless of checkbox state. | P0 |
| AC8 | Observed DeepWiki MCP calls emit Activity log events for started and completed / failed phases. | P0 |
| AC9 | Activity events do not include full MCP arguments or output by default. | P1 |
| AC10 | Typecheck and lints pass for touched files. | P1 |

## 6. Scope

### 6.1 In Scope

1. UI checkbox in `apps/web/src/app/page.tsx`.
2. Request DTO validation and forwarding in `apps/web/src/app/api/agent/route.ts`.
3. Conditional DeepWiki MCP tool construction in `apps/web/src/lib/agent/runInstructions.ts`.
4. Activity-log publishing for DeepWiki `mcp_call` response output items.
5. Keeping existing web search, file writing, synchronous POST response, and SSE trace architecture unchanged.

### 6.2 Out of Scope

1. MCP server registry or dynamic server configuration.
2. User-authenticated MCP servers.
3. Tool allowlist UI.
4. Approval flows using `mcp_approval_request` / `mcp_approval_response`.
5. Persistence of the checkbox preference in local storage or user settings.
6. Production trust review of DeepWiki beyond using it as a public demo endpoint.

## 7. Open Questions

1. **Owner: Product / Engineering:** Should DeepWiki remain the demo endpoint after this proof of concept, or should we replace it with a self-hosted MCP server?
2. **Owner: Engineering:** Should future MCP support use a server registry abstraction once there is more than one server?
3. **Owner: Security / Product:** Should production usage require approval prompts, an allowlist of read-only MCP tools, or a trust review per server?
4. **Owner: Engineering:** Should activity events later include collapsed metadata for MCP tool names, arguments, or outputs?

## 8. Decisions

1. **DeepWiki endpoint:** Use `https://mcp.deepwiki.com/mcp` for this demo. Rationale: publicly reachable remote MCP endpoint that works with the OpenAI Responses MCP tool.
2. **Default enabled:** Checkbox defaults to checked. Rationale: demo should show MCP behavior without extra setup.
3. **Unchecked excludes:** Unchecked means DeepWiki MCP is omitted from the tool list. Rationale: clean opt-out with no hidden server access.
4. **No persistence:** Checkbox state does not persist across reloads. Rationale: requested behavior and simpler implementation.
5. **No per-call approval:** Set `require_approval: "never"` for this demo. Rationale: read-oriented demo flow with lower latency and no approval UI.
6. **Web search unchanged:** Keep `web_search_preview` always on. Rationale: existing behavior and current AI news flow depend on it.

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Remote MCP server can receive model context | Data exposure | Use only for demo; avoid sending secrets; revisit approval / allowlist before production. |
| Public MCP endpoint uptime or behavior changes | Broken demo | Treat endpoint as replaceable; keep inclusion conditional and isolated in tool construction. |
| Activity log misses MCP stream granularity | Reduced observability | Publish events from final response output items; keep messages short and safe. |
| SDK type support lags new MCP fields | Type friction | Isolate MCP tool shape locally and typecheck the integration. |
| Checkbox implies arXiv despite DeepWiki endpoint | User confusion | Label the checkbox explicitly as DeepWiki public MCP. |

## 10. High-Level Technical Approach

1. Add `enableDeepWikiMcp` React state in `apps/web/src/app/page.tsx`, defaulting to `true`.
2. Render a checkbox under the instruction textarea, disabled during submit, with clear copy for the DeepWiki public MCP server.
3. Include `enableDeepWikiMcp` in the existing `fetch("/api/agent")` JSON body.
4. Extend the `AgentRequestBody` shape and validation in `apps/web/src/app/api/agent/route.ts`.
5. Pass `enableDeepWikiMcp` through `runInstructions` options.
6. Build agent tools with a helper that always includes `web_search_preview` and `write_document`, and conditionally inserts the DeepWiki MCP tool.
7. After each streamed OpenAI response finalizes, inspect response output for DeepWiki `mcp_call` items and publish Activity events with `serverLabel`, `toolName`, `round`, and phase.
8. Keep final answer and downloads unchanged through the existing `{ messages, files }` POST response.

### 10.1 Patterns

1. **Follows existing patterns:** Thin `route.ts` request validation; OpenAI orchestration in `src/lib/agent/runInstructions.ts`; Activity events via `publishAgentTraceEvent`; final payload remains synchronous `{ messages, files }`.
2. **Breaks/changes patterns:** Adds remote MCP as a hosted tool type that is not represented in the installed SDK types as directly as existing tools. Rationale: OpenAI Responses API supports remote MCP and this demo needs the currently documented shape.

## 11. Testing Strategy

| Area | Test Type | Coverage | Priority |
| --- | --- | --- | --- |
| Request validation | Unit / route-level | Valid boolean accepted; invalid non-boolean rejected. | P0 |
| Tool construction | Unit | Enabled includes DeepWiki MCP; disabled excludes it; web search always present. | P0 |
| Activity mapping | Unit | DeepWiki `mcp_call` output maps to started and completed / failed Activity events. | P0 |
| UI behavior | Manual smoke | Checkbox defaults checked, disables while submitting, and changes POST body. | P1 |
| End-to-end demo | Manual smoke | Prompt that can use DeepWiki shows MCP activity and returns `{ messages, files }`. | P1 |
| Type safety | Static checks | `npm run typecheck` and lint for touched web files pass. | P1 |

## 12. Observability

1. Activity log shows DeepWiki MCP tool name and phase.
2. Server logs continue to summarize OpenAI responses and run ids through existing logging.
3. Do not log full MCP arguments or output at default user-visible Activity level.
4. No new metrics or alerts for this demo.

## 13. Security & Permissions

1. DeepWiki MCP is a public third-party remote MCP server; enabling it allows OpenAI to send relevant model context to that server.
2. `require_approval: "never"` is acceptable only for this demo decision; production should revisit approvals, allowed tools, and trust review.
3. Client cannot provide arbitrary MCP URLs or server labels.
4. No new secrets or environment variables are required.
5. Activity messages should remain safe and concise, avoiding raw tool arguments, raw outputs, secrets, or full instruction bodies.

## 14. Dependencies

1. **External:** OpenAI Responses API remote MCP support.
2. **External:** DeepWiki public MCP endpoint at `https://mcp.deepwiki.com/mcp`.
3. **Internal:** Existing agent API route, `runInstructions`, `traceEvents`, and Activity panel from 1002.
4. **Internal:** Existing `web_search_preview` and `write_document` tool wiring from 1001.

## 15. Pattern Alignment Checklist

1. **`AGENTS.md`:** Routes stay thin; request validation stays at the boundary; agent orchestration remains in `lib/agent`.
2. **`.ai-assist/code-standards.md`:** Uses explicit TypeScript interfaces, no `any`, validates client input, and avoids exposing sensitive data.
3. **`.ai-assist/agents/code-review.md`:** Review should focus on third-party MCP trust, request validation, checkbox behavior, and absence of raw MCP arguments / output in Activity events.
