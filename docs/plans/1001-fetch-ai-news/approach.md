# 1001 • Fetch AI news + downloadable text files — Implementation solutions & approaches

## TLDR

**Key decisions** (clarifications locked for this demo):

1. **`files`** in the agent JSON response lists **user-friendly filenames** (not opaque ids). The same strings are what the tool used on disk and what the UI uses for links.
2. Artifacts are **text only**. Extension and shape match what the user asked for (examples: `.txt`, `.md`, `.csv`). The model chooses an appropriate filename including extension.
3. **Retention:** **No TTL** and **no cleanup**—demo posture; operators can delete `public/downloads` manually if needed.
4. **Auth:** **None** on agent POST or file access (same spirit as 1000).
5. **Storage:** Files are written under the Next app’s **`public/downloads/`** so they are served as **static assets** at **`/downloads/<filename>`** (see §Request flow). No separate download Route Handler is required unless we later need attachment headers or non-public storage.
6. **Web source:** Use OpenAI’s **built-in hosted web capability** (web search / web preview—exact tool name and parameters **per current Responses API + SDK docs**) so the model can search for AI news and pull **headlines** into the artifact. No custom scraper or allowlist layer for this slice.

**Tool contract:**

1. The LLM calls a **custom write tool** with **`filename`** (user-friendly, with extension) and **`content`** (UTF-8 text).
2. The server **sanitizes** `filename` (basename only, safe character allowlist, reasonable max length, reject `..` and absolute paths) and writes **`public/downloads/<sanitized>`**.
3. The tool result returned to the model includes the **canonical filename** actually written (post-sanitization). The HTTP response **`files`** array collects those canonical names for the frontend.

**Success metrics:**

1. Happy path: user asks for latest AI news as a downloadable file → response includes **`messages`** plus **`files`** with ≥1 name → browser can open **`/downloads/<name>`**.
2. `npm run tsc` (and project lint) clean for touched code.
3. Path traversal and unsafe names are rejected at write time with a clear tool error (no silent writes outside `public/downloads`).

## Table of Contents

1. [TLDR](#tldr)
2. [Stack decision](#stack-decision)
3. [Architecture patterns to reuse](#architecture-patterns-to-reuse)
4. [Request flow](#request-flow)
5. [Filename & format rules](#filename--format-rules)
6. [Testing strategy](#testing-strategy)
7. [Implementation phases](#implementation-phases)
8. [Risk mitigation](#risk-mitigation)
9. [Related](#related)
10. [Checklist (guide alignment)](#checklist-guide-alignment)

## Stack decision

| Layer | Choice | Notes |
| ----- | ------ | ----- |
| Framework | **Next.js** (App Router), **Node** runtime for agent route | Same as 1000; SDK + filesystem writes stay server-side. |
| Agent API | **OpenAI Responses API** via official SDK | Extend current `responses.create` usage with **tools**: hosted web + custom write tool (see OpenAI docs for enabling hosted web tools on Responses). |
| Storage | **`apps/web/public/downloads/`** (repo-relative path in web app) | Static hosting at `/downloads/*`; ensure directory exists or is created on first write; **gitignore** contents if we do not want artifacts committed (recommended). |
| Download UX | **Static URL** `/downloads/<filename>` | Simplest demo; no auth means URLs are guessable if filenames are predictable—acceptable for internal demo only. |

## Architecture patterns to reuse

1. **Thin Route Handler** (`app/api/agent/route.ts`): validate body → call **`runInstructions`** (or renamed orchestrator) → return **`{ messages, files }`** or typed errors.
2. **Orchestration module** (`lib/agent/runInstructions.ts` or sibling): owns OpenAI call loop (model → tool calls → execute **`write_document`** → submit outputs → final text). Accumulates **`files`** from successful writes.
3. **Small file helper**: `sanitizeDownloadFilename`, `writeDownloadFile`, resolve path under `public/downloads` only—keeps traversal logic out of the route.

**Alignment:** Matches `AGENTS.md`: thin HTTP layer, typed services, throw on failure, log errors.

## Request flow

```
Browser
  │  POST { instructions }
  ▼
POST /api/agent  →  validate  →  run agent (Responses + tools)
                              │
                              ├─► OpenAI hosted web tool (search / preview for AI news headlines)
                              │
                              └─► Custom tool write_document(filename, content)
                                     → write public/downloads/<sanitized>
                                     → append canonical name to files[]
  │
  ▼
JSON { messages, files: ["ai-news.md", ...] }

Browser  GET /downloads/ai-news.md   (Next static file from public/)
```

## Filename & format rules

1. **User-facing names:** `files[]` entries are **filenames** suitable for download links (e.g. `ai-headlines-2026-05-06.csv`).
2. **Formats:** Only **text** formats the user requested; model picks extension (`txt`, `md`, `csv`, etc.). No PDF/binary in this ticket.
3. **Sanitization (required):**
   1. Take **basename only** (strip any path segments).
   2. Reject empty string, reserved names, and names containing `..` or separators.
   3. Allow only a conservative charset (e.g. alphanumeric, hyphen, underscore, single dot before extension) or normalize unsafe characters; cap length (e.g. ≤ 128 chars).
4. **Collisions:** For demo, **overwrite** same sanitized name within a single server process is acceptable; alternatively append `-2`, `-3`—pick one behavior and document in code comment.
5. **Response:** Tool returns **canonical filename**; **`files`** in API response is the deduped ordered list of successful writes for that request.

## Testing strategy

| Area | Scenarios | Priority |
| ---- | --------- | -------- |
| Sanitizer | `../../../etc/passwd`, `\`, path segments, unicode tricks → rejected or normalized safely | P0 |
| Write tool | Oversized `content` rejected; successful write creates file under `public/downloads` only | P1 |
| POST /api/agent | Body validates; response shape `{ messages, files }`; `files` empty when no writes | P0 |
| Manual smoke | Prompt for AI news + markdown file → file appears and loads at `/downloads/...` | P0 |

Live OpenAI + hosted web tool behavior is **manual smoke** unless we add recorded mocks.

## Implementation phases

1. **Filesystem + sanitizer + write tool** wired locally (unit tests on sanitizer).
2. **Responses API loop**: register custom `write_document`; enable **OpenAI built-in web** tool per docs; system/developer instructions nudging “search web for AI news, then write headlines to a file with a clear name.”
3. **API + UI**: migrate response from `{ reply }` to **`{ messages, files }`**; render message + links to **`/downloads/<file>`**.
4. **Repo hygiene**: add `public/downloads/.gitkeep` or document mkdir-on-write; **ignore `*` under downloads** in `.gitignore` if artifacts must not be committed.

## Risk mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Path traversal via model-supplied filename | Basename + strict allowlist + reject `..`; never join unchecked segments. |
| Public URLs without auth | Accepted for demo; do not use for sensitive data; document “internal only.” |
| Disk growth (no TTL) | Demo only; manual cleanup; optional soft cap on file size per write. |
| Hosted web tool availability / model behavior | Fall back to clear `messages` when tool unavailable; keep instructions simple (“headlines only”). |

## Related

- **`spec.md`** — requirements; update §7–§8 when this approach is adopted so spec matches filename + `public/downloads` + hosted web decisions.
- **`docs/plans/1000-lightweight-frontend/approach.md`** — base stack and thin-route pattern.

## Checklist (guide alignment)

1. [x] TLDR: decisions, tool contract, success metrics
2. [x] Table of contents
3. [x] Stack table
4. [x] Patterns: thin route + orchestration + file helper
5. [x] ASCII flow diagram
6. [x] Filename rules explicit (sanitization required)
7. [x] Testing table + manual smoke
8. [x] Phased implementation
9. [x] Risks
10. [x] No implementation source code blocks
