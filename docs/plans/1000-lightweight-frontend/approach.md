# 1000 • Lightweight automation frontend — Implementation solutions & approaches

## TLDR

**Key decisions**:

- **Next.js (App Router)** for one page + one server API route—SDK and `ANTHROPIC_API_KEY` stay on the server by default.
- **Tailwind CSS** for layout/spacing; **shadcn/ui** for textarea, button, card, and loading/error affordances without bespoke CSS.
- **Claude Agents SDK** invoked only from a **Route Handler** (`app/api/.../route.ts`) or Server Action—never from client components.

**Open questions**:

- Optional: exact marketing URL path only (`/` vs `/agent`)—pick one when scaffolding; not blocking.

**Resolved** (see `spec.md` §7–§8): **docker-compose.local.yml** for the Next app only; **no auth**; **user-only payload** for v1 (system prompt later).

**Success metrics**:

- Happy path: instructions submitted → visible agent reply typically under 30s (network/model dependent).
- `npm run tsc` (and project lint) clean for touched code.
- No Anthropic secret in client bundle (verify with build inspect or grep `process.env` usage in `"use client"` trees).

## Table of Contents

1. [TLDR](#tldr)
2. [Stack decision](#stack-decision)
3. [Architecture patterns to reuse](#architecture-patterns-to-reuse)
4. [Request flow](#request-flow)
5. [Testing strategy](#testing-strategy)
6. [Implementation phases](#implementation-phases)
7. [Open questions requiring answers](#open-questions-requiring-answers)
8. [Risk mitigation](#risk-mitigation)
9. [Related](#related)

## Stack decision

| Layer | Choice | Pros | Cons | Recommendation |
| ----- | ------ | ---- | ---- | -------------- |
| Framework | **Next.js** (App Router, TypeScript) | Route Handlers for thin HTTP + server-only SDK; one deploy unit for spike | Extra tooling vs bare Vite | ✅ **Use** |
| Styling | **Tailwind** | Fast utility layout; matches shadcn assumptions | Utility noise if abused | ✅ **Use** |
| Components | **shadcn/ui** | Accessible primitives; copy-in components | Requires `components.json` + cn helper setup once | ✅ **Use** |
| Agent call site | **Route Handler** (`POST` JSON) | Explicit boundary; easy to curl; clear “no SDK in client” | Slightly more boilerplate than Server Action alone | ✅ **Recommended** (Server Action acceptable if team prefers) |

**Environment**: Load `ANTHROPIC_API_KEY` from `.env` (gitignored per repo `.gitignore`); Next reads via `process.env` on server only—do not prefix with `NEXT_PUBLIC_`.

## Architecture patterns to reuse

### 1. Greenfield Next app in this repo

**Pattern**: This workspace currently has no tracked Next app; implement the spike as a **new Next.js app** (or first app in monorepo) rather than bolting onto an unknown stack.

**Implementation**:

1. Add **`docker-compose.local.yml`** for the **Next dev** app service (`env_file`, bind mount, anonymous `node_modules` volume, `npm run dev`). Do not add Postgres/Redis services or app wiring for this phase.
2. `create-next-app` with TypeScript, Tailwind, App Router, ESLint (inside the bind-mounted app directory the compose file expects).
3. Initialize shadcn (`npx shadcn@latest init`) then add **Button**, **Textarea**, **Card** (and **Alert** if useful).
4. Thin **Route Handler**: parse JSON → validate → call small **service module** (`lib/agent/runInstructions.ts` or similar) that wraps the **Claude Agents SDK** → return `{ reply: string }` or typed error. **v1:** pass **user instructions only** into the SDK entrypoint; leave hooks/constants ready if product adds **system** prompt later.

**Alignment**: Matches `spec.md` and `AGENTS.md` intent—router thin, orchestration in a typed helper—within Next’s single-process model.

## Request flow

```
Browser (Client Component)
  │  POST { instructions: string }
  ▼
Route Handler  app/api/agent/route.ts
  │  validate body
  ▼
lib/agent/runInstructions.ts  →  Claude Agents SDK  →  Anthropic API
  │
  ▼
JSON response { reply } or 4xx/5xx + safe message
```

## Testing strategy

### Unit / handler tests (mock SDK)

| Area | Scenarios | Priority |
| ---- | --------- | -------- |
| Route Handler | Empty/missing `instructions` → 400 | Should have |
| Route Handler | SDK throws → 502 + generic body (no stack/key in response) | Should have |

Integration tests against **live** Anthropic API are **out of scope** for this spike (`spec.md` §6.2).

### Manual smoke

| Area | Coverage | Priority |
| ---- | -------- | -------- |
| UI | Submit text → loading → result panel | P0 |
| Secrets | Confirm SDK import graph stays server-only | P0 |

## Implementation phases

See **`plan.md`** in this folder for two **vertical** phases (compose + full stack stub, then real SDK). The breakdown below is a logical dependency order only.

1. **Compose + app scaffold:** `docker-compose.local.yml` + Next + Tailwind + shadcn + `.env.example`.
2. **API + UI slice:** Route Handler + client page; stub then SDK (`plan.md`).
3. **Hardening:** Validation tests, error shapes, manual smoke.

## Open questions requiring answers

_No blocking questions._ Minor: choose default page path `/` vs `/agent` when creating `app/page.tsx` (see `plan.md`).

## Risk mitigation

### Critical risks

**SDK only runs in Node**: If Claude Agents SDK assumes Node APIs, avoid Edge runtime for the Route Handler—use **Node** runtime default.

**Accidental client bundle**: Mitigate by keeping SDK imports out of `"use client"` files and code-reviewing dynamic imports.

**shadcn + Tailwind drift**: Run `shadcn` add commands per docs; keep `components/ui/*` generated and avoid hand-editing primitives unnecessarily.

---

## Checklist (guide alignment)

- [x] TLDR: decisions, open questions, success metrics
- [x] Table of contents
- [x] Patterns: greenfield Next + thin route + service helper (no fictional file paths beyond suggested names)
- [ ] Base class contracts — **N/A** (no abstract repo/interface extension)
- [x] Comparison table with recommendation column
- [x] ASCII flow diagram
- [x] Testing: unit/handler + manual (no DB/integration containers—N/A)
- [x] Open questions tied to spec
- [x] Risks brief (3)
- [x] No implementation source code blocks; no “Next Steps” section

## Related

- **`spec.md`** — requirements and acceptance criteria.
- **`plan.md`** — ordered implementation steps (two vertical phases).
- **`.claude/skills/docker-compose-local/SKILL.md`** — authoritative rules for `docker-compose.local.yml`.
